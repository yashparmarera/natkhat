-- Migration 0002: Hardened Row Level Security (RLS) Policies & Database Grants
-- Customer order writes are restricted exclusively to the validated server-side API.
-- Public direct INSERT on orders and order_items is strictly forbidden.

-- 1. Enable RLS on all tables
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer Helper Functions
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'manager', 'staff')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = 'admin'
  );
$$;

-- Function Execution Permissions Hardening
REVOKE EXECUTE ON FUNCTION public.is_active_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO anon, authenticated, service_role;

-- 3. Public-Safe View for Store Settings
-- Configured with security_invoker = false (definer mode) and security_barrier = true
-- This allows anonymous customers to query public-safe storefront parameters
-- while completely blocking direct read access to the underlying store_settings table.
CREATE OR REPLACE VIEW public.public_store_settings 
WITH (security_barrier = true, security_invoker = false) AS
SELECT 
  cafe_name,
  tagline,
  contact_phone,
  whatsapp_number,
  address,
  city,
  landmark,
  opening_hours,
  announcement_text,
  delivery_enabled,
  pickup_enabled,
  min_order_delivery_paise,
  delivery_fee_paise,
  free_delivery_threshold_paise,
  fssai_number
FROM public.store_settings
WHERE id = 1;

-- 4. Database Grants Hardening
-- Step 4A: Revoke all direct permissions from anon and authenticated roles across all tables
REVOKE ALL ON public.orders FROM anon, authenticated;
REVOKE ALL ON public.order_items FROM anon, authenticated;
REVOKE ALL ON public.store_settings FROM anon, authenticated;
REVOKE ALL ON public.categories FROM anon, authenticated;
REVOKE ALL ON public.products FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;

-- Step 4B: Anonymous Role Grants (Storefront Read-Only Access)
-- Anonymous users can ONLY query public-safe view, active categories, and available products.
-- ZERO write permissions. ZERO access to customer orders or order items. ZERO access to profiles.
GRANT SELECT ON public.public_store_settings TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;

-- Step 4C: Authenticated Role Grants (Controlled Strictly by RLS Policies Below)
-- Note: authenticated users have NO INSERT grants on orders or order_items. Order writes are server-exclusive.
GRANT SELECT ON public.public_store_settings TO authenticated;
GRANT SELECT, UPDATE ON public.store_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 5. RLS Policies

-- store_settings: Base table access is restricted to active staff/admin
CREATE POLICY "Staff read base store settings" ON public.store_settings
  FOR SELECT USING (public.is_active_staff());

CREATE POLICY "Admin update store settings" ON public.store_settings
  FOR UPDATE USING (public.is_active_admin());

-- categories: Public read active; staff read/manage all
CREATE POLICY "Public read active categories" ON public.categories
  FOR SELECT USING (active = true OR public.is_active_staff());

CREATE POLICY "Staff manage categories" ON public.categories
  FOR ALL USING (public.is_active_staff());

-- products: Public read available; staff read/manage all
CREATE POLICY "Public read available products" ON public.products
  FOR SELECT USING (is_available = true OR public.is_active_staff());

CREATE POLICY "Staff manage products" ON public.products
  FOR ALL USING (public.is_active_staff());

-- orders: ZERO PUBLIC ACCESS (No public INSERT, no public SELECT)
-- Orders can only be inserted by the privileged server-side backend.
CREATE POLICY "Staff select orders" ON public.orders
  FOR SELECT USING (public.is_active_staff());

CREATE POLICY "Staff update orders" ON public.orders
  FOR UPDATE USING (public.is_active_staff());

-- order_items: ZERO PUBLIC ACCESS (No public INSERT, no public SELECT)
-- Line items can only be inserted by the privileged server-side backend.
CREATE POLICY "Staff select order items" ON public.order_items
  FOR SELECT USING (public.is_active_staff());

-- profiles: Users can read their own profile; admins can read and manage all profiles
CREATE POLICY "Users read own profile or admin reads all" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_active_admin());

CREATE POLICY "Admin manage profiles" ON public.profiles
  FOR ALL USING (public.is_active_admin());
