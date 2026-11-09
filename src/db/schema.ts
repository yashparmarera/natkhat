import { 
  pgTable, 
  text, 
  boolean, 
  integer, 
  bigint, 
  timestamp, 
  jsonb, 
  pgEnum, 
  check, 
  index, 
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums matching verified business logic
export const orderTypeEnum = pgEnum('order_type', ['delivery', 'pickup']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'ready_for_pickup',
  'completed',
  'cancelled'
]);

export const staffRoleEnum = pgEnum('staff_role', ['admin', 'manager', 'staff']);

// 1. Store Settings (Single-Row Enforced)
export const storeSettings = pgTable('store_settings', {
  id: integer('id').primaryKey().default(1),
  cafeName: text('cafe_name').notNull().default('Natkhat Café'),
  tagline: text('tagline').notNull().default('Desi Flavours • Fresh Everyday • Handcrafted With Love'),
  contactPhone: text('contact_phone').notNull().default('+91 98765 43210'),
  whatsappNumber: text('whatsapp_number').notNull().default('919876543210'),
  address: text('address').notNull(),
  city: text('city').notNull().default('New Delhi / NCR'),
  landmark: text('landmark'),
  openingHours: text('opening_hours').notNull().default('8:00 AM – 10:30 PM (Mon – Sun)'),
  announcementText: text('announcement_text'),
  deliveryEnabled: boolean('delivery_enabled').notNull().default(true),
  pickupEnabled: boolean('pickup_enabled').notNull().default(true),
  minOrderDeliveryPaise: bigint('min_order_delivery_paise', { mode: 'number' }).notNull().default(10000),
  deliveryFeePaise: bigint('delivery_fee_paise', { mode: 'number' }).notNull().default(3000),
  freeDeliveryThresholdPaise: bigint('free_delivery_threshold_paise', { mode: 'number' }).notNull().default(25000),
  fssaiNumber: text('fssai_number'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('store_settings_single_row_chk', sql`${table.id} = 1`),
  check('store_settings_positive_paise_chk', sql`
    ${table.minOrderDeliveryPaise} >= 0 AND 
    ${table.deliveryFeePaise} >= 0 AND 
    ${table.freeDeliveryThresholdPaise} >= 0
  `),
]);

// 2. Categories Table
export const categories = pgTable('categories', {
  id: text('id').primaryKey(), // Preserves slug-based IDs from SQLite (e.g. 'tea-snacks')
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  displayOrder: integer('display_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_categories_display_order').on(table.displayOrder),
  index('idx_categories_active').on(table.active),
]);

// 3. Products Table
export const products = pgTable('products', {
  id: text('id').primaryKey(), // e.g. 'prod-kulhad-chai'
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  pricePaise: bigint('price_paise', { mode: 'number' }).notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  categoryName: text('category_name'),
  dietary: text('dietary').notNull().default('veg'),
  image: text('image'),
  isAvailable: boolean('is_available').notNull().default(true),
  isFeatured: boolean('is_featured').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  portionInfo: text('portion_info'),
  prepTimeMinutes: integer('prep_time_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_products_category').on(table.categoryId),
  index('idx_products_available').on(table.isAvailable),
  index('idx_products_display_order').on(table.displayOrder),
  check('check_product_price_positive', sql`${table.pricePaise} > 0`),
  check('check_product_prep_time_non_neg', sql`${table.prepTimeMinutes} IS NULL OR ${table.prepTimeMinutes} >= 0`),
]);

// 4. Orders Table
export const orders = pgTable('orders', {
  referenceId: text('reference_id').primaryKey(), // e.g. 'NC-348176'
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  orderType: orderTypeEnum('order_type').notNull(),
  address: text('address'),
  landmark: text('landmark'),
  instructions: text('instructions'),
  subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull(),
  deliveryFeePaise: bigint('delivery_fee_paise', { mode: 'number' }).notNull(),
  totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
  status: orderStatusEnum('status').notNull().default('pending_confirmation'),
  // Retained snapshot for backwards compatibility with frontend serializers
  itemsJson: jsonb('items_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_orders_status').on(table.status),
  index('idx_orders_created_at').on(table.createdAt),
  index('idx_orders_customer_phone').on(table.customerPhone),
  check('check_orders_paise_integrity', sql`
    ${table.subtotalPaise} >= 0 AND 
    ${table.deliveryFeePaise} >= 0 AND 
    ${table.totalPaise} = (${table.subtotalPaise} + ${table.deliveryFeePaise})
  `),
]);

// 5. Authoritative Relational Order Items Table
export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(), // e.g. UUID v4
  orderReferenceId: text('order_reference_id').notNull().references(() => orders.referenceId, { onDelete: 'restrict' }),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
  quantity: integer('quantity').notNull(),
  totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
  portionInfoSnapshot: text('portion_info_snapshot'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_order_items_order_ref').on(table.orderReferenceId),
  index('idx_order_items_product').on(table.productId),
  check('check_item_quantity_positive', sql`${table.quantity} > 0`),
  check('check_item_price_positive', sql`${table.unitPricePaise} >= 0 AND ${table.totalPaise} >= 0`),
  check('check_item_total_math', sql`${table.totalPaise} = (${table.unitPricePaise} * ${table.quantity})`),
]);

// 6. Profiles Table (Linked to Supabase Auth auth.users.id)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // Matches auth.users.id (UUID)
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: staffRoleEnum('role').notNull().default('staff'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_profiles_email').on(table.email),
  index('idx_profiles_role').on(table.role),
  index('idx_profiles_is_active').on(table.isActive),
]);
