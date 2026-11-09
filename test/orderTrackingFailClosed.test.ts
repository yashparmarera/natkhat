import test from 'node:test';
import assert from 'node:assert/strict';
import { changeOrderStatus, getOrderStore, trackOrder } from '../src/server/orderTracking';

/**
 * Order tracking must keep the production rule: Supabase PostgreSQL only, SQLite local-only.
 * With no usable database configuration the order routes fail (the handler turns this into a 500)
 * instead of quietly reading or writing a local SQLite file.
 */

const KEYS = ['NODE_ENV', 'VERCEL', 'USE_LOCAL_SQLITE', 'DATABASE_URL'];

function withEnv(env: Record<string, string>, fn: () => Promise<void>) {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    Object.assign(process.env, env);
    try {
      await fn();
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
}

const SQLITE_OFF = /SQLite is disabled outside local development/;

for (const [name, env] of [
  ['NODE_ENV=production', { NODE_ENV: 'production' }],
  ['VERCEL set', { VERCEL: '1' }],
  ['production with USE_LOCAL_SQLITE=true (cannot override production)', { NODE_ENV: 'production', USE_LOCAL_SQLITE: 'true' }],
] as const) {
  test(
    `Production (${name}) without DATABASE_URL: tracking and status updates never fall back to SQLite`,
    withEnv(env, async () => {
      await assert.rejects(getOrderStore().find('NC-123456'), SQLITE_OFF);
      await assert.rejects(trackOrder('NC-123456'), SQLITE_OFF);
      await assert.rejects(changeOrderStatus('NC-123456', 'confirmed'), SQLITE_OFF);
    })
  );
}

test(
  'An unknown status is rejected before any database access, even in production',
  withEnv({ NODE_ENV: 'production' }, async () => {
    const result = await changeOrderStatus('NC-123456', 'bogus');
    assert.ok(!result.ok && result.code === 'invalid_status');
  })
);
