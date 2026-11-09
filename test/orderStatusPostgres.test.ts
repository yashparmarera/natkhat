import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema';
import { changeOrderStatus, createPostgresOrderStore, describeError, trackOrder } from '../src/server/orderTracking';

/**
 * Postgres branch of order tracking and staff status updates.
 * Runs the real store implementation (the same Drizzle statements production uses) against a
 * disposable in-memory PGlite database with ALL migrations applied, including 0003.
 * PGlite sessions run as the `postgres` role, the same role the Express server uses in production,
 * so the 0003 immutability triggers apply exactly as they will on Supabase.
 * Never connects to a real database.
 */

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
  await pg.exec(`
    INSERT INTO public.categories (id, name, slug, active, display_order) VALUES ('cat', 'Chai', 'chai', true, 1);
    INSERT INTO public.products (id, name, slug, price_paise, category_id, is_available)
      VALUES ('prod', 'Kulhad Chai', 'kulhad-chai', 3000, 'cat', true);
  `);

  const queries: string[] = [];
  const orm = drizzle(pg, { schema, logger: { logQuery: (query: string) => void queries.push(query) } });
  return { pg, orm, queries };
}

async function addOrder(pg: PGlite, ref: string, type: 'pickup' | 'delivery') {
  await pg.query(
    `INSERT INTO public.orders (reference_id, customer_name, customer_phone, order_type, address,
       subtotal_paise, delivery_fee_paise, total_paise, items_json)
     VALUES ($1, 'Asha Customer', '9000000001', $2, $3, 6000, 0, 6000, '[{"productId":"prod","quantity":2}]'::jsonb)`,
    [ref, type, type === 'delivery' ? '12 Test Street' : null]
  );
  await pg.query(
    `INSERT INTO public.order_items (id, order_reference_id, product_id, product_name_snapshot, unit_price_paise, quantity, total_paise)
     VALUES ($1, $2, 'prod', 'Kulhad Chai', 3000, 2, 6000)`,
    [`item-${ref}`, ref]
  );
}

const bigintSafe = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

/** Everything about an order except status and updated_at, plus its line items. */
async function contentSnapshot(pg: PGlite, ref: string) {
  const order = await pg.query(
    `SELECT reference_id, customer_name, customer_phone, order_type, address, landmark, instructions,
            subtotal_paise, delivery_fee_paise, total_paise, items_json, created_at
       FROM public.orders WHERE reference_id = $1`,
    [ref]
  );
  const items = await pg.query(`SELECT * FROM public.order_items WHERE order_reference_id = $1 ORDER BY id`, [ref]);
  return JSON.stringify({ order: order.rows, items: items.rows }, bigintSafe);
}

async function statusRow(pg: PGlite, ref: string) {
  const res = await pg.query<{ status: string; updated_at: Date }>(
    `SELECT status, updated_at FROM public.orders WHERE reference_id = $1`,
    [ref]
  );
  return res.rows[0];
}

test('Postgres: as the postgres role, status and updated_at can change but order content cannot (migration 0003)', async (t) => {
  const { pg } = await createDb();
  await addOrder(pg, 'NC-100001', 'pickup');

  await t.test('UPDATE ... SET status, updated_at = now() works', async () => {
    const res = await pg.query(
      `UPDATE public.orders SET status = $1, updated_at = now() WHERE reference_id = $2`,
      ['confirmed', 'NC-100001']
    );
    assert.equal(res.affectedRows, 1);
    assert.equal((await statusRow(pg, 'NC-100001')).status, 'confirmed');
  });

  await t.test('content changes are still blocked, alone or combined with a status change', async () => {
    const before = await contentSnapshot(pg, 'NC-100001');
    const attempts = [
      `customer_name = 'Hacked'`,
      `customer_phone = '0'`,
      `address = 'Elsewhere'`,
      `total_paise = 1, subtotal_paise = 1`,
      `items_json = '[]'::jsonb`,
      `created_at = now() - interval '1 year'`,
      `reference_id = 'NC-999999'`,
      `status = 'preparing', customer_name = 'Hacked'`,
      `status = 'preparing', total_paise = 1, subtotal_paise = 1`,
    ];
    for (const set of attempts) {
      await assert.rejects(pg.query(`UPDATE public.orders SET ${set} WHERE reference_id = 'NC-100001'`), /immutable/i, set);
    }
    assert.equal(await contentSnapshot(pg, 'NC-100001'), before);
    assert.equal((await statusRow(pg, 'NC-100001')).status, 'confirmed', 'a rejected combined update changes nothing');
  });

  await t.test('order_items stay immutable', async () => {
    await assert.rejects(pg.query(`UPDATE public.order_items SET quantity = 9`), /immutable/i);
    await assert.rejects(pg.query(`DELETE FROM public.order_items`), /immutable/i);
  });

  await pg.close();
});

test('Postgres store: find returns only public-safe columns', async () => {
  const { pg, orm } = await createDb();
  await addOrder(pg, 'NC-100001', 'pickup');
  const store = createPostgresOrderStore(orm);

  const record = await store.find('NC-100001');
  assert.ok(record);
  assert.deepEqual(Object.keys(record).sort(), ['createdAt', 'orderType', 'referenceId', 'status', 'updatedAt']);
  assert.equal(record.referenceId, 'NC-100001');
  assert.equal(record.orderType, 'pickup');
  assert.equal(record.status, 'pending_confirmation');
  assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(record.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(await store.find('NC-000000'), null);
  await pg.close();
});

test('Postgres: takeaway order moves through the whole flow and only status/updated_at change', async (t) => {
  const { pg, orm, queries } = await createDb();
  await addOrder(pg, 'NC-100001', 'pickup');
  const store = createPostgresOrderStore(orm);
  const content = await contentSnapshot(pg, 'NC-100001');

  let lastUpdatedAt = (await statusRow(pg, 'NC-100001')).updated_at.getTime();
  for (const next of ['confirmed', 'preparing', 'ready_for_pickup', 'completed'] as const) {
    await t.test(`-> ${next}`, async () => {
      const result = await changeOrderStatus('NC-100001', next, store);
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(result.status, next);
      assert.match(result.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);

      const row = await statusRow(pg, 'NC-100001');
      assert.equal(row.status, next);
      assert.ok(row.updated_at.getTime() >= lastUpdatedAt, 'updated_at moves forward');
      lastUpdatedAt = row.updated_at.getTime();
      assert.equal(row.updated_at.toISOString(), result.updatedAt);

      // The public tracking payload reflects the change immediately.
      const tracking = await trackOrder('NC-100001', store);
      assert.equal(tracking?.status, next);
      assert.equal(tracking?.orderType, 'pickup');
    });
  }

  await t.test('customer details, totals, items_json, created_at and order_items are unchanged', async () => {
    assert.equal(await contentSnapshot(pg, 'NC-100001'), content);
  });

  await t.test('a finished order cannot be changed', async () => {
    for (const next of ['preparing', 'cancelled', 'completed'] as const) {
      const result = await changeOrderStatus('NC-100001', next, store);
      assert.equal(result.ok, false);
      assert.ok(!result.ok && result.code === 'invalid_transition');
    }
    assert.equal((await statusRow(pg, 'NC-100001')).status, 'completed');
  });

  await t.test('the UPDATE statement sets only status and updated_at', () => {
    const updates = queries.filter((q) => /^update "orders"/i.test(q));
    assert.equal(updates.length, 4);
    for (const sql of updates) {
      const setClause = sql.match(/ set (.*?) where /is)?.[1] ?? '';
      const columns = [...setClause.matchAll(/"([a-z_]+)" = /g)].map((m) => m[1]);
      assert.deepEqual(columns, ['status', 'updated_at'], sql);
      assert.match(sql, /"orders"\."status" = \$\d/, 'compare-and-set on the previous status');
    }
  });

  await pg.close();
});

test('Postgres: skip rules, delivery limits, cancel, and unknown orders', async (t) => {
  const { pg, orm } = await createDb();
  const store = createPostgresOrderStore(orm);
  await addOrder(pg, 'NC-200001', 'pickup');
  await addOrder(pg, 'NC-200002', 'pickup');
  await addOrder(pg, 'NC-200003', 'delivery');
  await addOrder(pg, 'NC-200004', 'pickup');

  await t.test('a new takeaway order can skip "confirmed" but not "ready" or "collected"', async () => {
    for (const bad of ['ready_for_pickup', 'completed', 'out_for_delivery'] as const) {
      const result = await changeOrderStatus('NC-200001', bad, store);
      assert.ok(!result.ok && result.code === 'invalid_transition', bad);
      assert.equal((await statusRow(pg, 'NC-200001')).status, 'pending_confirmation');
    }
    const skip = await changeOrderStatus('NC-200001', 'preparing', store);
    assert.ok(skip.ok);
    assert.equal((await statusRow(pg, 'NC-200001')).status, 'preparing');
  });

  await t.test('no backwards moves', async () => {
    const back = await changeOrderStatus('NC-200001', 'confirmed', store);
    assert.ok(!back.ok && back.code === 'invalid_transition');
    assert.equal(back.ok ? '' : back.currentStatus, 'preparing');
  });

  await t.test('cancel works from a non-terminal status and is final', async () => {
    assert.ok((await changeOrderStatus('NC-200002', 'cancelled', store)).ok);
    assert.equal((await statusRow(pg, 'NC-200002')).status, 'cancelled');
    const again = await changeOrderStatus('NC-200002', 'confirmed', store);
    assert.ok(!again.ok && again.code === 'invalid_transition');
  });

  await t.test('delivery orders can only be confirmed or cancelled', async () => {
    const bad = await changeOrderStatus('NC-200003', 'preparing', store);
    assert.ok(!bad.ok && bad.code === 'invalid_transition');
    assert.ok((await changeOrderStatus('NC-200003', 'confirmed', store)).ok);
    const bad2 = await changeOrderStatus('NC-200003', 'preparing', store);
    assert.ok(!bad2.ok && bad2.code === 'invalid_transition');
    assert.ok((await changeOrderStatus('NC-200003', 'cancelled', store)).ok);
  });

  await t.test('unknown status and unknown order', async () => {
    const unknownStatus = await changeOrderStatus('NC-200004', 'bogus', store);
    assert.ok(!unknownStatus.ok && unknownStatus.code === 'invalid_status');
    const missing = await changeOrderStatus('NC-000000', 'confirmed', store);
    assert.ok(!missing.ok && missing.code === 'not_found');
    assert.equal(await trackOrder('NC-000000', store), null);
    assert.equal((await statusRow(pg, 'NC-200004')).status, 'pending_confirmation');
  });

  await pg.close();
});

test('Postgres: compare-and-set refuses to overwrite a status that changed meanwhile', async (t) => {
  const { pg, orm } = await createDb();
  await addOrder(pg, 'NC-300001', 'pickup');
  const store = createPostgresOrderStore(orm);

  await t.test('transition from a stale expected status updates nothing', async () => {
    const first = await store.transition('NC-300001', 'pending_confirmation', 'confirmed', new Date());
    assert.ok(first);
    const stale = await store.transition('NC-300001', 'pending_confirmation', 'preparing', new Date());
    assert.equal(stale, null);
    assert.equal((await statusRow(pg, 'NC-300001')).status, 'confirmed');
  });

  await t.test('changeOrderStatus reports a conflict when the row changes between read and write', async () => {
    // Same real store, but someone else moves the order right after we read it.
    const racing = {
      find: store.find,
      async transition(ref: string, expected: string, next: any, at: Date) {
        await pg.query(`UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE reference_id = $1`, [ref]);
        return store.transition(ref, expected, next, at);
      },
    };
    const result = await changeOrderStatus('NC-300001', 'preparing', racing);
    assert.ok(!result.ok && result.code === 'conflict', JSON.stringify(result));
    assert.equal(result.ok ? '' : result.currentStatus, 'preparing');
    assert.equal((await statusRow(pg, 'NC-300001')).status, 'preparing');
  });

  await pg.close();
});

test('Postgres: describeError logs the database error only, not the query or its parameters', async () => {
  const { pg, orm } = await createDb();
  await pg.exec(`DROP TABLE public.order_items; DROP TABLE public.orders;`);
  const store = createPostgresOrderStore(orm);

  let failure: unknown;
  try {
    await store.find('NC-424242');
  } catch (err) {
    failure = err;
  }
  assert.ok(failure instanceof Error);
  const text = describeError(failure);
  assert.match(text, /42P01/);
  assert.match(text, /does not exist/);
  assert.ok(!/select/i.test(text) && !text.includes('NC-424242'), `log text leaked the query: ${text}`);

  assert.equal(describeError(new Error('plain failure')), 'plain failure');
  assert.equal(describeError('not an error'), 'unknown error');
  await pg.close();
});

test('Postgres: public tracking payload never carries customer data and masks delivery status', async () => {
  const { pg, orm } = await createDb();
  await addOrder(pg, 'NC-400001', 'pickup');
  await addOrder(pg, 'NC-400002', 'delivery');
  const store = createPostgresOrderStore(orm);

  const pickup = await trackOrder('NC-400001', store);
  assert.deepEqual(Object.keys(pickup ?? {}).sort(), ['createdAt', 'orderType', 'referenceId', 'status', 'updatedAt']);
  assert.equal(pickup?.status, 'pending_confirmation');
  assert.match(pickup?.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);

  await changeOrderStatus('NC-400002', 'confirmed', store);
  const delivery = await trackOrder('NC-400002', store);
  assert.deepEqual(Object.keys(delivery ?? {}).sort(), ['createdAt', 'orderType', 'referenceId', 'status', 'updatedAt']);
  assert.equal(delivery?.orderType, 'delivery');
  assert.equal(delivery?.status, null);
  assert.equal(delivery?.updatedAt, null);

  const json = JSON.stringify([pickup, delivery]);
  for (const secret of ['Asha', '9000000001', '12 Test Street', 'Kulhad', 'prod', '6000']) {
    assert.ok(!json.includes(secret), `payload must not contain ${secret}`);
  }
  await pg.close();
});
