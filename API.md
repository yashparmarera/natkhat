# API & Integrations Reference

## 1. WhatsApp Order Handoff URL Protocol
The application communicates with WhatsApp exclusively through standard click-to-chat links:
`https://wa.me/{WHATSAPP_NUMBER}?text={ENCODED_MESSAGE}`

### Rules:
- Number format: Strictly numeric digits with country code (e.g. `919876543210`).
- Text encoding: All message contents are encoded with standard `encodeURIComponent`.
- No API keys, no WhatsApp Cloud API, and no webhook servers required.

## 2. Server API Routes (When Full-Stack Mode Active)
- `GET /api/settings`: Returns current café store settings.
- `POST /api/settings`: Updates editable store settings.
- `GET /api/products`: Returns list of all active/inactive dishes.
- `POST /api/products`: Creates or updates a product.
- `POST /api/orders`: Logs an order handoff request.
- `GET /api/orders/:referenceId/track`: Public takeaway order tracking (see below).
- `PATCH /api/orders/:referenceId/status`: Staff updates an order's status (see below).
- `POST /api/auth/login`: Verifies staff passcode for admin dashboard.

### Order tracking
`GET /api/orders/:referenceId/track` needs no login and is sent with `Cache-Control: no-store`. The order number is trimmed and upper-cased, and must look like `NC-` plus 4 to 12 digits.
- Returns only `{ referenceId, orderType, status, createdAt, updatedAt }`. No customer details, items or totals.
- Delivery orders return `status: null` and `updatedAt: null`. Live tracking is for takeaway (`pickup`) orders.
- `updatedAt` is `null` when the local SQLite table has no `updated_at` column.
- Errors: `400` bad order number, `404` unknown order, `429` more than 60 requests a minute from one client (with `Retry-After`).

`PATCH /api/orders/:referenceId/status` needs a staff, manager or admin session. Body: `{ "status": "<order_status>" }`.
- Takeaway flow: `pending_confirmation` → `confirmed` → `preparing` → `ready_for_pickup` → `completed`. A new order may skip straight to `preparing`. `cancelled` is allowed from any open status. `completed` and `cancelled` are final. No backwards moves.
- Delivery orders can only be moved to `confirmed` or `cancelled` for now.
- Only `status` and `updated_at` are written. Success: `{ success: true, referenceId, status, updatedAt }`.
- Errors: `400` unknown status or move not allowed (the body includes `currentStatus`), `401` not signed in, `404` unknown order, `409` the order changed while the request was running.
