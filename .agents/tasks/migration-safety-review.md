# Migration runner hardening and idempotent 0003 with service_role orders exemption

The runner now requires DIRECT_URL with no DATABASE_URL fallback. It checks the project ref parsed from the URL host or pooler user against EXPECTED_SUPABASE_PROJECT_REF, and refuses port 6543, all before opening a connection. Applying also requires MIGRATION_CONFIRM to equal the ref. `--dry-run` reads applied and pending state inside a READ ONLY transaction. Migration 0003 is idempotent, and only `service_role` is exempt from the orders content trigger.

Watch for: (1) the connect, dry-run and apply paths ran only against fakes and PGlite, never a real Postgres (confirmed, per report; non-blocking). (2) Safety depends on the operator setting EXPECTED_SUPABASE_PROJECT_REF correctly (confirmed; inherent). (3) The Express server connects as `postgres`, so it cannot make order content corrections (confirmed; intended).

**Verdict**: APPROVED

## High-level view

All validation is a pure function, `validateConfig`, which runs before any connection. A missing, placeholder or non-postgres DIRECT_URL, an unset or mismatched ref, a 6543 port, or a missing or wrong confirm value aborts with "ABORTED before connecting". Output shows only the ref and a redacted host.

Dry-run opens a read-only transaction, checks `to_regclass` for the tracking table, and never takes the advisory lock or creates anything. A checksum mismatch exits 1. Env files load only on CLI entry, with host variables winning.

Migration 0003 drops and recreates its policy and triggers. The orders trigger function returns early when `current_user = 'service_role'`. It is not SECURITY DEFINER and keeps an empty search_path. `order_items` triggers raise unconditionally. The test change for service_role is explicit in the report.

<details>
<summary>Issues (3)</summary>

1. **Live paths unexercised** — run `--dry-run` against staging first and review output before applying.
2. **Operator-supplied ref** — confirm EXPECTED_SUPABASE_PROJECT_REF is typed independently of local.env, which holds a real DIRECT_URL.
3. **`process.exit` in runner** — not safe as a library; acceptable for a CLI-only script.

</details>

<details>
<summary>Details</summary>

## Pre-connection gating

`validateConfig` has no fallback to DATABASE_URL. Placeholder values are rejected. The ref is derived from `db.<ref>.supabase.co` or from the pooler user `postgres.<ref>`, and an undeterminable ref aborts. The confirm check is skipped only for dry-run. Port 6543 is refused on any host, which is stricter than needed but safe. The Target line prints the ref and a redacted host, never the URL or password.

## Dry-run read-only guarantee

The dry-run branch precedes the advisory lock and the `CREATE TABLE IF NOT EXISTS`, and the queries run in `begin('read only')`, so even a bug cannot write. Not tested: the dry-run connect path (likely correct by reading, unverified against a real database).

## 0003 exemption scope

Because the function is not SECURITY DEFINER, `current_user` is the invoking role. `authenticated` and `anon` cannot become `service_role`, so the exemption is not reachable through the API roles. The `postgres` role, which the runner and the Express server use, stays blocked. The `order_items` function raises for every role. Tests 10-12 cover the exemption, order_items blocking for service_role and re-application equality.

## Scope and integrity evidence

The directory is not a git repository, so the diff cannot be listed. Changed files rest on the report: the runner, 0003, loadEnv, two test files, ENVIRONMENT.md and .env.example. The report says package.json was unchanged. The report records the SQLite backup hash 41ac3463ad6165f59a0fe66d6016a9f2c8b237b7ebe5e4a589c6540f3098c476 as unchanged. Tests were reported at 68 pass and 12 pass, with tsc exit 0. No real DB connection was possible in the tests.

</details>

<details>
<summary>File map</summary>

- scripts/apply-migrations.ts: hardened runner with dry-run
- supabase/migrations/0003_staff_order_immutability.sql: idempotent, service_role exemption on orders
- src/server/loadEnv.ts: no-override env loader
- test/applyMigrations.test.ts: new runner tests
- test/orderImmutabilityRls.test.ts: test 8 changed, tests 10-12 added
- ENVIRONMENT.md, .env.example: documentation

</details>
