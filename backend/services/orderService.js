import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products } from '../db/schema.js';
import { AppError, NotFoundError } from '../utils/errors.js';

// Complimentary luxury shipping
const SHIPPING_FLAT_PAISE = 0;

/**
 * Calculates dynamic expected delivery date: 5 business days (skipping Sundays)
 */
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
    })
    .from(orderItems)
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
          shadeName: productVariants.shade_name,
          shadeCode: productVariants.shade_code,
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
      const shipping_paise = SHIPPING_FLAT_PAISE;
      const total_paise = subtotal_paise + shipping_paise;

      // 7. Calculate dynamic expected delivery date (Mentor Directive 2)
      const expected_delivery_date = calculateExpectedDeliveryDate();

      // 8. Insert order
      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          user_id: userId,
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

      return {
        order: {
          ...insertedOrder,
          items: insertedItems,
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
    })
    .from(orderItems)
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
    })
    .from(orderItems)
    .where(eq(orderItems.order_id, order.id))
    .orderBy(asc(orderItems.id));

  return {
    ...order,
    items,
  };
};
