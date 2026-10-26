import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['customer', 'admin']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
]);

// 1. Users (supports email/password and Google OAuth)
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: text('password_hash'), // Nullable for OAuth users
  google_id: varchar('google_id', { length: 255 }).unique(),
  avatar_url: text('avatar_url'),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 20 }),
  role: roleEnum('role').default('customer').notNull(),
  refresh_token_version: integer('refresh_token_version').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Addresses
export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  line1: text('line1').notNull(),
  line2: text('line2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: varchar('pincode', { length: 10 }).notNull(),
  is_default: boolean('is_default').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Products
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Product Variants (Shades)
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    product_id: uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    shade_name: text('shade_name').notNull(),
    shade_code: varchar('shade_code', { length: 50 }).notNull(),
    sku: varchar('sku', { length: 100 }).notNull().unique(),
    price_paise: integer('price_paise').notNull(),
    stock_qty: integer('stock_qty').notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('product_variants_product_id_idx').on(table.product_id),
    check('product_variants_stock_qty_check', sql`${table.stock_qty} >= 0`),
  ]
);

// 5. Orders (Includes Expected Delivery Date)
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    status: orderStatusEnum('status').default('pending_payment').notNull(),
    subtotal_paise: integer('subtotal_paise').notNull(),
    shipping_paise: integer('shipping_paise').notNull(),
    total_paise: integer('total_paise').notNull(),
    shipping_address: jsonb('shipping_address').notNull(),
    expected_delivery_date: timestamp('expected_delivery_date', { withTimezone: true }),
    razorpay_order_id: varchar('razorpay_order_id', { length: 255 }),
    idempotency_key: varchar('idempotency_key', { length: 255 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('orders_user_id_idx').on(table.user_id),
    unique('orders_user_id_idempotency_key_unique').on(table.user_id, table.idempotency_key),
  ]
);

// 6. Order Items
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    order_id: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    variant_id: uuid('variant_id')
      .references(() => productVariants.id)
      .notNull(),
    quantity: integer('quantity').notNull(),
    unit_price_paise: integer('unit_price_paise').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.order_id),
    check('order_items_quantity_check', sql`${table.quantity} > 0`),
  ]
);

// 7. Payments
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  order_id: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  razorpay_payment_id: varchar('razorpay_payment_id', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull(),
  amount_paise: integer('amount_paise').notNull(),
  raw_payload: jsonb('raw_payload'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. Shipments
export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  order_id: uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  courier: text('courier'),
  awb: text('awb'),
  status: varchar('status', { length: 50 }).notNull(),
  expected_delivery_date: timestamp('expected_delivery_date', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 9. Carts
export const carts = pgTable('carts', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 10. Cart Items
export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cart_id: uuid('cart_id')
      .references(() => carts.id, { onDelete: 'cascade' })
      .notNull(),
    variant_id: uuid('variant_id')
      .references(() => productVariants.id, { onDelete: 'cascade' })
      .notNull(),
    quantity: integer('quantity').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('cart_items_cart_id_variant_id_unique').on(table.cart_id, table.variant_id),
    index('cart_items_cart_id_idx').on(table.cart_id),
    check('cart_items_quantity_check', sql`${table.quantity} > 0`),
  ]
);
