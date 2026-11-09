import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseProjectRef,
  assertExpectedProject,
  assertNotTransactionPooler,
  parseDbUrl,
  validateConfig,
  planMigrations,
  ConfigError,
} from '../scripts/apply-migrations';

const REF = 'abcdefghijklmnopqrst';
const OTHER = 'zzzzzzzzzzzzzzzzzzzz';
const DIRECT = `postgresql://postgres:fakepw@db.${REF}.supabase.co:5432/postgres`;
const POOLER_SESSION = `postgresql://postgres.${REF}:fakepw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const POOLER_TX = `postgresql://postgres.${REF}:fakepw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

test('parseProjectRef', () => {
  assert.equal(parseProjectRef(DIRECT), REF);
  assert.equal(parseProjectRef(POOLER_SESSION), REF);
  assert.equal(parseProjectRef('not a url'), null);
  assert.equal(parseProjectRef('http://db.abc.supabase.co/x'), null);
  assert.equal(parseProjectRef('postgres://u:p@localhost:5432/db'), null);
  assert.equal(parseProjectRef(`postgres://postgres:p@aws-0.pooler.supabase.com:5432/postgres`), null);
});

test('assertExpectedProject: match / mismatch / unset / undeterminable', () => {
  assert.equal(assertExpectedProject(REF, REF), REF);
  assert.throws(() => assertExpectedProject(REF, OTHER), /mismatch/);
  assert.throws(() => assertExpectedProject(REF, undefined), /EXPECTED_SUPABASE_PROJECT_REF/);
  assert.throws(() => assertExpectedProject(REF, '  '), /EXPECTED_SUPABASE_PROJECT_REF/);
  assert.throws(() => assertExpectedProject(null, REF), /Could not determine/);
});

test('transaction pooler (6543) guard; session pooler 5432 allowed', () => {
  assert.throws(() => assertNotTransactionPooler(parseDbUrl(POOLER_TX)!), /6543/);
  assert.doesNotThrow(() => assertNotTransactionPooler(parseDbUrl(POOLER_SESSION)!));
  assert.doesNotThrow(() => assertNotTransactionPooler(parseDbUrl(DIRECT)!));
});

test('validateConfig: DIRECT_URL required, no DATABASE_URL fallback, confirm required for apply only', () => {
  const good = { DIRECT_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: REF, MIGRATION_CONFIRM: REF } as NodeJS.ProcessEnv;
  const ok = validateConfig(good, { dryRun: false });
  assert.equal(ok.ref, REF);
  assert.ok(!ok.redactedHost.includes(REF));
  assert.throws(() => validateConfig({ DATABASE_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: REF, MIGRATION_CONFIRM: REF } as any, { dryRun: false }), /DIRECT_URL/);
  assert.throws(() => validateConfig({ ...good, DIRECT_URL: '' }, { dryRun: false }), ConfigError);
  assert.throws(() => validateConfig({ ...good, DIRECT_URL: 'postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres' }, { dryRun: false }), /DIRECT_URL/);
  assert.throws(() => validateConfig({ ...good, DIRECT_URL: 'mysql://x' }, { dryRun: false }), /valid postgres/);
  assert.throws(() => validateConfig({ ...good, DIRECT_URL: POOLER_TX }, { dryRun: false }), /6543/);
  assert.throws(() => validateConfig({ ...good, MIGRATION_CONFIRM: OTHER }, { dryRun: false }), /MIGRATION_CONFIRM/);
  assert.throws(() => validateConfig({ ...good, MIGRATION_CONFIRM: undefined }, { dryRun: false }), /MIGRATION_CONFIRM/);
  assert.doesNotThrow(() => validateConfig({ ...good, MIGRATION_CONFIRM: undefined }, { dryRun: true }));
  assert.throws(() => validateConfig({ ...good, EXPECTED_SUPABASE_PROJECT_REF: OTHER }, { dryRun: true }), /mismatch/);
});

test('planMigrations: pending vs applied vs checksum mismatch', () => {
  const f = (v: string, s: string) => ({ file: `${v}_x.sql`, version: v, sha256: s });
  const applied = new Map([
    ['0001', { name: '0001_x.sql', sha256: 'aaa' }],
    ['0002', { name: '0002_x.sql', sha256: 'old' }],
  ]);
  const plan = planMigrations([f('0001', 'aaa'), f('0002', 'new'), f('0003', 'ccc')], applied);
  assert.deepEqual(plan.verified.map((m) => m.version), ['0001']);
  assert.deepEqual(plan.pending.map((m) => m.version), ['0003']);
  assert.deepEqual(plan.mismatches.map((m) => [m.version, m.recorded]), [['0002', 'old']]);
  assert.equal(planMigrations([f('0001', 'a')], new Map()).pending.length, 1);
});

// CLI abort paths: fake env, empty temp cwd (so no .env/local.env is read), aborts must occur before any connect.
const script = path.resolve(process.cwd(), 'scripts/apply-migrations.ts');
const tsx = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
function cli(env: Record<string, string>, args: string[] = []) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-cli-'));
  const baseEnv: Record<string, string> = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };
  const r = spawnSync(process.execPath, [tsx, script, ...args], { cwd, env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 60000 });
  fs.rmSync(cwd, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('CLI aborts before connecting (fake values only)', () => {
  const cases: Array<[string, Record<string, string>, string[], RegExp]> = [
    ['DATABASE_URL only', { DATABASE_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: REF, MIGRATION_CONFIRM: REF }, [], /DIRECT_URL/],
    ['ref mismatch', { DIRECT_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: OTHER, MIGRATION_CONFIRM: OTHER }, [], /mismatch/],
    ['expected unset', { DIRECT_URL: DIRECT, MIGRATION_CONFIRM: REF }, [], /EXPECTED_SUPABASE_PROJECT_REF/],
    ['confirm missing', { DIRECT_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: REF }, [], /MIGRATION_CONFIRM/],
    ['confirm mismatch', { DIRECT_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: REF, MIGRATION_CONFIRM: OTHER }, [], /MIGRATION_CONFIRM/],
    ['6543 pooler', { DIRECT_URL: POOLER_TX, EXPECTED_SUPABASE_PROJECT_REF: REF, MIGRATION_CONFIRM: REF }, [], /6543/],
    ['dry-run ref mismatch', { DIRECT_URL: DIRECT, EXPECTED_SUPABASE_PROJECT_REF: OTHER }, ['--dry-run'], /mismatch/],
  ];
  for (const [name, env, args, re] of cases) {
    const r = cli(env, args);
    assert.notEqual(r.status, 0, name);
    assert.match(r.out, /ABORTED before connecting/, name);
    assert.match(r.out, re, name);
    assert.ok(!r.out.includes('fakepw'), `${name}: secret leaked`);
    assert.ok(!r.out.includes('[Preflight]'), `${name}: reached connect step`);
  }
});
