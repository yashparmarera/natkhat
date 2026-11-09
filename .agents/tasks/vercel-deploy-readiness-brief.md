# Vercel deployment readiness investigation (READ-ONLY)

## Goal
The owner asks: "Can I deploy the current codebase to Vercel?" Determine, with evidence from real execution wherever possible, whether this project can be deployed to Vercel right now, what (if anything) blocks it, and exactly what the owner must do (project settings, env vars, Supabase prerequisites, steps). Do NOT deploy and do NOT fix anything. Findings only.

## Context
- Workspace/repo: `c:\Users\yashs\Downloads\natkhat-café` (Windows, PowerShell: use `;` not `&&`, absolute paths, `$env:TEMP` for temp dirs).
- Project: "Natkhat Café", a cafe ordering app. React + Vite frontend (`src/`), Express backend (`server.ts` for local runs, `src/server/app.ts`), Vercel serverless entry `api/index.ts`, Drizzle ORM + Supabase Postgres in production (SQLite only for local dev), Supabase Auth for admin sign-in, SQL migrations in `supabase/migrations/` (`0001_initial_schema.sql`, `0002_rls_policies.sql`, `0003_staff_order_immutability.sql`).
- Git: branch `main`, HEAD `9fcfc9b`, pushed to https://github.com/yashparmarera/natkhat.git (PUBLIC repo). Vercel's Git integration builds what is on GitHub, i.e. `9fcfc9b`, NOT the owner's uncommitted edits.
- The working tree contains uncommitted changes made by ANOTHER concurrent process/agent (UI typography and logo work): `src/components/Navbar.tsx`, `.agents/tasks/typography-screens/*`, `.agents/tasks/logo-make-brand-assets.ps1`, `.agents/tasks/order-tracking-review.*`. A Vite dev server on port 5199 started by that process is running. Do NOT modify, revert, stash, commit, or delete any of it, do NOT kill that process, and do not use port 5199.
- Today's date is 2026-11-09. Vercel behavior may have changed since your training data. When unsure about current Vercel behavior (Node versions, package-manager detection, function config, limits, region codes), check the official Vercel docs (web search/fetch) and cite the URL in the report.

## Starting points (read these first)
- Config and entry: `vercel.json`, `.vercelignore`, `api/index.ts`, `server.ts`, `package.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`, `index.html`
- Server: `src/server/app.ts`, `config.ts`, `loadEnv.ts`, `db.ts`, `pgDb.ts`, `supabase.ts`, `auth.ts`, `rateLimit.ts`, `orderValidator.ts`, `orderTracking.ts`
- Client env/Supabase usage: search `src/` for `import.meta.env` and `VITE_`
- Scripts: `scripts/apply-migrations.ts`, `migrate-data.ts`, `provision-admin.ts`, `reconcile-orders.ts`, `verify-migration.ts`
- Database: `supabase/migrations/*.sql`
- Docs: `DEPLOYMENT.md`, `ENVIRONMENT.md`, `.env.example`, `SECURITY.md`, `DATABASE.md`, `ARCHITECTURE.md`, `API.md`, `README.md`
- Prior reports (CONTEXT ONLY, they may be stale because order-tracking and typography work landed after them, so VERIFY instead of trusting): `.agents/tasks/vercel-plan.md`, `vercel-report.md`, `vercel-review.md` (earlier Vercel prep), `.agents/tasks/natkhat-audit-report.md` (sections J Vercel Readiness, K Storage Readiness, Q Verdict), `.agents/tasks/phase1-report.md`.

## Hard constraints
1. Read-only investigation. Do not edit, create, or delete any tracked file. Do not run `git add/commit/push/stash/reset/checkout/clean` in the workspace.
2. Do NOT deploy. Never run `vercel deploy`, `vercel --prod`, `vercel link`, `vercel pull`, `vercel env add/pull`, `vercel build`, or anything that creates or changes a Vercel project or sends data to a third party. Read-only checks are fine: `Get-Command vercel`, `vercel --version`, `vercel whoami` (only if already installed; do not install or log in; do not use `npx vercel`).
3. Secrets. `local.env` (gitignored) holds REAL credentials. You may list its variable NAMES and say whether each value is empty / placeholder / set, but NEVER print, copy, log, or place any value in the report, scratch files, or messages, and never use its values to connect to anything. One exception: to recommend a Vercel function region you may print ONLY the hostname part of `DATABASE_URL` (e.g. `aws-0-xx-xxxx-x.pooler.supabase.com`), never the username, password, or full URL.
4. Do not connect to the owner's real Supabase/Postgres project. Do not run migrations or any script that opens a database connection to a real database. A dry-run mode that provably opens no connection is fine (confirm in the code first).
5. Do NOT run the test suite, `server.ts`, or any script inside the workspace itself: tests and server init write to the local SQLite file under `data/` and would alter the owner's local data. Anything that executes application code must run inside the temp clone/copy described below. (Running tests is not required for this task.)
6. Writes allowed only to: the report file, and scratch dirs under `$env:TEMP` (delete them when done). Leave the workspace `dist/` and `node_modules/` untouched; build elsewhere.
7. Junction safety (Windows): if you junction the workspace `node_modules` into a temp dir as a fallback, NEVER delete the temp dir with `Remove-Item -Recurse` while the junction exists (Windows PowerShell 5.1 can follow it and delete the real `node_modules`). Remove the junction first with `cmd /c rmdir "<junction path>"` (no `/s`), verify the workspace `node_modules` still exists, then delete the temp dir.

## Questions to answer
Label every finding **TESTED** (you ran it) or **STATIC** (read only), and **PASS / FAIL / PARTIAL / BLOCKED**. Do not claim something is verified unless you executed it.

### Q1. Build, exactly as Vercel would do it
a. Determine what Vercel will run: framework preset detection, `buildCommand`, `installCommand`, `outputDirectory` from `vercel.json` / `package.json`; Node version (`engines` in package.json vs Vercel's current default). BOTH `package-lock.json` and `bun.lock` exist at the repo root: determine which package manager Vercel will choose (check current Vercel docs) and whether the lockfiles agree with `package.json`.
b. Fresh-clone test: `git clone https://github.com/yashparmarera/natkhat.git` into a temp dir outside the workspace (public repo, no auth needed). Run the install (`npm ci`, unless Vercel would use another manager) and then the build command exactly as Vercel would, WITHOUT `local.env` present (it is gitignored, so Vercel won't have it either) and with all `VITE_*` variables unset. Record exit codes, warnings, bundle sizes. Also run `npx tsc --noEmit` and report errors, and say whether type errors would fail the Vercel build. If `npm ci` fails locally for a Windows-only reason (native module toolchain, e.g. `better-sqlite3`), report that, say whether it would also fail on Vercel's Linux builders, and fall back to a junction of the workspace `node_modules` (see constraint 7) so you can still run the build.
c. Repeat the build for the CURRENT WORKING TREE (it includes the other process's uncommitted edits). Do it in a copy, e.g. `robocopy` the workspace to a temp dir excluding `node_modules`, `dist`, `.git`, `.agents` (robocopy exit codes 0-7 mean success), junction/install node_modules there, and build there. Report whether it builds. This tells the owner whether committing those edits would break deployment. Do not modify the originals.
d. Runtime effect of missing build-time client variables: if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing when Vercel builds (they are baked in at build time), what happens in the built client: crash at import (blank white page), graceful degradation, or only the admin area breaks? Check the code in `src/` and, if feasible, load the built output.

### Q2. Vercel configuration correctness
- `vercel.json`: rewrites/routes/headers/functions. Does every `/api/*` path (including nested ones like `/api/orders/:ref/status`, `/api/products/:id`) reach the Express app through `api/index.ts`? Is there an SPA fallback so client routes (deep links, page refresh on `/track`, `/admin`, etc.) do not 404, without swallowing `/api` or static assets? Check `.vercelignore` for anything that would exclude files needed at build or runtime.
- `api/index.ts`: does it export something Vercel can run? Confirm there is no `app.listen`, no Vite dev middleware, no top-level await on unavailable resources, no work at import time that needs a filesystem/SQLite. How does it behave when required env vars are missing (clear error vs crash)?
- Module and runtime pitfalls: package.json `"type"`, tsconfig `module`/`moduleResolution`, relative imports without `.js` extensions under ESM (`ERR_MODULE_NOT_FOUND` at runtime), `__dirname` / `import.meta` usage, path aliases that don't resolve at runtime, TypeScript features that need `tsx`. Determine how Vercel compiles `api/index.ts` (check docs) and whether this setup works. If feasible, empirically load `api/index.ts` in the temp clone in a Vercel-like environment (`NODE_ENV=production`, `USE_LOCAL_SQLITE` unset, FAKE placeholder env values only, via `tsx` or an equivalent small script) and observe import-time behavior plus a few GET requests. DB-backed routes may fail cleanly, but import must not crash.
- Serverless hazards: is `better-sqlite3` (or any native module) imported on the production path? Any writes to local disk (uploads, SQLite file, logs)? Vercel's filesystem is read-only except `/tmp`. In-memory state (login rate limiter in `rateLimit.ts`, sessions, caches) that is not shared across instances: what is the functional impact? Any SSE/WebSockets/long-lived connections, background timers, cron? Request-body limits (Vercel Functions cap request bodies, verify the current limit) versus any image-upload endpoint. Function bundle size (traced dependencies, `.vercelignore`/`includeFiles`/`excludeFiles`), `maxDuration`, memory, cold-start work (migrations or seeding on boot?).
- Region: Vercel functions default to a US region. The `.env.example` sample pooler host is `ap-southeast-1`. Recommend a function region close to the owner's actual Supabase region (see constraint 3 for the only allowed way to look at it) and say how to set it in `vercel.json`.

### Q3. Environment variables
- Search the code (server, client, scripts) for every env var read (`process.env.*`, `import.meta.env.*`). Produce a table: NAME | where read | on Vercel: required / optional / must NOT be set | build-time or runtime | public (browser-exposed) or secret. Flag drift versus `.env.example`, `ENVIRONMENT.md`, `DEPLOYMENT.md`.
- Confirm no secret (service-role key, `DATABASE_URL`) can reach the client bundle: look for secrets under a `VITE_` name and grep the BUILT client output for secret-looking strings.
- Using `local.env` NAMES only (constraint 3): which required names are defined locally (so the owner can copy the values by hand into Vercel), which are missing or still placeholders, and which local-only names must NOT be copied to Vercel (e.g. `USE_LOCAL_SQLITE`, `SQLITE_DB_PATH`, `DIRECT_URL`, `EXPECTED_SUPABASE_PROJECT_REF`, `MIGRATION_CONFIRM`; verify against the code). Check the pooler guidance (port 6543 transaction pooler, `?pgbouncer=true`) against how `pgDb.ts` creates its connection (prepared statements disabled for the transaction pooler? pool size appropriate for serverless?).
- Fail-fast behavior: if a required variable is missing on Vercel, does the owner see a clear error or a confusing 500 / blank page?

### Q4. Database and Supabase prerequisites
- Which migrations must be applied (0001, 0002, 0003) and how (`scripts/apply-migrations.ts` with its guards, or the Supabase SQL editor). You cannot verify the owner's remote DB state; say so, and give the owner a safe read-only way to check (SQL they can paste into the Supabase SQL editor).
- Auth: how admin sign-in works (Supabase Auth plus a `profiles` row/role?), what must be provisioned (`scripts/provision-admin.ts`?), and what bootstrap data the public site needs to render (settings, categories, products). Is the SQLite-to-Postgres data migration (`migrate-data.ts`, `reconcile-orders.ts`, `verify-migration.ts`) required for the owner's existing menu/orders, and is it a prerequisite for the first deploy?
- Storage: how product images/uploads work in production (Supabase Storage vs local disk vs static files in `public/`) and whether anything depends on local disk that will not exist on Vercel.

### Q5. Public-deploy safety (report only, do not fix)
Hardcoded/default admin credentials, dev bypass flags or debug routes active when `NODE_ENV=production`, permissive CORS, missing rate limiting on login/order creation (note serverless in-memory limits), service-role key used on public endpoints, RLS posture (`supabase/migrations/0002`, `0003`), error responses that leak internals. Keep to what matters for putting the site on the public internet.

### Q6. Tooling and account
Is the `vercel` CLI installed, is the owner logged in (read-only checks only, see constraint 2), is there a local `.vercel/` project link? Recommend the easiest path for this owner (Vercel dashboard "Add New > Project > Import Git Repository" for `yashparmarera/natkhat` vs CLI) and give the exact values for Framework Preset, Root Directory, Build Command, Output Directory, Install Command, Node.js Version.

## Deliverable
Write the report to `c:\Users\yashs\Downloads\natkhat-café\.agents\tasks\vercel-deploy-readiness-report.md`. Lead with something the owner can read in 10 seconds:
1. **VERDICT**: one of "YES, deploy now", "YES, after N fixes", or "NO", plus 2-5 plain sentences. State whether it applies to pushed commit `9fcfc9b`, the working tree, or both.
2. **MUST FIX BEFORE FIRST DEPLOY** (blockers): each with file path and function/line, evidence (short quote or command output, no secrets), why it breaks, and the smallest recommended fix. If none, write "none".
3. **SHOULD FIX / WARNINGS** (won't block the deploy but matter in production).
4. **ENV VARS TABLE for the Vercel dashboard** (names only, never values), with Production / Preview / Development scope guidance.
5. **SUPABASE PREREQUISITES** checklist.
6. **DEPLOY STEPS**: numbered, copy-pasteable, for a first-time Vercel user on Windows: dashboard import path and CLI alternative, which branch, how to add env vars, and how to redeploy after adding them (the `VITE_*` values are baked in at build time).
7. **POST-DEPLOY SMOKE TEST**: concrete URLs/actions with expected results (home loads, menu loads from the API, refresh on a client route works, order validation rejects an invalid payload with a 4xx and does NOT create a real order, admin login works, protected endpoints return 401 when unauthenticated, order tracking works).
8. **EVIDENCE appendix**: every command run with exit code and a one-line result; what you could not verify and why (BLOCKED/PARTIAL, honestly); the scratch dirs you created and confirmation that they were deleted and that the workspace `node_modules` and `dist` are intact.

As your final message, send a concise summary (15 lines max) of the verdict and top blockers so it can be relayed to the owner.
