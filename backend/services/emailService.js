import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products, users } from '../db/schema.js';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
    logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, '[EMAIL] SMTP Transporter initialized successfully');
  } else {
    transporter = null;
  }

  return transporter;
};

/**
 * Renders high-priority Store Owner Alert HTML
 */
export const renderOwnerOrderAlertHtml = (order, customer, items, shippingAddress) => {
  const itemsRows = items
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #2a2a30;">
      <td style="padding: 12px 8px; color: #f5f5f7; font-size: 14px; font-weight: 500;">
        ${item.product_title || 'Evoluir Product'}
        <div style="font-size: 12px; color: #a1a1a6; margin-top: 3px;">
          Formula: <span style="color: #42fcff;">${item.formula || 'Base'}</span> &bull; 
          Shade: <strong>${item.shade_name || item.variant_title}</strong> 
          ${item.shade_code ? `(${item.shade_code})` : ''}
        </div>
      </td>
      <td style="padding: 12px 8px; text-align: center; color: #d1d1d6; font-size: 14px;">
        ${item.quantity}
      </td>
      <td style="padding: 12px 8px; text-align: right; color: #f5f5f7; font-size: 14px; font-weight: 600;">
        ₹${Number(item.total_price).toLocaleString('en-IN')}
      </td>
    </tr>`
    )
    .join('');

  const formattedAddress = shippingAddress
    ? `${shippingAddress.line1}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}, ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}`
    : 'No address provided';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Alert: ${order.order_number}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f5f5f7;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #121216; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.6);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #18181b 0%, #09090b 100%); padding: 24px; border-bottom: 1px solid #27272a;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #42fcff; font-weight: 700; margin-bottom: 6px;">
        NEW STORE ORDER RECEIVED
      </div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">
        Order #${order.order_number}
      </h1>
      <div style="font-size: 13px; color: #a1a1a6; margin-top: 6px;">
        Total Paid: <strong style="color: #42fcff; font-size: 16px;">₹${Number(order.total_amount).toLocaleString('en-IN')}</strong> &bull; Status: <span style="background: #27272a; padding: 2px 8px; border-radius: 4px; color: #f5f5f7; text-transform: uppercase; font-size: 11px;">${order.status}</span>
      </div>
    </div>

    <!-- Body -->
    <div style="padding: 24px;">
      
      <!-- Customer Info Card -->
      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #a1a1a6; font-weight: 600; margin-bottom: 10px;">
          Customer & Shipping Details
        </div>
        <div style="font-size: 14px; color: #f5f5f7; line-height: 1.6;">
          <div><strong>Name:</strong> ${customer.name || 'Valued Customer'}</div>
          <div><strong>Email:</strong> <a href="mailto:${customer.email}" style="color: #42fcff; text-decoration: none;">${customer.email}</a></div>
          <div><strong>Phone:</strong> ${customer.phone || shippingAddress?.phone || 'Not provided'}</div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #3f3f46;">
            <strong>Shipping Destination:</strong><br />
            ${formattedAddress}
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #a1a1a6; font-weight: 600; margin-bottom: 10px;">
          Ordered Items & Shade Formula
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #3f3f46; color: #a1a1a6; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 8px;">Product</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <!-- CTA / Action Button -->
      <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #27272a;">
        <a href="http://localhost:5173/admin" style="display: inline-block; background: #42fcff; color: #000000; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; letter-spacing: 0.04em;">
          Open Admin Panel to Manage Dispatch &rarr;
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #09090b; padding: 16px 24px; border-top: 1px solid #27272a; text-align: center; font-size: 12px; color: #71717a;">
      Evoluir Internal Operations &bull; Automated Payment & Order Dispatch Pipeline
    </div>
  </div>
</body>
</html>`;
};

/**
 * Renders luxury branded Customer Order Confirmation Receipt HTML
 */
export const renderCustomerReceiptHtml = (order, customer, items, shippingAddress) => {
  const itemsHtml = items
    .map(
      (item) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid #222226;">
      <div style="display: flex; align-items: center; gap: 14px;">
        ${
          item.hex_color
            ? `<div style="width: 24px; height: 24px; border-radius: 50%; background: ${item.hex_color}; border: 1px solid rgba(255,255,255,0.25); flex-shrink: 0;"></div>`
            : ''
        }
        <div>
          <div style="font-size: 14px; font-weight: 600; color: #ffffff;">
            ${item.product_title || 'Evoluir Device / Formula'}
          </div>
          <div style="font-size: 12px; color: #8e8e93; margin-top: 3px;">
            ${item.formula ? `<span style="text-transform: uppercase; color: #42fcff; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;">${item.formula}</span> &bull; ` : ''}
            Shade: <span style="color: #e5e5ea;">${item.shade_name || item.variant_title}</span>
            ${item.shade_code ? ` &bull; Code ${item.shade_code}` : ''}
          </div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 14px; font-weight: 600; color: #ffffff;">
          ₹${Number(item.total_price).toLocaleString('en-IN')}
        </div>
        <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">
          Qty: ${item.quantity}
        </div>
      </div>
    </div>`
    )
    .join('');

  const formattedAddress = shippingAddress
    ? `${shippingAddress.line1}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}, ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}`
    : 'Provided at checkout';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Evoluir Order #${order.order_number}</title>
</head>
<body style="margin: 0; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050505; color: #e5e5ea;">
  <div style="max-width: 580px; margin: 0 auto; background: #0e0e11; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.85);">
    
    <!-- Luxury Brand Masthead -->
    <div style="padding: 36px 32px 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06); background: radial-gradient(circle at top, #181820 0%, #0e0e11 80%);">
      <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.3em; text-transform: uppercase; color: #ffffff;">
        EVOLUIR
      </div>
      <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8e8e93; margin-top: 6px;">
        Haute Performance Air Mist
      </div>
      <div style="display: inline-block; margin-top: 20px; padding: 4px 12px; border-radius: 20px; background: rgba(66, 252, 255, 0.1); border: 1px solid rgba(66, 252, 255, 0.25); color: #42fcff; font-size: 12px; font-weight: 600;">
        Payment Confirmed &bull; Order #${order.order_number}
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 32px;">
      
      <!-- Greeting -->
      <h2 style="margin: 0 0 10px; font-size: 20px; font-weight: 600; color: #ffffff;">
        Thank you, ${customer.name || 'Valued Collector'}.
      </h2>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #a1a1a6;">
        Your precision micro-mist order is confirmed and has entered the preparation queue. Our atelier will hand-inspect each formulation capsule prior to dispatch.
      </p>

      <!-- Order Status Stepper Snapshot -->
      <div style="background: #141418; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px 20px; margin-bottom: 28px;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #8e8e93; margin-bottom: 10px;">
          <span>Status: <strong style="color: #42fcff;">Preparing Order</strong></span>
          <span>Delivery Estimate: <strong>2&ndash;4 Business Days</strong></span>
        </div>
        <div style="height: 4px; background: #27272a; border-radius: 2px; overflow: hidden;">
          <div style="width: 35%; height: 100%; background: linear-gradient(90deg, #42fcff, #00d2ff); border-radius: 2px;"></div>
        </div>
      </div>

      <!-- Items Section -->
      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #8e8e93; font-weight: 700; margin-bottom: 12px;">
          Your Selections
        </div>
        <div>
          ${itemsHtml}
        </div>
      </div>

      <!-- Pricing Summary -->
      <div style="background: #141418; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #a1a1a6; margin-bottom: 8px;">
          <span>Subtotal</span>
          <span style="color: #ffffff;">₹${Number(order.total_amount).toLocaleString('en-IN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #a1a1a6; margin-bottom: 8px;">
          <span>Courier Delivery</span>
          <span style="color: #42fcff; font-weight: 600;">Complimentary</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #ffffff; padding-top: 10px; border-top: 1px solid #222226;">
          <span>Total Paid</span>
          <span style="color: #42fcff;">₹${Number(order.total_amount).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <!-- Delivery Address -->
      <div style="font-size: 13px; line-height: 1.6; color: #a1a1a6; margin-bottom: 28px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8e8e93; font-weight: 700; margin-bottom: 6px;">
          Shipping Destination
        </div>
        <div>${formattedAddress}</div>
      </div>

      <!-- Track Order CTA -->
      <div style="text-align: center; margin-top: 24px;">
        <a href="http://localhost:5173/orders" style="display: inline-block; background: #ffffff; color: #000000; font-weight: 700; font-size: 13px; padding: 12px 28px; border-radius: 8px; text-decoration: none; letter-spacing: 0.05em;">
          Track Live Package Status &rarr;
        </a>
      </div>

    </div>

    <!-- Concierge Footer -->
    <div style="padding: 24px; text-align: center; background: #08080a; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #636366; line-height: 1.6;">
      Need assistance? Contact our Concierge at <a href="mailto:support@evoluir.luxury" style="color: #8e8e93; text-decoration: underline;">support@evoluir.luxury</a>.<br />
      &copy; 2026 Evoluir Inc. All rights reserved.
    </div>

  </div>
</body>
</html>`;
};

/**
 * Dispatches both Owner Order Alert and Customer Confirmation receipt
 * Logs clean structured application telemetry through Pino logger.
 */
export const sendOrderConfirmationEmails = async (orderId) => {
  try {
    logger.info({ orderId }, '[EMAIL_PIPELINE] Starting order notification pipeline');

    // 1. Fetch complete order record
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      logger.warn({ orderId }, '[EMAIL_PIPELINE] Order not found for email dispatch');
      return { success: false, reason: 'ORDER_NOT_FOUND' };
    }

    // 2. Fetch customer info
    const [customer] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, order.user_id))
      .limit(1);

    if (!customer || !customer.email) {
      logger.warn({ orderId, userId: order.user_id }, '[EMAIL_PIPELINE] Customer record or email not found');
      return { success: false, reason: 'CUSTOMER_EMAIL_MISSING' };
    }

    // 3. Fetch items enriched with product title and variant metadata
    const rawItems = await db
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        unit_price_paise: orderItems.unit_price_paise,
        variant_id: orderItems.variant_id,
        variant_title: productVariants.shade_name,
        sku: productVariants.sku,
        formula: productVariants.formula,
        shade_name: productVariants.shade_name,
        shade_code: productVariants.shade_code,
        hex_color: productVariants.color_hex,
        product_id: productVariants.product_id,
        product_name: products.name,
      })
      .from(orderItems)
      .leftJoin(productVariants, eq(orderItems.variant_id, productVariants.id))
      .leftJoin(products, eq(productVariants.product_id, products.id))
      .where(eq(orderItems.order_id, orderId));

    const totalRupees = order.total_paise ? Math.round(order.total_paise / 100) : Number(order.total_amount || 0);

    const items = rawItems.map((item) => {
      const unitRupees = item.unit_price_paise ? Math.round(item.unit_price_paise / 100) : 0;
      return {
        ...item,
        product_title: item.product_name || 'Evo-Air Mist Device',
        unit_price: unitRupees,
        total_price: unitRupees * item.quantity,
      };
    });

    const enrichedOrder = {
      ...order,
      total_amount: totalRupees,
    };

    const shippingAddress = order.shipping_address;

    // 4. Render HTML templates
    const ownerHtml = renderOwnerOrderAlertHtml(enrichedOrder, customer, items, shippingAddress);
    const customerHtml = renderCustomerReceiptHtml(enrichedOrder, customer, items, shippingAddress);

    const client = getTransporter();

    // 5. Send or log Owner Order Alert
    const ownerEmail = env.OWNER_EMAIL;
    if (client) {
      await client.sendMail({
        from: env.SMTP_FROM,
        to: ownerEmail,
        subject: `[NEW ORDER] ${order.order_number} - ₹${Number(order.total_amount).toLocaleString('en-IN')} by ${customer.name || customer.email}`,
        html: ownerHtml,
      });
      logger.info(
        {
          event: 'EMAIL_SENT',
          recipient: ownerEmail,
          orderNumber: order.order_number,
          type: 'OWNER_ORDER_ALERT',
        },
        '[EMAIL_PIPELINE] Store Owner alert email dispatched via SMTP'
      );
    } else {
      logger.info(
        {
          event: 'EMAIL_DEV_TELEMETRY',
          recipient: ownerEmail,
          from: env.SMTP_FROM,
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          itemCount: items.length,
          type: 'OWNER_ORDER_ALERT',
          status: 'SIMULATED_SUCCESS_NO_SMTP',
        },
        '[EMAIL_PIPELINE] Simulated Store Owner alert email (SMTP not configured in .env)'
      );
    }

    // 6. Send or log Customer Receipt
    if (client) {
      await client.sendMail({
        from: env.SMTP_FROM,
        to: customer.email,
        subject: `Your Evoluir Order #${order.order_number} is Confirmed`,
        html: customerHtml,
      });
      logger.info(
        {
          event: 'EMAIL_SENT',
          recipient: customer.email,
          orderNumber: order.order_number,
          type: 'CUSTOMER_CONFIRMATION',
        },
        '[EMAIL_PIPELINE] Customer confirmation receipt dispatched via SMTP'
      );
    } else {
      logger.info(
        {
          event: 'EMAIL_DEV_TELEMETRY',
          recipient: customer.email,
          from: env.SMTP_FROM,
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          itemCount: items.length,
          type: 'CUSTOMER_CONFIRMATION',
          status: 'SIMULATED_SUCCESS_NO_SMTP',
        },
        '[EMAIL_PIPELINE] Simulated Customer confirmation receipt (SMTP not configured in .env)'
      );
    }

    return { success: true };
  } catch (err) {
    logger.error(
      {
        err: err.message,
        stack: err.stack,
        orderId,
      },
      '[EMAIL_PIPELINE] Failed to send order confirmation emails'
    );
    return { success: false, error: err.message };
  }
};
