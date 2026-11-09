# Migration safety fixes: report

## Changed files
- `scripts/apply-migrations.ts`: rewritten runner (items 1-5). Exports pure helpers `parseDbUrl`, `parseProjectRef`, `assertExpectedProject`, `assertNotTransactionPooler`, `assertConfirmed`, `validateConfig`, `planMigrations`.
- `supabase/migrations/0003_staff_order_immutability.sql`: idempotent, `service_role` exemption on the orders trigger, header updated (items 6-7). 0001/0002 untouched; 0003 was never applied.
- `test/orderImmutabilityRls.test.ts`: test 8 expectation changed (see below); new tests 10-12.
- `test/applyMigrations.test.ts` (new): helper, validation, plan and CLI-abort tests.
- `ENVIRONMENT.md`, `.env.example`: document DIRECT_URL, EXPECTED_SUPABASE_PROJECT_REF, MIGRATION_CONFIRM, `--dry-run` (placeholders only).
- `package.json` not changed (`npm run db:migrate -- --dry-run` already forwards args).

## Explicit test expectation change
`test/orderImmutabilityRls.test.ts` test 8 previously asserted triggers block `service_role` content edits on `orders`. It now asserts: `postgres` is still blocked; `service_role` content edits on orders are allowed (test 10); `order_items` UPDATE/DELETE remain blocked for both `postgres` and `service_role`.

## Test results
- `tsc --noEmit`: exit 0.
- `test/*.test.ts`: before 59 pass / 0 fail; after 68 pass / 0 fail (SQLITE_DB_PATH set to a temp file).
- `src/**/*.test.ts` (3 files): 12 pass / 0 fail.
- SQLite hashes unchanged: `data/natkhat.db` sha256 `fff1d67b...5005e` before and after; backup `41ac3463ad6165f59a0fe66d6016a9f2c8b237b7ebe5e4a589c6540f3098c476` before and after.

## Evidence per item
1. DIRECT_URL required: `validateConfig` test, and CLI test with only `DATABASE_URL` set exits non-zero with "DIRECT_URL" message. Placeholder, empty and non-postgres values rejected. Output prints only the ref and host with the ref replaced by `<ref>`; CLI tests assert the fake password never appears.
2. Project ref: `parseProjectRef` handles `db.<ref>.supabase.co` and pooler user `postgres.<ref>`; garbage returns null. Unset, undeterminable or mismatched ref aborts. Port 6543 aborts; pooler on 5432 allowed. All CLI abort cases assert the output has "ABORTED before connecting" and no `[Preflight]` line.
3. MIGRATION_CONFIRM: missing and mismatched cases abort before connecting; not required with `--dry-run`.
4. `--dry-run`: connects inside a `READ ONLY` transaction, checks `to_regclass` for `_schema_migrations` (absent means all pending), takes no advisory lock, creates nothing, prints applied/pending, exits 0; a checksum mismatch exits 1. `planMigrations` is unit tested (pending, verified, mismatch). The dry-run connect path itself was NOT exercised (no live DB).
5. Env loading: the CLI imports `src/server/loadEnv.ts` (`.env`, then `local.env`, never overriding host vars, skipping placeholders). Bare `dotenv.config()` removed. The import happens only when run as CLI, so importing helpers in tests loads no env files.
6. 0003 idempotent: `DROP POLICY IF EXISTS`, `DROP TRIGGER IF EXISTS` before all three CREATE TRIGGERs. Test 12 re-applies 0003 and compares triggers, policies, function definitions and ACLs: identical.
7. Exemption: `prevent_order_content_update()` returns early when `current_user = 'service_role'`; still non-SECURITY DEFINER with `SET search_path = ''`. Tests: service_role edits allowed; postgres, authenticated, anon blocked; order_items UPDATE/DELETE blocked for service_role.

## Judgement calls
- Port 6543 is refused on any host, not only pooler hosts.
- Dry-run does not take the advisory lock (it writes nothing).
- Project ref pattern is `[a-z0-9]+`.
- Normal apply still runs `CREATE TABLE IF NOT EXISTS _schema_migrations` after the lock, as before.
- CLI abort tests run in an empty temp cwd so a real `local.env` (which contains a `DIRECT_URL`) cannot be read.

## Remaining risks
- Runner verified with fakes and PGlite only; the connect, dry-run and apply paths have not run against a real Postgres.
- The Express server connects as `postgres`, so it cannot make orders content corrections; only `service_role` or SQL sessions as that role can.
- Runner uses `process.exit` in its error paths, so it is not safely callable as a library.
- `local.env` holds a real-looking `DIRECT_URL`; the ref check protects against a wrong target but depends on `EXPECTED_SUPABASE_PROJECT_REF` being set correctly by the operator.

## Commands for later
```
node node_modules/tsx/dist/cli.mjs scripts/apply-migrations.ts --dry-run
node node_modules/tsx/dist/cli.mjs scripts/apply-migrations.ts
```
(Apply requires `EXPECTED_SUPABASE_PROJECT_REF` and `MIGRATION_CONFIRM` set to the staging ref.)
