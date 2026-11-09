-- Migration 0001: Initial PostgreSQL Schema for Natkhat Café

-- 1. Create Enums
CREATE TYPE public.order_type AS ENUM ('delivery', 'pickup');
CREATE TYPE public.order_status AS ENUM (
  'pending_confirmation',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'ready_for_pickup',
  'completed',
  'cancelled'
);
CREATE TYPE public.staff_role AS ENUM ('admin', 'manager', 'staff');

-- 2. Store Settings
CREATE TABLE public.store_settings (
  id integer PRIMARY KEY DEFAULT 1,
  cafe_name text NOT NULL DEFAULT 'Natkhat Café',
  tagline text NOT NULL DEFAULT 'Desi Flavours • Fresh Everyday • Handcrafted With Love',
  contact_phone text NOT NULL DEFAULT '+91 98765 43210',
  whatsapp_number text NOT NULL DEFAULT '919876543210',
  address text NOT NULL,
  city text NOT NULL DEFAULT 'New Delhi / NCR',
  landmark text,
  opening_hours text NOT NULL DEFAULT '8:00 AM – 10:30 PM (Mon – Sun)',
  announcement_text text,
  delivery_enabled boolean NOT NULL DEFAULT true,
  pickup_enabled boolean NOT NULL DEFAULT true,
  min_order_delivery_paise bigint NOT NULL DEFAULT 10000,
  delivery_fee_paise bigint NOT NULL DEFAULT 3000,
  free_delivery_threshold_paise bigint NOT NULL DEFAULT 25000,
  fssai_number text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_settings_single_row_chk CHECK (id = 1),
  CONSTRAINT store_settings_positive_paise_chk CHECK (
    min_order_delivery_paise >= 0 AND 
    delivery_fee_paise >= 0 AND 
    free_delivery_threshold_paise >= 0
  )
);

-- 3. Categories
CREATE TABLE public.categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  image text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_display_order ON public.categories (display_order);
CREATE INDEX idx_categories_active ON public.categories (active);

-- 4. Products
CREATE TABLE public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_paise bigint NOT NULL,
  category_id text NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  category_name text,
  dietary text NOT NULL DEFAULT 'veg',
  image text,
  is_available boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  portion_info text,
  prep_time_minutes integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_product_price_positive CHECK (price_paise > 0),
  CONSTRAINT check_product_prep_time_non_neg CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0)
);

CREATE INDEX idx_products_category ON public.products (category_id);
CREATE INDEX idx_products_available ON public.products (is_available);
CREATE INDEX idx_products_display_order ON public.products (display_order);

-- 5. Orders
CREATE TABLE public.orders (
  reference_id text PRIMARY KEY,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  order_type public.order_type NOT NULL,
  address text,
  landmark text,
  instructions text,
  subtotal_paise bigint NOT NULL,
  delivery_fee_paise bigint NOT NULL,
  total_paise bigint NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending_confirmation',
  items_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_orders_paise_integrity CHECK (
    subtotal_paise >= 0 AND 
    delivery_fee_paise >= 0 AND 
    total_paise = (subtotal_paise + delivery_fee_paise)
  )
);

CREATE INDEX idx_orders_status ON public.orders (status);
CREATE INDEX idx_orders_created_at ON public.orders (created_at);
CREATE INDEX idx_orders_customer_phone ON public.orders (customer_phone);

-- 6. Authoritative Order Items
CREATE TABLE public.order_items (
  id text PRIMARY KEY,
  order_reference_id text NOT NULL REFERENCES public.orders(reference_id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  unit_price_paise bigint NOT NULL,
  quantity integer NOT NULL,
  total_paise bigint NOT NULL,
  portion_info_snapshot text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_item_quantity_positive CHECK (quantity > 0),
  CONSTRAINT check_item_price_positive CHECK (unit_price_paise >= 0 AND total_paise >= 0),
  CONSTRAINT check_item_total_math CHECK (total_paise = (unit_price_paise * quantity))
);

CREATE INDEX idx_order_items_order_ref ON public.order_items (order_reference_id);
CREATE INDEX idx_order_items_product ON public.order_items (product_id);

-- 7. Staff Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role public.staff_role NOT NULL DEFAULT 'staff',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_email ON public.profiles (email);
CREATE INDEX idx_profiles_role ON public.profiles (role);
CREATE INDEX idx_profiles_is_active ON public.profiles (is_active);
