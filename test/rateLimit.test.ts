import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, getClientKey } from '../src/server/rateLimit';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('Rate limiter allows up to max requests per window, then blocks with a retry hint', () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: c.now });

  for (let i = 0; i < 3; i++) assert.deepEqual(limiter.check('a'), { allowed: true, retryAfterSeconds: 0 });

  c.advance(15_000);
  const blocked = limiter.check('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 45);
  assert.equal(limiter.check('a').allowed, false, 'stays blocked inside the window');
});

test('Rate limiter window resets after windowMs and keys are independent', () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: c.now });

  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true, 'another caller has its own budget');

  c.advance(60_000);
  assert.equal(limiter.check('a').allowed, true, 'new window');
  assert.equal(limiter.check('a').allowed, false);
});

test('Rate limiter reset() clears all counters', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  limiter.check('a');
  assert.equal(limiter.check('a').allowed, false);
  limiter.reset();
  assert.equal(limiter.check('a').allowed, true);
});

test('Rate limiter keeps memory bounded: expired windows are dropped, then the oldest keys', () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 2, now: c.now });

  limiter.check('a');
  assert.equal(limiter.check('a').allowed, false, 'a is blocked');
  limiter.check('b');
  limiter.check('c'); // table is full: the oldest key (a) is evicted to make room
  assert.equal(limiter.check('a').allowed, true, 'a was evicted, so it starts a fresh window');
});

test('Rate limiter drops expired windows before evicting callers that are still inside their window', () => {
  const c = clock();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 2, now: c.now });

  limiter.check('x'); // window ends at +60s
  c.advance(50_000);
  limiter.check('y'); // window ends at +110s
  c.advance(20_000); // x has expired, y is still active
  limiter.check('z'); // table full: the expired x is dropped, y is kept
  assert.equal(limiter.check('y').allowed, false, 'y kept its counter');
});

test('getClientKey only trusts x-forwarded-for when told to', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, ip: '10.1.1.1', socket: { remoteAddress: '10.2.2.2' } };

  assert.equal(getClientKey(req, false), '10.1.1.1', 'spoofable header ignored by default');
  assert.equal(getClientKey(req, true), '203.0.113.7', 'first (client) entry when trusted');
  assert.equal(getClientKey({ headers: { 'x-forwarded-for': ['198.51.100.2, 10.0.0.1'] }, ip: '10.1.1.1' }, true), '198.51.100.2');
  assert.equal(getClientKey({ headers: {}, ip: '10.1.1.1' }, true), '10.1.1.1', 'no header: falls back to ip');
  assert.equal(getClientKey({ headers: { 'x-forwarded-for': ' ' }, socket: { remoteAddress: '10.2.2.2' } }, true), '10.2.2.2');
  assert.equal(getClientKey({ headers: {} }, false), 'unknown');
});
