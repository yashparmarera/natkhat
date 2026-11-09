# Database Architecture & Schema

## 1. Storage Engine
- **Engine**: Embedded SQLite database (`data/natkhat.db`) via `node:sqlite`.
- **Currency Convention**: All monetary fields are strictly stored as integer paise (`price_paise`, `subtotal_paise`, `delivery_fee_paise`, `total_paise`) to prevent floating-point drift.

## 2. Table Specifications

### `store_settings`
- `id` (INTEGER PRIMARY KEY)
- `cafe_name` (TEXT)
- `tagline` (TEXT)
- `contact_phone` (TEXT)
- `whatsapp_number` (TEXT)
- `address` (TEXT)
- `city` (TEXT)
- `landmark` (TEXT)
- `opening_hours` (TEXT)
- `announcement_text` (TEXT)
- `delivery_enabled` (INTEGER 0/1)
- `pickup_enabled` (INTEGER 0/1)
- `min_order_delivery_paise` (INTEGER)
- `delivery_fee_paise` (INTEGER)
- `free_delivery_threshold_paise` (INTEGER)
- `fssai_number` (TEXT)
- `updated_at` (TEXT)

### `categories`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT)
- `slug` (TEXT)
- `description` (TEXT)
- `display_order` (INTEGER)
- `active` (INTEGER 0/1)
- `image` (TEXT)

### `products`
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT)
- `slug` (TEXT)
- `description` (TEXT)
- `price_paise` (INTEGER)
- `category_id` (TEXT REFERENCES categories(id))
- `category_name` (TEXT)
- `dietary` (TEXT)
- `image` (TEXT)
- `is_available` (INTEGER 0/1)
- `is_featured` (INTEGER 0/1)
- `display_order` (INTEGER)
- `portion_info` (TEXT)
- `prep_time_minutes` (INTEGER)

### `orders`
- `reference_id` (TEXT PRIMARY KEY, e.g. "NC-8402")
- `customer_name` (TEXT)
- `customer_phone` (TEXT)
- `order_type` (TEXT)
- `address` (TEXT)
- `landmark` (TEXT)
- `instructions` (TEXT)
- `subtotal_paise` (INTEGER)
- `delivery_fee_paise` (INTEGER)
- `total_paise` (INTEGER)
- `status` (TEXT DEFAULT 'pending_confirmation')
- `created_at` (TEXT)
- `items_json` (TEXT)

### `admin_users`
- `id` (TEXT PRIMARY KEY)
- `username` (TEXT UNIQUE)
- `password_hash` (TEXT)
- `salt` (TEXT)
- `role` (TEXT)
- `created_at` (TEXT)
