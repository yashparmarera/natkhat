# Vercel Readiness Plan

Findings from reading the code (no secrets read):
- `vercel.json` exists: framework vite, `npm run build`, `dist`, rewrites `/api/(.*)` -> `/api`, `/(.*)` -> `/index.html`. No function config, headers, or `.vercelignore`.
- `api/index.ts` is a correct Node handler: fails closed with 503 via `getMissingConfig()`, lazy-imports `src/server/app` and calls the Express `app(req,res)`. No `listen`. Log string has mojibake ("CafÃ©").
- `src/server/config.ts`: production = `NODE_ENV=production` or `VERCEL`; production never uses SQLite. `pgDb.ts` uses `postgres` with `prepare:false`, `max:1`, module-level cache (correct for Supabase transaction pooler).
- `src/server/db.ts` touches the filesystem (`data/natkhat.db`, `mkdirSync`) only in local SQLite mode; `loadEnv.ts` is skipped on Vercel. `app.ts` calls `initDatabase()` only if `useLocalSqlite()`.
- `server.ts` is local/Node-container only (Vite middleware, `listen`); not used on Vercel.
- grep found no multer/uploads, express-session, cron, setInterval, or hardcoded localhost in `src`. Login rate-limit and sessions live in `src/server/auth.ts` (needs verification during implementation: if they are in-memory they are per-instance on serverless).
- `package.json`: `build` = `vite build` (OK). No `engines`. Build-time packages (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`) sit in dependencies (fine for Vercel). `tsx`, `typescript` are dev. `drizzle-kit`, `@electric-sql/pglite`, `@google/genai` are in dependencies; usage needs verification. Both `bun.lock` and `package-lock.json` exist.
- `.gitignore` ignores `.env*`, `local.env`, `dist`, `node_modules` but not `data/*.db`. No `.vercelignore`.
- `src/App.tsx` statically imports `AdminCMS` and all views; `vite.config.ts` has no `manualChunks`.
- `public/robots.txt` and `sitemap.xml` use `https://natkhatcafe.com` (needs user confirmation of final domain; do not change blindly).
- `.env.example` has AI Studio leftovers (`GEMINI_API_KEY`, `APP_URL`) plus Supabase vars. `DEPLOYMENT.md` is generic and does not mention Vercel.

## Decisions
- Keep Express-in-one-function (`api/index.ts`) with the existing rewrite. Splitting into many functions would be a refactor.
- Keep npm as the package manager (`package-lock.json`); Vercel picks bun if `bun.lock` exists, so state this in docs and do NOT delete `bun.lock` (note it for the user; ask-first). Alternative: keep both and document.
- Use Supabase Postgres via the transaction pooler (already implemented). No libsql.

## Steps

- [ ] 1. Harden `vercel.json`.
      Add `"installCommand": "npm ci"`, `functions` for `api/index.ts` (`maxDuration: 10`, `memory: 1024`; `includeFiles` only if needed), and `headers`: `/assets/(.*)` -> `Cache-Control: public, max-age=31536000, immutable`; `/(.*)` -> `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Change the SPA rewrite so static files and `/api` are not swallowed (rewrites already run after the filesystem; keep the `/api` rule first). Do not add a CSP unless verified against the app (needs verification).
      Files: `vercel.json`
      Verify: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` succeeds; `npx vercel build` if CLI is available (needs verification), else note.

- [ ] 2. Fix `api/index.ts` log mojibake and confirm entry contract.
      Replace "CafÃ©" with "Café" (save as UTF-8). Keep the handler otherwise unchanged. Also check `server.ts` and `vite.config.ts` for the same mojibake in comments (cosmetic, only if trivial).
      Files: `api/index.ts`
      Verify: `npm run lint` passes.

- [ ] 3. Audit serverless-unsafe state in `src/server/auth.ts` and `src/server/app.ts`.
      Read both fully. If login rate limiting or sessions are held in in-memory Maps/SQLite in production, check whether Postgres tables back them. Only document the limitation in `SECURITY.md`/`DEPLOYMENT.md` (per-instance, resets on cold start); do not redesign. Confirm no code path in production reads `data/` or writes the filesystem.
      Files: `src/server/auth.ts`, `src/server/app.ts` (read), `SECURITY.md`, `DEPLOYMENT.md`
      Verify: `npm run lint`; findings recorded in the final report.

- [ ] 4. Dependencies and engines in `package.json`.
      Add `"engines": {"node": "22.x"}` (db.ts uses `node:sqlite`, which needs Node 22.5+; Vercel Node 22 is available). Verify whether `drizzle-kit`, `@electric-sql/pglite`, `@google/genai`, `@supabase/supabase-js` are imported at runtime from `src/` or `api/`; move packages used only by scripts/tooling (`drizzle-kit`) to devDependencies only if no api code imports them, and leave the rest. Add `"vercel-build": "vite build"` is NOT needed. Add `"typecheck"` is NOT needed (`lint` is the typecheck).
      Files: `package.json`, `package-lock.json` (via `npm install --package-lock-only`)
      Verify: `npm ci && npm run lint && npm run build` pass and `dist/index.html` exists.

- [ ] 5. Frontend bundle.
      In `src/App.tsx` replace the static `AdminCMS` import with `React.lazy(() => import('./components/AdminCMS').then(m => ({default: m.AdminCMS})))` and wrap line ~409 `<AdminCMS />` in `<Suspense fallback={...}>` with a minimal fallback matching existing styling. Optionally lazy-load `BulkOrdersView` and `AboutContactView` the same way. In `vite.config.ts` add `build.rollupOptions.output.manualChunks` (Vite 8 uses rolldown; verify option name works, use `advancedChunks`/`codeSplitting` if `manualChunks` warns) to split `react`/`react-dom` and `motion`. Keep the `server.hmr` block untouched.
      Files: `src/App.tsx`, `vite.config.ts`
      Verify: `npm run build` shows a separate AdminCMS chunk with no warnings; `npm run preview` loads home page and admin view.

- [ ] 6. Images and SEO files.
      Inspect `public/` and `src/assets` image sizes (`Get-ChildItem -Recurse | Sort Length`). Add `loading="lazy"`/`decoding="async"` to below-the-fold `<img>` tags in `ProductCard.tsx` only (cheap, behavior-preserving). Do not convert formats. Leave `robots.txt`/`sitemap.xml` domain `natkhatcafe.com` as is and list it in DEPLOYMENT.md as "update to your Vercel/custom domain" (needs user confirmation).
      Files: `src/components/ProductCard.tsx`
      Verify: `npm run lint && npm run build`.

- [ ] 7. Ignore files.
      Create `.vercelignore`: `node_modules`, `data`, `local.env`, `.env*` (not needed by build), `.agents`, `.aistudio`, `test`, `scripts`, `supabase`? (keep `supabase` out only if no build input; needs verification), `*.db`. Append to `.gitignore`: `data/*.db`, `*.db`, `.vercel`. Do not delete any existing data file or lockfile.
      Files: `.vercelignore` (new), `.gitignore`
      Verify: `npm run build` still succeeds; `npx vercel build` if available.

- [ ] 8. Env vars docs.
      Rewrite `.env.example` header: remove AI Studio-only text, keep placeholders only; mark which vars are required on Vercel: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional: `GEMINI_API_KEY` (only if code uses it, needs verification via search of `src/`), `APP_URL`. Note `DIRECT_URL`, `EXPECTED_SUPABASE_PROJECT_REF`, `MIGRATION_CONFIRM`, `USE_LOCAL_SQLITE`, `SQLITE_DB_PATH` are local/CI only, never set on Vercel. Mirror the same table in `ENVIRONMENT.md`. Confirm the frontend uses only relative `/api` URLs (search `fetch(` in `src/`).
      Files: `.env.example`, `ENVIRONMENT.md`
      Verify: manual read-through; no real secrets present.

- [ ] 9. Rewrite `DEPLOYMENT.md` for Vercel.
      Sections: prerequisites (Node 22, Supabase project, migrations applied with `npm run db:migrate` from a local machine using `DIRECT_URL`), import repo, framework Vite, build `npm run build`, output `dist`, env var table (Production + Preview), Supabase transaction pooler URL (port 6543), post-deploy checks (`/api/health` returns `{status:"ok"}`, 503 means missing env vars, admin login), lockfile note (npm is used; `bun.lock` also present and Vercel prefers bun if it is the only/first match, so remove it deliberately or keep it knowingly), robots/sitemap domain update, limitations from step 3, and the local-only `npm run dev`/`npm start` path via `server.ts`.
      Files: `DEPLOYMENT.md`
      Verify: every command and path named in the doc exists in `package.json`/repo.

- [ ] 10. Final verification.
      Run `npm ci`, `npm run lint`, `npm run build`, `npm test`; run `npx vercel dev` or `npx vercel build` if the CLI is available. Smoke test the handler with `DATABASE_URL` unset and `VERCEL=1` (expect 503 JSON) and with local SQLite mode (`npm run dev`, GET `/api/health`). Anything not executable (real Supabase connectivity, live Vercel deploy) is "needs verification by user after deploy".
      Verify: all commands exit 0.
