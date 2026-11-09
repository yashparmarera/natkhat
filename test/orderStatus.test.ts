import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ORDER_STATUSES,
  PICKUP_TRACKING_STEPS,
  getAllowedNextStatuses,
  getStatusActionLabel,
  getStatusLabel,
  getTrackingProgress,
  isOrderStatus,
  isTerminalStatus,
  normalizeOrderReference,
  validateTransition,
  type OrderStatus,
} from '../src/utils/orderStatus';

const PICKUP_FLOW: OrderStatus[] = ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'completed'];

test('Status list matches the Postgres enum in migration 0001', () => {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/0001_initial_schema.sql'), 'utf8');
  const block = sql.match(/CREATE TYPE public\.order_status AS ENUM \(([\s\S]*?)\);/);
  assert.ok(block, 'order_status enum not found in migration 0001');
  const enumValues = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...ORDER_STATUSES], enumValues);
});

test('isOrderStatus and isTerminalStatus', () => {
  for (const s of ORDER_STATUSES) assert.equal(isOrderStatus(s), true, s);
  for (const bad of ['', 'Confirmed', 'done', 'delivered', null, undefined, 3, {}, ['confirmed']]) {
    assert.equal(isOrderStatus(bad), false, String(bad));
  }
  assert.deepEqual(ORDER_STATUSES.filter(isTerminalStatus), ['completed', 'cancelled']);
});

test('Takeaway: exact set of valid next statuses', () => {
  const expected: Record<OrderStatus, OrderStatus[]> = {
    pending_confirmation: ['confirmed', 'preparing', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready_for_pickup', 'cancelled'],
    ready_for_pickup: ['completed', 'cancelled'],
    out_for_delivery: ['cancelled'],
    completed: [],
    cancelled: [],
  };
  for (const status of ORDER_STATUSES) {
    assert.deepEqual(getAllowedNextStatuses('pickup', status), expected[status], status);
  }
});

test('Takeaway: valid moves pass validation', () => {
  const valid: Array<[OrderStatus, OrderStatus]> = [
    ['pending_confirmation', 'confirmed'],
    ['confirmed', 'preparing'],
    ['preparing', 'ready_for_pickup'],
    ['ready_for_pickup', 'completed'],
    // skipping the "confirmed" step is the only allowed skip
    ['pending_confirmation', 'preparing'],
  ];
  for (const [from, to] of valid) {
    assert.deepEqual(validateTransition('pickup', from, to), { ok: true }, `${from} -> ${to}`);
  }
});

test('Takeaway: no backwards moves', () => {
  for (let i = 0; i < PICKUP_FLOW.length; i++) {
    for (let j = 0; j < i; j++) {
      const result = validateTransition('pickup', PICKUP_FLOW[i], PICKUP_FLOW[j]);
      assert.equal(result.ok, false, `${PICKUP_FLOW[i]} -> ${PICKUP_FLOW[j]} must be rejected`);
    }
  }
});

test('Takeaway: only the confirmed step can be skipped', () => {
  const rejected: Array<[OrderStatus, OrderStatus]> = [
    ['pending_confirmation', 'ready_for_pickup'],
    ['pending_confirmation', 'completed'],
    ['confirmed', 'ready_for_pickup'],
    ['confirmed', 'completed'],
    ['preparing', 'completed'],
    ['pending_confirmation', 'out_for_delivery'],
    ['preparing', 'out_for_delivery'],
  ];
  for (const [from, to] of rejected) {
    const result = validateTransition('pickup', from, to);
    assert.equal(result.ok, false, `${from} -> ${to}`);
  }
});

test('Cancelling is allowed from every non-terminal status, for both order types', () => {
  for (const type of ['pickup', 'delivery'] as const) {
    for (const status of ORDER_STATUSES.filter((s) => !isTerminalStatus(s))) {
      assert.deepEqual(validateTransition(type, status, 'cancelled'), { ok: true }, `${type} ${status}`);
      assert.equal(getAllowedNextStatuses(type, status).at(-1), 'cancelled', 'cancel is listed last');
    }
  }
});

test('Terminal statuses accept no changes at all', () => {
  for (const type of ['pickup', 'delivery'] as const) {
    for (const from of ['completed', 'cancelled'] as const) {
      assert.deepEqual(getAllowedNextStatuses(type, from), []);
      for (const to of ORDER_STATUSES) {
        const result = validateTransition(type, from, to);
        assert.equal(result.ok, false, `${type} ${from} -> ${to}`);
      }
    }
  }
  const done = validateTransition('pickup', 'completed', 'preparing');
  assert.ok(!done.ok && /cannot be changed/.test(done.message) && /Collected/.test(done.message));
});

test('Moving to the current status is rejected with a clear message', () => {
  const result = validateTransition('pickup', 'preparing', 'preparing');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /already "Preparing your order"/.test(result.message));
});

test('Delivery orders: staff can only confirm or cancel', () => {
  assert.deepEqual(getAllowedNextStatuses('delivery', 'pending_confirmation'), ['confirmed', 'cancelled']);
  assert.deepEqual(getAllowedNextStatuses('delivery', 'confirmed'), ['cancelled']);
  for (const to of ['preparing', 'out_for_delivery', 'ready_for_pickup', 'completed'] as const) {
    assert.equal(validateTransition('delivery', 'pending_confirmation', to).ok, false, to);
    assert.equal(validateTransition('delivery', 'confirmed', to).ok, false, to);
  }
  // Statuses outside the delivery path (hand-edited data) can still be cancelled, nothing else.
  for (const from of ['preparing', 'out_for_delivery', 'ready_for_pickup'] as const) {
    assert.deepEqual(getAllowedNextStatuses('delivery', from), ['cancelled'], from);
  }
});

test('Unknown statuses are rejected; an unrecognised stored status can only be cancelled', () => {
  for (const bad of ['', 'bogus', 'CONFIRMED', 'delivered']) {
    const result = validateTransition('pickup', 'pending_confirmation', bad);
    assert.ok(!result.ok && /Unknown status/.test(result.message), bad);
  }
  assert.deepEqual(getAllowedNextStatuses('pickup', 'legacy_value'), ['cancelled']);
  assert.deepEqual(validateTransition('pickup', 'legacy_value', 'cancelled'), { ok: true });
  assert.equal(validateTransition('pickup', 'legacy_value', 'confirmed').ok, false);
});

test('getAllowedNextStatuses returns a copy that cannot corrupt the tables', () => {
  const list = getAllowedNextStatuses('pickup', 'pending_confirmation');
  list.push('completed');
  assert.deepEqual(getAllowedNextStatuses('pickup', 'pending_confirmation'), ['confirmed', 'preparing', 'cancelled']);
});

test('Labels: every status has a label, the pending text is kept, completed reads Collected for takeaway', () => {
  for (const status of ORDER_STATUSES) {
    assert.ok(getStatusLabel(status).length > 0, status);
    assert.ok(getStatusLabel(status, 'pickup').length > 0, status);
  }
  assert.equal(getStatusLabel('pending_confirmation'), 'Pending WhatsApp Confirmation');
  assert.equal(getStatusLabel('preparing'), 'Preparing your order');
  assert.equal(getStatusLabel('ready_for_pickup'), 'Ready for takeaway');
  assert.equal(getStatusLabel('completed', 'pickup'), 'Collected');
  assert.equal(getStatusLabel('completed', 'delivery'), 'Completed');
  assert.equal(getStatusLabel('legacy_value'), 'legacy_value');
});

test('Staff action labels', () => {
  assert.equal(getStatusActionLabel('confirmed'), 'Order confirmed');
  assert.equal(getStatusActionLabel('preparing'), 'Preparing your order');
  assert.equal(getStatusActionLabel('ready_for_pickup'), 'Ready for takeaway');
  assert.equal(getStatusActionLabel('completed', 'pickup'), 'Mark as collected');
  assert.equal(getStatusActionLabel('completed', 'delivery'), 'Mark as completed');
  assert.equal(getStatusActionLabel('cancelled', 'pickup'), 'Cancel order');
});

test('Customer tracker steps follow the takeaway flow and cover every reachable status', () => {
  assert.deepEqual(PICKUP_TRACKING_STEPS.map((s) => s.status), PICKUP_FLOW);
  // Every non-cancel status a takeaway order can move to is a visible tracker step.
  const reachable = new Set<OrderStatus>();
  for (const from of ORDER_STATUSES) {
    for (const to of getAllowedNextStatuses('pickup', from)) if (to !== 'cancelled') reachable.add(to);
  }
  assert.deepEqual([...reachable].sort(), ['completed', 'confirmed', 'preparing', 'ready_for_pickup']);
  for (const to of reachable) {
    assert.ok(PICKUP_TRACKING_STEPS.some((s) => s.status === to), to);
  }
  assert.match(PICKUP_TRACKING_STEPS[0].description, /Waiting for the café to confirm your WhatsApp message/);
  assert.equal(PICKUP_TRACKING_STEPS[2].title, 'Preparing your order');
  assert.equal(PICKUP_TRACKING_STEPS[3].title, 'Ready for takeaway');
});

test('getTrackingProgress marks done / current / upcoming steps', () => {
  const states = (status: string) => getTrackingProgress(status).steps.map((s) => s.state);

  assert.deepEqual(states('pending_confirmation'), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.deepEqual(states('confirmed'), ['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
  assert.deepEqual(states('preparing'), ['done', 'done', 'current', 'upcoming', 'upcoming']);
  assert.deepEqual(states('ready_for_pickup'), ['done', 'done', 'done', 'current', 'upcoming']);
  // A collected order has finished every step.
  assert.deepEqual(states('completed'), ['done', 'done', 'done', 'done', 'done']);

  const cancelled = getTrackingProgress('cancelled');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.activeIndex, -1);

  assert.equal(getTrackingProgress('preparing').activeIndex, 2);
  assert.equal(getTrackingProgress('out_for_delivery').activeIndex, -1);
  assert.equal(getTrackingProgress('legacy_value').activeIndex, -1);
});

test('normalizeOrderReference trims, upper-cases and validates NC- plus digits', () => {
  assert.equal(normalizeOrderReference('NC-348176'), 'NC-348176');
  assert.equal(normalizeOrderReference('  nc-348176 '), 'NC-348176');
  assert.equal(normalizeOrderReference('Nc-1234'), 'NC-1234');
  assert.equal(normalizeOrderReference('NC-123456789012'), 'NC-123456789012');
  assert.equal(normalizeOrderReference('\tNC-348176\n'), 'NC-348176');

  const invalid = [
    '', '   ', 'NC-', 'NC-123', 'NC-1234567890123', 'NC-12AB56', 'NC348176', 'NC 348176', 'XX-348176',
    '348176', 'NC-348176; DROP TABLE orders', "NC-1' OR '1'='1", '../../etc/passwd', 'NC-348\n176', 'NC-٣٤٨١٧٦',
    null, undefined, 348176, {}, ['NC-348176'],
  ];
  for (const bad of invalid) {
    assert.equal(normalizeOrderReference(bad), null, String(bad));
  }
});
