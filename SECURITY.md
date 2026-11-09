# Security & Data Protection Specifications

## 1. Authentication & Access Control
- **No Hardcoded Passcodes**: The system replaces demo passcodes with salted and hashed passwords using Node's cryptographic primitive `crypto.scryptSync(password, salt, 64)`.
- **Timing-Safe Comparison**: Hashes are verified using `crypto.timingSafeEqual` to prevent timing attack vulnerabilities.
- **Session Tokens**: Cryptographically secure 256-bit hex tokens (`crypto.randomBytes(32)`).
- **Rate Limiting**: Sliding window rate limiter blocks client IPs after 5 failed login attempts for 15 minutes, preventing brute-force password guessing.
- **Protected Endpoints**: All admin routes (`POST /api/settings`, `POST/PUT/DELETE /api/products`, `PATCH /api/products/:id/availability`, `GET /api/orders`) enforce `requireAdminAuth` bearer token verification.

## 2. Server-Side Price & Order Integrity
- Clients submit only item IDs and quantities (`{ productId, quantity }`).
- The server independently queries the SQLite database to verify:
  1. Product existence.
  2. Immediate stock availability (`is_available = 1`).
  3. Official database price (`price_paise`).
- Subtotals, delivery fees, and minimum delivery thresholds are calculated on the server.
- Browser state or devtools manipulation of price values cannot alter the generated order total or WhatsApp message.

## 3. Customer Data Protection
- Customer phone numbers and addresses are saved in the central SQLite `orders` table.
- Customer order logs (`GET /api/orders`) require admin authentication; no public API exposes customer contact info.
