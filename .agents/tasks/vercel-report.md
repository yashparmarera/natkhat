# Vercel Readiness Report

## Changes
- `vercel.json`: installCommand `npm ci`, function config for `api/index.ts` (10 s, 1024 MB), cache header for `/assets/*`, security headers (nosniff, X-Frame-Options DENY, Referrer-Policy). Rewrites kept.
- `api/index.ts`: log-string mojibake fixed. Handler unchanged (no listen, no Vite middleware, 503 when config missing).
- `package.json`: `engines.node` 22.x; `drizzle-kit` moved to devDependencies (only used by tooling). Lockfile refreshed with `npm install --package-lock-only`.
- `src/App.tsx`: `AdminCMS` lazy-loaded with Suspense. `vite.config.ts`: `manualChunks` for react and motion.
- `.vercelignore` added; `.gitignore` adds `data/*.db`, `*.db`, `.vercel`.
- `.env.example`, `ENVIRONMENT.md`, `DEPLOYMENT.md` rewritten for Vercel.
- Not changed: `bun.lock` kept (noted in DEPLOYMENT.md); robots/sitemap domain kept; `ProductCard` images already had `loading="lazy"`.

## Verification
- `npm run lint`: pass. `npm run build`: pass, separate AdminCMS (33 kB) and react (219 kB) chunks. `npm test`: 68/68 pass.
- Handler smoke test with `VERCEL=1` and no env: 503 `{"error":"Service misconfigured"}`.
- Audit: no uploads, cron or runtime file writes in production; in-memory login rate limit is per instance (documented).
- NOT verified: `npx vercel build` (not run, needs CLI/login), Postgres connectivity, live deploy, `/api/health` against a real DB. The `motion` chunk was not emitted separately (motion is likely bundled into the main chunk).
- No git repository exists in the folder, so nothing was committed.

## Required Vercel env vars
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Manual steps
1. Provision Supabase and run `npm run db:migrate` (plus admin provisioning/data migration) from your machine.
2. Import the repo in Vercel, add the env vars, deploy.
3. Check `/api/health`, menu, admin login.
4. Decide on `bun.lock` and update robots.txt/sitemap.xml domain.
