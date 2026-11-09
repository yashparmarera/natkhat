# Vercel deployment readiness changes

The change makes the project deployable on Vercel: a `vercel.json` with Vite build, SPA and `/api` rewrites, function limits and headers. The serverless entry fails closed with 503 when config is missing. `drizzle-kit` moves to devDependencies, `engines.node` is pinned to 22.x, AdminCMS is lazy-loaded, `manualChunks` are added, and the ignore files and deployment docs are rewritten. Review relied on the report and on spot reads of the config files (no git repo exists, so no diff was available).

Watch for: live Postgres connectivity and `vercel build` are unverified (confirmed in report). The `motion` manual chunk is not emitted (confirmed in report, harmless). `bun.lock` coexists with `package-lock.json` (possible, documented).

**Verdict**: APPROVED

## High-level view

`vercel.json` uses `npm ci`, outputs `dist`, rewrites `/api/*` to the function and everything else to `index.html`, and sets long-lived cache on `/assets/*` plus basic security headers. `api/index.ts` has no `listen` and no dev middleware, and lazily imports the app only when Supabase config is present, so production never loads SQLite. Env vars are documented in `.env.example` with placeholders only, and SQLite variables are marked local-only. Lint, build and 68 tests passed per the report.

## Issues (3)

1. **No live verification** — Postgres connectivity, `/api/health` and `vercel build` were not run. Check after first preview deploy.
2. **Unused `motion` chunk config** — the `motion` manualChunk is not emitted. Optional cleanup.
3. **Dual lockfiles** — `bun.lock` and `package-lock.json` both exist, and Vercel may pick Bun. `installCommand` pins npm, so risk is low. Consider removing one.
