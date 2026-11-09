import test from 'node:test';
import assert from 'node:assert/strict';

export function isSafePaise(val: unknown): val is number {
  return typeof val === 'number' && Number.isSafeInteger(val) && val >= 0;
}

export function assertSafePaise(val: number, label: string = 'Amount') {
  if (!isSafePaise(val)) {
    throw new RangeError(`${label} ${val} exceeds safe integer bounds or is negative`);
  }
}

test('BIGINT Safety: Number.MAX_SAFE_INTEGER threshold verification', () => {
  const maxSafePaise = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991
  const maxSafeRupees = maxSafePaise / 100;    // ₹90,071,992,547,409.91

  // Asserts that standard JavaScript Number safe limit handles up to ₹90 Trillion
  assert.equal(maxSafePaise, 9007199254740991);
  assert.ok(maxSafeRupees > 90_000_000_000_000);
});

test('BIGINT Safety: All catalogue prices are safe positive integers', () => {
  // Test sample product catalogue prices in paise
  const cataloguePrices = [1500, 3000, 4000, 8000, 11000, 15000, 19000];

  for (const price of cataloguePrices) {
    assert.doesNotThrow(() => assertSafePaise(price, 'Price'));
  }
});

test('BIGINT Safety: Order calculation math prevents overflow and precision loss', () => {
  const subtotal = 25000; // ₹250
  const fee = 3000;       // ₹30
  const total = subtotal + fee;

  assert.equal(total, 28000);
  assert.doesNotThrow(() => assertSafePaise(subtotal, 'Subtotal'));
  assert.doesNotThrow(() => assertSafePaise(fee, 'Delivery Fee'));
  assert.doesNotThrow(() => assertSafePaise(total, 'Total'));
});

test('BIGINT Safety: Overflow detection rejects values beyond MAX_SAFE_INTEGER or negative', () => {
  assert.equal(isSafePaise(-100), false, 'Negative paise must fail');
  assert.equal(isSafePaise(Number.MAX_SAFE_INTEGER + 10), false, 'Overflow beyond MAX_SAFE_INTEGER must fail');
  assert.equal(isSafePaise(Infinity), false, 'Infinity must fail');
  assert.equal(isSafePaise(NaN), false, 'NaN must fail');
  assert.equal(isSafePaise(250.55), false, 'Decimals in paise must fail (paise must be integer)');
});
