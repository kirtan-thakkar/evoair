import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { carts, cartItems, productVariants, products } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

export const getOrCreateCart = async (txOrDb, userId) => {
  await txOrDb
    .insert(carts)
    .values({ user_id: userId })
    .onConflictDoNothing({ target: carts.user_id });

  const [cart] = await txOrDb
    .select({
      id: carts.id,
      user_id: carts.user_id,
      created_at: carts.created_at,
      updated_at: carts.updated_at,
    })
    .from(carts)
    .where(eq(carts.user_id, userId));

  return cart;
};

export const getUserCart = async (userId, txOrDb = db) => {
  const cart = await getOrCreateCart(txOrDb, userId);

  const rows = await txOrDb
    .select({
      item_id: cartItems.id,
      quantity: cartItems.quantity,
      variant_id: productVariants.id,
      product_id: products.id,
      product_name: products.name,
      product_slug: products.slug,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      sku: productVariants.sku,
      price_paise: productVariants.price_paise,
      stock_qty: productVariants.stock_qty,
      variant_is_active: productVariants.is_active,
      product_is_active: products.is_active,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variant_id, productVariants.id))
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(eq(cartItems.cart_id, cart.id))
    .orderBy(asc(cartItems.id));

  let total_paise = 0;
  let total_count = 0;

  const items = rows.map((row) => {
    // Backorder Mode (Mentor Directive 1): Active products are always purchaseable
    const isAvailable = row.variant_is_active && row.product_is_active;
    const maxQuantity = isAvailable ? 10 : 0;
    const lineTotal = isAvailable ? row.price_paise * row.quantity : 0;

    if (isAvailable) {
      total_paise += lineTotal;
    }
    total_count += row.quantity;

    return {
      id: row.item_id,
      variant_id: row.variant_id,
      product_id: row.product_id,
      product_name: row.product_name,
      product_slug: row.product_slug,
      shade_name: row.shade_name,
      shade_code: row.shade_code,
      sku: row.sku,
      price_paise: row.price_paise,
      quantity: row.quantity,
      available: isAvailable,
      in_stock: row.stock_qty > 0,
      max_quantity_available: maxQuantity,
      line_total_paise: lineTotal,
    };
  });

  return {
    id: cart.id,
    user_id: cart.user_id,
    items,
    total_count,
    total_paise,
    updated_at: cart.updated_at,
  };
};

export const updateCartItem = async (userId, variantId, quantity) => {
  const cart = await getOrCreateCart(db, userId);

  if (quantity <= 0) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cart_id, cart.id), eq(cartItems.variant_id, variantId)));
  } else {
    const [variant] = await db
      .select({
        id: productVariants.id,
        stock_qty: productVariants.stock_qty,
        variant_is_active: productVariants.is_active,
        product_is_active: products.is_active,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.product_id, products.id))
      .where(eq(productVariants.id, variantId))
      .limit(1);

    if (!variant || !variant.variant_is_active || !variant.product_is_active) {
      throw new AppError('Product variant is unavailable or inactive', 409);
    }

    await db
      .insert(cartItems)
      .values({
        cart_id: cart.id,
        variant_id: variantId,
        quantity: Math.min(quantity, 10),
      })
      .onConflictDoUpdate({
        target: [cartItems.cart_id, cartItems.variant_id],
        set: {
          quantity: Math.min(quantity, 10),
          updated_at: sql`now()`,
        },
      });
  }

  await db
    .update(carts)
    .set({ updated_at: sql`now()` })
    .where(eq(carts.id, cart.id));

  return getUserCart(userId);
};

export const removeCartItem = async (userId, variantId) => {
  const cart = await getOrCreateCart(db, userId);

  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cart_id, cart.id), eq(cartItems.variant_id, variantId)));

  await db
    .update(carts)
    .set({ updated_at: sql`now()` })
    .where(eq(carts.id, cart.id));

  return getUserCart(userId);
};

export const clearUserCart = async (userId) => {
  const cart = await getOrCreateCart(db, userId);

  await db.delete(cartItems).where(eq(cartItems.cart_id, cart.id));

  await db
    .update(carts)
    .set({ updated_at: sql`now()` })
    .where(eq(carts.id, cart.id));

  return getUserCart(userId);
};

export const syncGuestCart = async (userId, guestItems) => {
  return await db.transaction(async (tx) => {
    const cart = await getOrCreateCart(tx, userId);

    if (!guestItems || guestItems.length === 0) {
      const currentCart = await getUserCart(userId, tx);
      return { cart: currentCart, skipped: [] };
    }

    const variantIds = guestItems.map((i) => i.variantId);
    const dbVariants = await tx
      .select({
        variant_id: productVariants.id,
        stock_qty: productVariants.stock_qty,
        variant_is_active: productVariants.is_active,
        product_is_active: products.is_active,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.product_id, products.id))
      .where(inArray(productVariants.id, variantIds));

    const variantMap = new Map(dbVariants.map((v) => [v.variant_id, v]));

    const skipped = [];
    const validItems = [];

    for (const item of guestItems) {
      const v = variantMap.get(item.variantId);
      if (!v) {
        skipped.push({ variant_id: item.variantId, reason: 'Variant not found' });
      } else if (!v.variant_is_active || !v.product_is_active) {
        skipped.push({ variant_id: item.variantId, reason: 'Variant or product is inactive' });
      } else {
        validItems.push(item);
      }
    }

    if (validItems.length > 0) {
      await tx
        .insert(cartItems)
        .values(
          validItems.map((item) => ({
            cart_id: cart.id,
            variant_id: item.variantId,
            quantity: Math.min(item.quantity, 10),
          }))
        )
        .onConflictDoUpdate({
          target: [cartItems.cart_id, cartItems.variant_id],
          set: {
            quantity: sql`LEAST(10, GREATEST(${cartItems.quantity}, EXCLUDED.quantity))`,
            updated_at: sql`now()`,
          },
        });

      await tx
        .update(carts)
        .set({ updated_at: sql`now()` })
        .where(eq(carts.id, cart.id));
    }

    const updatedCart = await getUserCart(userId, tx);
    return { cart: updatedCart, skipped };
  });
};
