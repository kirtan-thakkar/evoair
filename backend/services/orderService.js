import { eq, and, desc, asc, inArray, sql, or, ilike } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products, carts, cartItems, users } from '../db/schema.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import * as emailService from './emailService.js';

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

      // 8. Insert order with unique order_number and initial 'pending_payment' status
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

/**
 * Admin: Retrieve all orders across all customers with status filtering and customer search
 */
export const getAllOrdersForAdmin = async ({ status, search, page = 1, limit = 50 }) => {
  const offset = (Math.max(1, page) - 1) * limit;

  // Build conditions
  const conditions = [];

  const rawSearch = search?.trim();
  const cleanedSearch = rawSearch ? rawSearch.replace(/^#+/, '').trim() : '';

  // Check if search looks like a direct order identifier (#EVO-..., EVO-..., UUID, order_...)
  const isDirectOrderSearch = Boolean(
    cleanedSearch &&
      (/^EVO-?/i.test(cleanedSearch) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(cleanedSearch) ||
        /^order_/i.test(cleanedSearch))
  );

  // If searching for a specific order identifier, don't restrict by tab status so the order is always found
  if (status && status !== 'all' && !isDirectOrderSearch) {
    if (status === 'in_transit') {
      conditions.push(or(eq(orders.status, 'in_transit'), eq(orders.status, 'shipped')));
    } else {
      conditions.push(eq(orders.status, status));
    }
  }

  if (cleanedSearch) {
    const qClean = `%${cleanedSearch}%`;
    const qRaw = `%${rawSearch}%`;
    conditions.push(
      or(
        ilike(orders.order_number, qClean),
        ilike(orders.order_number, qRaw),
        sql`CAST(${orders.id} AS text) ILIKE ${qClean}`,
        sql`CAST(${orders.id} AS text) ILIKE ${qRaw}`,
        sql`CAST(${orders.razorpay_order_id} AS text) ILIKE ${qClean}`,
        ilike(users.name, qRaw),
        ilike(users.email, qRaw),
        ilike(users.phone, qClean)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const [{ count }] = await db
    .select({ count: sql`count(*)` })
    .from(orders)
    .innerJoin(users, eq(orders.user_id, users.id))
    .where(whereClause);

  const total = Number(count || 0);

  // Paginated query
  const rawOrders = await db
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
      created_at: orders.created_at,
      customer_name: users.name,
      customer_email: users.email,
      customer_phone: users.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.user_id, users.id))
    .where(whereClause)
    .orderBy(desc(orders.created_at))
    .limit(limit)
    .offset(offset);

  if (rawOrders.length === 0) {
    return {
      orders: [],
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // Fetch enriched items
  const orderIds = rawOrders.map((o) => o.id);
  const allItems = await db
    .select({
      id: orderItems.id,
      order_id: orderItems.order_id,
      variant_id: orderItems.variant_id,
      quantity: orderItems.quantity,
      unit_price_paise: orderItems.unit_price_paise,
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

  const itemsMap = new Map();
  for (const item of allItems) {
    if (!itemsMap.has(item.order_id)) {
      itemsMap.set(item.order_id, []);
    }
    itemsMap.get(item.order_id).push(item);
  }

  const enrichedOrders = rawOrders.map((order) => ({
    id: order.id,
    order_number: order.order_number,
    user_id: order.user_id,
    status: order.status,
    subtotal_paise: order.subtotal_paise,
    shipping_paise: order.shipping_paise,
    total_paise: order.total_paise,
    shipping_address: order.shipping_address,
    expected_delivery_date: order.expected_delivery_date,
    created_at: order.created_at,
    customer: {
      id: order.user_id,
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
    },
    items: itemsMap.get(order.id) || [],
  }));

  return {
    orders: enrichedOrders,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Admin: Retrieve single order details with customer and enriched item breakdown
 */
export const getOrderByIdForAdmin = async (orderId) => {
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
      customer_name: users.name,
      customer_email: users.email,
      customer_phone: users.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.user_id, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);

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
    customer: {
      id: order.user_id,
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
    },
    items,
  };
};

/**
 * Admin: Update order status transition (processing -> in_transit -> delivered)
 */
export const updateOrderStatusByAdmin = async (orderId, nextStatus) => {
  const validStatuses = ['pending_payment', 'paid', 'processing', 'in_transit', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(nextStatus)) {
    throw new AppError(`Invalid order status: ${nextStatus}. Allowed: ${validStatuses.join(', ')}`, 400);
  }

  const [existingOrder] = await db
    .select({ id: orders.id, status: orders.status, order_number: orders.order_number })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existingOrder) {
    throw new NotFoundError('Order not found');
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({ status: nextStatus })
    .where(eq(orders.id, orderId))
    .returning({
      id: orders.id,
      order_number: orders.order_number,
      status: orders.status,
      user_id: orders.user_id,
      total_paise: orders.total_paise,
    });

  logger.info(
    {
      event: 'ORDER_STATUS_TRANSITION',
      orderId,
      orderNumber: existingOrder.order_number,
      previousStatus: existingOrder.status,
      nextStatus,
    },
    `[ADMIN] Order #${existingOrder.order_number} status updated to '${nextStatus}'`
  );

  return updatedOrder;
};

/**
 * Admin: Calculate real-time KPI metrics for dashboard stat cards
 */
export const getAdminKpis = async () => {
  const result = await db.execute(sql`
    SELECT
      count(*)::int AS total_orders,
      count(*) FILTER (WHERE status = 'pending_payment')::int AS pending_orders,
      count(*) FILTER (WHERE status = 'processing')::int AS processing_orders,
      count(*) FILTER (WHERE status = 'in_transit' OR status = 'shipped')::int AS in_transit_orders,
      count(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
      COALESCE(SUM(total_paise), 0)::bigint AS total_revenue_paise
    FROM orders
  `);

  const row = result.rows[0] || {};
  const totalRevenuePaise = Number(row.total_revenue_paise || 0);

  return {
    totalOrders: Number(row.total_orders || 0),
    pendingOrders: Number(row.pending_orders || 0),
    processingOrders: Number(row.processing_orders || 0),
    inTransitOrders: Number(row.in_transit_orders || 0),
    deliveredOrders: Number(row.delivered_orders || 0),
    totalRevenuePaise,
    totalRevenueRupees: Math.round(totalRevenuePaise / 100),
  };
};

/**
 * Fulfills order upon verified payment confirmation.
 * Idempotent: safe against retries, webhooks, and duplicate requests.
 */
export const fulfillOrderPayment = async (orderId, paymentRecord = null, existingTx = null) => {
  const runInContext = async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        order_number: orders.order_number,
        status: orders.status,
        user_id: orders.user_id,
        total_paise: orders.total_paise,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    // Idempotency: If already processing or delivered, return cleanly without duplicate fulfillment
    if (['processing', 'paid', 'shipped', 'in_transit', 'delivered'].includes(order.status)) {
      logger.info(
        { orderId, status: order.status },
        '[PAYMENT_PROMISE] Order already fulfilled/processed, skipping duplicate fulfillment'
      );
      return { order, alreadyProcessed: true };
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set({ status: 'processing' })
      .where(eq(orders.id, orderId))
      .returning({
        id: orders.id,
        order_number: orders.order_number,
        status: orders.status,
        user_id: orders.user_id,
        total_paise: orders.total_paise,
      });

    return { order: updatedOrder, alreadyProcessed: false };
  };

  const result = existingTx ? await runInContext(existingTx) : await db.transaction(runInContext);

  // Asynchronous fulfillment promise dispatch
  if (!result.alreadyProcessed && result.order?.id) {
    Promise.resolve(result.order.id)
      .then(async (id) => {
        logger.info(
          { orderId: id, orderNumber: result.order.order_number },
          '[PAYMENT_PROMISE] Payment successful, resolving fulfillment promise and dispatching notifications'
        );
        await emailService.sendOrderConfirmationEmails(id);
      })
      .catch((err) => {
        logger.error(
          { err: err.message, orderId },
          '[PAYMENT_PROMISE] Error executing fulfillment promise handler'
        );
      });
  }

  return result;
};
