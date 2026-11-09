# System Architecture & Technical Design

## 1. Full-Stack Production Architecture
- **Runtime & Server**: Express 4 running on Node.js 22 (`server.ts`).
  - In development: mounts Vite 8 SPA middlewares directly (`"dev": "tsx server.ts"`).
  - In production: serves pre-compiled `/dist` assets while hosting the `/api` REST endpoints.
- **Database**: Embedded SQLite database (`data/natkhat.db`) with `node:sqlite`, providing centralized persistence for store settings, categories, products, customer orders, and admin credentials.
- **Server-Side Order Validation**: Client baskets are re-validated against database pricing before an order reference or WhatsApp message is generated. Product prices cannot be manipulated in the browser.
- **Top Bar Contract**: One-row 3-zone header:
  - Zone 1: Single brand wordmark (`Natkhat Café`) in Playfair Display serif.
  - Zone 2: Single-line text navigation links (`Home`, `Menu & Order`, `Bulk Orders`, `About & Contact`, `Staff Portal`).
  - Zone 3: 1 Primary Action (`Cart` CTA with item count badge).
- **SEO & Social Sharing**:
  - OpenGraph & Twitter meta tags in `index.html`.
  - Schema.org JSON-LD structured data for `CafeOrCoffeeShop`.
  - Search engine crawlers index `robots.txt` and `sitemap.xml`.
