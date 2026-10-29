import { eq, and, asc, inArray, sql, or } from 'drizzle-orm';
import { db } from '../config/db.js';
import { carts, cartItems, productVariants, products } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const formatInr = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));

/**
 * Single source of truth for pricing calculations across cart, orders, and checkout.
 */
export const calculatePricing = (items = []) => {
  let subtotal_paise = 0;
  let total_count = 0;

  for (const item of items) {
    if (item.available !== false) {
      const lineTotal = item.line_total_paise ?? (item.price_paise * (item.quantity || 1));
      subtotal_paise += lineTotal;
    }
    total_count += item.quantity || 0;
  }

  const shipping_fee_paise = subtotal_paise > 0 ? Number(process.env.SHIPPING_FEE_PAISE ?? 15000) : 0;
  const total_paise = subtotal_paise + shipping_fee_paise;

  return {
    subtotal_paise,
    subtotal_rupees: Math.round(subtotal_paise / 100),
    shipping_fee_paise,
    shipping_fee_rupees: Math.round(shipping_fee_paise / 100),
    customs_and_taxes: 'Included',
    tax_paise: 0,
    total_paise,
    total_rupees: Math.round(total_paise / 100),
    currency: 'INR',
    currency_symbol: '₹',
    formatted: {
      subtotal: formatInr(subtotal_paise),
      shipping: shipping_fee_paise > 0 ? formatInr(shipping_fee_paise) : '₹0',
      customs_and_taxes: 'Included',
      total: formatInr(total_paise),
    },
  };
};

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
      formula: productVariants.formula,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      color_hex: productVariants.color_hex,
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

  const items = rows.map((row) => {
    // Backorder Mode: Active products are always purchaseable
    const isAvailable = row.variant_is_active && row.product_is_active;
    const maxQuantity = isAvailable ? 10 : 0;
    const lineTotal = isAvailable ? row.price_paise * row.quantity : 0;

    return {
      id: row.item_id,
      variant_id: row.variant_id,
      product_id: row.product_id,
      product_name: row.product_name,
      product_slug: row.product_slug,
      formula: row.formula,
      shade_name: row.shade_name,
      shade_code: row.shade_code,
      color_hex: row.color_hex,
      sku: row.sku,
      price_paise: row.price_paise,
      price_rupees: Math.round(row.price_paise / 100),
      formatted_price: formatInr(row.price_paise),
      quantity: row.quantity,
      available: isAvailable,
      in_stock: row.stock_qty > 0,
      max_quantity_available: maxQuantity,
      line_total_paise: lineTotal,
      line_total_rupees: Math.round(lineTotal / 100),
      formatted_line_total: formatInr(lineTotal),
    };
  });

  const pricing = calculatePricing(items);

  return {
    id: cart.id,
    user_id: cart.user_id,
    items,
    total_count: items.reduce((sum, item) => sum + (item.quantity || 1), 0),
    subtotal_paise: pricing.subtotal_paise,
    total_paise: pricing.total_paise,
    pricing,
    updated_at: cart.updated_at,
  };
};

/**
 * Public calculation endpoint for guest carts. Performs exact server database pricing.
 */
export const calculateGuestCart = async (guestItems = []) => {
  if (!Array.isArray(guestItems) || guestItems.length === 0) {
    const pricing = calculatePricing([]);
    return {
      items: [],
      total_count: 0,
      subtotal_paise: 0,
      total_paise: 0,
      pricing,
    };
  }

  // Fetch all active products and variants from PostgreSQL
  const allVariants = await db
    .select({
      variant_id: productVariants.id,
      product_id: products.id,
      product_name: products.name,
      product_slug: products.slug,
      formula: productVariants.formula,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      color_hex: productVariants.color_hex,
      sku: productVariants.sku,
      price_paise: productVariants.price_paise,
      stock_qty: productVariants.stock_qty,
      variant_is_active: productVariants.is_active,
      product_is_active: products.is_active,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(eq(products.is_active, true));

  const items = [];
  for (const item of guestItems) {
    const vId = item.variantId || item.variant_id || item.id;
    const match = allVariants.find((v) => {
      if (typeof vId === 'string' && v.variant_id === vId) return true;
      if (item.sku && v.sku === item.sku) return true;
      if (item.shadeCode && v.shade_code === item.shadeCode) return true;
      if (item.id === 'evofills' && v.sku?.includes('FILL')) return true;
      if (item.id === 'evo-bottles-empty-pack' && v.sku?.includes('BOTTLE')) return true;
      if (item.id === 'evoair' && v.shade_code === (item.shadeCode || '02')) return true;
      return false;
    });

    if (match) {
      const isAvailable = match.variant_is_active && match.product_is_active;
      const quantity = Math.max(1, Math.min(10, item.quantity || 1));
      const lineTotal = isAvailable ? match.price_paise * quantity : 0;

      items.push({
        id: match.variant_id,
        variant_id: match.variant_id,
        product_id: match.product_id,
        product_name: match.product_name,
        product_slug: match.product_slug,
        formula: match.formula,
        shade_name: match.shade_name,
        shade_code: match.shade_code,
        color_hex: match.color_hex,
        sku: match.sku,
        price_paise: match.price_paise,
        price_rupees: Math.round(match.price_paise / 100),
        formatted_price: formatInr(match.price_paise),
        quantity,
        available: isAvailable,
        in_stock: match.stock_qty > 0,
        line_total_paise: lineTotal,
        line_total_rupees: Math.round(lineTotal / 100),
        formatted_line_total: formatInr(lineTotal),
      });
    }
  }

  const pricing = calculatePricing(items);
  return {
    items,
    total_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal_paise: pricing.subtotal_paise,
    total_paise: pricing.total_paise,
    pricing,
  };
};

export const updateCartItem = async (userId, variantId, quantity) => {
  const cart = await getOrCreateCart(db, userId);

  if (quantity <= 0) {
    return removeCartItem(userId, variantId);
  }

  // Resolve UUID if identifier was compound or slug
  let resolvedId = variantId;
  if (typeof variantId === 'string' && !UUID_REGEX.test(variantId)) {
    if (variantId.includes('-')) {
      const possibleUuid = variantId.split('-').slice(0, 5).join('-');
      if (UUID_REGEX.test(possibleUuid)) {
        resolvedId = possibleUuid;
      }
    }
  }

  const [variant] = await db
    .select({
      id: productVariants.id,
      stock_qty: productVariants.stock_qty,
      variant_is_active: productVariants.is_active,
      product_is_active: products.is_active,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(eq(productVariants.id, resolvedId))
    .limit(1);

  if (!variant || !variant.variant_is_active || !variant.product_is_active) {
    throw new AppError('Product variant is unavailable or inactive', 409);
  }

  await db
    .insert(cartItems)
    .values({
      cart_id: cart.id,
      variant_id: resolvedId,
      quantity: Math.min(quantity, 10),
    })
    .onConflictDoUpdate({
      target: [cartItems.cart_id, cartItems.variant_id],
      set: {
        quantity: Math.min(quantity, 10),
        updated_at: sql`now()`,
      },
    });

  await db
    .update(carts)
    .set({ updated_at: sql`now()` })
    .where(eq(carts.id, cart.id));

  return getUserCart(userId);
};

export const removeCartItem = async (userId, identifier) => {
  const cart = await getOrCreateCart(db, userId);

  if (typeof identifier === 'string' && UUID_REGEX.test(identifier)) {
    await db
      .delete(cartItems)
      .where(
        and(
          eq(cartItems.cart_id, cart.id),
          sql`(${cartItems.variant_id} = ${identifier}::uuid OR ${cartItems.id} = ${identifier}::uuid)`
        )
      );
  } else {
    // If identifier is a compound key like "uuid-02"
    let candidateUuid = null;
    if (typeof identifier === 'string' && identifier.includes('-')) {
      const parts = identifier.split('-');
      if (parts.length >= 5) {
        const possible = parts.slice(0, 5).join('-');
        if (UUID_REGEX.test(possible)) {
          candidateUuid = possible;
        }
      }
    }

    if (candidateUuid) {
      await db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.cart_id, cart.id),
            sql`(${cartItems.variant_id} = ${candidateUuid}::uuid OR ${cartItems.id} = ${candidateUuid}::uuid)`
          )
        );
    } else {
      // Lookup by SKU or product slug
      const [v] = await db
        .select({ id: productVariants.id })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.product_id, products.id))
        .where(or(eq(productVariants.sku, identifier), eq(products.slug, identifier)))
        .limit(1);

      if (v) {
        await db
          .delete(cartItems)
          .where(and(eq(cartItems.cart_id, cart.id), eq(cartItems.variant_id, v.id)));
      }
    }
  }

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
