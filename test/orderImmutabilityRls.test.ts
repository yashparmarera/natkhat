import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Migration 0003: staff can change orders.status only; order_items are immutable.
 * Runs on a disposable in-memory PGlite engine with ALL migrations applied.
 */

const adminId = 'a0000000-0000-0000-0000-000000000001';
const staffId = 'b0000000-0000-0000-0000-000000000002';
const inactiveId = 'c0000000-0000-0000-0000-000000000003';

async function createDb() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  `);
  const dir = path.resolve(process.cwd(), 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  // Emulate Supabase default privileges for service_role
  await pg.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await pg.exec(`
    INSERT INTO public.categories (id, name, slug, active, display_order) VALUES ('cat', 'Chai', 'chai', true, 1);
    INSERT INTO public.products (id, name, slug, price_paise, category_id, is_available)
      VALUES ('prod', 'Kulhad Chai', 'kulhad-chai', 3000, 'cat', true);
    INSERT INTO public.profiles (id, email, full_name, role, is_active) VALUES
      ('${adminId}', 'admin@x.com', 'Admin', 'admin', true),
      ('${staffId}', 'staff@x.com', 'Staff', 'staff', true),
      ('${inactiveId}', 'inactive@x.com', 'Inactive', 'staff', false);
    INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, address,
      subtotal_paise, delivery_fee_paise, total_paise, items_json)
      VALUES ('NC-1', 'Customer', '9876543210', 'delivery', 'Addr', 25000, 0, 25000, '[]'::jsonb);
    INSERT INTO public.order_items (id, order_reference_id, product_id, product_name_snapshot,
      unit_price_paise, quantity, total_paise) VALUES ('item-1', 'NC-1', 'prod', 'Kulhad Chai', 3000, 2, 6000);
  `);
  return pg;
}

async function runAs(pg: PGlite, role: string | null, userId: string | null, sql: string) {
  try {
    await pg.exec('BEGIN;');
    if (role) await pg.exec(`SET LOCAL ROLE ${role};`);
    await pg.exec(`SET LOCAL request.jwt.claim.sub = '${userId ?? ''}';`);
    const res = await pg.exec(sql);
    await pg.exec('COMMIT;');
    return res;
  } catch (err) {
    await pg.exec('ROLLBACK;').catch(() => {});
    throw err;
  }
}

function affected(res: any[]): number | undefined {
  return res.find((r) => typeof r.affectedRows === 'number')?.affectedRows;
}

test('Migration 0003: order immutability and staff permissions', async (t) => {
  const pg = await createDb();

  await t.test('1. Active staff can update orders.status', async () => {
    const res = await runAs(pg, 'authenticated', staffId,
      `UPDATE public.orders SET status = 'confirmed', updated_at = now() WHERE reference_id = 'NC-1';`);
    assert.equal(affected(res), 1);
    const row = await pg.query<{ status: string }>(`SELECT status FROM public.orders WHERE reference_id = 'NC-1'`);
    assert.equal(row.rows[0].status, 'confirmed');
  });

  await t.test('2. Inactive staff update affects 0 rows', async () => {
    const res = await runAs(pg, 'authenticated', inactiveId,
      `UPDATE public.orders SET status = 'cancelled' WHERE reference_id = 'NC-1';`);
    assert.equal(affected(res), 0);
  });

  await t.test('3. Staff cannot update customer, total or content columns', async () => {
    const attempts = [
      `customer_name = 'Hacked'`,
      `customer_phone = '0000000000'`,
      `address = 'Elsewhere'`,
      `subtotal_paise = 1, total_paise = 1`,
      `delivery_fee_paise = 5, total_paise = 25005`,
      `total_paise = 1`,
      `reference_id = 'NC-X'`,
      `items_json = '[1]'::jsonb`,
      `created_at = now() - interval '1 year'`,
    ];
    for (const set of attempts) {
      await assert.rejects(
        runAs(pg, 'authenticated', staffId, `UPDATE public.orders SET ${set} WHERE reference_id = 'NC-1';`),
        /permission denied/i,
        set
      );
    }
    const row = await pg.query<any>(`SELECT customer_name, total_paise FROM public.orders WHERE reference_id = 'NC-1'`);
    assert.equal(row.rows[0].customer_name, 'Customer');
    assert.equal(Number(row.rows[0].total_paise), 25000);
  });

  await t.test('4. Staff cannot modify order_items or insert orders/items', async () => {
    await assert.rejects(runAs(pg, 'authenticated', staffId, `UPDATE public.order_items SET quantity = 99;`), /permission denied/i);
    await assert.rejects(runAs(pg, 'authenticated', staffId, `DELETE FROM public.order_items;`), /permission denied/i);
    await assert.rejects(runAs(pg, 'authenticated', staffId,
      `INSERT INTO public.order_items (id, order_reference_id, product_id, product_name_snapshot, unit_price_paise, quantity, total_paise)
       VALUES ('i2', 'NC-1', 'prod', 'x', 1, 1, 1);`), /permission denied/i);
    await assert.rejects(runAs(pg, 'authenticated', staffId,
      `INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, subtotal_paise, delivery_fee_paise, total_paise, items_json)
       VALUES ('NC-2', 'a', 'b', 'pickup', 1, 0, 1, '[]'::jsonb);`), /permission denied/i);
    await assert.rejects(runAs(pg, 'authenticated', staffId, `DELETE FROM public.orders;`), /permission denied/i);
  });

  await t.test('5. Anon still cannot read or insert orders', async () => {
    await assert.rejects(runAs(pg, 'anon', null, `SELECT * FROM public.orders;`), /permission denied/i);
    await assert.rejects(runAs(pg, 'anon', null,
      `INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, subtotal_paise, delivery_fee_paise, total_paise, items_json)
       VALUES ('NC-3', 'a', 'b', 'pickup', 1, 0, 1, '[]'::jsonb);`), /permission denied/i);
  });

  await t.test('6. Policy shape: orders UPDATE policy has WITH CHECK', async () => {
    const res = await pg.query<{ with_check: string | null }>(
      `SELECT with_check FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Staff update orders'`);
    assert.equal(res.rows.length, 1);
    assert.ok(res.rows[0].with_check);
  });

  await pg.close();
});

test('Migration 0003: triggers protect against grant drift and apply to all roles', async (t) => {
  const pg = await createDb();

  await t.test('7. Trigger blocks staff content update even if table-level UPDATE is granted', async () => {
    await pg.exec(`GRANT UPDATE ON public.orders TO authenticated;`);
    await assert.rejects(
      runAs(pg, 'authenticated', staffId, `UPDATE public.orders SET customer_name = 'Hacked' WHERE reference_id = 'NC-1';`),
      /immutable/i
    );
    const res = await runAs(pg, 'authenticated', staffId, `UPDATE public.orders SET status = 'preparing' WHERE reference_id = 'NC-1';`);
    assert.equal(affected(res), 1);
  });

  await t.test('8. Orders trigger blocks postgres (service_role exempt); order_items immutable for all; status updates work', async () => {
    // Updated expectation: service_role may now correct orders content (see test 10); postgres stays blocked.
    await assert.rejects(runAs(pg, null, null, `UPDATE public.orders SET total_paise = 1, subtotal_paise = 1;`), /immutable/i);
    await assert.rejects(runAs(pg, null, null, `UPDATE public.orders SET customer_name = 'x';`), /immutable/i);
    for (const role of [null, 'service_role']) {
      await assert.rejects(runAs(pg, role, null, `UPDATE public.order_items SET quantity = 5;`), /immutable/i);
      await assert.rejects(runAs(pg, role, null, `DELETE FROM public.order_items;`), /immutable/i);
      const res = await runAs(pg, role, null, `UPDATE public.orders SET status = 'ready_for_pickup', updated_at = now();`);
      assert.equal(affected(res), 1);
    }
  });

  await t.test('9. INSERT paths and ON CONFLICT DO NOTHING are unaffected', async () => {
    for (const [i, role] of ([[2, null], [3, 'service_role']] as const)) {
      await runAs(pg, role, null, `
        INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, subtotal_paise, delivery_fee_paise, total_paise, items_json)
        VALUES ('NC-${i}', 'New', '1', 'pickup', 100, 0, 100, '[]'::jsonb);
        INSERT INTO public.order_items (id, order_reference_id, product_id, product_name_snapshot, unit_price_paise, quantity, total_paise)
        VALUES ('item-${i}', 'NC-${i}', 'prod', 'Kulhad Chai', 100, 1, 100);
      `);
    }
    await runAs(pg, null, null, `
      INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, subtotal_paise, delivery_fee_paise, total_paise, items_json)
      VALUES ('NC-1', 'Overwrite', '1', 'pickup', 1, 0, 1, '[]'::jsonb) ON CONFLICT (reference_id) DO NOTHING;
    `);
    const row = await pg.query<any>(`SELECT customer_name FROM public.orders WHERE reference_id = 'NC-1'`);
    assert.equal(row.rows[0].customer_name, 'Customer');
    const count = await pg.query<any>(`SELECT count(*)::int AS c FROM public.orders`);
    assert.equal(count.rows[0].c, 3);
  });

  await t.test('10. service_role may correct orders content; postgres/authenticated/anon may not', async () => {
    const res = await runAs(pg, 'service_role', null,
      `UPDATE public.orders SET customer_name = 'Corrected', total_paise = 25000 WHERE reference_id = 'NC-1';`);
    assert.equal(affected(res), 1);
    const row = await pg.query<any>(`SELECT customer_name FROM public.orders WHERE reference_id = 'NC-1'`);
    assert.equal(row.rows[0].customer_name, 'Corrected');
    await assert.rejects(runAs(pg, null, null, `UPDATE public.orders SET customer_name = 'x' WHERE reference_id = 'NC-1';`), /immutable/i);
    await assert.rejects(runAs(pg, 'authenticated', staffId, `UPDATE public.orders SET customer_name = 'x' WHERE reference_id = 'NC-1';`), /immutable/i);
    await pg.exec(`GRANT UPDATE ON public.orders TO anon;`);
    await assert.rejects(runAs(pg, 'anon', null, `UPDATE public.orders SET customer_name = 'x' WHERE reference_id = 'NC-1';`), /immutable|permission denied/i);
  });
  await t.test('11. order_items stay immutable for service_role', async () => {
    await assert.rejects(runAs(pg, 'service_role', null, `UPDATE public.order_items SET quantity = 7;`), /immutable/i);
    await assert.rejects(runAs(pg, 'service_role', null, `DELETE FROM public.order_items;`), /immutable/i);
  });
  await t.test('12. Migration 0003 applied a second time succeeds and leaves identical state', async () => {
    const snapshot = async () => (await pg.query<any>(
      `SELECT 'trg' k, tgrelid::regclass::text || '.' || tgname v FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.orders'::regclass,'public.order_items'::regclass)
       UNION ALL SELECT 'pol', policyname || ':' || coalesce(qual,'') || ':' || coalesce(with_check,'') FROM pg_policies WHERE tablename='orders'
       UNION ALL SELECT 'fn', md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE proname IN ('prevent_order_content_update','prevent_order_items_change')
       UNION ALL SELECT 'acl', coalesce(relacl::text,'') FROM pg_class WHERE oid IN ('public.orders'::regclass,'public.order_items'::regclass)
       ORDER BY 1,2`)).rows;
    const file = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/0003_staff_order_immutability.sql'), 'utf8');
    await pg.exec(file); // normalise grant drift introduced by earlier subtests
    const before = await snapshot();
    await pg.exec(fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/0003_staff_order_immutability.sql'), 'utf8'));
    assert.deepEqual(await snapshot(), before);
    assert.equal(before.filter((r: any) => r.k === 'trg').length, 3);
  });  await pg.close();
});
