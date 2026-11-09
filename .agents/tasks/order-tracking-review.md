# Takeaway order tracking and staff status updates

The hero's "Bulk & Office Catering" button now reads "Track order" and opens a new page where a customer enters an order number and sees a five-step tracker for takeaway orders, refreshed every 10 seconds. Staff change an order's status from an "Update status" popup in the Orders tab, and the customer's page follows. One shared pure module defines the statuses, the allowed moves and the labels for both the server and the UI. Two new routes sit on top of it: a public, rate-limited `GET /api/orders/:referenceId/track` and a staff-only `PATCH /api/orders/:referenceId/status` that writes only `status` and `updated_at`, so migration 0003 needs no change.

Watch for: the `pending_confirmation -> preparing` skip goes beyond the requested chain (confirmed, owner decision). 60 requests a minute equals about ten live tracker pages per IP (arithmetic confirmed, impact possible). The Postgres path has only run on PGlite, not on Supabase (confirmed). One of the author's throwaway servers read from the staging Supabase project for about four minutes before it was stopped (confirmed from the author's disclosure, read-only).

**Verdict**: APPROVED

## High-level view

One shared module defines the statuses, the allowed moves and every label, and both the server and the UI build on it. The takeaway chain matches the request except that a new order may jump straight to "Preparing your order", skipping "Order confirmed". The author chose that on purpose, and it needs the owner's sign-off.

The public track route exposes five fields and nothing about the customer, and hides the status of delivery orders. Its 60-a-minute limit is tight against 10-second polling when customers share an IP, the counters are per process, and order numbers are short enough to enumerate.

The staff route applies a move with a compare-and-set on the previous status and, in Postgres, writes only `status` and `updated_at`, which migration 0003 allows. That path has only run against an in-memory Postgres with the real migrations, never against Supabase, and nothing records who changed a status.

On a 401 the staff popup signs the staff member out with a message, which the other admin actions do not do. The failure paths of the customer page and the popup were read but never run.

A throwaway test server briefly ran against the staging project because `local.env` now holds real values. It only read, and the staging database has no tables.

<details>
<summary>Issues (11)</summary>

1. **Confirmed-step skip** — `pending_confirmation -> preparing` is allowed, which the requested chain does not list (confirmed). Keep it if staff confirm and start cooking together, otherwise remove `'preparing'` from the `pending_confirmation` row of `PICKUP_TRANSITIONS` and update the three test files that assert it.
2. **Limit versus polling** — 60 requests a minute equals ten visible tracker pages per client address, so customers on one café Wi-Fi or carrier NAT can start getting 429 (arithmetic confirmed, impact possible). Raise the cap or poll every 15 to 20 seconds, accepting faster scanning of order numbers.
3. **Limiter scope** — counters are per process, and where `VERCEL` is unset every client shares `req.ip`, so behind a reverse proxy without `trust proxy` all customers share one bucket (confirmed, disclosed by the author). Set `trust proxy` if hosting off Vercel and say so in `DEPLOYMENT.md`.
4. **Order-number enumeration** — the public route reveals which of about 900,000 time-derived numbers exist and the stage of takeaway orders, about ten days per address at the current cap (confirmed, no personal data). Plan longer random references as a follow-up in order creation.
5. **No audit trail** — a status change stores `updated_at` but not who made it (confirmed). If accountability matters, add an `updated_by` column in a new migration and extend the 0003 allow-list.
6. **Postgres path not run on Supabase** — verified only on PGlite as the `postgres` role (confirmed). After applying the migrations to staging, place a takeaway order, change its status in the staff panel and watch the tracker.
7. **Untested client failure paths and browsers** — no component tests; the browser run skipped network error, 429, 500, the 15-second timeout, unmount cleanup and disabled-while-saving, and used headless Chrome only (confirmed gap). Add one failing-fetch scenario and open the page once on a real phone.
8. **Evidence only in the temp folder** — raw `tsc`, test, build and mutation outputs sit in `%TEMP%\natkhat-tracking` and the report does not cite them (confirmed). Copy `final-*-output.txt` and `mutation-report.txt` into `.agents/tasks/` and link them.
9. **Staging contact** — a throwaway server ran against the staging project for about four minutes: two failed reads (`42P01`), one login call, nothing written (confirmed from the author's disclosure). Check the Supabase Auth log for one failed `admin@natkhatcafe.com` sign-in around 11:03 to 11:07 IST, and start local servers with `USE_LOCAL_SQLITE=true` while `local.env` holds real values.
10. **401 sign-out scope** — only the status action signs out on 401, the other admin actions fail silently (confirmed). Supabase tokens expire after an hour by default and the app keeps no refresh token, so staff will hit this often (likely). Decide whether to extend the handling to the rest.
11. **Accessibility details** — the polite live region re-announces "Last checked" on every poll, and the status dialog neither traps nor restores focus (likely). Limit `aria-live` to the status banner and return focus to the "Update status" button on close.

</details>

<details>
<summary>Details</summary>

### Takeaway chain and the confirmed-step skip

The takeaway table in `src/utils/orderStatus.ts` allows `pending_confirmation -> preparing` on top of the one-step chain in the request. The author's reason is that staff usually confirm on WhatsApp and start cooking at the same time. A skipped order shows "Order confirmed" as done on the customer's tracker although no confirmation step happened. The open question is only whether the owner wants the skip (confirmed).

```
pending_confirmation --> confirmed --> preparing --> ready_for_pickup --> completed
        |                                  ^
        +------------ extra skip ----------+
any non-final status --> cancelled         completed and cancelled are final
```

For strict sequencing, remove `'preparing'` from the `pending_confirmation` row of `PICKUP_TRANSITIONS` and update the assertions that expect the skip in `orderStatus.test.ts`, `orderTrackingApi.test.ts` and `orderStatusPostgres.test.ts`. The status list is asserted against the enum text in migration 0001, so drift between the app and the database fails a test.

### Public track route: exposure and limiter

Order numbers are `NC-` plus six time-derived digits, about 900,000 values. At 60 requests a minute one address needs roughly ten days to scan them all, and per-process counters on Vercel make that figure optimistic. What leaks is which numbers exist and the stage of takeaway orders, never names, phones, items or totals (confirmed). Longer random references would close this and would also remove the order-creation collisions the author noted, but that is a change to order creation.

The limit is tight against the page's own behaviour. A visible tracker page sends six requests a minute, so ten pages behind one public IP use the whole budget. An eleventh page, or a manual lookup, then gets 429 and "Too many lookups in a short time" (arithmetic confirmed, real-world likelihood possible). Polls degrade softly and keep showing the last status with a note. Raising the cap or polling every 15 to 20 seconds relieves it, at the price of faster scanning.

The client address comes from `x-forwarded-for` only when `VERCEL` is set. On any other host behind a proxy without `trust proxy`, every customer shares the proxy's address and one bucket (confirmed, disclosed by the author).

### Status PATCH, Postgres and migration 0003

```
customer page --GET /track (every 10 s)--> limiter --> OrderStore.find ----+
                                                                           +--> orders row
staff popup --PATCH /status--> requireAuth --> validateTransition (shared)
                                  --> OrderStore.transition (UPDATE ... WHERE status = expected)
OrderStore = Postgres via Drizzle (production) | SQLite via lazy proxy (local only, throws elsewhere)
```

A staff member acting on a stale popup gets 409 with the current status and the popup reloads its options, so two people cannot overwrite each other silently. In Postgres the statement sets `status` and `updated_at` only, and the 0003 trigger blocks every other column for every role except `service_role`. The server connects through `DATABASE_URL` as `postgres`, and the PGlite tests run as `postgres` with all three migrations applied. Nothing has run against Supabase. The staging database has no tables yet (the disclosed `42P01`), so the first real exercise comes after the migrations are applied, and the pooler login (`postgres.<ref>`) is assumed to resolve to the `postgres` role (confirmed gap, low risk).

A status change records `updated_at` and nothing about who made it, so staff actions have no audit trail (confirmed). Adding one needs a new column in a new migration and an extended allow-list in the 0003 trigger.

### Staff popup, Track order page and coverage gaps

On a 401 the status action calls `adminLogout()`, returns to the login screen and shows "Your session has expired. Please sign in again." The other admin actions (availability, product and category edits, settings) return false and show nothing. Supabase access tokens last an hour by default and the app stores no refresh token, so staff will meet this regularly, and only the status action tells them why (confirmed, frequency likely). Extending the handling to the rest is a separate change.

Two accessibility details, likely rather than confirmed because they depend on the screen reader. The `aria-live="polite"` region on the Track order page wraps the whole result card including "Last checked HH:MM:SS", which changes on every successful poll, so it will be re-announced every 10 seconds. The status dialog declares `aria-modal` and moves focus in, but does not trap Tab or return focus to the "Update status" button when it closes.

Not tested: the page's failure paths (network error, 429, 500, the 15-second timeout, unmount cleanup) and the popup's disabled-while-saving state. There are no component tests and the headless-Chrome run did not trigger them (confirmed gap).

### Verification evidence and the staging contact

The author's raw outputs are in `%TEMP%\natkhat-tracking` and the report does not cite the path. They agree with the report: `tsc` clean, 136 of 136 tests, 12 of 12 source tests, clean build, all written after the last source edit (11:30:53). `app.ts`, `orderTracking.ts`, `rateLimit.ts` and `orderStatus.ts` still match the hashes recorded after the mutation run, and each of the seven mutations failed its intended tests rather than crashing. The UI check reports 44 of 44, and the hero, tracker and popup screenshots I opened match it. Both SQLite files hash identically to the baseline, migrations 0001 to 0003 predate the task, and the dependency list is unchanged. The outputs live only in the temp folder (confirmed, low risk until it is cleaned).

Not tested: Safari, Firefox and real phones, the pooler on port 6543, and Supabase itself.

At about 11:03 to 11:07 IST a throwaway UI server started without forcing local mode while `local.env` held real staging values, so the page-load reads of settings and categories and one login call went to the staging project. Postgres answered `42P01` (no tables) and nothing was written. `local.env` was last saved at 11:06:35, inside that window, and I did not open it. No server is listening on 3000 or 3150 now, the browser script refuses to run unless `/api/health` reports SQLite, and the final test wrapper blanks every database and Supabase variable. The Auth log may show one failed sign-in for `admin@natkhatcafe.com` in that window (confirmed from the disclosure, the log itself cannot be checked from here). The dev server that was on port 3000 when the author started is also gone (the author says it never signalled it), so it needs a restart with `USE_LOCAL_SQLITE=true`.

</details>

<details>
<summary>File map</summary>

- `src/utils/orderStatus.ts` (new): statuses, transition tables, labels, tracker steps, order-number normaliser.
- `src/server/orderTracking.ts` (new): Postgres and SQLite stores, public payload, compare-and-set status change, log-safe error text.
- `src/server/rateLimit.ts` (new): in-memory fixed-window limiter and client key.
- `src/server/app.ts`: the track and status routes.
- `src/components/TrackOrderView.tsx` (new): customer page.
- `src/components/OrderStatusModal.tsx` (new): staff popup and status badge.
- `src/components/Hero.tsx`: button replaced, prop renamed to `onOpenTrack`.
- `src/components/CartDrawer.tsx`: "Track this order" for takeaway orders.
- `src/components/AdminCMS.tsx`: Update status button, badge and popup wiring.
- `src/context/CafeContext.tsx`: `updateOrderStatus` with 401 handling.
- `src/App.tsx`, `src/components/Navbar.tsx`: new view and prefill, type widening.
- `src/types/cafe.ts`: order status type widened to seven values.
- `API.md`, `FEATURES.md`: endpoints and feature notes.
- `test/orderStatus.test.ts`, `rateLimit.test.ts`, `orderStatusPostgres.test.ts`, `orderTrackingApi.test.ts`, `orderTrackingFailClosed.test.ts` (all new): 68 tests.

The folder is not a git repository, so there is no diff to link. Files were read in place, and the author's list is in `.agents/tasks/order-tracking-report.md`. `public/images/logo.png`, `skills-lock.json`, `.env.example`, `local.env` and `test/applyMigrations.test.ts` changed in the same window by someone else and are outside this review.

</details>
