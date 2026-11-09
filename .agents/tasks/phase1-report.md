# Phase 1 Report

## Changed / added files
| File | Purpose |
|---|---|
| `src/server/loadEnv.ts` (new) | Loads `.env` then `local.env` (skipped on Vercel), never overrides host env, skips placeholders and `NODE_ENV`/`VERCEL` keys, never logs values. |
| `src/server/config.ts` (new) | Single mode rule + config validation (`isProductionRuntime`, `useLocalSqlite`, `getMissingConfig` returns names only). |
| `src/server/db.ts` | SQLite is lazy (Proxy + `createRequire('node:sqlite')`), local-only, `SQLITE_DB_PATH` override; `initDatabase()` is a no-op outside local mode (default admin seed never runs in production). No import-time fs/DB work (N6). |
| `src/server/pgDb.ts` | `isPostgresConfigured()` also requires non-local mode. Pooler options unchanged. |
| `src/server/supabase.ts` | Adds anon-key `supabaseAuth` client (persistSession/autoRefreshToken/detectSessionInUrl false); service-role `supabaseAdmin` documented as never signing in. |
| `src/server/auth.ts` | Path A returns 503 if Postgres client missing; Path B (local sessions + SQLite) returns 503 unless local mode; `\|\| 'staff'` role default replaced by role allowlist (403). |
| `src/server/app.ts` | `initDatabase()` only in local mode; `/api/health` returns `{status:'ok'}` in production; login uses anon client, rejects missing/inactive profile (403), no default `staff` role, 503 if misconfigured, generic 500 without logging secrets. |
| `server.ts` | Validates config before dynamically importing the app; exits 1 listing variable names; `PORT` env (default 3000). |
| `api/index.ts` | Handler: 503 `{"error":"Service misconfigured"}` when config missing (names logged server-side); app lazily imported otherwise. |
| `supabase/migrations/0003_staff_order_immutability.sql` (new) | Revokes write grants, column-limited `UPDATE (status, updated_at)`, `WITH CHECK` policy, immutability triggers. |
| `test/postgresSecurityIntegration.test.ts` | Now applies all migrations in `supabase/migrations/` (was 0001+0002 hardcoded). |
| `test/orderImmutabilityRls.test.ts` (new) | 9 PGlite assertions for item 3. |
| `test/envConfig.test.ts` (new) | 11 tests for mode rule, fail-closed config, production SQLite/requireAuth guards. |
| `.env.example`, `local.env`, `ENVIRONMENT.md` | `SUPABASE_ANON_KEY` placeholder line only; docs for runtime modes. |

Untouched: frontend, Admin Portal UI, `orderValidator.ts`, cart/whatsapp, images, migrations 0001/0002, `scripts/*`, `package.json`, `data/*.db`.

## Test results
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0 before and after.
- `test/*.test.ts`: before 37/37 pass; after 59/59 pass (`node node_modules/tsx/dist/cli.mjs --test test/*.test.ts`, with `SQLITE_DB_PATH` set to a temp file).
- `src/server/orderValidator.test.ts` + `src/utils/*.test.ts`: 12/12 pass after (run with `SQLITE_DB_PATH` temp file). Not run before the change because it wrote to `data/natkhat.db`; logic is unchanged.
- `node node_modules/vite/bin/vite.js build`: exit 0, output in `dist/` only.
- Existing test expectations changed: none (only the migration-loading in `postgresSecurityIntegration.test.ts` was widened).

## Evidence
1. **Supabase production / SQLite local-only**: `envConfig.test.ts` truth table (production, `VERCEL`, `USE_LOCAL_SQLITE` cannot override production); in production the `db` Proxy throws and `initDatabase()` does nothing. Vercel handler run created no `data/` dir and `node:sqlite` was not in `process.moduleLoadList`.
2. **Fail closed**: `server.ts` with `NODE_ENV=production`, clean env, cwd=temp dir, PORT 3101: exit 1, stderr `missing required environment variables: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY`; with three of four set it named only `SUPABASE_SERVICE_ROLE_KEY`; nothing listening on 3101, no `data/` created. Vercel handler (`VERCEL=1`): status 503, body `{"error":"Service misconfigured"}`, content-type JSON. `requireAuth` in production returns 503 (test).
3. **Staff RLS**: PGlite with all migrations: active staff updates `status` (1 row); inactive staff 0 rows; staff updates to customer_name/phone/address, subtotal/fee/total, reference_id, items_json, created_at all `permission denied`; staff UPDATE/DELETE/INSERT on `order_items` and INSERT/DELETE on orders denied; anon read/insert denied; policy has `WITH CHECK`; with table-level UPDATE re-granted (grant drift) the trigger still blocks content edits; triggers also block postgres and service_role content edits; INSERTs and `ON CONFLICT DO NOTHING` still work.
4. **Anon-key separation**: login uses `supabaseAuth` only; `supabaseAdmin` has no `signInWithPassword` call (grep). Login rejects missing/inactive profiles. Not verifiable without real Supabase (see blockers).
5. **Local mode**: from repo cwd (placeholder `local.env` present), no `DATABASE_URL`, `SQLITE_DB_PATH` temp, PORT 3102: `/api/health` 200 `SQLite (Local)`, `/api/settings`, `/api/products`, `/api/categories` 200, wrong-password login 401. Process stopped by PID. Default path `data/natkhat.db` was validated by reasoning only (default branch of `getDb()`), not by starting the server on it.
6. **Protected files**: `data/natkhat_backup_pre_migration.db` sha256 `41ac3463...c476` before and after. `data/natkhat.db` before and after both `fff1d67b...5005e`, mtime unchanged (07:13:26), no new files in `data/`. Note: the plan expected `af02fc8c...`; the file already had a different hash at baseline (before any edit; likely the running dev server on :3000 wrote to it). 0001/0002 hashes unchanged (`be4faa6f...`, `d53683d5...`).

## Deviations / judgement calls
- `PORT` env var added to `server.ts` (default 3000) to allow a second instance for verification.
- Lazy `db` is a Proxy so `orderValidator.ts` and its test stay unchanged.
- Orders trigger applies to all roles (including postgres/service_role); content corrections now need a deliberate migration.
- The `|| 'staff'` fallback was in auth.ts Path B (not the Supabase path); app.ts login had the other `'staff'` default. Both removed.
- Loader skips placeholder values and `NODE_ENV`/`VERCEL`; `scripts/*` call their own `dotenv.config()` and are unchanged.
- `SQLITE_DB_PATH` added so tests never open `data/natkhat.db`.
- Config validation treats placeholder values as missing.
- Baseline `natkhat.db` hash differs from the plan's expected value (see above).

## Remaining blockers
- Untestable without real Supabase: anon sign-in, `auth.uid()`/`is_active_staff()` under PostgREST, the live login flow.
- Migration 0003 is not applied anywhere; the user must run it (`db:migrate` against `DIRECT_URL`).
- The dev server on :3000 still runs the old code; restart it to pick up changes.
- Later phases: status endpoint, images, migrate-data overwrite safety, hardcoded admin seed (still created in local mode), order validation, rate limiter / `trust proxy`, `.vercelignore` for `data/`, products/categories staff policies.
