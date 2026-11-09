# Phase 1 Implementation Plan

## Task (verbatim)

USER REQUEST (verbatim): Implement Phase 1 fixes from `natkhat-audit-report.md`. 1. Make Supabase PostgreSQL the production runtime and SQLite local-development-only. 2. Ensure production fails safely if Supabase configuration is missing. 3. Fix staff RLS permissions so staff cannot modify customer details, order totals or historical order items. 4. Separate Supabase anon-key sign-in from the service-role client. Preserve the existing Vite frontend and Admin Portal. Do not touch SQLite databases, run migrations, deploy, or modify unrelated features. Run relevant tests. Report changed files, test results and remaining blockers. Stop.

DETAILED BRIEF:
npm/npx wrappers failed in the audit so run binaries via node, e.g. `node node_modules/typescript/bin/tsc --noEmit`, tests via `node node_modules/tsx/dist/cli.mjs --test test/*.test.ts src/**/*.test.ts` or equivalent. Dev server already runs on port 3000 (tsx server.ts, no watch); do not start a duplicate; for HTTP checks start a SEPARATE server on another port with throwaway env and a temp copy of data, then stop it.

Phase 1 scope (ONLY these four)
1. Supabase PostgreSQL production runtime, SQLite local-dev-only. Files: server.ts, api/index.ts, src/server/app.ts, db.ts, pgDb.ts, supabase.ts, auth.ts. Load env in the server for local dev (dotenv). Support `.env` and `local.env` (local.env has placeholders only; never print/log values). Do not override variables already set by the host (Vercel). SQLite (src/server/db.ts, node:sqlite) must be lazily imported/initialised ONLY in non-production local mode (NODE_ENV !== 'production' AND no DATABASE_URL, or explicit opt-in such as USE_LOCAL_SQLITE=true; pick a clear rule and document it). It must not run fs.mkdirSync/new DatabaseSync at import time in production or on Vercel (audit finding N6). Local dev must work exactly as before when no Postgres env is configured. In production (NODE_ENV=production or VERCEL set) use Postgres via pgDb.ts (Transaction Pooler, prepare:false, existing config) and Supabase Auth only.
2. Production fails safely if Supabase config missing. Add a single startup/config validation (e.g. src/server/config.ts) requiring in production DATABASE_URL, SUPABASE_URL (or existing VITE_SUPABASE_URL fallback), SUPABASE_SERVICE_ROLE_KEY, and the new anon key. If missing: fail closed. server.ts: exit non-zero with message listing missing VARIABLE NAMES only. api/index.ts (Vercel): do not crash at import; export a handler/app answering every request with 503 JSON {error:"Service misconfigured"} (no variable names in body; log names server-side), never falling back to SQLite or local in-memory sessions. Remove/neutralise the production fallthrough in auth.ts requireAuth "Path B" (local SQLite sessions) so unreachable in production. The seeded default admin (admin / NatkhatCafe@2026 in db.ts) must never be created in production; keep unchanged for local dev (separate later phase). /api/health must not leak details in production (status ok, or 503 when misconfigured); locally may keep current output.
3. Staff RLS fix. Files: supabase/migrations/. DO NOT edit applied migrations 0001/0002 (checksums enforced by scripts/apply-migrations.ts). Add NEW `0003_*.sql` following existing naming/format (check how apply-migrations.ts picks versions and wraps transactions). Contents: REVOKE UPDATE/INSERT/DELETE on public.orders and public.order_items from authenticated and anon; GRANT UPDATE (status, updated_at) ONLY on public.orders to authenticated; keep SELECT for active staff. Add BEFORE UPDATE trigger on public.orders raising exception if any column other than status/updated_at changes (defence in depth; decide carefully so legitimate server-side status updates still work and scripts/migrate-data.ts inserts are not blocked; triggers fire only on UPDATE), and BEFORE UPDATE/DELETE triggers on order_items blocking any modification. Ensure RLS UPDATE policy on orders gets WITH CHECK. Do not drop or change CASCADE/FK behaviour. Tighten nothing else (products/categories staff policies out of scope). Extend PGlite-based tests (test/postgresSecurityIntegration.test.ts and/or new file under test/) to apply ALL migrations including 0003 and assert: staff (authenticated role with active staff profile) can UPDATE orders.status; cannot UPDATE customer_name/phone/address, subtotal/total/fee, reference_id, items_json (error or zero rows); cannot UPDATE or DELETE order_items; anon still cannot read/insert orders; admin/service paths unaffected for INSERT. Existing security/migration tests must still pass; update expectations only where they encode the old over-broad grant, and call that out in the report.
4. Separate anon-key sign-in from service-role client. Files: supabase.ts, app.ts (POST /api/auth/login Supabase branch), auth.ts. Create a second server-side client with SUPABASE_ANON_KEY (fallback VITE_SUPABASE_ANON_KEY) with auth {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false} used ONLY for signInWithPassword. Service-role client must never call signInWithPassword and keeps persistSession:false. requireAuth may keep using the admin client's auth.getUser(token) (document it). Login must reject a user without a profile (or inactive profile) instead of defaulting to role 'staff'; remove the auth.ts `|| 'staff'` fallback in the Supabase path. Do not log passwords/tokens. Add anon key to .env.example, ENVIRONMENT.md (brief), and local.env as PLACEHOLDER line only (SUPABASE_ANON_KEY="your-supabase-anon-key"); never write real secrets.

Hard constraints: Do NOT touch/open for write/copy over/modify data/natkhat.db or data/natkhat_backup_pre_migration.db. No migrations run (no apply-migrations, db:push, migrate-data, verify against real DB), no deploy, no connection to real Supabase/Postgres. PGlite in-memory tests fine. Do not modify unrelated features: frontend (src/components, src/context, App), Admin Portal UI, orderValidator.ts, cart/whatsapp utils, images, storage, status endpoint. Preserve existing API response shapes. No new dependencies (dotenv is already in package.json; verify; no npm install). Never print secrets. Minimal changes, follow existing style.

Verification required: tsc --noEmit exits 0; all tests in test/ and src/**/*.test.ts pass (before vs after counts); prove fail-safe by running the server entry on a different port with a temp env with NODE_ENV=production and missing Supabase vars (exit non-zero / 503, no SQLite file created or opened; sha256 of data/natkhat_backup_pre_migration.db must remain 41ac3463ad6165f59a0fe66d6016a9f2c8b237b7ebe5e4a589c6540f3098c476; data/natkhat.db hash recorded before/after and equal, copy-read with shared read only); prove local dev mode still starts (non-production, no DATABASE_URL) on a temp port using a TEMP COPY of data, or if local mode would write to data/natkhat.db on startup, verify by static reasoning plus a test with DB path overridden, and say so; `vite build` still succeeds (outputs only dist/).

Final deliverable: report at c:/Users/yashs/Downloads/natkhat-café/.agents/tasks/phase1-report.md with changed/added files (one-line purpose each), test results (before/after counts, commands), evidence for each of the 4 items, deviations/judgement calls, remaining blockers (untestable without real Supabase; later-phase items: status endpoint, images, migrate-data safety, hardcoded admin seed, order validation, rate limiter). Then stop; do not start Phase 2.

---

## Findings from exploration (drive the design)

- `app.ts` calls `initDatabase()` at import. `db.ts` runs `fs.mkdirSync(data)` and `new DatabaseSync(data/natkhat.db)` at import (N6). `db.ts` also imports `hashPassword` from `auth.ts`, and `auth.ts` imports `db` (existing circular import, safe only because `db` is used inside functions; keep it that way).
- `orderValidator.ts` (must NOT be edited) does `import { db } from './db'` and uses `db.prepare(...)` in its SQLite branch. `src/server/orderValidator.test.ts` imports `{ initDatabase, db }` from `./db` and writes an order into the SQLite file. So `db` must remain a named export with the `DatabaseSync` API, and it must become lazy **without changing the export shape**. Use a lazy Proxy (see db.ts below).
- IMPORTANT hazard: `src/server/orderValidator.test.ts` calls `initDatabase()` and inserts an order into whatever file `db.ts` opens, which today is `data/natkhat.db`. Running `src/**/*.test.ts` unmodified would write to the protected DB (the extra order NC-842376 probably came from this). Therefore db.ts gets a `SQLITE_DB_PATH` override and ALL test runs in this task set `SQLITE_DB_PATH` to a fresh temp file (never `data/`).
- `scripts/*.ts` call `dotenv.config()` themselves and import `pgDb.ts`; they stay working (the new loader only adds `local.env` and ignores placeholders).
- `local.env` holds placeholder values for `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` etc. (`YOUR-PROJECT-ID`, `your-...`). Loading it naively would flip local dev to Postgres with a fake URL. The loader MUST skip placeholder values.
- `apply-migrations.ts` lists `*.sql`, sorts, version = `file.split('_')[0]`, runs each file inside `sql.begin` (so the file must not contain BEGIN/COMMIT), and checksums applied files. 0001/0002 contain no BEGIN/COMMIT. New file: `0003_staff_order_immutability.sql`.
- `package.json` has `dotenv ^17.2.3` (already a dependency). `engines` absent, Node here is v24.11.0 (`node:sqlite` available). `process.cwd()` contains `é`; use `node node_modules/...` for binaries.
- `vercel.json` rewrites `/api/(.*)` to `/api`, handled by `api/index.ts`.
- In the Supabase login branch, `app.ts` uses `supabaseAdmin.auth.signInWithPassword` and defaults `userRole = 'staff'` when no profile exists. In `auth.ts`, the `|| 'staff'` is actually in Path B (`userRow.role || 'staff'`), not the Supabase path A, which already rejects missing/inactive profiles. Plan handles both (login rejects; Path B rejects unknown roles).

## Decisions

1. **Env-detection rule (single source: `src/server/config.ts`)**
   - `isProductionRuntime()` = `NODE_ENV === 'production'` OR `VERCEL` is set (non-empty).
   - `useLocalSqlite()` = `!isProductionRuntime() && (USE_LOCAL_SQLITE === 'true' || DATABASE_URL is empty)`.
   - `USE_LOCAL_SQLITE=true` forces SQLite in non-production even if `DATABASE_URL` is set (then Postgres and Supabase paths are disabled for that process). It never overrides production.
   - Otherwise (production, or non-production with `DATABASE_URL` set) the runtime is Postgres + Supabase Auth, and config validation applies (fail closed).
   - Rationale: one predicate used by pgDb, supabase, db, auth, app and both entrypoints so the modes cannot disagree.
2. **Lazy SQLite via Proxy**: keeps `orderValidator.ts` and existing tests unchanged, while nothing touches the filesystem until first use in local mode. `node:sqlite` is loaded with `createRequire(import.meta.url)('node:sqlite')` at first use (not a static import), so production bundles never load it.
3. **Env loading**: new `src/server/loadEnv.ts` side-effect module, imported first by `config.ts`, so any module reading `process.env` at import time sees loaded values (ESM evaluates imports in order). Skipped entirely when `VERCEL` is set. Loads `.env` then `local.env` from `process.cwd()` using `dotenv.parse` (not `dotenv.config`), and sets a key only if `process.env[key] === undefined` (never overrides the host; `.env` wins over `local.env`). Skips `NODE_ENV`/`VERCEL` keys and any value that looks like a placeholder (`/your[-_ ]|YOUR-|\[YOUR|MY_|<.*>|changeme/i`). Never logs values.
4. **Trigger scope (migration)**: the orders trigger applies to ALL roles, including `postgres`/`service_role`. Reasoning: the only legitimate writes to `orders` are INSERT (server, `ON CONFLICT DO NOTHING` in migrate-data, which does not fire UPDATE triggers) and status changes (only `status`/`updated_at` change). Comparing `to_jsonb(NEW) - 'status' - 'updated_at'` with the OLD equivalent also protects future columns by default. A future corrective edit needs a deliberate migration (`ALTER TABLE ... DISABLE TRIGGER`), which is acceptable for historical-record immutability. order_items triggers block UPDATE and DELETE for all roles; INSERT is unaffected. No exemption by `current_user` because PostgREST switches roles with SET ROLE and a role allowlist would add a bypass surface.
5. **Auth verification**: `requireAuth` keeps `supabaseAdmin.auth.getUser(token)` (verifies the JWT at GoTrue; does not create a session on the client). Add a code comment.
6. **Port**: `server.ts` reads `process.env.PORT` with default 3000 (needed to run a second instance for verification; default behaviour unchanged). This is a minimal deviation to call out in the report.

## Ordered work items

- [ ] 0. **Baseline (read-only, before any edit).**
      Record sha256 of `data/natkhat_backup_pre_migration.db` and `data/natkhat.db` using a shared-read stream (`[IO.File]::Open(path,'Open','Read','ReadWrite')` piped to `Get-FileHash`-equivalent or `[Security.Cryptography.SHA256]`), plus LastWriteTime and file list of `data/` (expect no -wal/-shm). Expected: backup `41ac3463ad6165f59a0fe66d6016a9f2c8b237b7ebe5e4a589c6540f3098c476`, active `af02fc8cf10c32c14b8db74e10923808c70f5785811230afaadde64ee11fc79e`. Create temp dir `$env:TEMP\nk_phase1` for all scratch DBs.
      Run baseline: `node node_modules/typescript/bin/tsc --noEmit` and tests with a throwaway DB: `$env:SQLITE_DB_PATH` cannot be used yet (db.ts not changed), so for the BASELINE run only `test/*.test.ts` (they use PGlite/mocks and `new DatabaseSync` only on a temp path; confirm by reading `test/comprehensiveSecurityAndMigrationAudit.test.ts` and `test/cartAndOrders.test.ts` imports for any `data/` use before running) plus `src/utils/*.test.ts`. Do NOT run `src/server/orderValidator.test.ts` before item 3 (it writes to `data/natkhat.db`). Record counts (audit baseline: 37 tests in `test/`). After item 3, run `src/server/orderValidator.test.ts` with `SQLITE_DB_PATH` set to a temp file and record its count as the "before" figure for that file (logic unchanged).
      Files: none modified.
      Verify: tsc exits 0; baseline counts noted for the report.

- [ ] 1. **Create `src/server/loadEnv.ts`** (see Decision 3). Exports `isPlaceholder(value: string): boolean` and runs the load at import. Uses `import * as dotenv from 'dotenv'`, `fs`, `path`.
      Files: `src/server/loadEnv.ts` (new).
      Verify: `node node_modules/typescript/bin/tsc --noEmit` exits 0. Unit test added in item 8 covers it.

- [ ] 2. **Create `src/server/config.ts`** with: `import './loadEnv'` as the FIRST import; `isProductionRuntime()`, `useLocalSqlite()` (Decision 1); `getSupabaseUrl()` (`SUPABASE_URL || VITE_SUPABASE_URL`), `getSupabaseServiceKey()`, `getSupabaseAnonKey()` (`SUPABASE_ANON_KEY || VITE_SUPABASE_ANON_KEY`); `getMissingConfig(): string[]` returning `[]` when `useLocalSqlite()`, else the NAMES (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) whose value is empty or a placeholder; `isRuntimeConfigValid()`. All read `process.env` at call time (so tests can mutate env). Header comment documents the rule. Never returns or logs values.
      Files: `src/server/config.ts` (new).
      Verify: tsc exits 0.

- [ ] 3. **Make SQLite lazy and local-only in `src/server/db.ts`.**
      - Remove the static `import { DatabaseSync } from 'node:sqlite'` (use `import type { DatabaseSync } from 'node:sqlite'`), remove top-level `fs.mkdirSync` / `new DatabaseSync`.
      - Add `getDb()`: throws `Error('SQLite is disabled outside local development')` if `!useLocalSqlite()`; otherwise resolves path = `process.env.SQLITE_DB_PATH` (resolved) or `data/natkhat.db` under `process.cwd()`; `fs.mkdirSync(path.dirname(p), {recursive:true})`; loads `DatabaseSync` via `createRequire(import.meta.url)('node:sqlite')`; caches the instance.
      - `export const db = new Proxy({} as DatabaseSync, { get: (_t, prop) => { const d = getDb(); const v = (d as any)[prop]; return typeof v === 'function' ? v.bind(d) : v; } })`. Same exported name/type, so `orderValidator.ts` and `orderValidator.test.ts` are unchanged.
      - `initDatabase()`: first line `if (!useLocalSqlite()) return;` (so the default admin seed can never run in production). Rest of the body unchanged, including the local admin seed.
      Files: `src/server/db.ts`.
      Verify: tsc exits 0. Then run `$env:SQLITE_DB_PATH="$env:TEMP\nk_phase1\unit.db"; node node_modules/tsx/dist/cli.mjs --test src/server/orderValidator.test.ts` and confirm it passes and `data/natkhat.db` hash is unchanged. Also a one-off check: `NODE_ENV=production` + `node node_modules/tsx/dist/cli.mjs -e "import('./src/server/db').then(()=>console.log('imported'))"` run with cwd = a temp empty dir containing no `data/` creates no `data/` dir (import is side-effect free).

- [ ] 4. **Update `src/server/pgDb.ts`.** Import `useLocalSqlite` from `./config`. `isPostgresConfigured()` becomes `!useLocalSqlite() && Boolean(DATABASE_URL trimmed non-empty)`. Keep pooler options (`prepare:false`, `max:1`, `idle_timeout:15`, `connect_timeout:10`) and the module-level cache. `export const pgDb = getPostgresClient()` stays (client creation is lazy-connect, and returns null when not configured).
      Files: `src/server/pgDb.ts`.
      Verify: tsc exits 0; `scripts/*.ts` still type-check (they import `isPostgresConfigured`, `getPostgresClient`).

- [ ] 5. **Rewrite `src/server/supabase.ts`.** Import config getters. Export:
      - `isSupabaseConfigured` = `!useLocalSqlite() && Boolean(url && serviceKey)` (module-level const evaluated after loadEnv because config imports it first; keep the existing export name used by auth.ts/app.ts).
      - `supabaseAdmin`: service-role client, `auth: { autoRefreshToken:false, persistSession:false }` (existing). Comment: used for `auth.getUser(token)`, `auth.admin.*` only; NEVER `signInWithPassword`.
      - `supabaseAuth`: anon-key client when `url && anonKey && !useLocalSqlite()`, else null; `auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }`. Comment: used ONLY for `signInWithPassword`.
      Files: `src/server/supabase.ts`.
      Verify: tsc exits 0.

- [ ] 6. **Harden `src/server/auth.ts` `requireAuth`.**
      - Path A condition becomes `if (isSupabaseConfigured && supabaseAdmin)`; inside, if `getPostgresClient()` returns null respond `503 {error:'Service misconfigured'}` and return (no fall through). Add comment that `supabaseAdmin.auth.getUser(token)` is a server-side JWT verification and intentionally stays on the admin client.
      - Before Path B: `if (!useLocalSqlite()) { res.status(503).json({ error: 'Service misconfigured' }); return; }` so Path B (in-memory sessions + SQLite) is unreachable in production or Postgres mode.
      - In Path B replace `(userRow.role as ...) || 'staff'` with a check that `userRow.role` is one of `admin|manager|staff`, else `403 Forbidden`. No default role.
      - Keep exported helpers (`hashPassword`, `verifyPassword`, rate limiter, sessions) and signatures untouched; existing tests (`test/rbacNegativeTests.test.ts`, `test/comprehensiveSecurityAndMigrationAudit.test.ts`) import `requireAuth`.
      Files: `src/server/auth.ts`.
      Verify: tsc exits 0; `node node_modules/tsx/dist/cli.mjs --test test/rbacNegativeTests.test.ts test/comprehensiveSecurityAndMigrationAudit.test.ts` pass.

- [ ] 7. **Update `src/server/app.ts`.**
      - Replace top-level `initDatabase();` with `if (useLocalSqlite()) initDatabase();` (import `useLocalSqlite`, `isProductionRuntime` from `./config`).
      - `/api/health`: if `isProductionRuntime()` respond `{ status: 'ok' }` only; otherwise keep the current object. Database label stays derived from `isPostgresConfigured()`.
      - `POST /api/auth/login` Supabase branch: if `!supabaseAuth` respond `503 {error:'Service misconfigured'}`; call `supabaseAuth.auth.signInWithPassword({ email, password })`; on failure keep `recordLoginAttempt(ip,false)` + `401 Invalid credentials`. Then require `pg`; load the profile; if no `pg`, no profile, or `!profile.isActive` -> `recordLoginAttempt(ip,false)` and `403 { error: 'Account is not authorised for the admin portal' }`. Only then `recordLoginAttempt(ip,true)` and return the same shape `{ success, token, user:{id, username, role: profile.role} }`. Remove `let userRole = 'staff'`. Wrap in try/catch returning `500` generic message without logging request body, password or tokens.
      - Leave all other routes untouched (they already branch on `isPostgresConfigured() && pg` and fall to SQLite only in local mode because `db` throws elsewhere). Branch B (SQLite login) and change-password SQLite path stay but are only reachable when `isSupabaseConfigured` is false, i.e. local mode (production validation guarantees Supabase config).
      Files: `src/server/app.ts`.
      Verify: tsc exits 0.

- [ ] 8. **Update `server.ts`.** Make `src/server/app` a dynamic import. Static imports only `path`, `url`, and `./src/server/config`. In `startServer()`: `const missing = getMissingConfig(); if (missing.length) { console.error('[Natkhat Café] Refusing to start: missing required environment variables: ' + missing.join(', ')); process.exit(1); }` BEFORE `await import('./src/server/app')`. `PORT = Number(process.env.PORT) || 3000`. Rest unchanged (Vite middleware when not production, static + SPA fallback in production).
      Files: `server.ts`.
      Verify: tsc exits 0 (server.ts is in tsconfig scope; confirm with the compile run).

- [ ] 9. **Update `api/index.ts` (Vercel).** No static import of the app. Export default `async function handler(req, res)`: `const missing = getMissingConfig(); if (missing.length) { console.error('[Natkhat Café] Service misconfigured; missing: ' + missing.join(', ')); res.statusCode = 503; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: 'Service misconfigured' })); return; }` else cache `appPromise ??= import('../src/server/app')` and `return (await appPromise).app(req, res)`. Importing `config` alone does not touch SQLite or Postgres. Importantly, in production `getMissingConfig()` never returns empty by fallback to local mode, since `useLocalSqlite()` is false whenever `VERCEL` or `NODE_ENV=production` is set.
      Files: `api/index.ts`.
      Verify: tsc exits 0; later script check in item 12.

- [ ] 10. **Migration `supabase/migrations/0003_staff_order_immutability.sql`** (no BEGIN/COMMIT; file is wrapped by `sql.begin`). Contents, in order:
      1. Header comment (purpose; staff can only change `status`/`updated_at`; order_items are immutable once written).
      2. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon, authenticated;` and same for `public.order_items`.
      3. `GRANT UPDATE (status, updated_at) ON public.orders TO authenticated;` (SELECT grant from 0002 stays).
      4. `DROP POLICY "Staff update orders" ON public.orders;` then `CREATE POLICY "Staff update orders" ON public.orders FOR UPDATE USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());`.
      5. Function `public.prevent_order_content_update()` RETURNS trigger, LANGUAGE plpgsql, `SET search_path = ''`: `IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN RAISE EXCEPTION 'orders are immutable except status and updated_at' USING ERRCODE = '42501'; END IF; RETURN NEW;`. Trigger `trg_orders_immutable_content BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION ...`.
      6. Function `public.prevent_order_items_change()` RAISE EXCEPTION 'order_items are immutable' ERRCODE '42501'; triggers `trg_order_items_no_update BEFORE UPDATE` and `trg_order_items_no_delete BEFORE DELETE` (FOR EACH ROW).
      7. Do not touch FKs, products/categories policies, or INSERT behaviour. INSERT (server/postgres/service_role, migrate-data) is not hit by UPDATE/DELETE triggers; `ON CONFLICT DO NOTHING` does not fire UPDATE triggers.
      Interaction note for the report: the Express server connects with `DATABASE_URL` (postgres role, bypasses RLS and column grants); status updates only change `status`/`updated_at`, so the trigger allows them. The trigger also blocks the postgres/service_role roles from editing content columns by design (Decision 4).
      Files: `supabase/migrations/0003_staff_order_immutability.sql` (new). 0001/0002 untouched (verify by comparing sha256 before/after).
      Verify: PGlite tests in item 11. Do NOT run apply-migrations.

- [ ] 11. **PGlite tests.**
      a. Edit `test/postgresSecurityIntegration.test.ts`: replace the two hard-coded file reads with a loop over `fs.readdirSync('supabase/migrations').filter(.sql).sort()` executing each via `pg.exec`; update header comment. Existing 12 assertions remain valid (none relies on staff UPDATE of orders).
      b. New `test/orderImmutabilityRls.test.ts`, same harness style (auth.uid shim, roles anon/authenticated/service_role with `service_role` created `BYPASSRLS` and granted ALL on public tables to emulate Supabase, all migrations applied, seed profiles admin/staff/inactive staff, one order + one order_item). Cases:
         1. Active staff `UPDATE orders SET status='confirmed', updated_at=now()` -> affectedRows 1 and persisted.
         2. Inactive staff same update -> 0 rows.
         3. Staff UPDATE of each of: `customer_name`, `customer_phone`, `address`, `subtotal_paise`, `delivery_fee_paise`, `total_paise`, `reference_id`, `items_json`, `created_at` -> rejects with `permission denied`; row unchanged.
         4. Staff UPDATE and DELETE on `order_items` -> `permission denied`; staff INSERT into orders / order_items -> `permission denied`.
         5. Anon SELECT/INSERT on orders -> `permission denied` (retains existing coverage).
         6. Defence in depth: on a fresh instance, as superuser `GRANT UPDATE ON public.orders TO authenticated` (simulates grant drift), then staff UPDATE `customer_name` -> error matching /immutable/; staff UPDATE `status` still OK.
         7. Trigger as superuser/postgres and as `service_role`: UPDATE `total_paise`/`customer_name` raises /immutable/; UPDATE `status` works; UPDATE/DELETE `order_items` raises /immutable/.
         8. INSERT path unaffected: as postgres and as `service_role`, INSERT a new order, INSERT its order_items, and `INSERT ... ON CONFLICT (reference_id) DO NOTHING` of an existing reference leaves the row unchanged without error (mirrors migrate-data).
         9. Policy shape: query `pg_policies` to confirm "Staff update orders" has a non-null `with_check`.
      c. `test/comprehensiveSecurityAndMigrationAudit.test.ts` has a JS mock `evaluateRlsPolicy` where staff UPDATE on orders is true. Leave unless an assertion contradicts the new rule; if any test asserts "staff may update orders" as a whole-row capability, update that expectation only and list it in the report. Otherwise report "no expectations changed".
      d. New `test/envConfig.test.ts`: tests `isPlaceholder`, `getMissingConfig()` and `useLocalSqlite()` truth table by mutating `process.env` and restoring it (cases: prod w/ nothing -> 4 names; prod w/ all four -> []; `VERCEL=1` w/o `NODE_ENV` -> production; `VITE_` fallbacks accepted; placeholder values count as missing; non-prod no DATABASE_URL -> sqlite and [] ; non-prod with DATABASE_URL -> postgres mode and validation applies; `USE_LOCAL_SQLITE=true` + non-prod + DATABASE_URL -> sqlite; `USE_LOCAL_SQLITE=true` + production -> NOT sqlite). Also: with `NODE_ENV=production`, `db.prepare` (Proxy) throws and `initDatabase()` is a no-op (no admin seeded; no files created); `requireAuth()` with a bearer token and `NODE_ENV=production` and no Supabase config returns 503, not 401-via-sessions path A/B. Use a mock req/res as in `test/rbacNegativeTests.test.ts`. Use dynamic import with env set BEFORE import only where module-level consts matter (`supabase.ts`); `config.ts` reads at call time.
      Files: `test/postgresSecurityIntegration.test.ts`, `test/orderImmutabilityRls.test.ts` (new), `test/envConfig.test.ts` (new), maybe `test/comprehensiveSecurityAndMigrationAudit.test.ts`.
      Verify: `node node_modules/tsx/dist/cli.mjs --test test/*.test.ts` (set `$env:SQLITE_DB_PATH` to a temp file) all pass; counts = baseline 37 + new.

- [ ] 12. **Docs and examples (placeholders only).**
      - `.env.example`: add `SUPABASE_ANON_KEY="your-supabase-anon-key"` (server-side anon key, used only for sign-in), `DIRECT_URL`-free (do not expand scope), and comments for `USE_LOCAL_SQLITE`, `SQLITE_DB_PATH`.
      - `local.env`: append only the line `SUPABASE_ANON_KEY="your-supabase-anon-key"` (placeholder). Do not print or alter other lines (read with line-append only; never echo values).
      - `ENVIRONMENT.md`: short section: production requirement list, env-detection rule, `.env`/`local.env` loading and no-override, test hygiene (`SQLITE_DB_PATH`).
      Files: `.env.example`, `local.env`, `ENVIRONMENT.md`.
      Verify: no secret-like long strings added (`Select-String` for `eyJ` in changed files returns only pre-existing `.env.example` truncated sample); tsc unaffected.

- [ ] 13. **Full verification.**
      1. `node node_modules/typescript/bin/tsc --noEmit` exits 0.
      2. Tests (with `$env:SQLITE_DB_PATH="$env:TEMP\nk_phase1\all.db"`, NODE_ENV unset): `node node_modules/tsx/dist/cli.mjs --test test/*.test.ts src/server/*.test.ts src/utils/*.test.ts`. Compare with baseline; every previously passing test still passes.
      3. Fail-safe, server entry: scratch dir `$env:TEMP\nk_phase1\prod`, with a `.env` containing nothing sensitive (or no file). Start `node <repo>/node_modules/tsx/dist/cli.mjs <repo>/server.ts` with cwd = scratch dir, env `NODE_ENV=production`, `PORT=3101`, and `DATABASE_URL`, `SUPABASE_*`, `VERCEL` removed from the child environment (use `Start-Process`/`ProcessStartInfo` with an explicit clean env block). Expect: non-zero exit, stderr lists variable NAMES only, nothing listening on 3101, no `data/` directory created in the scratch dir.
      4. Fail-safe, Vercel handler: a small `tsx` script (in the scratch dir, not the repo) imports `<repo>/api/index.ts` with `VERCEL=1` and no Supabase vars, calls the default export with a mock `req`/`res`, asserts status 503, body exactly `{"error":"Service misconfigured"}`, and that no `data/` dir exists in cwd and `node:sqlite` was never loaded.
      5. Fail-safe partial config: `NODE_ENV=production` with three of four vars set -> exit non-zero naming only the missing one.
      6. Local mode: from the repo cwd (so the placeholder `local.env` is exercised), `NODE_ENV` unset, `DATABASE_URL` unset, `SQLITE_DB_PATH=$env:TEMP\nk_phase1\local.db` (temp file, so `data/natkhat.db` is not opened), `PORT=3102`; start server in background; `Invoke-WebRequest` `/api/health` (expect `database: 'SQLite (Local)'`), `/api/settings` and `/api/products` (200); then stop that process only (by PID, never port 3000). Because `data/natkhat.db` is the default when `SQLITE_DB_PATH` is unset, say in the report that the default path was validated by static reasoning (db.ts default branch unchanged) and by the unit test, not by starting the server on it.
      7. `node node_modules/vite/bin/vite.js build` succeeds; only `dist/` changed.
      8. Re-hash both DBs (shared read): backup must equal `41ac3463...c476`; active must equal baseline hash; mtimes unchanged; no new files in `data/`. Compare sha256 of `0001_*.sql` and `0002_*.sql` against pre-change values (unchanged).
      9. Confirm port 3000 dev server untouched (still running, not restarted). Note: it was started before the change, so it still runs the OLD code; mention this in the report.
      Files: none (scratch only under `$env:TEMP\nk_phase1`).
      Verify: all above recorded in the report.

- [ ] 14. **Write `.agents/tasks/phase1-report.md`** and stop. Sections: changed/added files with one-line purpose; test results (commands, before/after counts); evidence per item 1-4; deviations/judgement calls (PORT env; Proxy-based lazy `db`; trigger applies to all roles; `|| 'staff'` was in Path B not Supabase path; loader skips placeholders and `NODE_ENV`/`VERCEL` keys; scripts now also read `local.env`; test expectations changed: list or "none"; `SQLITE_DB_PATH` added so tests never open `data/natkhat.db`); remaining blockers (untestable without real Supabase: anon sign-in, `auth.uid()` on Supabase, applying 0003 to the real database requires the user to run `db:migrate` against `DIRECT_URL`, `public.is_active_staff()` under PostgREST; running dev server on :3000 still on old code and needs a restart by the user; later phases: status endpoint, images, migrate-data overwrite safety, hardcoded admin seed, order validation, rate limiter/`trust proxy`, `.vercelignore` for `data/`, products/categories staff policies). Do not start Phase 2.

## File summary

| File | Action |
|---|---|
| `src/server/loadEnv.ts` | new |
| `src/server/config.ts` | new |
| `src/server/db.ts` | lazy SQLite, `SQLITE_DB_PATH`, guard in `initDatabase` |
| `src/server/pgDb.ts` | `isPostgresConfigured` honours `useLocalSqlite` |
| `src/server/supabase.ts` | add anon `supabaseAuth` client |
| `src/server/auth.ts` | fail-closed Path A/B, no role default |
| `src/server/app.ts` | guarded init, health, login via anon client + profile required |
| `server.ts` | validate config before importing app, `PORT` env |
| `api/index.ts` | handler with 503 when misconfigured, lazy app import |
| `supabase/migrations/0003_staff_order_immutability.sql` | new |
| `test/postgresSecurityIntegration.test.ts` | apply all migrations |
| `test/orderImmutabilityRls.test.ts`, `test/envConfig.test.ts` | new |
| `.env.example`, `local.env`, `ENVIRONMENT.md` | anon key placeholder + docs |

Not touched: `src/components`, `src/context`, `App`, Admin Portal UI, `orderValidator.ts`, `cart.ts`, `whatsapp.ts`, images, `migrations 0001/0002`, `data/*.db`, `scripts/*`, `package.json` (no new deps).
