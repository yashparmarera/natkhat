import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';
/**
 * Hardened Database Migration Runner for Natkhat Café
 *
 * Safety features:
 * 1. Requires DIRECT_URL (no DATABASE_URL fallback) and refuses invalid / placeholder values.
 * 2. Verifies the project ref parsed from DIRECT_URL equals EXPECTED_SUPABASE_PROJECT_REF
 *    BEFORE any database connection is opened.
 * 3. Requires MIGRATION_CONFIRM to equal that project ref before applying (not needed for --dry-run).
 * 4. Refuses the transaction pooler (port 6543): the session advisory lock needs a direct/session connection.
 * 5. --dry-run: read-only inspection of applied vs pending migrations; applies nothing, creates nothing.
 * 6. PostgreSQL session advisory locking, SHA256 checksum tracking and tamper detection.
 * 7. Transactional execution per migration file.
 * Secrets (URL, password) are never printed; only the project ref and a redacted host.
 */
const MIGRATION_LOCK_ID = 894729104859124n; // Dedicated 64-bit advisory lock key

const PLACEHOLDER = /your[-_ ]|YOUR-|\[YOUR|MY_|<.*>|changeme/i;

export class ConfigError extends Error {}

export interface ParsedDbUrl {
  host: string;
  port: string;
  user: string;
  ref: string | null;
}

/** Parse a postgres URL without ever echoing it. Returns null if it is not a valid postgres URL. */
export function parseDbUrl(url: string): ParsedDbUrl | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
  if (!u.hostname) return null;
  const host = u.hostname.toLowerCase();
  const user = decodeURIComponent(u.username);
  return { host, port: u.port || '5432', user, ref: refFrom(host, user) };
}

function refFrom(host: string, user: string): string | null {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (direct) return direct[1];
  if (host.endsWith('.pooler.supabase.com')) {
    const pooled = /^postgres\.([a-z0-9]+)$/.exec(user);
    if (pooled) return pooled[1];
  }
  return null;
}

/** Project ref from a direct (db.<ref>.supabase.co) or pooler (user postgres.<ref>) URL; null if undeterminable. */
export function parseProjectRef(url: string): string | null {
  return parseDbUrl(url)?.ref ?? null;
}

export function assertExpectedProject(parsedRef: string | null, expected: string | undefined): string {
  const exp = (expected ?? '').trim();
  if (!exp) throw new ConfigError('EXPECTED_SUPABASE_PROJECT_REF is not set.');
  if (!parsedRef) {
    throw new ConfigError('Could not determine the project ref from DIRECT_URL (expected db.<ref>.supabase.co or pooler user postgres.<ref>).');
  }
  if (parsedRef !== exp) {
    throw new ConfigError(`Project ref mismatch: DIRECT_URL targets "${parsedRef}" but EXPECTED_SUPABASE_PROJECT_REF is "${exp}".`);
  }
  return parsedRef;
}

/** The session advisory lock cannot work through the transaction pooler (port 6543). */
export function assertNotTransactionPooler(parsed: ParsedDbUrl): void {
  if (parsed.port === '6543') {
    throw new ConfigError('DIRECT_URL uses port 6543 (transaction pooler). Use the direct host (5432) or the session pooler on port 5432.');
  }
}

export function assertConfirmed(ref: string, confirm: string | undefined): void {
  if ((confirm ?? '').trim() !== ref) {
    throw new ConfigError(`MIGRATION_CONFIRM must equal the expected project ref ("${ref}") to apply migrations.`);
  }
}

export function redactHost(parsed: ParsedDbUrl): string {
  return parsed.ref ? parsed.host.replace(parsed.ref, '<ref>') : '<unrecognized-host>';
}

export interface ValidatedConfig {
  url: string;
  ref: string;
  redactedHost: string;
}

/** Pure validation of everything that must hold before a connection is opened. */
export function validateConfig(env: NodeJS.ProcessEnv, opts: { dryRun: boolean }): ValidatedConfig {
  const url = (env.DIRECT_URL ?? '').trim();
  if (!url || PLACEHOLDER.test(url)) {
    throw new ConfigError('DIRECT_URL must be set to the direct Supabase Postgres connection string (no DATABASE_URL fallback).');
  }
  const parsed = parseDbUrl(url);
  if (!parsed) throw new ConfigError('DIRECT_URL is not a valid postgres:// URL.');
  const ref = assertExpectedProject(parsed.ref, env.EXPECTED_SUPABASE_PROJECT_REF);
  assertNotTransactionPooler(parsed);
  if (!opts.dryRun) assertConfirmed(ref, env.MIGRATION_CONFIRM);
  return { url, ref, redactedHost: redactHost(parsed) };
}

export interface MigrationFile {
  file: string;
  version: string;
  sha256: string;
}
export type AppliedMap = Map<string, { name: string; sha256: string }>;
export interface MigrationPlan {
  verified: MigrationFile[];
  pending: MigrationFile[];
  mismatches: Array<MigrationFile & { recorded: string }>;
}

/** Pure planning: classify each file as verified, pending, or checksum-mismatched. */
export function planMigrations(files: MigrationFile[], applied: AppliedMap): MigrationPlan {
  const plan: MigrationPlan = { verified: [], pending: [], mismatches: [] };
  for (const f of files) {
    const rec = applied.get(f.version);
    if (!rec) plan.pending.push(f);
    else if (rec.sha256 && rec.sha256 !== f.sha256) plan.mismatches.push({ ...f, recorded: rec.sha256 });
    else plan.verified.push(f);
  }
  return plan;
}

function readMigrationFiles(migrationsDir: string): MigrationFile[] {
  return fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({
      file,
      version: file.split('_')[0],
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationsDir, file), 'utf8')).digest('hex'),
    }));
}

function describeMismatches(plan: MigrationPlan): string {
  return plan.mismatches
    .map((m) => `"${m.file}" (recorded ${m.recorded}, current ${m.sha256})`)
    .join('; ');
}

export async function runMigrations(argv: string[] = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  console.log(`=== NATKHAT CAFÉ: HARDENED SQL MIGRATION RUNNER${dryRun ? ' (DRY RUN)' : ''} ===\n`);

  let cfg: ValidatedConfig;
  try {
    cfg = validateConfig(process.env, { dryRun });
  } catch (err: any) {
    console.error(`ABORTED before connecting: ${err.message}`);
    process.exit(1);
  }
  console.log(`[Target] project ref: ${cfg.ref}, host: ${cfg.redactedHost}`);

  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const files = readMigrationFiles(migrationsDir);

  const sql = postgres(cfg.url, { max: 1, connect_timeout: 15 });
  let lockAcquired = false;
  try {
    console.log('[Preflight] Connecting to target database...');
    const [dbInfo] = await sql`
      SELECT current_database() as db_name, current_user as db_user, version() as pg_version
    `;
    console.log(`[Preflight] Connected to database: "${dbInfo.db_name}" as user: "${dbInfo.db_user}"`);
    console.log(`[Preflight] PostgreSQL Engine: ${dbInfo.pg_version.split(',')[0]}\n`);

    console.log(`Discovered ${files.length} versioned migration files in ${migrationsDir}:`);
    files.forEach((f) => console.log(`  - ${f.file}`));

    if (dryRun) {
      // Read-only: SELECTs inside a READ ONLY transaction; no lock, no table creation.
      const appliedMap: AppliedMap = new Map();
      await sql.begin('read only', async (tx) => {
        const [{ t }] = await tx`SELECT to_regclass('public._schema_migrations') IS NOT NULL AS t`;
        if (!t) {
          console.log('\n[Dry run] _schema_migrations does not exist; treating all migrations as pending.');
          return;
        }
        const rows = await tx`SELECT version, name, sha256 FROM public._schema_migrations`;
        rows.forEach((r: any) => appliedMap.set(r.version, { name: r.name, sha256: r.sha256 }));
      });
      const plan = planMigrations(files, appliedMap);
      plan.verified.forEach((f) => console.log(`  applied: ${f.file} (checksum verified)`));
      plan.mismatches.forEach((m) => console.log(`  applied: ${m.file} (CHECKSUM MISMATCH)`));
      console.log(`\nPending migrations (${plan.pending.length}):`);
      plan.pending.forEach((f) => console.log(`  - ${f.file}`));
      if (plan.mismatches.length) {
        throw new Error(`Integrity violation: modified applied migration(s): ${describeMismatches(plan)}`);
      }
      console.log('\n[Dry run] Nothing was applied.');
      return;
    }

    console.log('\n[Lock] Acquiring PostgreSQL advisory lock...');
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    lockAcquired = true;
    console.log('✔ Advisory lock acquired successfully.\n');

    await sql`
      CREATE TABLE IF NOT EXISTS public._schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        sha256 text NOT NULL,
        applied_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
    const appliedRows = await sql`SELECT version, name, sha256 FROM public._schema_migrations`;
    const appliedMap: AppliedMap = new Map();
    appliedRows.forEach((r: any) => appliedMap.set(r.version, { name: r.name, sha256: r.sha256 }));

    const plan = planMigrations(files, appliedMap);
    if (plan.mismatches.length) {
      throw new Error(
        `FATAL INTEGRITY VIOLATION: previously applied migration(s) modified on disk: ${describeMismatches(plan)}. ` +
        'Modifying executed migrations is strictly forbidden.'
      );
    }
    plan.verified.forEach((f) => console.log(`⏭ Skipping already applied migration: ${f.file} (Checksum Verified)`));

    for (const m of plan.pending) {
      console.log(`\n⏳ Applying migration: ${m.file}...`);
      console.log(`   SHA256: ${m.sha256}`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, m.file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(sqlContent);
        await tx`
          INSERT INTO public._schema_migrations (version, name, sha256, applied_at)
          VALUES (${m.version}, ${m.file}, ${m.sha256}, now())
        `;
      });
      console.log(`✔ Successfully applied migration: ${m.file}`);
    }

    console.log('\n====================================================');
    console.log('✔ ALL MIGRATIONS VERIFIED AND APPLIED SUCCESSFULLY');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ MIGRATION RUNNER FAILED:', err.message);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      try {
        await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
        console.log('[Lock] Advisory lock released.');
      } catch (unlockErr: any) {
        console.error('[Lock] Warning: Failed to release advisory lock:', unlockErr.message);
      }
    }
    await sql.end();
  }
}

// Only execute when run directly from CLI. Env files load here (host env wins, placeholders skipped).
if (process.argv[1]?.endsWith('apply-migrations.ts')) {
  import('../src/server/loadEnv').then(() => runMigrations());
}
