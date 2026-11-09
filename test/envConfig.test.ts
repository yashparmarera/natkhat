import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProductionRuntime,
  useLocalSqlite,
  getMissingConfig,
} from '../src/server/config';
import { isPlaceholder } from '../src/server/loadEnv';
import { db, initDatabase } from '../src/server/db';
import { requireAuth } from '../src/server/auth';

const KEYS = [
  'NODE_ENV', 'VERCEL', 'USE_LOCAL_SQLITE', 'DATABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY',
];

function withEnv(env: Record<string, string>, fn: () => void | Promise<void>) {
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

const FULL = {
  DATABASE_URL: 'postgresql://u:p@db.example.test:6543/postgres',
  SUPABASE_URL: 'https://abc.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-value',
  SUPABASE_ANON_KEY: 'anon-key-value',
};

test('isPlaceholder', () => {
  assert.equal(isPlaceholder('your-supabase-anon-key'), true);
  assert.equal(isPlaceholder('postgresql://postgres.YOUR-PROJECT-ID:[YOUR-PASSWORD]@x'), true);
  assert.equal(isPlaceholder('real-looking-value'), false);
});

test('production with nothing configured lists all four names', withEnv({ NODE_ENV: 'production' }, () => {
  assert.equal(isProductionRuntime(), true);
  assert.equal(useLocalSqlite(), false);
  assert.deepEqual(getMissingConfig(), ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);
}));

test('production with all four is valid', withEnv({ NODE_ENV: 'production', ...FULL }, () => {
  assert.deepEqual(getMissingConfig(), []);
}));

test('VERCEL implies production', withEnv({ VERCEL: '1' }, () => {
  assert.equal(isProductionRuntime(), true);
  assert.equal(useLocalSqlite(), false);
  assert.equal(getMissingConfig().length, 4);
}));

test('VITE_ fallbacks are accepted', withEnv({
  NODE_ENV: 'production',
  DATABASE_URL: FULL.DATABASE_URL,
  VITE_SUPABASE_URL: FULL.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: FULL.SUPABASE_SERVICE_ROLE_KEY,
  VITE_SUPABASE_ANON_KEY: FULL.SUPABASE_ANON_KEY,
}, () => {
  assert.deepEqual(getMissingConfig(), []);
}));

test('placeholder values count as missing', withEnv({ NODE_ENV: 'production', ...FULL, SUPABASE_ANON_KEY: 'your-supabase-anon-key' }, () => {
  assert.deepEqual(getMissingConfig(), ['SUPABASE_ANON_KEY']);
}));

test('partial production config names only the missing variable', withEnv({ NODE_ENV: 'production', ...FULL, SUPABASE_SERVICE_ROLE_KEY: '' }, () => {
  assert.deepEqual(getMissingConfig(), ['SUPABASE_SERVICE_ROLE_KEY']);
}));

test('non-production without DATABASE_URL is local SQLite', withEnv({}, () => {
  assert.equal(useLocalSqlite(), true);
  assert.deepEqual(getMissingConfig(), []);
}));

test('non-production with DATABASE_URL is Postgres mode and validated', withEnv({ DATABASE_URL: FULL.DATABASE_URL }, () => {
  assert.equal(useLocalSqlite(), false);
  assert.deepEqual(getMissingConfig(), ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);
}));

test('USE_LOCAL_SQLITE forces SQLite in non-production only', async () => {
  await withEnv({ USE_LOCAL_SQLITE: 'true', DATABASE_URL: FULL.DATABASE_URL }, () => {
    assert.equal(useLocalSqlite(), true);
  })();
  await withEnv({ USE_LOCAL_SQLITE: 'true', NODE_ENV: 'production' }, () => {
    assert.equal(useLocalSqlite(), false);
  })();
});

test('production: SQLite proxy throws, initDatabase is a no-op, requireAuth returns 503', withEnv({ NODE_ENV: 'production' }, async () => {
  assert.throws(() => db.prepare('SELECT 1'), /SQLite is disabled/);
  assert.doesNotThrow(() => initDatabase());

  let status = 0;
  let body: any;
  const res: any = {
    status(c: number) { status = c; return this; },
    json(b: any) { body = b; return this; },
  };
  let nextCalled = false;
  await requireAuth()({ headers: { authorization: 'Bearer some-token' } } as any, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'Service misconfigured' });
}));
