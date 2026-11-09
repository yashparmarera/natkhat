# Natkhat Café: Transfer and Production-Readiness Audit

Audit date (system clock): 2026-11-09. Mode: read-only. Labels: PASS / FAIL / PARTIAL / NOT IMPLEMENTED / BLOCKED. Evidence tag: **[T]** tested by running something, **[S]** static inspection only.

---

## A. Executive Summary

**Verdict: NOT production-ready. The transfer itself is intact and the SQLite data is preserved, but the app does not run on the target architecture today.**

Key facts:

1. **Transfer integrity: PASS [T].** `tsc --noEmit` exits 0, 37/37 tests in `test/` pass, 3 more test files in `src/` pass, and `vite build` succeeds.
2. **Runtime is SQLite, not Supabase [T].** The live server's `GET /api/health` reports `"database":"SQLite (Local)"`. `server.ts` never loads dotenv, and the only env file present is `local.env`, which `dotenv.config()` (it reads `.env`) would not read. The Postgres, Supabase Auth and RLS code paths are therefore never exercised by the running app.
3. **SQLite preservation: PASS with one deviation [T].**
   - Backup SHA256 matches the expected value.
   - Active DB SHA256 matches the expected value.
   - The active DB contains 7 orders, not 6. The extra one is `NC-842376` (₹250, created 2026-11-09, a post-backup order).
   - The backup has exactly the expected inventory (1 / 7 / 27 / 6 / 12 items / ₹1,590).
4. **Highest-severity defects [S]:**
   - RLS grants staff whole-row `UPDATE` on `orders`, so staff can edit customer details, totals and snapshots via PostgREST.
   - `migrate-data.ts` overwrites settings, categories and products on re-run.
   - All 27 product images point at `/src/assets/images/...`, which does not exist in `dist/`, so images break in a static deploy.
   - No order-status update endpoint exists, so staff cannot confirm orders in the app.
   - A hardcoded default admin password sits in source (`db.ts`).
   - The login rate limiter is in-memory and keyed on `req.ip` without `trust proxy`.
   - The Vercel entrypoint opens a SQLite file at import time.
5. **Storage: NOT IMPLEMENTED.** There is no upload endpoint, bucket config or Supabase Storage usage.
6. **Order flow:** server-side pricing, availability and delivery math are correct and the UI wording is honest (nothing claims confirmation). Gaps: no quantity cap, NaN quantity handling, delivery/pickup-enabled flags not enforced, and a weak order reference generator.

Not performed (and why):
- Browser/UI testing: BLOCKED (no browser tool).
- Postgres, Supabase and Vercel behaviour: BLOCKED (no credentials or deployment, and prohibited by the brief).
- `git` history and `git ls-files` checks: the folder is not a git repository.

---

## B. Actual Repository Architecture

| Layer | Finding | Evidence |
|---|---|---|
| Frontend | Vite 8 + React 19 + TS 7 + Tailwind 4 (PASS) | `package.json` deps; `vite.config.ts` uses `@tailwindcss/vite` [S]; build OK [T] |
| Backend | One Express app in `src/server/app.ts`, not modular: all routes, SQL and Postgres branches live in a single file | [S] |
| Entrypoints | `server.ts` (local dev, Vite middleware, hard-coded port 3000, SPA fallback in prod) and `api/index.ts` (`export default app` for Vercel) both import `src/server/app.ts` | [S] |
| Databases | Dual-mode. `src/server/db.ts` (`node:sqlite`, `data/natkhat.db`) is initialised unconditionally by `initDatabase()` at import of `app.ts`. `src/server/pgDb.ts` is used only when `DATABASE_URL` is non-empty. | [S] |
| Active runtime | SQLite. `/api/health` returned `SQLite (Local)` | [T] |
| Auth | Two mechanisms: Supabase `signInWithPassword` + `getUser(token)` when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise in-memory sessions from SQLite `admin_users` | `auth.ts`, `app.ts` [S] |
| Storage | None | see K |
| Migrations | Hand-written SQL in `supabase/migrations/0001`, `0002`, run by `scripts/apply-migrations.ts` | [S] |
| Drizzle | `src/db/schema.ts` mirrors the SQL. `drizzle.config.ts` outputs to `supabase/migrations` (so `drizzle-kit generate` could write into the same folder as hand-written migrations). | [S] |

Unused or misleading items:
- `@google/genai` and `GEMINI_API_KEY`: no code reads them.
- `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_URL`: no frontend code uses `import.meta.env` or any Supabase client. Auth is proxied through `/api/auth/login`.
- `esbuild` and `autoprefixer` are unneeded with Tailwind 4 / Vite 8.
- Docs (`DATABASE.md` says "Embedded SQLite") and `.aistudio/.../implementation_plan.md` (PostgREST, Storage, `PATCH /api/orders/:id/status`) describe different architectures. Treat both as claims, not facts.

---

## C. Transfer Integrity

| Check | Result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` (TS 7.0.2) | PASS [T]: exit 0, no diagnostics |
| Missing files / broken imports | None found: tsc clean, build resolves 1676 modules [T] |
| node_modules present | Yes |
| Lint | `npm run lint` is just `tsc --noEmit`. No ESLint config exists. |
| `.env.example` completeness | PARTIAL: lacks `DIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_NAME` (used by `apply-migrations.ts`, `provision-admin.ts`) |
| Env loading in app | FAIL (Medium) [S]: `server.ts` / `app.ts` / `pgDb.ts` never call dotenv. Only scripts do, and they read `.env`, not `local.env`. |
| Git repository | Not a git repo. No history to scan; `.gitignore` covers `.env*`, `local.env`, `dist/`, but not `data/*.db`. |
| `package.json` `name` | Still `react-example` (cosmetic) |
| `engines` | Not declared. `node:sqlite` needs Node >= 22.5 and is experimental (ExperimentalWarning seen) [T]. |
| Tool note | `npm`/`npx` wrappers failed in this shell (path with `é`), so binaries were run via `node node_modules/...`. Results are equivalent to the npm scripts. |

---

## D. SQLite Data Preservation

Method: both files were copied byte-for-byte via shared-read streams into a temp directory (the active DB is locked by the running dev server). Hashes and queries ran on the copies. Originals were not opened for write. [T]

### Hashes

| File | SHA256 | Expected | Result |
|---|---|---|---|
| `data/natkhat_backup_pre_migration.db` | `41ac3463ad6165f59a0fe66d6016a9f2c8b237b7ebe5e4a589c6540f3098c476` | same | **PASS** |
| `data/natkhat.db` | `af02fc8cf10c32c14b8db74e10923808c70f5785811230afaadde64ee11fc79e` | same | **PASS** |

Both files are 69,632 bytes with identical mtime (2026-11-09 06:48:39). No `-wal`/`-shm` files in `data/`.

### Inventory (backup, the authoritative migration source)

| Item | Expected | Actual | Result |
|---|---|---|---|
| store_settings | 1 | 1 | PASS |
| categories | 7 | 7 | PASS |
| products | 27 | 27 (sum of prices 226,500 paise, 0 unavailable) | PASS |
| orders | 6 | 6 | PASS |
| order items (from `items_json`) | 12 | 12 | PASS |
| order value | ₹1,590 | 159,000 paise = ₹1,590 | PASS |
| references | the 6 listed | exactly NC-348176, NC-512660, NC-289212, NC-569859, NC-369171, NC-968790 | PASS |
| admin_users | n/a | 1 (`admin`, role `admin`, scrypt hash 128 hex + salt 32 hex) | PASS |

### Active DB deviation

`data/natkhat.db` has **7 orders / 14 items / ₹1,840**. The extra row is `NC-842376` (delivery, `pending_confirmation`, 25,000 paise, created 2026-11-09T00:13:38Z). It is a post-backup order, perhaps a test order from the running server. Its hash still equals the previously reported active hash, so this state was already reported before the transfer. The migration script reads only the backup, so this order would **not** be migrated to Postgres. Decision for the owner: is NC-842376 real or a test? If real, it must be added deliberately.

### Structure [T]

- All tables: `store_settings` (PK `id`, `CHECK(id=1)`), `categories` (PK `id` TEXT), `products` (PK `id`, FK `category_id → categories.id`), `orders` (PK `reference_id`), `admin_users` (PK `id`, UNIQUE `username`).
- No explicit indexes beyond PK/UNIQUE autoindexes.
- No `order_items` table in SQLite. Items exist only as `items_json`.
- `PRAGMA integrity_check` = `ok` for both files. `PRAGMA foreign_key_check` = empty. No orphaned products.
- `items_json` shape: array of `{product:{id,name,slug,description,pricePaise,categoryId,categoryName,dietary,image,isAvailable,isFeatured,displayOrder,portionInfo,prepTimeMinutes}, quantity}`.
- Arithmetic: for all 6 backup orders (and `NC-842376`), `Σ(pricePaise×qty) = subtotal` and `total = subtotal + delivery_fee`. Delivery fee is 0 on all (all at or above the ₹250 threshold; one is ₹340).
- All 6 backup orders are `delivery` + `pending_confirmation`.
- Timestamps are ISO-8601 UTC strings (2026-10-31T14:23:33Z … 14:52:59Z).
- Store config: cafe "Natkhat Café", WhatsApp `919876543210`, min delivery ₹100, fee ₹30, free-delivery threshold ₹250, FSSAI `13324005000892`. The contact/WhatsApp numbers look like placeholders (`+91 98765 43210`); confirm before launch.

---

## E. PostgreSQL and Drizzle (static only; nothing executed)

| Requirement | Result | Evidence |
|---|---|---|
| Tables for settings/categories/products/orders/order_items/profiles | PASS [S] | `schema.ts`, `0001_initial_schema.sql` |
| Schema and SQL agree | PASS [S] | Same columns/checks in both. Both are manually kept in sync. |
| FK correctness | PASS [S] | `products.category_id` RESTRICT; `order_items.order_reference_id → orders` RESTRICT; `order_items.product_id → products` RESTRICT |
| No destructive cascades | PASS [S] | No `ON DELETE CASCADE` anywhere |
| BIGINT money | PASS [S] | All `*_paise` are `bigint` |
| Safe TS handling of BIGINT | PARTIAL (Low) | `bigint({mode:'number'})` returns JS numbers. Safe up to 2^53, fine for café amounts. `verify-migration.ts` uses `BigInt()` on sums. |
| CHECK constraints | PASS [S] | positive price, `total = subtotal + fee`, `qty > 0`, `item total = unit × qty`, single-row settings |
| Unique order reference | PASS [S] | `reference_id` is the PK |
| `order_items` authoritative | PARTIAL | Table exists and is written alongside `items_json`. But `GET /api/orders` still reads `itemsJson`, and no constraint ties line items to `orders.subtotal_paise`. |
| Order snapshot preserved | PASS [S] | `product_name_snapshot`, `unit_price_paise`, `portion_info_snapshot`, `items_json` |
| Immutability of snapshots | FAIL | No trigger or column-level grant prevents UPDATE (see F) |
| Status values | PASS [S] | enum `order_status` starts at `pending_confirmation` |
| `public_store_settings` view | PARTIAL | See F |

### Migration runner `scripts/apply-migrations.ts` [S]

- Advisory lock: session-level `pg_advisory_lock(894729104859124)` with unlock in `finally`. PASS (it uses `DIRECT_URL`, so session locks are valid).
- Checksums: SHA256 stored in `_schema_migrations`; mismatch on an applied file throws "FATAL INTEGRITY VIOLATION". PASS.
- Transactional: each file inside `sql.begin` with the ledger insert. PASS.
- Falls back to `DATABASE_URL` (transaction pooler) if `DIRECT_URL` is unset. Session advisory locks are unreliable through PgBouncer in transaction mode. Severity: Medium. Recommend failing instead of falling back.
- Version key is `file.split('_')[0]`. OK for `0001_...`.
- `db:push` is not in `package.json` scripts: PASS. `drizzle-kit` is a runtime dependency though (should be dev).

### Data migration `scripts/migrate-data.ts` [S]

- Source is `data/natkhat_backup_pre_migration.db`, opened `readOnly`. PASS.
- Single `pg.transaction`. PASS.
- **FAIL (High):** the requirement says repeated imports must not overwrite data. `store_settings`, `categories` and `products` use `onConflictDoUpdate` with the full SQLite values. A re-run after go-live reverts production edits (prices, availability, settings, announcement) to the backup state.
- **Orders/order_items:** `onConflictDoNothing` protects the historical rows. PASS. But conflicts are only detected by comparing `total_paise`. A different name, phone, status or items with the same total is silently kept (Medium). The brief asks for conflicts to fail loudly.
- **Order item ID collision (Medium):** the id is `item-<ref>-<productId>`. If an order has two lines for one product, the second is silently dropped by `onConflictDoNothing` and the line sum diverges. Current data is clean (12 items on 6 orders with distinct products), but `verify-migration.ts` would not notice.
- **Advisory lock via pooler (Medium):** it uses `getPostgresClient()` (`DATABASE_URL`, `prepare:false`, `max:1`). Session lock + transaction-pooler is unsafe. It does not use `DIRECT_URL`.
- It reads existing orders before the transaction and takes no lock on the table. Fine given the advisory lock, but the lock itself is the weak part.
- `verify-migration.ts` [S]: compares counts and sums for categories, products and orders. For `order_items` it only prints a count and does not compare to 12. It does not compare item-level prices or quantities. PARTIAL (Medium).
- The migrator seeds only 1 settings/7 categories/27 products/6 orders. The brief's 12 items are derived from `items_json`. Sound.
- Neither script was run. Impact if run: writes to whatever `DATABASE_URL` points at.

---

## F. Supabase Auth / RLS / RBAC

Caveat: the Supabase path in `auth.ts` was **not exercised** (no credentials). `test/postgresSecurityIntegration.test.ts` runs the SQL against an in-memory PGlite, not Supabase. It checks grants/RLS on the real migration files for the `anon` and `authenticated` roles: 12 checks passed [T]. That is useful evidence for the SQL, but it does not prove behaviour with `auth.uid()` on Supabase.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | JWT verified server-side | PASS [S] | `requireAuth` calls `supabaseAdmin.auth.getUser(token)` (network verification by GoTrue) |
| 2 | Missing/invalid token → 401 | PASS [T] | `/api/orders`, `/api/auth/me`, etc. return 401 with no token; forged bearer returns 401 "Session invalid or expired" (local-session path) |
| 3 | Missing/inactive profile rejected | PASS [S] | `403` "profile does not exist" / "deactivated" in `auth.ts` |
| 4 | No automatic staff fallback | **PARTIAL** | `requireAuth` is fail-closed. But `POST /api/auth/login` (Supabase branch) sets `let userRole = 'staff'` and returns a valid token even when no profile exists. Also `auth.ts` Path B does `(userRow.role) || 'staff'`. Severity: Low-Medium. Middleware still rejects such users with 403. |
| 5 | Frontend roles never trusted | PASS [S] | Role is read from `profiles` or `admin_users`; request body roles are ignored |
| 6 | Staff cannot self-promote | PASS [S] | `profiles` write policy is admin-only (`Admin manage profiles`); no staff UPDATE policy. PGlite test passed [T]. |
| 7 | Admin-only ops enforced | PASS [S] | `requireAdminAuth` on `POST /api/settings`, `DELETE /api/products/:id`, `POST /api/auth/change-password`. 401 verified unauthenticated [T]. |
| 8 | Anon cannot read orders | PASS [S][T] | `REVOKE ALL ... FROM anon`; PGlite test 4 passed |
| 9 | Anon cannot insert orders/items | PASS [S][T] | same, tests 1–2 |
| 10 | Public sees only menu/store data | PASS [S] | anon granted `public_store_settings`, `categories`, `products` only; RLS limits to active/available rows |
| 11 | Service-role key not in frontend | PASS [S][T] | Used only in `src/server/supabase.ts` and `scripts/provision-admin.ts`. No `import.meta.env` anywhere. `dist/` scan for `SERVICE_ROLE`, `DATABASE_URL`, `postgres://`, JWT-looking strings: none. |
| 12 | No password/PII logging | PASS [S] | Only generic `console.error(label, err)`; `err` objects may include driver messages, not request bodies. Low risk. |

### Findings

**F-1 (High) [S]: staff can rewrite order contents.**
- `0002_rls_policies.sql`: `GRANT SELECT, UPDATE ON public.orders TO authenticated` and `CREATE POLICY "Staff update orders" ... FOR UPDATE USING (public.is_active_staff())`.
- There is no column-level grant, no `WITH CHECK`, and no trigger. Any active staff JWT can `PATCH` `/rest/v1/orders` through PostgREST and change `reference_id`, `customer_*`, `subtotal/total_paise` (only constrained by `total = subtotal + fee`), `items_json`, `created_at`.
- Violates "staff cannot modify references, customer details, names, unit prices, totals, snapshots".
- Fix: `REVOKE UPDATE ON orders FROM authenticated; GRANT UPDATE (status, updated_at) ON orders TO authenticated;`, or a `BEFORE UPDATE` trigger raising when any column other than `status`/`updated_at` changes. Add a status-transition rule. Consider dropping `authenticated` table grants entirely, since the Express server uses the postgres role and bypasses RLS.

**F-2 (Medium) [S]: staff have too much power on products and categories.**
- `Staff manage products` / `Staff manage categories` are `FOR ALL USING (is_active_staff())` with `INSERT, UPDATE, DELETE` grants. Staff can change prices and delete menu rows directly via PostgREST. The Express API restricts price edits to manager/admin; RLS does not.
- Fix: split policies per command and role, or revoke direct grants.

**F-3 (Medium) [S]: `public_store_settings` view.**
- Created with `security_invoker = false, security_barrier = true`.
- Intentional definer mode: it exposes only 15 non-sensitive columns and `WHERE id = 1`, and base-table access is revoked from anon. Supabase's linter will flag a security-definer view; this is by design, but document it.
- Anon receives `whatsapp_number` and `fssai_number` (public by nature).
- It returns `pgsql`-owner-privileged rows; owner must not be a role that can be abused. OK.

**F-4 (Medium) [S]: the sign-in client is the service-role client.**
- `app.ts` calls `supabaseAdmin.auth.signInWithPassword(...)` on the shared service-role singleton. supabase-js can keep the returned user session in that client's memory, so later calls may carry a user JWT instead of the service key.
- Fix: sign in with a separate anon-key client (`SUPABASE_ANON_KEY`, server-side) and keep the admin client for admin calls only.

**F-5 (High for production) [S]: hardcoded default credentials.**
- `src/server/db.ts` seeds `admin` / `NatkhatCafe@2026` if `admin_users` is empty (line ~167). The password is in source and in docs. The current local DBs contain this account (1 row).
- Used only in SQLite mode, but SQLite mode is what's running. Anyone with the repo knows it. Rotate, and prevent seeding in production.

**F-6 (Medium) [S]: login rate limiting.**
- `checkLoginRateLimit` / `recordLoginAttempt` use an in-memory `Map` keyed by `req.ip`. On Vercel, instances do not share memory, so limits are per-instance and reset on cold start.
- No `app.set('trust proxy', …)`. Behind Vercel `req.ip` can be the proxy address, so five failed logins by anyone would lock out all admins for 15 minutes (DoS).
- The Supabase branch records attempts only when the Supabase call fails. Fine.
- Fix: set `trust proxy`, or use a shared store (Redis/Upstash or DB table).

**F-7 (Medium) [S]: SQLite session tokens.**
- In-memory `Map`, 7-day TTL, lost on restart, not shared across instances. Acceptable for local dev only. `requireAuth` Path B also runs in Supabase mode if `DATABASE_URL` is unset (falls through), so a half-configured production would silently use local sessions. It would still fail closed (no sessions), but the combination is confusing.
- Password hashing: scrypt (`N` default, 64-byte, 16-byte salt) with `timingSafeEqual`. PASS.
- Password change enforces a minimum of 8 characters only.

**F-8 (Low) [S]:** `GET /api/auth/me` exists but no frontend code calls it. The stored token is never validated on page load. After expiry, the admin UI looks logged in until the first 401. Token is kept in `localStorage` (XSS-exposed; no `dangerouslySetInnerHTML` was found).

**F-9 (Low) [S]:** `profiles.id` has no FK to `auth.users(id)`; `profiles` has no `ON DELETE` link. Orphans possible.

---

## G. API Contract Compatibility

All of these were observed against the live local server (SQLite mode) for status codes. Schemas are from code. 401s were tested; authenticated success paths were NOT tested (no valid credentials were used, to avoid mutating data).

| Endpoint | Auth / Authz | Request | Response | Validation | DB |
|---|---|---|---|---|---|
| `GET /api/health` | none | n/a | `{status,service,database,timestamp}` | n/a | none. **Reveals DB backend publicly (Low)** |
| `GET /api/settings` | public | n/a | camelCase settings incl. `*Paise` numbers [T 200] | n/a | Postgres `store_settings` or SQLite row id 1; 404 if missing |
| `POST /api/settings` | admin | partial settings JSON | `{success,message}` | **none**; PG branch writes `undefined` fields (Drizzle skips them), SQLite uses `COALESCE`; no type/range checks (e.g. negative fees) beyond DB CHECKs | UPDATE id=1. 401 [T] |
| `GET /api/categories` | public | n/a | array `{id,name,slug,description,displayOrder,active,image}` [T 200] | n/a | **returns inactive categories too** (no filter) |
| `POST /api/categories` | admin/manager | `{name,description?,displayOrder?,image?}` | `201 {success,id}` | `b.name.toLowerCase()` throws on missing name → unhandled (500/hang) | INSERT; id `cat-<Date.now()>` |
| `PUT /api/categories/:id` | admin/manager | `{name,description,active}` | `{success,id}` | none; no 404 on unknown id | UPDATE |
| `GET /api/products` | public | n/a | array of product DTOs incl. `isAvailable` [T 200] | n/a | all rows, no filter |
| `POST /api/products` | admin/manager | product fields | `201 {success,id}` | name only implicitly; no price > 0 / int check in SQLite mode | INSERT; slug may collide (no unique on slug) |
| `PUT /api/products/:id` | admin/manager | name,description,pricePaise,… | `{success,id}` | none; price not validated; no 404 | UPDATE |
| `PATCH /api/products/:id/availability` | staff+ | none (toggles) | `{success,id,isAvailable}` | 404 if unknown | read-then-write toggle (race-prone, not idempotent) |
| `DELETE /api/products/:id` | admin | n/a | `{success,message}` | PG FK error → 400 "referenced in past orders" | In SQLite there are no order_items FKs, so delete succeeds even for products in past orders (data-integrity gap, historical `items_json` unaffected) |
| `POST /api/orders` | public | `{customer:{name,phone,orderType,address?,landmark?,instructions?}, items:[{productId,quantity}]}` | `201` order object with `referenceId`, totals, `status`, `whatsappUrl`, `whatsappMessage` | see H; 400 `{error}` for validation [T] | PG: transaction; SQLite: no transaction |
| `GET /api/orders` | staff+ | n/a | array `{referenceId,customer{…},subtotalPaise,…,status,createdAt,items}` [T 401 unauth] | n/a | SQLite: `LIMIT 50`; PG: all rows, unpaginated, ordered asc then reversed |
| `POST /api/auth/login` | public, rate limited | `{username,password}` | `{success,token,user{id,username,role}}` | 400 if missing [T]; wrong credentials 401 `Invalid credentials` [T] | Supabase or `admin_users` |
| `GET /api/auth/me` | staff+ | n/a | `{success,user}` | 401 [T] | |
| `POST /api/auth/change-password` | admin | `{newPassword}` | `{success,message}` | min 8 chars | Supabase admin API or SQLite UPDATE. 401 [T] |

### Mismatches and gaps

- **No endpoint to change order status.** The design plan lists `PATCH /api/orders/:id/status`; it is absent from `app.ts`, `CafeContext.tsx` and `AdminCMS.tsx`. Staff can only view orders, labelled "Pending WhatsApp Confirmation". There is no confirm/cancel/complete flow (High functional gap).
- `GET /api/orders` for Postgres returns `items: r.itemsJson` rather than joining `order_items`.
- Consumers match the producers for the endpoints that exist (`CafeContext.tsx`: settings/categories/products, `POST /api/orders`, login, `GET /api/orders`, change-password, settings, availability, product PUT/POST/DELETE, category PUT/POST). I found no request/response shape mismatch.
- `CafeContext.updateSettings` is optimistic: it updates local state before the server answers and does not roll back on failure; it returns `res.ok`. Same pattern for availability toggle.
- Malformed JSON body returns an Express **HTML error page** (with a stack trace in non-production) rather than JSON [T]. Fix with an error-handling middleware.
- Unknown `GET /api/*` returns the SPA `index.html` with 200 in the local dev server and in `server.ts` production mode (`app.get('*')`) [T]. On Vercel the `/api/(.*)` rewrite handles it.
- No global Express error handler; async handlers without try/catch (`POST /api/settings`, product/category routes) rely on Express 4, which does **not** catch rejected promises, so a DB error can hang the request or crash the process.
- `POST /api/orders` and the Postgres branch return `err.message` from the database to the client (information leak, Low).

---

## H. Customer Ordering Workflow

Files: `src/utils/cart.ts`, `src/utils/whatsapp.ts`, `src/server/orderValidator.ts`, `CartDrawer.tsx`, `CafeContext.tsx`.

| Check | Result | Evidence |
|---|---|---|
| Cart math | PASS [T] | `src/utils/cart.test.ts` passes; `calculateCartSubtotalPaise`, `calculateDeliveryFeePaise` |
| Client prices ignored | PASS [S][T] | Client sends only `{productId, quantity}` (`submitOrderToServer`); server loads price from DB. Test "computes prices from database, not client" passed. |
| Availability check | PASS [S] | `is_available` / `isAvailable` check, error `"… is currently sold out"` |
| Unknown product | PASS [T] | 400 `Product ID "does-not-exist" does not exist in menu` |
| Required fields | PASS [T] | name, phone (≥10 digits), delivery address, non-empty items → 400s observed |
| Delivery minimum | PASS [S] | `subtotal < min_order_delivery_paise` → error (delivery only) |
| Delivery fee / free threshold | PASS [S] | fee applies when `subtotal < freeDeliveryThreshold`; ≥ threshold is free; pickup = 0 |
| Total = subtotal + fee | PASS [S] | Also enforced by Postgres CHECK |
| Transactional creation | PARTIAL | Postgres: `pg.transaction` (orders + order_items). **SQLite: no transaction** and no `order_items` table |
| Unique reference | **FAIL (Medium)** | `NC-${Date.now().toString().slice(-4)}${Math.floor(10+Math.random()*90)}`: only about 4 digits of millisecond time plus 2 random digits, a 6-digit space. Collisions are plausible and no retry exists; a collision gives a PK error, and the raw error message goes to the user as a 400. Fix: `crypto.randomInt`, longer ref, retry on unique violation. |
| Quantity validation | **FAIL (Medium)** | `qty = Math.floor(requestedItem.quantity); if (qty <= 0) continue;` has no integer or maximum check. A non-numeric value gives `NaN`, and `NaN <= 0` is false, so it passes validation: SQL would receive NaN (PG error, or NOT NULL failure on SQLite). A huge quantity (e.g. 1e9) is accepted and priced. Zero/negative items are silently dropped rather than rejected. Duplicate `productId` lines are not merged. Not tested live (would risk writing a real order). |
| `orderType` validated | **FAIL (Medium)** | Any value other than `'delivery'` is treated like pickup in SQLite; Postgres enum would reject it with a DB error |
| `deliveryEnabled` / `pickupEnabled` enforced | **FAIL (Medium)** | Settings fields exist, and the server never checks them. A customer can place a delivery order when the admin has turned delivery off. |
| Opening hours / closed store | NOT IMPLEMENTED | `openingHours` is display text only |
| Input length limits | NOT IMPLEMENTED (Low) | No max lengths for name/address/instructions; phone has no maximum digit count or normalisation (`≥10` digits only) |
| Order status | PASS [S] | Created as `pending_confirmation`; never set to a confirmed value by code |
| Item immutability | PARTIAL | See F-1; nothing prevents updates in Postgres via PostgREST |
| Rate limit on order endpoint | NOT IMPLEMENTED (Medium) | Anyone can spam orders / fill the DB |
| WhatsApp URL | PASS [T] | `https://wa.me/<digits>?text=<encodeURIComponent(message)>`; number sanitised to digits (+91 prefix for 10-digit). `whatsapp.test.ts` passes. |
| WhatsApp message format | PASS [S] | Ref `#NC-…`, customer, items, bill summary, "Please confirm availability and estimated preparation time." |
| URL length | Low risk | wa.me URLs with long carts and notes can exceed practical limits. No truncation logic. |
| Message injection | Low | Name/address/instructions are inserted raw into the message; it is the customer's own message, so impact is minimal |

### "Never claim confirmed because WhatsApp opened": PASS [S]

- `CartDrawer.tsx` pre-submit notice: "Your order will be confirmed by our café team on WhatsApp."
- Admin label for `pending_confirmation`: "Pending WhatsApp Confirmation".
- Success screen offers a WhatsApp button and a copy-message button (the order is saved before WhatsApp opens).
- Observation (Low): the order is persisted at "submit" time, before the customer actually sends the WhatsApp message. Unsent orders will appear in the admin list as pending. That matches the intended model but staff cannot distinguish a sent message from an unsent one. `window.open` is called inside an async handler, so popup blockers may block it; a fallback button exists.
- `Footer.tsx` says "Confirmed live by café staff", which is accurate.

---

## I. Admin Portal Workflow

- Login: `AdminCMS` → `adminLogin(password, username='admin')` → `POST /api/auth/login`. In Supabase mode username `admin` becomes `admin@natkhatcafe.com`.
- Tabs/features seen in `AdminCMS.tsx` [S]: products table (stock toggle, edit, delete with `confirm()`), categories, store settings, change password, orders list with `pending_confirmation` badge.
- **NOT IMPLEMENTED:** order status transitions (confirm, preparing, out for delivery, complete, cancel). Staff must manage confirmation outside the system.
- **NOT IMPLEMENTED:** staff/user management UI. `scripts/provision-admin.ts` creates admins offline (generates a one-time password; not run).
- UI shows the Delete button to all roles; the server enforces admin-only. Role-aware UI was not verified.
- Product image field is a free-text URL/path (see K).
- `scripts/reconcile-orders.ts` exists but is not referenced from `package.json`; not reviewed in depth and not executed.
- Browser/UI testing: **BLOCKED** (no browser tool).

---

## J. Vercel Readiness

| Check | Result | Evidence |
|---|---|---|
| Static build | PASS [T] | `vite build` → `dist/index.html`, CSS 46.9 kB, JS 350 kB (97 kB gzip). Note: I ran the build, which overwrote the existing `dist/` (a build artefact, already present beforehand). |
| `vercel.json` rewrites | PASS [S] | `/api/(.*)` → `/api` precedes the SPA fallback `/(.*)` → `/index.html`, so `/api` does not get `index.html` |
| Function entry | PARTIAL [S] | `api/index.ts` exports the Express `app` (Node runtime by default, not Edge). Whether the original path is preserved after the rewrite to `/api` is untested: **BLOCKED**. Express routes expect `/api/settings` etc. |
| ESM/TS | Risk (Medium) [S] | `"type":"module"` with extensionless relative imports (`'./db'`, `'../src/server/app'`). Works under `tsx`/Vite; whether `@vercel/node` bundles it correctly is unverified |
| **SQLite at import** | **FAIL (High)** [S] | `app.ts` calls `initDatabase()`, and `db.ts` runs `fs.mkdirSync(process.cwd()/data)` and `new DatabaseSync(...)` at import. On Vercel's read-only filesystem the function can crash at cold start, even when Postgres is configured. `node:sqlite` is also experimental. Fix: lazy-load SQLite only when `DATABASE_URL` is unset. |
| **Production DBs bundled** | **High** [S] | No `.vercelignore`; `data/*.db` (customer names, phones, addresses in `orders`) and `local.env` could be uploaded with the deployment unless the CLI honours `.gitignore` (it does for `local.env` via `.gitignore`, but `data/` is not ignored). Add `.vercelignore` / `.gitignore` entries for `data/`. |
| Pooler config | PASS [S] | `pgDb.ts`: `prepare:false`, `max:1`, `idle_timeout:15`, `connect_timeout:10`, module-level client reuse |
| Separate migration connection | PASS [S] | `DIRECT_URL` (with the fallback risk in E) |
| `pgDb` eager init | Low | `export const pgDb = getPostgresClient()` creates a client at import; harmless (lazy connect) |
| Env vars used by code | | Server: `DATABASE_URL`, `SUPABASE_URL` (or `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV`. Scripts: `DIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_NAME`. Not read anywhere: `GEMINI_API_KEY`, `APP_URL`, `VITE_SUPABASE_ANON_KEY`, `DISABLE_HMR` (only vite config). |
| Env isolation | PASS [T][S] | No server secret in `dist/`; the only `VITE_` names are the Supabase URL/anon key, which the frontend does not use |
| Local dev | PASS [T] | Server on :3000 serves API and SPA; `GET /` 200 |
| `server.ts` | Low | hard-coded port 3000, ignores `PORT`; production `app.get('*')` serves `index.html` for unknown `/api/*` |
| Security headers | NOT IMPLEMENTED (Low) | `X-Powered-By: Express` exposed [T]; no helmet/CSP/HSTS |

---

## K. Storage Readiness: NOT IMPLEMENTED

- No upload endpoint, no multer/formidable, no `@supabase/storage-js` usage in `src/` (the package is only a transitive dependency of `supabase-js`), no bucket config, no MIME/size validation, no filename sanitisation.
- Admin product `image` is a free-text string.
- **All 27 products** use `/src/assets/images/<name>_<ts>.jpg` (4 distinct JPGs: 807, 908, 1067, 804 KB) [T from `/api/products`]. Those paths work only under the Vite dev server. `dist/` contains no `.jpg` files [T], so a static deployment would serve `index.html` (rewrite) or 404 for every product image. **FAIL (High).** Also `Hero.tsx` hard-codes `/src/assets/images/natkhat_hero_feast_…jpg`.
- Images are 0.8–1.1 MB each and unresized (Medium, performance).
- Recommendation: move images to `public/` or Supabase Storage, store absolute URLs, add an admin-only signed upload with MIME and size limits, and add `loading="lazy"` plus modern formats.

---

## L. Build / TS / Lint / Test Results

| Command | Result |
|---|---|
| `tsc --noEmit` (TS 7.0.2) | exit 0, no output **PASS** |
| Lint | No ESLint config; `lint` script is `tsc --noEmit` (same result). ESLint: **NOT IMPLEMENTED** |
| `npm test` glob `test/*.test.ts` (run through tsx) | 37 tests, 37 pass, 0 fail, 0 skipped (≈2.0 s) **PASS** |
| `src/` tests (`orderValidator.test.ts`, `cart.test.ts`, `whatsapp.test.ts`) | exit 0; all passed. They are not included in `npm test`'s glob (Medium: add `src/**/*.test.ts`). Output was only partially captured; no failures reported. |
| `vite build` (equivalent to `npm run build`) | PASS: 1676 modules, built in ~0.5 s. Warning: vite config uses `__dirname` with `configLoader: 'native'`. |

Test-quality notes:
- "Postgres integration" tests use PGlite in-memory (WASM Postgres), not Supabase; they validate the SQL and grants, not `auth.uid()` or Supabase roles.
- `comprehensiveSecurityAndMigrationAudit.test.ts` includes "Verification 8: repeated migration cannot overwrite orders". It holds for orders only, not for settings, categories and products (see E).
- No tests exist for quantity edge cases, enabled flags, status updates or the HTTP layer.

Live HTTP checks on `http://localhost:3000` (existing server reused) [T]:
- Public GETs (`health`, `settings`, `categories`, `products`) → 200.
- `GET /api/orders`, `/api/auth/me`; `POST /api/settings`, `/api/categories`, `/api/products`, `/api/auth/change-password`; `PUT /api/products/:id`; `PATCH …/availability`; `DELETE /api/products/:id` without a token → 401 each.
- Forged bearer → 401.
- One login with a nonexistent user → 401 `Invalid credentials`. Empty body → 400.
- `POST /api/orders` with 8 invalid payloads → 400 with descriptive errors. No valid order was submitted.
- Malformed JSON → HTML error page.
- Side effect: 1 failed login attempt was recorded against this machine's IP in the server's in-memory rate limiter (4 more would lock it for 15 minutes, until restart).

---

## M. Performance and Code Quality

- `any` usage: about 40 occurrences in `src/`, `scripts/`, `server.ts` (mostly `as any` on SQLite rows, `err: any`). Medium-Low.
- SQL injection: none found. SQLite uses `prepare` with bound parameters; Drizzle is parameterised; `tx.unsafe` is used only on repo-owned migration files. PASS [S].
- XSS: no `dangerouslySetInnerHTML` [S]. React escapes output.
- CORS: not configured (same-origin deployment). Acceptable.
- Rate limiting: only on login (see F-6). None on `POST /api/orders`.
- Body size: Express default 100 kb. Fine.
- Duplicate logic: two full code paths (SQLite and Postgres) for every route; `app.ts` is monolithic. Maintenance risk, and the untested path (Postgres) is the production path.
- Product/category IDs are `prod-${Date.now()}` / `cat-${Date.now()}` (collision-prone under concurrency). Slugs are not unique for products.
- `GET /api/orders` (PG) loads all orders with no limit or pagination.
- Connection management: PASS (`max:1`, reuse).
- Mobile responsiveness: Tailwind breakpoints (`sm:`/`md:`/`lg:`) appear 166 times across components, so responsive classes are used [S]; not visually verified (BLOCKED).
- Bundle: 350 kB JS (97 kB gzip). Fine.
- Dependencies: `drizzle-kit` under dependencies (should be dev); `@electric-sql/pglite` is a test-only dependency listed as a runtime dependency; `@google/genai`, `dotenv` (runtime unused), `esbuild`, `autoprefixer` unneeded. `package.json` `clean` script uses `rm -rf` (not Windows-friendly).
- Docs conflict with code (DATABASE.md says SQLite-only; `ENVIRONMENT.md`, `SECURITY.md` etc. not individually verified).

---

## N. Critical Issues (blockers for production)

| ID | Severity | Issue | Where | Status |
|---|---|---|---|---|
| N1 | Critical | App runs on SQLite; Supabase Auth, Postgres and RLS paths are unexercised in the running system. No env loading in the server. | `server.ts`, `app.ts` | FAIL [T] |
| N2 | High | Staff can UPDATE any column on `orders` via RLS/PostgREST | `0002_rls_policies.sql` | FAIL [S] |
| N3 | High | `migrate-data.ts` overwrites settings/categories/products on re-run; conflict detection compares only totals; advisory lock runs through the pooler | `scripts/migrate-data.ts` | FAIL [S] |
| N4 | High | No order status endpoint/UI, so staff cannot confirm orders in-app | `app.ts`, `AdminCMS.tsx` | NOT IMPLEMENTED |
| N5 | High | Product and hero images use `/src/assets/...` paths absent from `dist/` | DB rows, `Hero.tsx` | FAIL [T] |
| N6 | High | SQLite initialised at import in the serverless entrypoint; `data/` (PII) is not ignored for deployment | `db.ts`, `api/index.ts` | FAIL [S] |
| N7 | High | Hardcoded default admin password in source, present in both DBs | `db.ts` | FAIL [S] |
| N8 | High | Missing active-state decision: active DB has an extra order `NC-842376` that migration will skip | data | Decision needed |
| N9 | Medium-High | Quantity validation (NaN, no cap); delivery/pickup flags unenforced; weak order reference | `orderValidator.ts` | FAIL [S] |

---

## O. Non-Critical Issues

- Login returns role `'staff'` for users without a profile (F: #4); sign-in uses the service-role client (F-4).
- Login rate limiter is in-memory and `trust proxy` is missing (F-6).
- `public_store_settings` is security-definer by design (document it).
- Staff can mutate products/categories via RLS (F-2).
- No global Express error handler; async routes unguarded; HTML error for bad JSON; DB messages leaked (G).
- `GET /api/categories` returns inactive categories; `GET /api/products` returns unavailable ones. The UI filters as needed, but it is a public information leak.
- `GET /api/health` exposes the DB backend.
- `.env.example` is incomplete; `GEMINI_API_KEY` and `VITE_SUPABASE_*` are unused; `engines` is missing.
- `npm test` omits `src/**/*.test.ts`; no ESLint.
- Optimistic UI without rollback (`updateSettings`, availability).
- Images are large and unoptimised.
- `drizzle.config.ts` outputs into the hand-written migrations folder; the `db:push` command exists via drizzle-kit but is not scripted (OK).
- Unused/unreviewed `scripts/reconcile-orders.ts`.
- `X-Powered-By` header and no security headers.

---

## P. Fix Priority

1. **Decide the target runtime and wire it up.** Load env in the server (or rely on the Vercel env), set `DATABASE_URL` and the Supabase variables in a *test* Supabase project, and run the existing flows end to end there.
2. **Lock down RLS.** Column-level `UPDATE (status, updated_at)` on `orders` (or a trigger), tighten product/category policies, then re-run the PGlite tests plus new negative tests.
3. **Fix migration safety.** Use `DIRECT_URL` only (no pooler fallback); make `migrate-data.ts` insert-only with loud conflict failure on any differing column; fix the item-id collision; compare `order_items` counts and line sums in `verify-migration.ts`. Decide how to treat `NC-842376`.
4. **Add the order status workflow** (`PATCH /api/orders/:id/status`, validated transitions, staff/manager/admin) and UI.
5. **Fix images**: move to `public/` or Supabase Storage; update DB values; add `.vercelignore` / `.gitignore` for `data/`.
6. **Make the serverless entrypoint safe**: lazy-load SQLite only in local mode; verify the `/api` rewrite and ESM bundling on a Vercel preview.
7. **Harden order validation**: integer quantity range (1–N), reject NaN, merge duplicates, validate `orderType` and enabled flags, longer random reference with retry, rate limit `POST /api/orders`, cap field lengths.
8. **Auth hardening**: remove the hardcoded admin seed (or require env-supplied credentials), anon-key sign-in client, `trust proxy` + shared rate limit store, call `/api/auth/me` on load.
9. **Quality**: error-handling middleware and async wrapper, trim `any`, add ESLint, include `src/` tests in `npm test`, clean dependencies, update docs.

---

## Q. Production Readiness Verdict

**NOT READY.** Score by area:

| Area | Status |
|---|---|
| Transfer integrity (compile, build, tests) | PASS |
| SQLite data preservation | PASS (active DB has one extra order) |
| Postgres schema design | PASS (good constraints, RESTRICT FKs, BIGINT money) |
| Migration tooling | PARTIAL (runner good, data migrator unsafe on re-run) |
| RLS/RBAC | PARTIAL (anon lockdown good; staff write grants too broad) |
| Auth on Supabase | BLOCKED/untested live |
| API contract vs frontend | PASS for existing endpoints; status-update endpoint missing |
| Order flow and WhatsApp | PARTIAL (pricing and wording correct; validation gaps) |
| Admin portal | PARTIAL (no order management) |
| Vercel | PARTIAL/BLOCKED (rewrites correct; SQLite-at-import and static images break it) |
| Storage | NOT IMPLEMENTED |
| Browser/UI testing | BLOCKED |

The project is a sound base for the next phase. Resolve N1–N8 and rerun this audit against a test Supabase project and a Vercel preview before any production use.

---

*Method notes: No source, config, dependency, database or env file was modified. Temp copies of the databases and scripts were created under `%TEMP%\nk_audit` only. The one other filesystem change is that `vite build` regenerated `dist/`. No secret values were printed. The report is the only file written to the workspace. Items marked [S] were not exercised at runtime.*
