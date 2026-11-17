import crypto from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, payments } from '../db/schema.js';
import { env } from '../config/env.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import * as orderService from './orderService.js';

/**
 * Creates a Razorpay Order corresponding to a pending order in Evoair.
 * Supports fallback test generation when Razorpay API keys are not configured.
 */
export const createRazorpayOrder = async (userId, orderId) => {
  const [order] = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      total_paise: orders.total_paise,
      razorpay_order_id: orders.razorpay_order_id,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  if (order.user_id !== userId) {
    throw new ForbiddenError('You are not authorized to pay for this order');
  }

  if (order.status !== 'pending_payment') {
    throw new AppError(`Order cannot be paid in current status: ${order.status}`, 400);
  }

  let razorpayOrderId;
  const hasRazorpayKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

  if (hasRazorpayKeys) {
    try {
      const authHeader = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: order.total_paise,
          currency: 'INR',
          receipt: order.order_number,
        },
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      razorpayOrderId = response.data.id;
    } catch (err) {
      logger.error(
        { err: err.response?.data || err.message, orderId },
        '[PAYMENT] Failed to create Razorpay order with upstream gateway'
      );
      throw new AppError(
        err.response?.data?.error?.description || 'Failed to initialize payment gateway order',
        502
      );
    }
  } else {
    // Simulated test order ID for local developer testing
    const testSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    razorpayOrderId = `order_test_${testSuffix}`;
    logger.info(
      { orderId, simulatedOrderId: razorpayOrderId },
      '[PAYMENT] Simulated Razorpay order created (API keys not configured in environment)'
    );
  }

  await db
    .update(orders)
    .set({ razorpay_order_id: razorpayOrderId })
    .where(eq(orders.id, orderId));

  return {
    razorpay_order_id: razorpayOrderId,
    amount_paise: order.total_paise,
    currency: 'INR',
    key_id: env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    order_number: order.order_number,
  };
};

/**
 * Verifies Razorpay HMAC-SHA256 signature, validates payment details against upstream gateway,
 * saves payment record, transitions status, and triggers fulfillment promise.
 */
export const verifyPayment = async (
  userId,
  { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
) => {
  const [order] = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      total_paise: orders.total_paise,
      razorpay_order_id: orders.razorpay_order_id,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  if (order.user_id !== userId) {
    throw new ForbiddenError('You are not authorized for this order');
  }

  if (order.razorpay_order_id && order.razorpay_order_id !== razorpay_order_id) {
    throw new AppError('Payment order identifier mismatch', 400);
  }

  // 1. Cryptographic HMAC-SHA256 signature verification
  const secret = env.RAZORPAY_KEY_SECRET || 'test_secret';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const signatureBuf = Buffer.from(razorpay_signature, 'utf8');

  // Prevent timing attacks and guard against unequal buffer length RangeError
  const isValidSignature =
    expectedBuf.length === signatureBuf.length &&
    crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!isValidSignature) {
    logger.warn({ orderId, razorpay_order_id }, '[PAYMENT] Invalid payment signature detected');
    throw new AppError('Invalid payment signature', 400);
  }

  const hasRazorpayKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

  // 2. Upstream Verification & Tampering Protection (when keys configured)
  if (hasRazorpayKeys) {
    try {
      const authHeader = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        {
          headers: { Authorization: `Basic ${authHeader}` },
          timeout: 10000,
        }
      );

      const payment = response.data;

      // Ensure payment is captured or authorized
      if (!['captured', 'authorized'].includes(payment.status)) {
        throw new AppError(`Payment status is not captured: ${payment.status}`, 400);
      }

      // Strict amount tampering check: payment amount MUST match order total exactly
      if (Number(payment.amount) !== Number(order.total_paise)) {
        logger.error(
          {
            orderId,
            expectedPaise: order.total_paise,
            receivedPaise: payment.amount,
          },
          '[PAYMENT] Amount tampering detected'
        );
        throw new AppError('Payment amount tampering detected', 400);
      }

      // Currency check
      if (payment.currency !== 'INR') {
        throw new AppError(`Unexpected payment currency: ${payment.currency}`, 400);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error(
        { err: err.response?.data || err.message, paymentId: razorpay_payment_id },
        '[PAYMENT] Error verifying payment with Razorpay upstream API'
      );
      throw new AppError(
        err.response?.data?.error?.description || 'Failed to verify payment status with gateway',
        502
      );
    }
  }

  // 3. Atomic Database Transaction: Idempotency check + payment record insertion + order update
  const paymentRecord = await db.transaction(async (tx) => {
    const [existingPayment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.razorpay_payment_id, razorpay_payment_id))
      .limit(1);

    if (existingPayment) {
      logger.info(
        { orderId, razorpay_payment_id },
        '[PAYMENT] Payment already recorded; returning existing confirmation'
      );
      return existingPayment;
    }

    const [insertedPayment] = await tx
      .insert(payments)
      .values({
        order_id: orderId,
        razorpay_payment_id,
        status: 'captured',
        amount_paise: order.total_paise,
        raw_payload: {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          verified_at: new Date().toISOString(),
        },
      })
      .returning();

    await tx
      .update(orders)
      .set({
        status: 'processing',
        razorpay_order_id,
      })
      .where(eq(orders.id, orderId));

    return insertedPayment;
  });

  // 4. Trigger fulfillment promise (emails & status convergence)
  await orderService.fulfillOrderPayment(orderId, paymentRecord);

  return {
    status: 'success',
    message: 'Payment verified and order confirmed',
    orderId,
  };
};

/**
 * Public Razorpay Webhook processor with cryptographic HMAC-SHA256 signature verification.
 */
export const processWebhook = async ({ rawBody, signature }) => {
  if (!signature) {
    throw new AppError('Missing webhook signature', 400);
  }

  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('[PAYMENT_WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured; rejecting webhook');
    throw new AppError('Webhook secret not configured on server', 500);
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(bodyBuffer)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  const isValid =
    expectedBuf.length === signatureBuf.length &&
    crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!isValid) {
    logger.warn('[PAYMENT_WEBHOOK] Invalid webhook signature detected');
    throw new AppError('Invalid webhook signature', 400);
  }

  const payload = JSON.parse(bodyBuffer.toString('utf8'));
  const event = payload.event;

  logger.info({ event }, '[PAYMENT_WEBHOOK] Processing verified webhook event');

  if (event === 'payment.captured' || event === 'order.paid') {
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const paymentId = paymentEntity?.id;
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const amountPaise = paymentEntity?.amount || orderEntity?.amount_paid;

    if (!razorpayOrderId) {
      logger.warn({ event }, '[PAYMENT_WEBHOOK] Missing order_id in webhook payload');
      return { received: true, ignored: true };
    }

    const [order] = await db
      .select({
        id: orders.id,
        order_number: orders.order_number,
        status: orders.status,
        total_paise: orders.total_paise,
      })
      .from(orders)
      .where(eq(orders.razorpay_order_id, razorpayOrderId))
      .limit(1);

    if (!order) {
      logger.warn({ razorpayOrderId }, '[PAYMENT_WEBHOOK] Matching order not found in database');
      return { received: true, ignored: true };
    }

    const paymentRecord = await db.transaction(async (tx) => {
      let inserted = null;
      if (paymentId) {
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.razorpay_payment_id, paymentId))
          .limit(1);

        if (!existing) {
          [inserted] = await tx
            .insert(payments)
            .values({
              order_id: order.id,
              razorpay_payment_id: paymentId,
              status: 'captured',
              amount_paise: amountPaise || order.total_paise,
              raw_payload: payload,
            })
            .returning();
        }
      }

      await tx
        .update(orders)
        .set({ status: 'processing' })
        .where(eq(orders.id, order.id));

      return inserted;
    });

    await orderService.fulfillOrderPayment(order.id, paymentRecord);
  }

  return { received: true };
};
