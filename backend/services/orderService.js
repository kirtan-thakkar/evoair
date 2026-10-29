import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products, carts, cartItems } from '../db/schema.js';
import { AppError, NotFoundError } from '../utils/errors.js';

// Flat delivery fee (configurable via SHIPPING_FEE_PAISE, default ₹150)
const SHIPPING_FLAT_PAISE = Number(process.env.SHIPPING_FEE_PAISE ?? 15000);

/**
 * Calculates dynamic expected delivery date: 5 business days (skipping Sundays)
 */
export const generateUniqueOrderNumber = async (txOrDb) => {
  for (let i = 0; i < 10; i++) {
    const num = Math.floor(100000 + Math.random() * 900000);
    const candidate = `EVO-${num}`;
    const [exists] = await txOrDb
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.order_number, candidate))
      .limit(1);
    if (!exists) return candidate;
  }
  return `EVO-${Date.now().toString().slice(-6)}`;
};

export const calculateExpectedDeliveryDate = (startDate = new Date()) => {
  const d = new Date(startDate);
  let daysAdded = 0;
  while (daysAdded < 5) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) {
      daysAdded++;
    }
  }
  return d;
};

const areItemsMatching = (existingItems, requestedItems) => {
  if (existingItems.length !== requestedItems.length) return false;
  const sortedExisting = [...existingItems].sort((a, b) =>
    String(a.variant_id).localeCompare(String(b.variant_id))
  );
  const sortedRequested = [...requestedItems].sort((a, b) =>
    String(a.variantId).localeCompare(String(b.variantId))
  );
  return sortedExisting.every(
    (item, index) =>
      item.variant_id === sortedRequested[index].variantId &&
      item.quantity === sortedRequested[index].quantity
  );
};

const findExistingOrderWithItems = async (queryDb, userId, idempotencyKey) => {
  const [existingOrder] = await queryDb
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      subtotal_paise: orders.subtotal_paise,
      shipping_paise: orders.shipping_paise,
      total_paise: orders.total_paise,
      shipping_address: orders.shipping_address,
      expected_delivery_date: orders.expected_delivery_date,
      razorpay_order_id: orders.razorpay_order_id,
      idempotency_key: orders.idempotency_key,
      created_at: orders.created_at,
    })
    .from(orders)
    .where(and(eq(orders.user_id, userId), eq(orders.idempotency_key, idempotencyKey)));

  if (!existingOrder) return null;

  const existingItems = await queryDb
    .select({
      id: orderItems.id,
      order_id: orderItems.order_id,
      variant_id: orderItems.variant_id,
      quantity: orderItems.quantity,
      unit_price_paise: orderItems.unit_price_paise,
      created_at: orderItems.created_at,
      product_name: products.name,
      product_slug: products.slug,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      color_hex: productVariants.color_hex,
      formula: productVariants.formula,
      sku: productVariants.sku,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variant_id, productVariants.id))
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(eq(orderItems.order_id, existingOrder.id))
    .orderBy(asc(orderItems.id));

  return {
    ...existingOrder,
    items: existingItems,
  };
};

export const createOrder = async (userId, idempotencyKey, { items, shippingAddress }) => {
  try {
    const result = await db.transaction(async (tx) => {
      // 1. Transaction Advisory Lock on (userId hash, idempotencyKey hash)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${idempotencyKey}))`);

      // 2. Idempotency check inside transaction
      const existingOrder = await findExistingOrderWithItems(tx, userId, idempotencyKey);
      if (existingOrder) {
        if (!areItemsMatching(existingOrder.items, items)) {
          throw new AppError('Idempotency-Key was already used with a different request', 409);
        }
        return { order: existingOrder, isExisting: true };
      }

      // 3. Load all requested variants in one query with active products
      const variantIds = items.map((i) => i.variantId);
      const dbVariants = await tx
        .select({
          variantId: productVariants.id,
          productId: productVariants.product_id,
          productName: products.name,
          productSlug: products.slug,
          formula: productVariants.formula,
          shadeName: productVariants.shade_name,
          shadeCode: productVariants.shade_code,
          colorHex: productVariants.color_hex,
          sku: productVariants.sku,
          pricePaise: productVariants.price_paise,
          stockQty: productVariants.stock_qty,
          variantIsActive: productVariants.is_active,
          productIsActive: products.is_active,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.product_id, products.id))
        .where(inArray(productVariants.id, variantIds));

      const variantMap = new Map(dbVariants.map((v) => [v.variantId, v]));

      // Verify all requested variants exist and are active
      const unavailableVariantIds = [];
      for (const id of variantIds) {
        const v = variantMap.get(id);
        if (!v || !v.variantIsActive || !v.productIsActive) {
          unavailableVariantIds.push(id);
        }
      }

      if (unavailableVariantIds.length > 0) {
        throw new AppError(
          `Unavailable variants: ${unavailableVariantIds.join(', ')}`,
          409
        );
      }

      // 4. Sort items by variantId string ascending (prevents deadlocks)
      const sortedItems = [...items].sort((a, b) =>
        String(a.variantId).localeCompare(String(b.variantId))
      );

      // 5. Stock Update (Backorder Allowed - Mentor Directive 1)
      // Decrement stock down to 0; do NOT block customer order if stock reaches 0
      for (const item of sortedItems) {
        await tx
          .update(productVariants)
          .set({
            stock_qty: sql`GREATEST(0, ${productVariants.stock_qty} - ${item.quantity})`,
          })
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.is_active, true)
            )
          );
      }

      // 6. Compute totals on server from DB prices
      const subtotal_paise = items.reduce((acc, item) => {
        const v = variantMap.get(item.variantId);
        return acc + v.pricePaise * item.quantity;
      }, 0);
      const shipping_paise = subtotal_paise > 0 ? SHIPPING_FLAT_PAISE : 0;
      const total_paise = subtotal_paise + shipping_paise;

      // 7. Calculate dynamic expected delivery date (Mentor Directive 2)
      const expected_delivery_date = calculateExpectedDeliveryDate();

      // 8. Insert order with unique order_number
      const order_number = await generateUniqueOrderNumber(tx);
      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          user_id: userId,
          order_number,
          status: 'pending_payment',
          subtotal_paise,
          shipping_paise,
          total_paise,
          shipping_address: shippingAddress,
          expected_delivery_date,
          razorpay_order_id: null,
          idempotency_key: idempotencyKey,
        })
        .returning({
          id: orders.id,
          order_number: orders.order_number,
          user_id: orders.user_id,
          status: orders.status,
          subtotal_paise: orders.subtotal_paise,
          shipping_paise: orders.shipping_paise,
          total_paise: orders.total_paise,
          shipping_address: orders.shipping_address,
          expected_delivery_date: orders.expected_delivery_date,
          razorpay_order_id: orders.razorpay_order_id,
          idempotency_key: orders.idempotency_key,
          created_at: orders.created_at,
        });

      // 9. Insert order items
      const itemsToInsert = items.map((item) => ({
        order_id: insertedOrder.id,
        variant_id: item.variantId,
        quantity: item.quantity,
        unit_price_paise: variantMap.get(item.variantId).pricePaise,
      }));

      const insertedItems = await tx
        .insert(orderItems)
        .values(itemsToInsert)
        .returning({
          id: orderItems.id,
          order_id: orderItems.order_id,
          variant_id: orderItems.variant_id,
          quantity: orderItems.quantity,
          unit_price_paise: orderItems.unit_price_paise,
          created_at: orderItems.created_at,
        });

      const enrichedItems = insertedItems.map((item) => {
        const v = variantMap.get(item.variant_id);
        return {
          ...item,
          product_name: v?.productName || 'Evo-Air Device',
          product_slug: v?.productSlug || null,
          shade_name: v?.shadeName || null,
          shade_code: v?.shadeCode || null,
          color_hex: v?.colorHex || null,
          formula: v?.formula || 'foundation',
          sku: v?.sku || null,
        };
      });

      // 10. Automatically clear user's cart in database once order is placed
      const [userCart] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.user_id, userId));

      if (userCart) {
        await tx.delete(cartItems).where(eq(cartItems.cart_id, userCart.id));
        await tx
          .update(carts)
          .set({ updated_at: sql`NOW()` })
          .where(eq(carts.id, userCart.id));
      }

      return {
        order: {
          ...insertedOrder,
          items: enrichedItems,
        },
        isExisting: false,
      };
    });

    return result;
  } catch (err) {
    // Race condition on idempotency key
    const pgCode = err.code ?? err.cause?.code;
    if (pgCode === '23505') {
      const racedOrder = await findExistingOrderWithItems(db, userId, idempotencyKey);
      if (racedOrder) {
        if (!areItemsMatching(racedOrder.items, items)) {
          throw new AppError('Idempotency-Key was already used with a different request', 409);
        }
        return { order: racedOrder, isExisting: true };
      }
    }
    throw err;
  }
};

export const getUserOrders = async (userId) => {
  const userOrders = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      subtotal_paise: orders.subtotal_paise,
      shipping_paise: orders.shipping_paise,
      total_paise: orders.total_paise,
      shipping_address: orders.shipping_address,
      expected_delivery_date: orders.expected_delivery_date,
      razorpay_order_id: orders.razorpay_order_id,
      idempotency_key: orders.idempotency_key,
      created_at: orders.created_at,
    })
    .from(orders)
    .where(eq(orders.user_id, userId))
    .orderBy(desc(orders.created_at))
    .limit(50);

  if (userOrders.length === 0) {
    return [];
  }

  const orderIds = userOrders.map((o) => o.id);
  const allItems = await db
    .select({
      id: orderItems.id,
      order_id: orderItems.order_id,
      variant_id: orderItems.variant_id,
      quantity: orderItems.quantity,
      unit_price_paise: orderItems.unit_price_paise,
      created_at: orderItems.created_at,
      product_name: products.name,
      product_slug: products.slug,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      color_hex: productVariants.color_hex,
      formula: productVariants.formula,
      sku: productVariants.sku,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variant_id, productVariants.id))
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(inArray(orderItems.order_id, orderIds))
    .orderBy(asc(orderItems.id));

  const itemsByOrderId = new Map();
  for (const item of allItems) {
    if (!itemsByOrderId.has(item.order_id)) {
      itemsByOrderId.set(item.order_id, []);
    }
    itemsByOrderId.get(item.order_id).push(item);
  }

  return userOrders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) || [],
  }));
};

export const getUserOrderById = async (userId, orderId) => {
  const [order] = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      subtotal_paise: orders.subtotal_paise,
      shipping_paise: orders.shipping_paise,
      total_paise: orders.total_paise,
      shipping_address: orders.shipping_address,
      expected_delivery_date: orders.expected_delivery_date,
      razorpay_order_id: orders.razorpay_order_id,
      idempotency_key: orders.idempotency_key,
      created_at: orders.created_at,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.user_id, userId)));

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const items = await db
    .select({
      id: orderItems.id,
      order_id: orderItems.order_id,
      variant_id: orderItems.variant_id,
      quantity: orderItems.quantity,
      unit_price_paise: orderItems.unit_price_paise,
      created_at: orderItems.created_at,
      product_name: products.name,
      product_slug: products.slug,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      color_hex: productVariants.color_hex,
      formula: productVariants.formula,
      sku: productVariants.sku,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variant_id, productVariants.id))
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .where(eq(orderItems.order_id, order.id))
    .orderBy(asc(orderItems.id));

  return {
    ...order,
    items,
  };
};
