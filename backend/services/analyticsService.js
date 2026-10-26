import { eq, ne, sql, desc } from 'drizzle-orm';
import { db } from '../config/db.js';
import { orders, orderItems, productVariants, products, users } from '../db/schema.js';

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
