# Phase 1: Supabase production runtime, fail-closed config, staff order immutability, anon-key sign-in

Phase 1 makes Postgres plus Supabase Auth the only production runtime. SQLite becomes lazy and local-only, and a single config module (`config.ts`) decides the mode. The server exits non-zero and the Vercel handler answers 503 when required variables are missing. Migration 0003 limits staff to updating `orders.status` and `updated_at`. Login now goes through a separate anon-key client. I reviewed the changed files against the report's evidence and re-ran nothing.

Watch for: (1) the active `data/natkhat.db` hash differs from the plan's expected value at baseline, and the report attributes this to the running dev server, which is plausible but unconfirmed (possible, not blocking; the file is unchanged before versus after the work). (2) Migration 0003 is not applied anywhere, and the live Supabase sign-in and RLS flows are untested (confirmed, inherent to the constraints).

**Verdict**: APPROVED

## High-level view

Mode selection is centralised. Production (`NODE_ENV=production` or `VERCEL`) never uses SQLite, and `USE_LOCAL_SQLITE` cannot override it. `db.ts` has no import-time filesystem work, which closes N6. The default admin seed runs only through `initDatabase()`, which is a no-op outside local mode.

Fail-closed behaviour covers both entry points. `server.ts` validates before importing the app and exits 1 with variable names only. `api/index.ts` returns a generic 503 body and logs the names server-side. `requireAuth` returns 503 instead of falling to local sessions.

Migration 0003 combines column-level grants, a `WITH CHECK` policy and triggers. The orders trigger rejects any change outside `status` and `updated_at`. The order_items triggers block UPDATE and DELETE. INSERT and `ON CONFLICT DO NOTHING` paths, which is what `migrate-data` uses for orders and order_items, are unaffected.

Sign-in uses the anon client only. Missing or inactive profiles get 403, and the `'staff'` default role is gone.

<details>
<summary>Issues (2)</summary>

1. **Active DB hash differs from plan baseline** — the hash was identical before and after the work, so no action is needed from this change. Confirm out of band that the dev server on :3000 caused the earlier drift (possible).
2. **Migration 0003 untested against real Supabase** — apply it to a staging project first and exercise a staff PATCH of order status through PostgREST (confirmed gap, non-blocking).

</details>

<details>
<summary>Details</summary>

## Trigger scope in migration 0003

The orders trigger applies to all roles, including postgres and service_role. I traced the code that writes orders. The Express server only inserts orders and changes status. `migrate-data` uses `onConflictDoNothing` for orders and order_items, which does not fire UPDATE triggers. Other tables use `onConflictDoUpdate`, but they are outside the triggers. Deleting an order cascades to order_items and would hit the delete trigger. That is consistent with the historical-immutability goal and is not a legitimate path today (confirmed).

The `to_jsonb(NEW) - 'status' - 'updated_at'` comparison also protects future columns by default. The policy is dropped and recreated with `WITH CHECK`. The column grant and trigger are layered, and the PGlite tests cover grant drift.

## Sign-in separation

`supabaseAuth` (anon key, no session persistence) is the only caller of `signInWithPassword` in `src/server` (confirmed by grep). `requireAuth` keeps `supabaseAdmin.auth.getUser(token)`, which verifies the JWT and creates no session. Path B role handling is now an allowlist with 403.

## Not tested

The live anon sign-in and `auth.uid()` under PostgREST need a real Supabase project. The default `data/natkhat.db` start path was reasoned about, not run, to protect the file.

</details>

<details>
<summary>File map</summary>

See `.agents/tasks/phase1-report.md` for the full changed-file list. No git diff is available because the project is not a git repo.

</details>
