# Deployment Guide (Vercel)

## Prerequisites
- Node 22 (`engines` in `package.json`).
- A Supabase project with migrations applied (step 1).
- The repo pushed to GitHub/GitLab/Bitbucket.

## Steps
1. **Database.** On your machine set `DIRECT_URL`, `EXPECTED_SUPABASE_PROJECT_REF`, `MIGRATION_CONFIRM` in `local.env`, then run `npm run db:migrate -- --dry-run` and `npm run db:migrate`. Create the admin user with `npm run db:provision-admin` if needed. Existing data import: `npm run db:migrate-data`, check with `npm run db:verify`.
2. **Import** the repo in Vercel (Add New > Project). Framework Vite; `vercel.json` sets install `npm ci`, build `npm run build`, output `dist`.
3. **Environment variables** (Production and Preview): `DATABASE_URL` (transaction pooler, port 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. See `ENVIRONMENT.md`. Never set the local-only variables.
4. **Deploy.** `/api/*` is served by one Express function (`api/index.ts`, 10 s, 1024 MB); everything else falls back to `index.html`.
5. **Check.** Open `/api/health` (expect `{"status":"ok"}`; a 503 means a variable is missing), load the menu, and sign in to the admin view.

## Notes and limitations
- **Lockfiles.** Both `package-lock.json` and `bun.lock` exist. `vercel.json` forces `npm ci`, so npm is used. Delete `bun.lock` yourself if you want a single lockfile; it was not removed.
- **Admin login rate limit** is in memory (`src/server/auth.ts`), so it is per function instance and resets on cold start. Production admin sessions are Supabase tokens validated against Postgres; the in-memory session map is local SQLite only.
- No file uploads, cron jobs or runtime file writes are used in production. `data/*.db` is local only and excluded by `.vercelignore` and `.gitignore`.
- `public/robots.txt` and `public/sitemap.xml` use `https://natkhatcafe.com`. Update them if your final domain differs.
- Local run: `npm run dev` or `npm start` (`server.ts`, Vite middleware, not used on Vercel).
