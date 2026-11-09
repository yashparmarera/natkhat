# Environment Configuration

See `.env.example` for placeholders and `DEPLOYMENT.md` for the Vercel steps.

| Variable | Vercel | Notes |
|---|---|---|
| `DATABASE_URL` | Required | Supabase transaction pooler (port 6543) |
| `SUPABASE_URL` | Required | Or `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server only, never `VITE_` |
| `SUPABASE_ANON_KEY` | Required | Admin sign-in only; or `VITE_SUPABASE_ANON_KEY` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Required | Public, inlined at build |
| `USE_LOCAL_SQLITE`, `SQLITE_DB_PATH` | Never | Local dev only |
| `DIRECT_URL`, `EXPECTED_SUPABASE_PROJECT_REF`, `MIGRATION_CONFIRM` | Never | Migration runner, run from your machine |

The frontend calls relative `/api/...` URLs only. No hosted URL is configured in code.

## Runtime modes
- **Production** (`NODE_ENV=production` or `VERCEL` set): Supabase PostgreSQL + Supabase Auth only. If a required variable is missing, `api/index.ts` answers every request with 503 `{"error":"Service misconfigured"}` and `server.ts` exits non-zero. SQLite is never loaded.
- **Local SQLite** (not production, `DATABASE_URL` empty or `USE_LOCAL_SQLITE=true`): uses `data/natkhat.db`.
- Non-production with `DATABASE_URL` set uses Postgres + Supabase.
- `.env` then `local.env` load for local runs only (skipped on Vercel). Host variables are never overridden.

## Commands
- Dev: `npm run dev` (port 3000). Build: `npm run build`. Typecheck: `npm run lint`. Tests: `npm test`.

## Migrations
`npm run db:migrate` needs `DIRECT_URL` (direct host or session pooler on 5432; 6543 is refused), `EXPECTED_SUPABASE_PROJECT_REF` and `MIGRATION_CONFIRM` (equal to the ref). Add `-- --dry-run` to list pending migrations without applying.
