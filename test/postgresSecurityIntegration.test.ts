import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Disposable Real PostgreSQL Integration Test Suite
 * 
 * Uses an isolated, in-memory PostgreSQL engine (PGlite / WebAssembly PostgreSQL 16+)
 * to test all supabase/migrations/*.sql files (0001 - 0003) against REAL database roles:
 * - anon
 * - authenticated (staff, manager, admin, inactive)
 * - service_role
 * 
 * STRICT COMPLIANCE: Runs exclusively against a disposable in-memory engine. NEVER touches production.
 */

test('PostgreSQL Real Integration: Security, RLS, and Role Verification', async (t) => {
  const pg = new PGlite();

  // 1. Setup Supabase Auth Primitives and Roles in Disposable Postgres
  await pg.exec(`
    -- Create auth schema and auth.uid() function simulating Supabase JWT context
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    -- Create genuine PostgreSQL roles
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;

    -- Grant schema usage
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  `);

  // 2. Execute ALL migrations in order (0001 schema, 0002 RLS, 0003 staff order immutability, ...)
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }

  // 4. Seed Disposable Database as superuser / service_role
  const adminId = 'a0000000-0000-0000-0000-000000000001';
  const staffId = 'b0000000-0000-0000-0000-000000000002';
  const inactiveStaffId = 'c0000000-0000-0000-0000-000000000003';

  await pg.exec(`
    -- Insert store settings
    INSERT INTO public.store_settings (
      id, cafe_name, tagline, contact_phone, whatsapp_number, address,
      opening_hours, min_order_delivery_paise, delivery_fee_paise, free_delivery_threshold_paise
    ) VALUES (
      1, 'Natkhat Café', 'Desi Flavours', '+91 98765 43210', '919876543210',
      'Shop 12-14, Sector 4', '8:00 AM – 10:30 PM', 10000, 3000, 25000
    );

    -- Insert active and inactive categories
    INSERT INTO public.categories (id, name, slug, active, display_order)
    VALUES 
      ('cat-active', 'Active Chai', 'active-chai', true, 1),
      ('cat-inactive', 'Seasonal Winter Special', 'winter-special', false, 2);

    -- Insert available and unavailable products
    INSERT INTO public.products (id, name, slug, price_paise, category_id, is_available)
    VALUES 
      ('prod-available', 'Special Kulhad Chai', 'kulhad-chai', 3000, 'cat-active', true),
      ('prod-unavailable', 'Special Kesar Jalebi', 'kesar-jalebi', 8000, 'cat-active', false);

    -- Insert staff profiles
    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES 
      ('${adminId}', 'admin@natkhatcafe.com', 'Admin User', 'admin', true),
      ('${staffId}', 'staff@natkhatcafe.com', 'Staff Member', 'staff', true),
      ('${inactiveStaffId}', 'inactive@natkhatcafe.com', 'Inactive Member', 'staff', false);

    -- Insert sample order and order items
    INSERT INTO public.orders (
      reference_id, customer_name, customer_phone, order_type,
      subtotal_paise, delivery_fee_paise, total_paise, items_json
    ) VALUES (
      'NC-111111', 'Test Customer', '9876543210', 'delivery',
      25000, 0, 25000, '[]'::jsonb
    );

    INSERT INTO public.order_items (
      id, order_reference_id, product_id, product_name_snapshot,
      unit_price_paise, quantity, total_paise
    ) VALUES (
      'item-1', 'NC-111111', 'prod-available', 'Special Kulhad Chai',
      3000, 2, 6000
    );
  `);

  // Helper to run query as a specific role and JWT claim with automatic transaction cleanup
  async function queryAs(role: 'anon' | 'authenticated', userId: string | null, sqlText: string) {
    const claimSetting = userId ? `SET LOCAL request.jwt.claim.sub = '${userId}';` : `SET LOCAL request.jwt.claim.sub = '';`;
    try {
      await pg.exec('BEGIN;');
      await pg.exec(`SET LOCAL ROLE ${role};`);
      await pg.exec(claimSetting);
      const res = await pg.exec(sqlText);
      await pg.exec('COMMIT;');
      return res;
    } catch (err) {
      await pg.exec('ROLLBACK;').catch(() => {});
      throw err;
    }
  }

  // --- REAL POSTGRESQL SECURITY TESTS ---

  await t.test('1. Anonymous user CANNOT write directly to orders (REVOKE ALL check)', async () => {
    let errorCaught = false;
    try {
      await queryAs('anon', null, `
        INSERT INTO public.orders (
          reference_id, customer_name, customer_phone, order_type,
          subtotal_paise, delivery_fee_paise, total_paise, items_json
        ) VALUES (
          'NC-HACK', 'Attacker', '0000000000', 'pickup',
          1, 0, 1, '[]'::jsonb
        );
      `);
    } catch (err: any) {
      errorCaught = true;
      assert.match(err.message, /permission denied/i, 'Database must return permission denied for orders INSERT');
    }
    assert.equal(errorCaught, true, 'Anonymous direct INSERT into orders must be blocked');
  });

  await t.test('2. Anonymous user CANNOT write directly to order_items (REVOKE ALL check)', async () => {
    let errorCaught = false;
    try {
      await queryAs('anon', null, `
        INSERT INTO public.order_items (
          id, order_reference_id, product_id, product_name_snapshot,
          unit_price_paise, quantity, total_paise
        ) VALUES (
          'item-hack', 'NC-111111', 'prod-available', 'Spoofed Item',
          1, 1, 1
        );
      `);
    } catch (err: any) {
      errorCaught = true;
      assert.match(err.message, /permission denied/i, 'Database must return permission denied for order_items INSERT');
    }
    assert.equal(errorCaught, true, 'Anonymous direct INSERT into order_items must be blocked');
  });

  await t.test('3. Authenticated customer CANNOT write directly to orders (Server API Exclusivity)', async () => {
    let errorCaught = false;
    try {
      await queryAs('authenticated', 'd0000000-0000-0000-0000-000000000004', `
        INSERT INTO public.orders (
          reference_id, customer_name, customer_phone, order_type,
          subtotal_paise, delivery_fee_paise, total_paise, items_json
        ) VALUES (
          'NC-SPOOF', 'Customer', '9999999999', 'pickup',
          1, 0, 1, '[]'::jsonb
        );
      `);
    } catch (err: any) {
      errorCaught = true;
      assert.match(err.message, /permission denied/i, 'Database must return permission denied for orders INSERT');
    }
    assert.equal(errorCaught, true, 'Ordinary authenticated users must have no direct INSERT grant on orders');
  });

  await t.test('4. Anonymous user CANNOT read orders table directly (REVOKE ALL check)', async () => {
    let errorCaught = false;
    try {
      await queryAs('anon', null, `SELECT * FROM public.orders;`);
    } catch (err: any) {
      errorCaught = true;
      assert.match(err.message, /permission denied/i, 'Database must return permission denied for orders SELECT');
    }
    assert.equal(errorCaught, true, 'Anonymous user must have no read access to orders');
  });

  await t.test('5. Anonymous user CANNOT read base store_settings table directly', async () => {
    let errorCaught = false;
    try {
      await queryAs('anon', null, `SELECT * FROM public.store_settings;`);
    } catch (err: any) {
      errorCaught = true;
      assert.match(err.message, /permission denied/i, 'Database must return permission denied for store_settings SELECT');
    }
    assert.equal(errorCaught, true, 'Anonymous user must have no read access to base store_settings');
  });

  await t.test('6. Anonymous user CAN read public_store_settings view (Safe View Exposure)', async () => {
    const res = await queryAs('anon', null, `SELECT * FROM public.public_store_settings;`);
    const selectRes = res.find((r) => Array.isArray(r.rows) && r.rows.length > 0);
    assert.ok(selectRes, 'Must return rows from public_store_settings');
    assert.equal(selectRes.rows[0].cafe_name, 'Natkhat Café');
    assert.equal(Number(selectRes.rows[0].min_order_delivery_paise), 10000);
    // Ensure internal metadata is NOT exposed by the view
    assert.equal(selectRes.rows[0].updated_at, undefined);
  });

  await t.test('7. Anonymous user can ONLY see active categories via RLS', async () => {
    const res = await queryAs('anon', null, `SELECT id, name, active FROM public.categories;`);
    const selectRes = res.find((r) => Array.isArray(r.rows) && r.rows.length > 0);
    assert.ok(selectRes);
    assert.equal(selectRes.rows.length, 1, 'Anonymous user must see only the 1 active category');
    assert.equal(selectRes.rows[0].id, 'cat-active');
  });

  await t.test('8. Anonymous user can ONLY see available products via RLS', async () => {
    const res = await queryAs('anon', null, `SELECT id, name, is_available FROM public.products;`);
    const selectRes = res.find((r) => Array.isArray(r.rows) && r.rows.length > 0);
    assert.ok(selectRes);
    assert.equal(selectRes.rows.length, 1, 'Anonymous user must see only the 1 available product');
    assert.equal(selectRes.rows[0].id, 'prod-available');
  });

  await t.test('9. Active Staff CAN read orders table via RLS', async () => {
    const res = await queryAs('authenticated', staffId, `SELECT reference_id, total_paise FROM public.orders;`);
    const selectRes = res.find((r) => Array.isArray(r.rows) && r.rows.length > 0);
    assert.ok(selectRes);
    assert.equal(selectRes.rows.length, 1);
    assert.equal(selectRes.rows[0].reference_id, 'NC-111111');
  });

  await t.test('10. Inactive Staff CANNOT read orders table (is_active_staff evaluates false)', async () => {
    const res = await queryAs('authenticated', inactiveStaffId, `SELECT reference_id FROM public.orders;`);
    const selectRes = res.find((r) => Array.isArray(r.rows));
    assert.ok(selectRes);
    assert.equal(selectRes.rows.length, 0, 'Inactive staff must receive 0 rows from orders table');
  });

  await t.test('11. Staff user CANNOT promote themselves or modify roles in profiles', async () => {
    const res = await queryAs('authenticated', staffId, `
      UPDATE public.profiles SET role = 'admin' WHERE id = '${staffId}';
    `);
    const updateRes = res.find((r) => typeof r.affectedRows === 'number');
    assert.equal(updateRes?.affectedRows, 0, 'Staff update on profiles must affect 0 rows due to RLS');

    const checkRes = await pg.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = '${staffId}';`);
    assert.equal(checkRes.rows[0]?.role, 'staff', 'Role must remain staff');
  });

  await t.test('12. Admin user CAN update store settings', async () => {
    const res = await queryAs('authenticated', adminId, `
      UPDATE public.store_settings SET announcement_text = 'Updated by Admin' WHERE id = 1;
    `);
    const updateRes = res.find((r) => typeof r.affectedRows === 'number');
    assert.equal(updateRes?.affectedRows, 1, 'Admin must be permitted to update store settings');

    const checkRes = await pg.query<{ announcement_text: string }>(`SELECT announcement_text FROM public.store_settings WHERE id = 1;`);
    assert.equal(checkRes.rows[0]?.announcement_text, 'Updated by Admin');
  });

  await pg.close();
});
