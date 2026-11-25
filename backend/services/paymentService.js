import crypto from 'crypto';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, payments, users } from '../db/schema.js';
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

/**
 * ── PayU India Integration ──
 */

/**
 * Generates an outbound SHA-512 payment hash for PayU Hosted Checkout.
 * Format: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
export const generatePayuPaymentHash = ({
  key,
  salt,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
}) => {
  const hashString = [
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    '', // udf6
    '', // udf7
    '', // udf8
    '', // udf9
    '', // udf10
    salt,
  ].join('|');

  return crypto.createHash('sha512').update(hashString, 'utf8').digest('hex').toLowerCase();
};

/**
 * Validates the inbound reverse SHA-512 hash returned by PayU on callback/webhook.
 * Format: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * Or with additionalCharges: sha512(additionalCharges|SALT|status|...)
 */
export const verifyPayuHash = (params, merchantSalt) => {
  if (!params || !merchantSalt) return false;
  const {
    additionalCharges,
    status = '',
    udf10 = '',
    udf9 = '',
    udf8 = '',
    udf7 = '',
    udf6 = '',
    udf5 = '',
    udf4 = '',
    udf3 = '',
    udf2 = '',
    udf1 = '',
    email = '',
    firstname = '',
    productinfo = '',
    amount = '',
    txnid = '',
    key = '',
    hash: incomingHash = '',
  } = params;

  let hashSequence = [
    merchantSalt,
    status,
    udf10,
    udf9,
    udf8,
    udf7,
    udf6,
    udf5,
    udf4,
    udf3,
    udf2,
    udf1,
    email,
    firstname,
    productinfo,
    amount,
    txnid,
    key,
  ].join('|');

  if (additionalCharges) {
    hashSequence = `${additionalCharges}|${hashSequence}`;
  }

  const calculatedHash = crypto.createHash('sha512').update(hashSequence, 'utf8').digest('hex').toLowerCase();
  const incoming = (incomingHash || '').toLowerCase();

  if (!incoming || calculatedHash.length !== incoming.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(calculatedHash, 'utf8'), Buffer.from(incoming, 'utf8'));
  } catch {
    return false;
  }
};

/**
 * Initializes a PayU Hosted Checkout transaction for a pending order.
 */
export const initiatePayuPayment = async (userId, orderId) => {
  const [order] = await db
    .select({
      id: orders.id,
      order_number: orders.order_number,
      user_id: orders.user_id,
      status: orders.status,
      total_paise: orders.total_paise,
      shipping_address: orders.shipping_address,
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

  const merchantKey = env.PAYU_MERCHANT_KEY;
  const merchantSalt = env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    throw new AppError('PayU payment gateway is not properly configured on server', 500);
  }

  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const shippingAddr = order.shipping_address || {};
  const firstname = (shippingAddr.name || user?.name || 'Customer').trim().split(' ')[0] || 'Customer';
  const email = (user?.email || 'customer@evoair.in').trim();
  const phone = (shippingAddr.phone || '9999999999').trim();
  const amount = (Number(order.total_paise) / 100).toFixed(2);
  const txnid = order.order_number || `EVO-${order.id.slice(0, 8).toUpperCase()}-${Date.now()}`;
  const productinfo = 'Evoluir Luxury Skincare and Cosmetics';

  const backendPublicUrl = (env.BACKEND_PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, '');
  const surl = `${backendPublicUrl}/api/v1/payments/payu/callback`;
  const furl = `${backendPublicUrl}/api/v1/payments/payu/callback`;

  const hash = generatePayuPaymentHash({
    key: merchantKey,
    salt: merchantSalt,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1: order.id,
  });

  const payuBaseUrl =
    env.PAYU_ENV === 'production'
      ? 'https://secure.payu.in/_payment'
      : 'https://test.payu.in/_payment';

  logger.info({ orderId: order.id, txnid, amount }, '[PAYU] Generated hosted payment checkout session');

  return {
    actionUrl: payuBaseUrl,
    params: {
      key: merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash,
      service_provider: 'payu_paisa',
      udf1: order.id,
    },
  };
};

/**
 * Handles PayU browser return callback (surl / furl POST).
 */
export const handlePayuCallback = async (params) => {
  const merchantSalt = env.PAYU_MERCHANT_SALT;
  const isHashValid = verifyPayuHash(params, merchantSalt);

  const orderId = params.udf1;
  const status = params.status;
  const txnid = params.txnid;
  const mihpayid = params.mihpayid;
  const amount = params.amount;
  const errorMessage = params.error_Message || params.error || 'Payment transaction failed or cancelled';

  const frontendUrl = (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

  if (!isHashValid) {
    logger.warn({ params: { ...params, hash: '[REDACTED]' } }, '[PAYU] Invalid reverse hash detected in callback');
    return {
      redirectUrl: `${frontendUrl}/checkout?status=failed&error=tampered_response`,
    };
  }

  if (status === 'success') {
    logger.info({ orderId, txnid, mihpayid }, '[PAYU] Verified successful payment callback');

    let order = null;
    if (orderId) {
      [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    } else if (txnid) {
      [order] = await db.select().from(orders).where(eq(orders.order_number, txnid)).limit(1);
    }

    if (order) {
      const amountPaise = Math.round(parseFloat(amount) * 100);
      const paymentRecord = await db.transaction(async (tx) => {
        let inserted = null;
        if (mihpayid) {
          const [existing] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(eq(payments.gateway_payment_id, String(mihpayid)))
            .limit(1);

          if (!existing) {
            [inserted] = await tx
              .insert(payments)
              .values({
                order_id: order.id,
                gateway: 'payu',
                transaction_id: txnid,
                gateway_payment_id: String(mihpayid),
                status: 'captured',
                amount_paise: amountPaise || order.total_paise,
                raw_payload: params,
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

    return {
      redirectUrl: `${frontendUrl}/orders?status=success&orderId=${order?.id || orderId}`,
    };
  }

  logger.warn({ orderId, txnid, status, errorMessage }, '[PAYU] Unsuccessful payment callback');
  return {
    redirectUrl: `${frontendUrl}/checkout?status=failed&error=${encodeURIComponent(errorMessage)}`,
  };
};

/**
 * Handles PayU server-to-server webhook (successful, failed, refund).
 */
export const processPayuWebhook = async (payload) => {
  const merchantSalt = env.PAYU_MERCHANT_SALT;
  const isHashValid = verifyPayuHash(payload, merchantSalt);

  if (!isHashValid) {
    logger.warn('[PAYU_WEBHOOK] Invalid reverse hash detected in webhook');
    throw new AppError('Invalid PayU webhook signature', 400);
  }

  const orderId = payload.udf1;
  const txnid = payload.txnid;
  const mihpayid = payload.mihpayid;
  const status = payload.status;
  const amount = payload.amount;

  logger.info({ eventStatus: status, orderId, txnid, mihpayid }, '[PAYU_WEBHOOK] Processing verified webhook');

  let order = null;
  if (orderId) {
    [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  } else if (txnid) {
    [order] = await db.select().from(orders).where(eq(orders.order_number, txnid)).limit(1);
  }

  if (!order) {
    logger.warn({ orderId, txnid }, '[PAYU_WEBHOOK] Order not found for webhook');
    return { received: true, ignored: true, reason: 'order_not_found' };
  }

  if (status === 'success') {
    const amountPaise = Math.round(parseFloat(amount) * 100);
    const paymentRecord = await db.transaction(async (tx) => {
      let inserted = null;
      if (mihpayid) {
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.gateway_payment_id, String(mihpayid)))
          .limit(1);

        if (!existing) {
          [inserted] = await tx
            .insert(payments)
            .values({
              order_id: order.id,
              gateway: 'payu',
              transaction_id: txnid,
              gateway_payment_id: String(mihpayid),
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
    return { received: true, fulfilled: true };
  }

  return { received: true, status };
};
