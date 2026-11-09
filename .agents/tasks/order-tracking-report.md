# Order tracking: report

Implemented and verified. The folder is not a git repository, so nothing was committed.

## Needs your attention

1. **One of my throwaway test servers contacted your staging Supabase project (read-only).**
   - When and why: about 11:03 to 11:07 IST on 2026-11-09. While I was testing, `local.env` was filled with real Supabase values (`DATABASE_URL`, `DIRECT_URL` and `SUPABASE_URL` all point at the project named in `EXPECTED_SUPABASE_PROJECT_REF`). I had started my UI test server on port 3150 and relied on the default rule (no `DATABASE_URL` means SQLite) instead of forcing local mode. That one run therefore used Postgres and Supabase.
   - What it sent: the page-load reads `GET /api/settings` and `GET /api/categories` (the log shows two failing queries), and one `POST /api/auth/login` from my script using the local default admin credentials. In Supabase mode that call is a Supabase Auth sign-in for `admin@natkhatcafe.com`. If your Auth log shows one sign-in for that email in that window, it was this.
   - Result: the queries failed with Postgres error `42P01` (relation does not exist), so the staging database has no tables yet.
   - What it did not do: no INSERT, UPDATE, DELETE or DDL, no migration, no change to users or profiles. The script stopped at its first lookup step, before any step that creates or updates an order.
   - Fix: I stopped the server as soon as I saw the Postgres error. Every later run forced `USE_LOCAL_SQLITE=true` and blanked all database and Supabase variables. The browser script now refuses to run unless `/api/health` reports SQLite. The final server reported `SQLite (Local)`.
2. **Shared Vite cache.** My first test server (Vite dev mode, about 10:31) logged "Re-optimizing dependencies because lockfile has changed" and rewrote `node_modules/.vite/deps`. That cache is regenerated automatically, but a dev server that was already running may need a hard refresh or restart. I switched to a static build plus API server afterwards, which does not touch that folder.
3. **Local development now needs `USE_LOCAL_SQLITE=true`.** Because `local.env` holds real Supabase values, `npm run dev` starts against Supabase unless you set that variable. The staging database has no tables yet, so the app would show errors.
4. **Dev server on :3000.** When I started, a dev server (pid 7848, old code) was listening on :3000. At the end nothing was listening there. I never signalled it: every kill I issued targeted pids from my own pid files or processes whose command line contained my temp folder. Start it again (see "Manual test steps").
5. **Changes by others during the session (not mine, not touched):** `.env.example` and `test/applyMigrations.test.ts` (pooler region string only), `public/images/logo.png`, `skills-lock.json`, `.aistudio/artifacts/brain/.../implementation_plan.md`, `.agents/tasks/typography-screens/`. A Vite process on port 5199 that I did not start was also running.

## What was built

- Hero button "Bulk & Office Catering" is now "Track order" (same classes, `PackageSearch` icon) and opens a new Track order view.
- Track order view: enter an order number, see a status banner and stepper for takeaway orders, auto-refresh every 10 s, manual Refresh, friendly errors. Delivery orders get the takeaway-only message and no status.
- Cart success screen: "Track this order" next to the order number (takeaway orders only). It closes the drawer and opens Track order with the number filled in and already looked up.
- Public `GET /api/orders/:referenceId/track` and staff `PATCH /api/orders/:referenceId/status`.
- Staff panel: each order card has "Update status", which opens a popup with only the valid next steps. Badges are status-aware.
- The Bulk view, the Bulk & Office Catering footer link, the bulk teaser and the "Bulk Orders" nav link are untouched.

## Files

| File | Purpose |
|---|---|
| `src/utils/orderStatus.ts` (new) | Shared pure module: status list (checked against the migration 0001 enum), transition tables, `validateTransition`, labels, tracker steps, order-number normaliser. Used by server and UI. |
| `src/server/orderTracking.ts` (new) | Store interface with Postgres (Drizzle) and SQLite implementations, public payload builder, `changeOrderStatus` with compare-and-set, log-safe `describeError`. |
| `src/server/rateLimit.ts` (new) | In-memory fixed-window limiter (bounded keys) and `getClientKey`. |
| `src/server/app.ts` | Two routes added. Nothing else changed. |
| `src/components/TrackOrderView.tsx` (new) | Track order page. |
| `src/components/OrderStatusModal.tsx` (new) | Staff popup and the status badge component. |
| `src/components/Hero.tsx` | Button replaced; prop `onOpenBulk` became `onOpenTrack`. |
| `src/components/CartDrawer.tsx` | "Track this order" button (takeaway only); new required prop `onTrackOrder`. |
| `src/components/AdminCMS.tsx` | "Update status" button, status badge, popup wiring. Products, categories, settings and password change untouched. |
| `src/context/CafeContext.tsx` | `updateOrderStatus`. A 401 signs out and returns to the login screen with a message. |
| `src/App.tsx`, `src/components/Navbar.tsx` | `track-order` view, prefill handling. Navbar only widens the `currentView` type. |
| `src/types/cafe.ts` | `OrderSubmission.status` widened from 3 to all 7 statuses (the staff list returns raw DB values). |
| `API.md`, `FEATURES.md` | The two endpoints and the feature, briefly. |
| `test/orderStatus.test.ts`, `test/rateLimit.test.ts`, `test/orderStatusPostgres.test.ts`, `test/orderTrackingApi.test.ts`, `test/orderTrackingFailClosed.test.ts` (all new) | See "Verification". |
| `.agents/tasks/order-tracking-report.md`, `order-tracking-ui-check-output.txt`, `order-tracking-screenshots/` | This report, the browser check output, 17 screenshots. |

No migration was added or edited (0001, 0002 and 0003 have the same hashes as at the start). `package.json`, `package-lock.json`, `server.ts`, `api/index.ts`, `orderValidator.ts`, `auth.ts`, `config.ts`, `db.ts`, `pgDb.ts`, `whatsapp.ts` and `cart.ts` are unchanged. No dependency was installed.

## API contracts

### `GET /api/orders/:referenceId/track` (public)

The order number is trimmed and upper-cased, then must match `^NC-\d{4,12}$`. Every response, including errors, carries `Cache-Control: no-store`. Limit: 60 requests per 60 s per client.

```json
200 { "referenceId": "NC-348176", "orderType": "pickup",   "status": "preparing", "createdAt": "2026-11-09T05:59:17.000Z", "updatedAt": null }
200 { "referenceId": "NC-640393", "orderType": "delivery", "status": null,        "createdAt": "2026-11-09T05:59:20.000Z", "updatedAt": null }
400 { "error": "Invalid order number. Order numbers look like NC-123456." }
404 { "error": "Order not found" }
429 { "error": "Too many requests. Please wait a moment and try again." }   + Retry-After: <seconds>
500 { "error": "Failed to retrieve order status" }
```

`updatedAt` is an ISO string in Postgres. In local SQLite it is `null` because the existing `orders` table has no `updated_at` column (the schema is never altered). Delivery orders always return `status: null` and `updatedAt: null`. There are no customer fields, items or totals in any response.

### `PATCH /api/orders/:referenceId/status` (staff, manager, admin)

Body `{ "status": "<order_status>" }`. Auth is `requireAuth(['admin','manager','staff'])`.

```json
200 { "success": true, "referenceId": "NC-348176", "status": "preparing", "updatedAt": "2026-11-09T06:00:02.114Z" }   // updatedAt null in SQLite
400 { "error": "Unknown status. Allowed values: pending_confirmation, confirmed, ..." }
400 { "error": "A takeaway order cannot move from \"Pending WhatsApp Confirmation\" to \"Ready for takeaway\".", "currentStatus": "pending_confirmation" }
400 { "error": "Invalid order number" }
401 / 403 / 503   from requireAuth (missing or expired session, wrong role, misconfigured production)
404 { "error": "Order not found" }
409 { "error": "This order was just updated by someone else. Please check its latest status and try again.", "currentStatus": "confirmed" }
500 { "error": "Failed to update order status" }
```

Postgres writes only `status` and `updated_at`:
`UPDATE orders SET status = $1, updated_at = $2 WHERE reference_id = $3 AND status = $4 RETURNING updated_at`. Zero rows means someone else changed the order, and the server answers 409. SQLite writes only `status` (and `updated_at` if that column already exists), with the same `AND status = ?` guard.

## Transition table

| From | Takeaway (pickup) can go to | Delivery can go to |
|---|---|---|
| `pending_confirmation` | `confirmed`, `preparing`, `cancelled` | `confirmed`, `cancelled` |
| `confirmed` | `preparing`, `cancelled` | `cancelled` |
| `preparing` | `ready_for_pickup`, `cancelled` | `cancelled` |
| `ready_for_pickup` | `completed`, `cancelled` | `cancelled` |
| `out_for_delivery` (not part of either flow) | `cancelled` | `cancelled` |
| `completed`, `cancelled` | nothing | nothing |

Staff labels: Order confirmed, Preparing your order, Ready for takeaway, Mark as collected, Cancel order. Customer steps: Order received, Order confirmed, Preparing your order, Ready for takeaway, Collected, plus Order cancelled. The pending badge keeps the text "Pending WhatsApp Confirmation". All of this lives in `src/utils/orderStatus.ts`.

## Verification (real results)

Baseline was taken before any edit, with `SQLITE_DB_PATH` pointing at a temp file. Final runs used a wrapper that sets `USE_LOCAL_SQLITE=true`, a temp `SQLITE_DB_PATH`, and blanks `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

| Command (from the project root) | Before | After |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 | exit 0 |
| `node node_modules/tsx/dist/cli.mjs --test test/*.test.ts` | 68 tests, 68 pass, 0 fail | **136 tests, 136 pass, 0 fail** (20.7 s) |
| `node node_modules/tsx/dist/cli.mjs --test src/server/orderValidator.test.ts src/utils/cart.test.ts src/utils/whatsapp.test.ts` | 12 pass, 0 fail | 12 pass, 0 fail |
| `node node_modules/vite/bin/vite.js build` | not re-run in this task | exit 0, 1680 modules; no JWT-like string in `dist/` |

The 68 new tests: `orderStatus` 17, `rateLimit` 6, `orderStatusPostgres` 24 (counting subtests), `orderTrackingApi` 17, `orderTrackingFailClosed` 4. No existing test expectation was changed.

- **Shared transitions (`orderStatus.test.ts`).** Exact next-status set for every status, valid moves, no backwards move, only the `confirmed` step can be skipped, cancel from every open status, terminal states are final, same-status rejected, delivery restricted to confirm or cancel, unknown statuses, labels, tracker steps, order-number normaliser (SQL and path-traversal strings, 13 digits, Arabic digits). The status list is compared with the enum in `0001_initial_schema.sql`.
- **HTTP level (`orderTrackingApi.test.ts`).** Real Express app on an ephemeral port with its own temp SQLite file (it sets `SQLITE_DB_PATH` and `USE_LOCAL_SQLITE` itself, so it cannot touch `data/natkhat.db`). Covers 401 without or with a forged token; staff, manager and admin all allowed; 400 for bad input and invalid transitions; 404 for unknown orders; 409 (a trigger simulates a concurrent change); 429 after 60 requests with `Retry-After`, including a spoofed `X-Forwarded-For`; no PII in track responses; delivery status masked even after staff confirm; the full flow pending, confirmed, preparing, ready, collected with the public tracker following each step; skip rule; cancel; delivery limits; the staff list shows the new status with customer data unchanged; every other column unchanged in the database; generic 500s with no request data in logs; the app never adds `updated_at`, and fills it when the column already exists.
- **Postgres branch (`orderStatusPostgres.test.ts`).** PGlite with all three migrations applied and the real Drizzle store, running as the `postgres` role like the server. Raw `UPDATE ... SET status, updated_at = now()` works; every content change is still blocked, also when combined with a status change; `order_items` stay immutable; the full takeaway flow changes only status and `updated_at` (content snapshot compared); the logged Drizzle SQL sets exactly `status` and `updated_at`; compare-and-set refuses a stale status; delivery limits; the public payload carries no customer data.
- **Fail closed (`orderTrackingFailClosed.test.ts`).** With `NODE_ENV=production`, with `VERCEL` set, and with production plus `USE_LOCAL_SQLITE=true` and no `DATABASE_URL`, tracking and status updates reject with "SQLite is disabled outside local development" instead of using SQLite.
- **Mutation check.** Seven deliberate breaks (PATCH without `requireAuth`, delivery status unmasked, limiter never blocking, UPDATE also writing `customer_name`, a takeaway skip to ready, compare-and-set ignoring the expected status, a silent fallback in production). Each made the matching test file fail. The files were restored and their hashes verified identical.
- **Browser check (headless Chrome 1280 px and 390 px, driven through DevTools Protocol, throwaway scripts in the OS temp folder).** 44 of 44 checks passed against the real Express API in forced SQLite mode: hero button text and unchanged classes; Bulk entry points still present; format validation makes no request; not-found message; Order received text; staff "confirmed" appears without any click (9 s); preparing, ready and collected shown; polling stops after "Collected" (no request for 22 s); delivery message and no status; cancelled state; no horizontal overflow at 390 px; cart success screen keeps its wording and shows "Track this order" for takeaway only; the button opens Track order prefilled and already tracking; the popup shows only valid options and closes on success; cancel needs a second click; Escape closes; a stale popup shows the server error and refreshes its options; a 401 returns to the login screen with the message. Output: `.agents/tasks/order-tracking-ui-check-output.txt`. Screenshots: `.agents/tasks/order-tracking-screenshots/`. I looked at those screenshots; layout and colours match the site. Not covered: Safari, Firefox, a real phone.
- Earlier browser runs failed for harness reasons only (CSS upper-casing in `innerText`, a reused browser profile holding a stale login, 404s missing from resource timing, background-tab screenshots), plus the incident described at the top.

## Hash evidence

| File | Before (baseline file) | After |
|---|---|---|
| `data/natkhat.db` | `B3C02B1A733B70F41CE0046ADBD03DF3E0F532EED98946D2AAF4E08DD835924B` | identical, mtime unchanged (09:55:18) |
| `data/natkhat_backup_pre_migration.db` | `41AC3463AD6165F59A0FE66D6016A9F2C8B237B7EBE5E4A589C6540F3098C476` | identical, mtime unchanged (06:48:39) |

No new files appeared in `data/`. The hashes were taken with a shared-read stream because the dev server held `natkhat.db` open. I copied `natkhat.db` once, read-only, into the temp folder to inspect its schema (no `updated_at` column; 11 delivery orders, all pending) and deleted the copy afterwards.

## Judgement calls

- **Takeaway only.** The public endpoint returns the order type for delivery orders and hides status and `updatedAt`. Delivery staff updates are limited to confirm and cancel.
- **Skip rule.** Only the "confirmed" step may be skipped (a new order can go straight to "Preparing your order"), because staff usually confirm on WhatsApp and start cooking together, and your request names Preparing and Ready as the two main choices. Ready and Collected can never be skipped to. To make it stricter, remove `'preparing'` from the `pending_confirmation` row in `PICKUP_TRANSITIONS` and update the tests that assert the skip.
- **Polling.** Every 10 s, paused while the tab is hidden, refreshed when it becomes visible again. A check is skipped while the previous one is still running, and a request times out after 15 s. It stops at Collected, Cancelled, delivery and unknown status.
- **Rate limit.** 60 requests per 60 s per client, fixed window, in memory, at most 5000 tracked clients. The client is the socket address, or the first `X-Forwarded-For` entry only when `VERCEL` is set (Vercel overwrites that header). Without that rule every Vercel visitor would share one bucket.
- **`updatedAt` in SQLite.** Null, no `ALTER TABLE`. The page always shows "Last checked" and shows "Status updated" only when the server sends a time that differs from "Placed".
- **401 on a status change.** Signs out and shows the login screen with "Your session has expired. Please sign in again." Other admin actions fail silently on 401. I chose this because local sessions are in memory and die on every server restart.
- **Update status on finished orders.** The button stays visible (outlined); the popup says no further updates are possible.
- **No Navbar link.** I measured the header: the page is already wider than the viewport at 768 px and 820 px, and fits from 900 px. From the measured widths, a sixth link would start overflowing below roughly 1020 px (estimated, not tested with the link). The entry points are the hero button and the cart success screen. A footer quick link has no layout risk if you want one more entry point.
- **"Track this order" does not reset the cart drawer.** It closes the drawer like the X button, so reopening the cart shows the success screen again with the WhatsApp resend button (existing behaviour of the X button too).
- **Staff label "Ready for takeaway"** follows your brief; change `STATUS_LABELS` and the tracker step in `src/utils/orderStatus.ts` if you want "Order is ready to takeaway".
- **Logging.** Only the database error code and message are logged. Drizzle puts the whole query and its parameters in its own wrapper message, so the underlying cause is used (covered by tests).

## Remaining risks

- **Postgres path not run against real Supabase.** It is verified with PGlite, the real migrations and the real Drizzle statements, as the `postgres` role. Not verified: the Supabase pooler on port 6543, the real `profiles`-based login, and the staging database itself (no tables yet). Migration 0003 is not applied anywhere; the endpoint works with or without it.
- **Order numbers.** `NC-` plus 6 digits built from the clock and 2 random digits (`orderValidator.ts`, untouched). (a) Guessable: the track endpoint reveals whether a number exists and the status of takeaway orders, never personal data; at 60 requests a minute per client, scanning 900,000 numbers takes about 10 days from one address. (b) Not collision-free: the primary key prevents duplicates, but a clash makes the second order fail, with probability roughly (existing orders) / 900,000 per new order. A longer random reference with a retry would fix both; I did not change order creation.
- **Rate limit is per server instance.** On Vercel each warm function keeps its own counters. Behind a non-Vercel reverse proxy, all users share one bucket unless Express `trust proxy` is configured.
- **No audit trail** of who changed a status, only `updated_at`.
- **Sessions are in memory locally.** After a server restart the staff panel keeps the old token, shows "WhatsApp Orders Log (0)" and the list stays empty until you sign out and in (existing behaviour; only the new status action signs you out on 401).
- **Header overflow** at tablet widths (measured at 768 px and 820 px, not at 900 px) is an existing issue, unrelated to this feature.
- Visual checks cover headless Chrome only.

## Manual test steps

1. Start the app in local mode (the old server is not running; local.env now points at Supabase):
   `$env:USE_LOCAL_SQLITE='true'; node node_modules/tsx/dist/cli.mjs server.ts` (or `npm run dev` with that variable set), then open http://localhost:3000.
2. Home page: the second hero button reads "Track order". The Footer, the Bulk Orders nav link and the bulk teaser still open the bulk page.
3. Place a **Takeaway / Pickup** order: Menu & Order, add an item, cart, "Takeaway / Pickup", Proceed to Details, enter a name and a 10-digit number, "Generate WhatsApp Order". Click "Track this order". The page shows "Order received: Waiting for the café to confirm your WhatsApp message". Existing local orders are all delivery, so they cannot be tracked.
4. In another tab: Staff Portal, sign in (`admin` / `NatkhatCafe@2026` locally; sign in again after any restart), "WhatsApp Orders Log", "Update status" on that order. Choose "Order confirmed", then "Preparing your order". The customer tab changes within about 10 s, or at once with Refresh. Continue with "Ready for takeaway", then "Mark as collected" (polling stops).
5. On another order, open the popup and click "Cancel order": a second confirmation appears. After confirming, the customer sees "Order cancelled".
6. Place a Home Delivery order: no "Track this order" button; typing its number on Track order shows the WhatsApp message; the staff popup offers only "Order confirmed" and "Cancel order".
7. Type `abc` (format message) and `NC-000000` (not found).
8. Staging, after you apply the migrations yourself: provision the admin, repeat steps 3 to 6, and confirm that migration 0003 does not block the status changes.

To re-run the checks: `$env:USE_LOCAL_SQLITE='true'; $env:SQLITE_DB_PATH="$env:TEMP\natkhat-test.db"; node node_modules/tsx/dist/cli.mjs --test test/*.test.ts`
