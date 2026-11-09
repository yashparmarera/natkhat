import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/**
 * HTTP-level tests for GET /api/orders/:referenceId/track and PATCH /api/orders/:referenceId/status.
 * They run the real Express app against a THROWAWAY SQLite file in the OS temp directory.
 * This file never opens data/natkhat.db: SQLITE_DB_PATH is set before the app is imported.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natkhat-track-api-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.db');
process.env.USE_LOCAL_SQLITE = 'true';

const PUBLIC_KEYS = ['createdAt', 'orderType', 'referenceId', 'status', 'updatedAt'];
const PII = ['Priya Pickup', '9876543210', 'Flat 9', 'Tower', 'prod-kulhad-chai', 'prod-special-thali', 'pricePaise', 'items', 'total', 'customer'];

let server: Server;
let base = '';
let db: typeof import('../src/server/db').db;
let trackRateLimiter: typeof import('../src/server/orderTracking').trackRateLimiter;
const tokens: Record<string, string> = {};

async function call(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function createOrder(orderType: 'pickup' | 'delivery'): Promise<string> {
  const customer =
    orderType === 'pickup'
      ? { name: 'Priya Pickup', phone: '9876543210', orderType }
      : { name: 'Priya Pickup', phone: '9876543210', orderType, address: 'Flat 9, Test Tower' };
  const items =
    orderType === 'pickup'
      ? [{ productId: 'prod-kulhad-chai', quantity: 2 }]
      : [{ productId: 'prod-special-thali', quantity: 1 }];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await call('POST', '/api/orders', { body: { customer, items } });
    if (res.status === 201) return res.json.referenceId;
  }
  throw new Error('could not create a test order');
}

const track = (ref: string) => call('GET', `/api/orders/${ref}/track`);
const setStatus = (ref: string, status: unknown, role = 'staff') =>
  call('PATCH', `/api/orders/${ref}/status`, { token: tokens[role], body: { status } });

function orderRow(ref: string) {
  return db.prepare('SELECT * FROM orders WHERE reference_id = ?').get(ref) as Record<string, unknown>;
}

before(async () => {
  const { app } = await import('../src/server/app');
  ({ db } = await import('../src/server/db'));
  ({ trackRateLimiter } = await import('../src/server/orderTracking'));
  const { hashPassword } = await import('../src/server/auth');

  // Local default admin (seeded into the temp database) plus one manager and one staff account.
  for (const role of ['manager', 'staff']) {
    const { hash, salt } = hashPassword('Pass-12345!');
    db.prepare('INSERT INTO admin_users (id, username, password_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      `user-${role}`, `${role}1`, hash, salt, role, new Date().toISOString()
    );
  }

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const logins: Array<[string, string, string]> = [
    ['admin', 'admin', 'NatkhatCafe@2026'],
    ['manager', 'manager1', 'Pass-12345!'],
    ['staff', 'staff1', 'Pass-12345!'],
  ];
  for (const [role, username, password] of logins) {
    const res = await call('POST', '/api/auth/login', { body: { username, password } });
    assert.equal(res.status, 200, `${role} login`);
    tokens[role] = res.json.token;
  }
});

after(async () => {
  server?.close();
  server?.closeAllConnections();
  try {
    db.close(); // release the file handle (Windows cannot delete an open file)
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* the OS cleans the temp directory eventually */
  }
});

beforeEach(() => {
  trackRateLimiter.reset();
});

test('Track: a takeaway order returns only the public fields, uncached, with no customer data', async () => {
  const ref = await createOrder('pickup');
  const res = await track(ref);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(res.json).sort(), PUBLIC_KEYS);
  assert.equal(res.json.referenceId, ref);
  assert.equal(res.json.orderType, 'pickup');
  assert.equal(res.json.status, 'pending_confirmation');
  assert.match(res.json.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(res.json.updatedAt, null, 'the local SQLite orders table has no updated_at column');
  for (const secret of PII) {
    assert.ok(!res.text.includes(secret), `response must not contain "${secret}"`);
  }
});

test('Track: the order number is trimmed and case-normalised', async () => {
  const ref = await createOrder('pickup');
  const res = await call('GET', `/api/orders/${encodeURIComponent(`  ${ref.toLowerCase()} `)}/track`);
  assert.equal(res.status, 200);
  assert.equal(res.json.referenceId, ref);
});

test('Track: malformed order numbers get 400 and nothing reaches the database', async () => {
  const bad = ['abc', 'NC-12', 'NC-1234567890123', 'NC-12AB56', 'NC-', 'XX-123456', "NC-1'%20OR%20'1'='1", '..%2F..%2Fetc%2Fpasswd'];
  for (const value of bad) {
    const res = await call('GET', `/api/orders/${value}/track`);
    assert.equal(res.status, 400, value);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(res.json), ['error']);
  }
});

test('Track: an unknown order number gets 404', async () => {
  const res = await track('NC-000000');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(res.json), ['error']);
});

test('Track: delivery orders report their type but never their status', async () => {
  const ref = await createOrder('delivery');
  const before = await track(ref);
  assert.equal(before.status, 200);
  assert.deepEqual(Object.keys(before.json).sort(), PUBLIC_KEYS);
  assert.equal(before.json.orderType, 'delivery');
  assert.equal(before.json.status, null);
  assert.equal(before.json.updatedAt, null);

  // Staff can still confirm a delivery order, and the public endpoint still hides it.
  assert.equal((await setStatus(ref, 'confirmed')).status, 200);
  const after = await track(ref);
  assert.equal(after.json.status, null);
  assert.ok(!after.text.includes('confirmed'));
  assert.ok(!after.text.includes('pending_confirmation'));
});

test('Track: more than 60 requests a minute from one client get 429 with Retry-After', async () => {
  for (let i = 0; i < 60; i++) {
    const res = await track('NC-000000');
    assert.equal(res.status, 404, `request ${i + 1}`);
  }
  const limited = await track('NC-000000');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.deepEqual(Object.keys(limited.json), ['error']);

  // Malformed requests count too, and a spoofed X-Forwarded-For does not buy a fresh budget.
  const spoofed = await call('GET', '/api/orders/bad/track', { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  assert.equal(spoofed.status, 429);

  trackRateLimiter.reset();
  assert.equal((await track('NC-000000')).status, 404, 'budget returns after the window');
});

test('Status: requires a valid staff, manager or admin session', async () => {
  const ref = await createOrder('pickup');

  const anonymous = await call('PATCH', `/api/orders/${ref}/status`, { body: { status: 'confirmed' } });
  assert.equal(anonymous.status, 401);

  const forged = await call('PATCH', `/api/orders/${ref}/status`, { token: 'not-a-real-token', body: { status: 'confirmed' } });
  assert.equal(forged.status, 401);

  assert.equal((await track(ref)).json.status, 'pending_confirmation', 'nothing changed');

  // All three roles may update a status.
  assert.equal((await setStatus(ref, 'confirmed', 'staff')).status, 200);
  assert.equal((await setStatus(ref, 'preparing', 'manager')).status, 200);
  assert.equal((await setStatus(ref, 'ready_for_pickup', 'admin')).status, 200);
});

test('Status: bad input gets 400, unknown orders get 404', async () => {
  const ref = await createOrder('pickup');

  const noBody = await call('PATCH', `/api/orders/${ref}/status`, { token: tokens.staff });
  assert.equal(noBody.status, 400);

  for (const bad of [undefined, null, 123, {}, ['confirmed'], '', 'bogus', 'CONFIRMED']) {
    const res = await setStatus(ref, bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.match(res.json.error, /Unknown status/);
  }

  assert.equal((await call('PATCH', '/api/orders/not-a-ref/status', { token: tokens.staff, body: { status: 'confirmed' } })).status, 400);
  assert.equal((await setStatus('NC-000000', 'confirmed')).status, 404);
  assert.equal((await track(ref)).json.status, 'pending_confirmation');
});

test('Status: invalid transitions get 400 with the current status and change nothing', async () => {
  const ref = await createOrder('pickup');

  for (const bad of ['ready_for_pickup', 'completed', 'out_for_delivery', 'pending_confirmation']) {
    const res = await setStatus(ref, bad);
    assert.equal(res.status, 400, bad);
    assert.equal(res.json.currentStatus, 'pending_confirmation');
    assert.ok(res.json.error.length > 10);
  }
  assert.equal((await track(ref)).json.status, 'pending_confirmation');
});

test('Status: a takeaway order moves pending -> confirmed -> preparing -> ready -> collected and the public tracker follows', async () => {
  const ref = await createOrder('pickup');
  const original = orderRow(ref);

  for (const next of ['confirmed', 'preparing', 'ready_for_pickup', 'completed']) {
    const res = await setStatus(ref, next);
    assert.equal(res.status, 200, next);
    assert.deepEqual(Object.keys(res.json).sort(), ['referenceId', 'status', 'success', 'updatedAt']);
    assert.equal(res.json.success, true);
    assert.equal(res.json.referenceId, ref);
    assert.equal(res.json.status, next);

    const tracked = await track(ref);
    assert.equal(tracked.status, 200);
    assert.equal(tracked.json.status, next, `public tracker shows ${next}`);
  }

  // Backwards and further moves are refused once the order is collected.
  for (const bad of ['ready_for_pickup', 'preparing', 'cancelled', 'completed']) {
    assert.equal((await setStatus(ref, bad)).status, 400, bad);
  }
  assert.equal((await track(ref)).json.status, 'completed');

  // Only the status column changed: customer details, totals and items are intact.
  const finalRow = orderRow(ref);
  assert.equal(finalRow.status, 'completed');
  assert.deepEqual({ ...finalRow, status: 'x' }, { ...original, status: 'x' });
});

test('Status: a new takeaway order may skip straight to preparing, but not to ready', async () => {
  const ref = await createOrder('pickup');
  assert.equal((await setStatus(ref, 'ready_for_pickup')).status, 400);
  assert.equal((await setStatus(ref, 'preparing')).status, 200);
  assert.equal((await track(ref)).json.status, 'preparing');
});

test('Status: cancelling is final and visible to the customer', async () => {
  const ref = await createOrder('pickup');
  assert.equal((await setStatus(ref, 'confirmed')).status, 200);
  assert.equal((await setStatus(ref, 'cancelled')).status, 200);
  assert.equal((await track(ref)).json.status, 'cancelled');
  assert.equal((await setStatus(ref, 'preparing')).status, 400);
  assert.equal((await setStatus(ref, 'cancelled')).status, 400);
});

test('Status: delivery orders only accept confirmed and cancelled', async () => {
  const ref = await createOrder('delivery');
  for (const bad of ['preparing', 'out_for_delivery', 'ready_for_pickup', 'completed']) {
    assert.equal((await setStatus(ref, bad)).status, 400, bad);
  }
  assert.equal((await setStatus(ref, 'confirmed')).status, 200);
  assert.equal((await setStatus(ref, 'preparing')).status, 400);
  assert.equal((await setStatus(ref, 'cancelled')).status, 200);
  assert.equal(orderRow(ref).status, 'cancelled');
});

test('Status: the staff order list shows the new status and unchanged customer details', async () => {
  const ref = await createOrder('pickup');
  const listBefore = await call('GET', '/api/orders', { token: tokens.staff });
  const before = listBefore.json.find((o: any) => o.referenceId === ref);
  assert.equal(before.status, 'pending_confirmation');

  assert.equal((await setStatus(ref, 'confirmed')).status, 200);

  const listAfter = await call('GET', '/api/orders', { token: tokens.staff });
  const after = listAfter.json.find((o: any) => o.referenceId === ref);
  assert.equal(after.status, 'confirmed');
  assert.deepEqual({ ...after, status: '' }, { ...before, status: '' });
});

test('Status: a concurrent change between read and write is reported as 409', async () => {
  const ref = await createOrder('pickup');
  // Simulates another staff member confirming the order after this request has read it:
  // the trigger moves the row to "confirmed" and discards the update that was about to be applied.
  db.exec(`
    CREATE TRIGGER simulate_race BEFORE UPDATE OF status ON orders
    WHEN OLD.status = 'pending_confirmation' AND NEW.status = 'preparing'
    BEGIN
      UPDATE orders SET status = 'confirmed' WHERE reference_id = OLD.reference_id;
      SELECT RAISE(IGNORE);
    END;
  `);
  try {
    const res = await setStatus(ref, 'preparing');
    assert.equal(res.status, 409);
    assert.equal(res.json.currentStatus, 'confirmed');
    assert.match(res.json.error, /updated by someone else/);
    assert.equal((await track(ref)).json.status, 'confirmed');
  } finally {
    db.exec('DROP TRIGGER simulate_race');
  }
});

test('Errors: a database failure gives a generic 500 and the log carries no request data', async () => {
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };
  db.exec('ALTER TABLE orders RENAME TO orders_hidden'); // makes every order query fail (test database only)
  try {
    const tracked = await track('NC-123456');
    assert.equal(tracked.status, 500);
    assert.deepEqual(tracked.json, { error: 'Failed to retrieve order status' });

    const updated = await call('PATCH', '/api/orders/NC-123456/status', {
      token: tokens.staff,
      body: { status: 'confirmed', note: 'SECRET-MARKER 9876543210' },
    });
    assert.equal(updated.status, 500);
    assert.deepEqual(updated.json, { error: 'Failed to update order status' });
  } finally {
    db.exec('ALTER TABLE orders_hidden RENAME TO orders');
    console.error = originalError;
  }

  const output = logged.join('\n');
  assert.match(output, /Error tracking order: .*no such table/);
  assert.match(output, /Error updating order status: .*no such table/);
  assert.ok(!output.includes('SECRET-MARKER'), 'request body must not be logged');
  assert.ok(!output.includes('9876543210'), 'phone numbers must not be logged');
});

test('Status: the server never alters the SQLite schema, and uses updated_at only if the column already exists', async () => {
  const columns = () => (db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!columns().includes('updated_at'), 'no updated_at column was added by any request so far');

  // A database that already has the column gets it filled in. (Test-only change on the temp file.)
  db.exec('ALTER TABLE orders ADD COLUMN updated_at TEXT');
  const ref = await createOrder('pickup');
  assert.equal((await track(ref)).json.updatedAt, null, 'not set until the first status change');

  const res = await setStatus(ref, 'confirmed');
  assert.equal(res.status, 200);
  assert.match(res.json.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const tracked = await track(ref);
  assert.equal(tracked.json.status, 'confirmed');
  assert.equal(tracked.json.updatedAt, res.json.updatedAt);
});
