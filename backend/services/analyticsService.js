import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq, ne, sql, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products, users } from '../db/schema.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '../logs');
const logFile = path.join(logDir, 'user-activity.log');

// Security & Disk Bounds Configuration
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_BACKUP_FILES = 3; // Keeps up to 3 rotated backups (max 20 MB total storage)
const MAX_LINE_BYTES = 2048; // Max 2 KB per line to stop oversized entries
const SENSITIVE_KEY_REGEX = /password|token|secret|authorization|cookie|credential|key/i;
const JWT_OR_BEARER_REGEX = /^(Bearer\s+)?[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;

// Serial mutex queue to prevent race conditions during log file rotation
let writeQueue = Promise.resolve();

/**
 * Strips newlines, control characters, and dangerous input to prevent log forging/injection attacks
 */
const sanitizeString = (str, maxLength = 256) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, maxLength);
};

/**
 * Sanitizes metadata dictionary to redact sensitive keys and strip control characters
 */
const sanitizeMetadata = (meta) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(meta)) {
    const safeKey = sanitizeString(key, 256);
    if (!safeKey) continue;

    if (SENSITIVE_KEY_REGEX.test(safeKey)) {
      cleaned[safeKey] = '[REDACTED]';
    } else if (typeof value === 'string') {
      if (JWT_OR_BEARER_REGEX.test(value.trim())) {
        cleaned[safeKey] = '[REDACTED]';
      } else {
        cleaned[safeKey] = sanitizeString(value, 256);
      }
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cleaned[safeKey] = value;
    }
  }
  return cleaned;
};

/**
 * Rotates logs if the primary log file exceeds MAX_LOG_SIZE_BYTES
 */
const rotateLogIfNeeded = async () => {
  if (!fs.existsSync(logFile)) return;

  const stats = await fs.promises.stat(logFile);
  if (stats.size < MAX_LOG_SIZE_BYTES) return;

  // Remove oldest backup if it exists
  const oldestBackup = path.join(logDir, `user-activity.${MAX_BACKUP_FILES}.log`);
  if (fs.existsSync(oldestBackup)) {
    await fs.promises.unlink(oldestBackup);
  }

  // Shift existing rotated files: .2 -> .3, .1 -> .2
  for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
    const currentBackup = path.join(logDir, `user-activity.${i}.log`);
    const nextBackup = path.join(logDir, `user-activity.${i + 1}.log`);
    if (fs.existsSync(currentBackup)) {
      await fs.promises.rename(currentBackup, nextBackup);
    }
  }

  // Rotate active log to .1
  await fs.promises.rename(logFile, path.join(logDir, 'user-activity.1.log'));
};

/**
 * Appends sanitized, bounded user journey and telemetry logs to local storage
 */
export const recordUserActivity = (entry) => {
  // Chain through sequential queue to make rotation and append race-condition safe
  writeQueue = writeQueue
    .then(async () => {
      if (!fs.existsSync(logDir)) {
        await fs.promises.mkdir(logDir, { recursive: true });
      }

      await rotateLogIfNeeded();

      const sanitizedEntry = {
        timestamp: entry.timestamp || new Date().toISOString(),
        event: sanitizeString(entry.event, 64) || 'unknown_event',
        path: sanitizeString(entry.path, 256) || '/',
        sessionId: sanitizeString(entry.sessionId, 64) || 'anon_session',
        userId: entry.userId ? sanitizeString(String(entry.userId), 64) : null,
        ip: sanitizeString(entry.ip, 64),
        userAgent: sanitizeString(entry.userAgent, 256),
        metadata: sanitizeMetadata(entry.metadata),
      };

      let line = JSON.stringify(sanitizedEntry) + '\n';

      // Enforce strict per-line byte bounds to prevent disk exhaustion
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        sanitizedEntry.metadata = { _truncated: true };
        line = JSON.stringify(sanitizedEntry) + '\n';
        if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
          line = line.slice(0, MAX_LINE_BYTES - 1) + '\n';
        }
      }

      await fs.promises.appendFile(logFile, line, 'utf8');

      if (sanitizedEntry.event === 'error' || sanitizedEntry.event === 'unhandled_rejection') {
        logger.warn({ userActivity: sanitizedEntry }, `[Telemetry Error] ${sanitizedEntry.event} on ${sanitizedEntry.path}`);
      } else {
        logger.info({ userActivity: sanitizedEntry }, `[Telemetry] ${sanitizedEntry.event} on ${sanitizedEntry.path}`);
      }
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to record user activity log');
    });

  return writeQueue;
};

/**
 * Generates comprehensive store analytics and KPI metrics
 */
export const getStoreAnalytics = async () => {
  // 1. Overview KPIs: Total Revenue, Total Orders, Paid Orders
  const [overview] = await db
    .select({
      total_orders: sql`count(*)::int`,
      total_revenue_paise: sql`coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.total_paise} else 0 end), 0)::bigint`,
      paid_orders: sql`coalesce(sum(case when ${orders.status} in ('paid', 'shipped', 'delivered') then 1 else 0 end), 0)::int`,
      pending_orders: sql`coalesce(sum(case when ${orders.status} = 'pending_payment' then 1 else 0 end), 0)::int`,
      cancelled_orders: sql`coalesce(sum(case when ${orders.status} = 'cancelled' then 1 else 0 end), 0)::int`,
    })
    .from(orders);

  const totalOrders = overview?.total_orders || 0;
  const totalRevenuePaise = Number(overview?.total_revenue_paise || 0);
  const activeOrdersCount = totalOrders - (overview?.cancelled_orders || 0);
  const aovPaise = activeOrdersCount > 0 ? Math.round(totalRevenuePaise / activeOrdersCount) : 0;

  // 2. Customer metrics
  const [customerStats] = await db
    .select({
      total_customers: sql`count(*)::int`,
    })
    .from(users);

  const repeatCustomersResult = await db.execute(sql`
    SELECT count(*)::int as repeat_count
    FROM (
      SELECT user_id
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY user_id
      HAVING count(*) > 1
    ) r
  `);

  // 3. Orders by Status Breakdown
  const statusRows = await db
    .select({
      status: orders.status,
      count: sql`count(*)::int`,
      revenue_paise: sql`coalesce(sum(${orders.total_paise}), 0)::bigint`,
    })
    .from(orders)
    .groupBy(orders.status);

  // 4. Top 5 Best-Selling Variants
  const topVariants = await db
    .select({
      variant_id: orderItems.variant_id,
      shade_name: productVariants.shade_name,
      shade_code: productVariants.shade_code,
      sku: productVariants.sku,
      product_name: products.name,
      total_units_sold: sql`sum(${orderItems.quantity})::int`,
      total_revenue_paise: sql`sum(${orderItems.quantity} * ${orderItems.unit_price_paise})::bigint`,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variant_id, productVariants.id))
    .innerJoin(products, eq(productVariants.product_id, products.id))
    .innerJoin(orders, eq(orderItems.order_id, orders.id))
    .where(ne(orders.status, 'cancelled'))
    .groupBy(
      orderItems.variant_id,
      productVariants.shade_name,
      productVariants.shade_code,
      productVariants.sku,
      products.name
    )
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(5);

  // 5. Recent 10 Orders Timeline
  const recentOrders = await db
    .select({
      id: orders.id,
      customer_name: sql`coalesce(${orders.shipping_address}->>'name', 'Guest')`,
      customer_city: sql`coalesce(${orders.shipping_address}->>'city', '')`,
      status: orders.status,
      total_paise: orders.total_paise,
      expected_delivery_date: orders.expected_delivery_date,
      created_at: orders.created_at,
    })
    .from(orders)
    .orderBy(desc(orders.created_at))
    .limit(10);

  // 6. Last 30-Days Daily Sales Trend
  const dailySales = await db.execute(sql`
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
      count(*)::int as orders_count,
      coalesce(sum(case when status != 'cancelled' then total_paise else 0 end), 0)::bigint as revenue_paise
    FROM orders
    WHERE created_at >= now() - interval '30 days'
    GROUP BY date_trunc('day', created_at)
    ORDER BY date_trunc('day', created_at) ASC
  `);

  return {
    kpis: {
      total_revenue_paise: totalRevenuePaise,
      total_revenue_inr: Math.round(totalRevenuePaise / 100),
      total_orders: totalOrders,
      active_orders: activeOrdersCount,
      paid_orders: overview?.paid_orders || 0,
      pending_orders: overview?.pending_orders || 0,
      cancelled_orders: overview?.cancelled_orders || 0,
      average_order_value_inr: Math.round(aovPaise / 100),
      total_customers: customerStats?.total_customers || 0,
      repeat_customers: repeatCustomersResult?.rows?.[0]?.repeat_count || 0,
    },
    status_breakdown: statusRows.map((s) => ({
      status: s.status,
      count: s.count,
      revenue_inr: Math.round(Number(s.revenue_paise) / 100),
    })),
    top_selling_variants: topVariants.map((v) => ({
      variant_id: v.variant_id,
      product_name: v.product_name,
      shade_name: v.shade_name,
      shade_code: v.shade_code,
      sku: v.sku,
      units_sold: v.total_units_sold,
      revenue_inr: Math.round(Number(v.total_revenue_paise) / 100),
    })),
    recent_orders: recentOrders.map((o) => ({
      id: o.id,
      customer_name: o.customer_name,
      customer_city: o.customer_city,
      status: o.status,
      total_inr: Math.round(o.total_paise / 100),
      expected_delivery_date: o.expected_delivery_date,
      created_at: o.created_at,
    })),
    daily_sales_30d: (dailySales?.rows || []).map((d) => ({
      date: d.date,
      orders_count: d.orders_count,
      revenue_inr: Math.round(Number(d.revenue_paise) / 100),
    })),
  };
};
