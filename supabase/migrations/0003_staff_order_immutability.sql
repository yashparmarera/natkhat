-- Migration 0003: Staff order immutability
-- Staff may only change orders.status (and updated_at). Customer details, order totals,
-- items_json and historical order_items cannot be modified through the Supabase API roles.
-- Defence in depth: BEFORE UPDATE/DELETE triggers enforce the same rule for every role,
-- with ONE exemption: the orders content trigger lets current_user = 'service_role' make
-- audited corrections (SQL sessions / service-role API). postgres, authenticated and anon stay blocked.
-- order_items are immutable for EVERYONE, including service_role.
-- Idempotent: safe to run more than once (DROP ... IF EXISTS before each CREATE).
-- INSERT paths (server-side order creation, data migration) are unaffected.

-- 1. Grants: remove write access for API roles, then allow only status/updated_at updates.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_items FROM anon, authenticated;
GRANT UPDATE (status, updated_at) ON public.orders TO authenticated;

-- 2. RLS: the orders UPDATE policy gets an explicit WITH CHECK.
DROP POLICY IF EXISTS "Staff update orders" ON public.orders;
CREATE POLICY "Staff update orders" ON public.orders
  FOR UPDATE USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

-- 3. Trigger: orders are immutable except status and updated_at (service_role exempt).
-- Not SECURITY DEFINER, so current_user is the invoking role.
CREATE OR REPLACE FUNCTION public.prevent_order_content_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'orders are immutable except status and updated_at' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_immutable_content ON public.orders;
CREATE TRIGGER trg_orders_immutable_content
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_content_update();

-- 4. Trigger: order_items are immutable once written.
CREATE OR REPLACE FUNCTION public.prevent_order_items_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'order_items are immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_no_update ON public.order_items;
CREATE TRIGGER trg_order_items_no_update
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_items_change();

DROP TRIGGER IF EXISTS trg_order_items_no_delete ON public.order_items;
CREATE TRIGGER trg_order_items_no_delete
  BEFORE DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_items_change();
