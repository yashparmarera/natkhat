import test from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, db } from './db';
import { validateAndCreateOrder } from './orderValidator';
import { hashPassword, verifyPassword, checkLoginRateLimit, recordLoginAttempt } from './auth';

// Ensure DB is initialized before tests
initDatabase();

test('Server-side password hashing and timing-safe verification works', () => {
  const password = 'SecurePassword@2026';
  const { hash, salt } = hashPassword(password);

  assert.ok(hash.length > 30);
  assert.ok(salt.length > 10);
  assert.equal(verifyPassword(password, hash, salt), true);
  assert.equal(verifyPassword('WrongPassword', hash, salt), false);
});

test('Rate limiter blocks IP after 5 consecutive failed login attempts', () => {
  const testIp = '192.168.1.105';
  for (let i = 0; i < 4; i++) {
    recordLoginAttempt(testIp, false);
    assert.equal(checkLoginRateLimit(testIp).allowed, true);
  }

  // 5th failed attempt should trigger block
  recordLoginAttempt(testIp, false);
  const check = checkLoginRateLimit(testIp);
  assert.equal(check.allowed, false);
  assert.ok((check.retryAfterSeconds || 0) > 0);

  // Successful login clears block
  recordLoginAttempt(testIp, true);
  assert.equal(checkLoginRateLimit(testIp).allowed, true);
});

test('Server-side order validation computes prices from database, not client', async () => {
  // Take a real product from DB
  const chai = db.prepare("SELECT * FROM products WHERE id = 'prod-kulhad-chai'").get() as any;
  assert.ok(chai);
  assert.equal(chai.price_paise, 3000); // ₹30 in database

  const thali = db.prepare("SELECT * FROM products WHERE id = 'prod-special-thali'").get() as any;
  assert.ok(thali);
  assert.equal(thali.price_paise, 19000); // ₹190 in database

  // Submit order payload
  const result = await validateAndCreateOrder({
    customer: {
      name: 'Rohan Sharma',
      phone: '9876543210',
      orderType: 'delivery',
      address: 'Flat 101, Galaxy Tower, Sector 4',
    },
    items: [
      { productId: 'prod-kulhad-chai', quantity: 2 }, // 2 * 3000 = 6000
      { productId: 'prod-special-thali', quantity: 1 }, // 1 * 19000 = 19000
    ],
  });

  assert.equal(result.success, true);
  assert.ok(result.order);
  assert.equal(result.order.subtotalPaise, 25000); // 6000 + 19000 = 25000 (₹250)
  assert.equal(result.order.deliveryFeePaise, 0); // ₹250 unlocks free delivery!
  assert.equal(result.order.totalPaise, 25000);
  assert.ok(result.order.referenceId.startsWith('NC-'));
  assert.ok(result.order.whatsappUrl.startsWith('https://wa.me/'));

  // Verify record was inserted into SQLite database
  const savedOrder = db.prepare('SELECT * FROM orders WHERE reference_id = ?').get(result.order.referenceId) as any;
  assert.ok(savedOrder);
  assert.equal(savedOrder.customer_name, 'Rohan Sharma');
  assert.equal(savedOrder.subtotal_paise, 25000);
  assert.equal(savedOrder.status, 'pending_confirmation');
});

test('Server rejects order when delivery minimum is not met', async () => {
  const result = await validateAndCreateOrder({
    customer: {
      name: 'Test Customer',
      phone: '9988776655',
      orderType: 'delivery',
      address: 'Near Station',
    },
    items: [
      { productId: 'prod-kulhad-chai', quantity: 1 }, // ₹30 < ₹100 minimum delivery threshold
    ],
  });

  assert.equal(result.success, false);
  assert.match(result.error || '', /Minimum delivery order amount/);
});
