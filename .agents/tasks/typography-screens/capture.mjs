#!/usr/bin/env node
/**
 * Natkhat Café typography capture + audit (reusable, zero project dependencies).
 *
 * Takes the same screenshots for a label ("before", "after", ...) and writes a machine-readable typography audit next
 * to them, so the coder and the reviewer compare like with like.
 *
 *   node .agents/tasks/typography-screens/capture.mjs before
 *   node .agents/tasks/typography-screens/capture.mjs after --strict
 *   node .agents/tasks/typography-screens/capture.mjs after --only home-hero,menu-grid,navbar-cart-filled --viewports 1440,1280,1024,768,390,360
 *   node .agents/tasks/typography-screens/capture.mjs compare before after      (writes compare-before-after.html)
 *
 * Positional arg  label or directory. A bare label (before|after|anything) writes to <this dir>/<label>/.
 * --base URL      app under test. Default http://127.0.0.1:5199
 *                 Start the front end first (project root):  npx vite --port 5199 --strictPort --host 127.0.0.1
 *                 (Do not use `npm run dev` for this: it needs server config and talks to a database.)
 * --only a,b      only these scene ids (see SCENES below)
 * --viewports     comma list of CSS widths. Default 1440,390. Widths <= 480 are emulated as a phone (2x, touch).
 * --strict        exit 1 when the audit finds a violation (use for "after"; "before" is report-only)
 * --allow "A,B"   font families (as the browser reports them) that may render text.
 *                 Default: Montserrat,Source Sans 3
 * --no-audit      screenshots only
 * --verbose       phase timing
 *
 * The real backend is never touched: every /api/* call is answered by an in-script fixture, and the admin session is a
 * fake token in localStorage. No secrets, no database, no writes. Playwright is NOT a project dependency: this script
 * installs `playwright-core` into <os tmp>/natkhat-typography-tools on first run and drives the installed Chrome/Edge.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const VALUE_OPTS = new Set(['--base', '--only', '--viewports', '--allow']);
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (VALUE_OPTS.has(argv[i])) { i++; continue; }
  if (argv[i].startsWith('--')) continue;
  positional.push(argv[i]);
}
const resolveDir = (l) => (path.isAbsolute(l) || l.includes('/') || l.includes('\\') ? path.resolve(l) : path.join(HERE, l));

if (positional[0] === 'compare') {
  writeCompare(resolveDir(positional[1] || 'before'), resolveDir(positional[2] || 'after'));
  process.exit(0);
}

const label = positional[0] || 'before';
const OUT_DIR = resolveDir(label);
const BASE = opt('--base', process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5199').replace(/\/$/, '');
const ONLY = opt('--only', '') ? opt('--only', '').split(',').map((s) => s.trim()).filter(Boolean) : null;
const VIEWPORT_WIDTHS = opt('--viewports', '1440,390').split(',').map((s) => Number(s.trim())).filter(Boolean);
const STRICT = flag('--strict');
const AUDIT = !flag('--no-audit');
const VERBOSE = flag('--verbose');
const T0 = Date.now();
const tick = (m) => { if (VERBOSE) console.log('      [' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m); };
const ALLOWED_FAMILIES = opt('--allow', process.env.CAPTURE_ALLOW_FAMILIES || 'Montserrat,Source Sans 3')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Weight palette per family (only enforced for the default families).
const ALLOWED_WEIGHTS = { Montserrat: [500, 600, 700, 800], 'Source Sans 3': [400, 600, 700] };

const viewportFor = (w) =>
  w <= 480
    ? { width: w, height: 844, isMobile: true, deviceScaleFactor: 2 }
    : { width: w, height: Math.max(700, Math.round(w * 0.625)), isMobile: false, deviceScaleFactor: 1 };
const VIEWPORTS = VIEWPORT_WIDTHS.map(viewportFor);

// ---------------------------------------------------------------------------------------------------------------------
// Tooling: playwright-core outside the project, system Chrome/Edge
// ---------------------------------------------------------------------------------------------------------------------
const TOOLS_DIR = path.join(os.tmpdir(), 'natkhat-typography-tools');

function loadPlaywright() {
  const tryRequire = (from) => {
    try { return createRequire(from)('playwright-core'); } catch { return null; }
  };
  let pw = tryRequire(path.join(TOOLS_DIR, 'package.json')) || tryRequire(import.meta.url);
  if (pw) return pw;
  console.log(`[capture] installing playwright-core into ${TOOLS_DIR} (one time, outside the project)...`);
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const pkg = path.join(TOOLS_DIR, 'package.json');
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: 'natkhat-typography-tools', private: true }));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['install', 'playwright-core', '--no-audit', '--no-fund', '--silent'], { cwd: TOOLS_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
  pw = tryRequire(pkg);
  if (!pw) throw new Error(`playwright-core could not be installed. Install it manually: npm install --prefix "${TOOLS_DIR}" playwright-core`);
  return pw;
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// ---------------------------------------------------------------------------------------------------------------------
// API fixtures (no backend, no secrets)
// ---------------------------------------------------------------------------------------------------------------------
const NOW = '2026-06-01T10:30:00.000Z';
const stubProduct = (id, name, pricePaise) => ({
  id, name, slug: id, description: 'Fixture item', pricePaise, categoryId: 'tea-snacks', categoryName: 'Tea and Snacks',
  dietary: 'veg', image: '/src/assets/images/chai_bun_maska_samosa_1793454952038.jpg', isAvailable: true, isFeatured: false, displayOrder: 1,
});
const FIXTURE_ORDERS = [
  { referenceId: 'NC-348176', status: 'pending_confirmation', createdAt: NOW, subtotalPaise: 29000, deliveryFeePaise: 3000, totalPaise: 32000,
    customer: { name: 'Rahul Sharma', phone: '9876500001', orderType: 'delivery', address: 'Flat 12, Shreeram Plaza, Sector 4' },
    items: [{ product: stubProduct('f1', 'Special Adrak Elaichi Kulhad Chai', 6000), quantity: 2 }, { product: stubProduct('f2', 'Aloo Paratha (With Curd & Butter)', 17000), quantity: 1 }] },
  { referenceId: 'NC-348177', status: 'preparing', createdAt: NOW, subtotalPaise: 19900, deliveryFeePaise: 0, totalPaise: 19900,
    customer: { name: 'Priya Verma', phone: '9876500002', orderType: 'pickup' },
    items: [{ product: stubProduct('f3', 'Amritsari Chole Bhature (2 Pcs)', 9950), quantity: 2 }] },
  { referenceId: 'NC-348178', status: 'ready_for_pickup', createdAt: NOW, subtotalPaise: 12000, deliveryFeePaise: 0, totalPaise: 12000,
    customer: { name: 'Amit Kumar', phone: '9876500003', orderType: 'pickup' },
    items: [{ product: stubProduct('f4', 'Mumbai Bun Maska', 6000), quantity: 2 }] },
];
// NOTE: do not add `Cache-Control: no-store` to fulfilled responses; Chromium then never reports the request as finished
// and `networkidle` waits for its full timeout.
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function installApiMocks(context) {
  await context.route(/\/api\//, async (route) => {
    try {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const m = req.method();
      if (m === 'GET' && /^\/api\/orders\/NC-\d+\/track$/.test(p)) {
        return json(route, 200, { referenceId: p.split('/')[3], orderType: 'pickup', status: 'preparing', createdAt: NOW, updatedAt: NOW });
      }
      if (m === 'GET' && p === '/api/orders') return json(route, 200, FIXTURE_ORDERS);
      if (m === 'POST' && p === '/api/orders') {
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch {}
        const customer = body.customer || { name: 'Fixture', phone: '9876500000', orderType: 'delivery' };
        return json(route, 201, {
          referenceId: 'NC-348180', status: 'pending_confirmation', createdAt: NOW, customer,
          items: (body.items || []).map((i) => ({ product: stubProduct(i.productId, 'Fixture item', 6000), quantity: i.quantity })),
          subtotalPaise: 12000, deliveryFeePaise: 3000, totalPaise: 15000,
          whatsappUrl: 'https://wa.me/919876543210?text=Fixture', whatsappMessage: 'Fixture',
        });
      }
      // settings/categories/products/auth/anything else: the app falls back to its bundled seed data.
      return json(route, 404, { error: 'fixture: not mocked' });
    } catch (e) {
      console.log('[capture] API mock error:', e && e.message);
      try { await route.abort(); } catch {}
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------------------------------------------------
const FREEZE_CSS = `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}`;

async function settle(page, extra = 250) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === last) break;
    last = y;
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(extra);
}

async function primeLazyImages(page) {
  await page.evaluate(async () => {
    const h = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += h * 0.8) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(150);
}

/** The inline nav is hidden below Tailwind's md breakpoint (768px); the hamburger menu is used there. */
const usesHamburger = (vp) => vp.width < 768;

async function openView(page, vp, name) {
  // name: 'Home' | 'Menu & Order' | 'Bulk Orders' | 'About & Contact' | 'admin'
  if (usesHamburger(vp)) await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  if (name === 'admin') {
    await page.getByRole('button', { name: usesHamburger(vp) ? /Café Staff & Admin Portal/ : /Staff Portal/ }).first().click();
  } else {
    await page.getByRole('button', { name, exact: true }).first().click();
  }
  await settle(page);
}

async function addFirstDishes(page, n = 2) {
  for (let i = 0; i < n; i++) await page.getByRole('button', { name: /^Add .* to cart$/ }).nth(i).click();
}

async function openAdmin(page, vp) {
  await openView(page, vp, 'admin');
  await page.getByText('Staff CMS').waitFor({ timeout: 15000 });
  await settle(page, 200);
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenes.  ctx: 'public' | 'admin' (admin = fake token in localStorage)
// shot: 'view' (viewport) | 'full' (full page, optionally capped by maxHeight CSS px) | CSS selector | (page) => Locator
// ---------------------------------------------------------------------------------------------------------------------
const LONG_NAME_CARD = (page) => page.locator('article', { hasText: 'Hyderabadi Veg Dum Biryani' }).first();
const SCENES = [
  { id: 'home-hero', ctx: 'public', shot: 'view', run: async () => {} },
  { id: 'home-full', ctx: 'public', shot: 'full', maxHeight: 6500, run: async () => {} },
  { id: 'footer', ctx: 'public', shot: 'footer', run: async (page) => { await page.locator('footer').scrollIntoViewIfNeeded(); } },
  { id: 'menu-grid', ctx: 'public', shot: 'view', run: async (page, vp) => { await openView(page, vp, 'Menu & Order'); } },
  { id: 'menu-full', ctx: 'public', shot: 'full', maxHeight: 4200, run: async (page, vp) => { await openView(page, vp, 'Menu & Order'); } },
  { id: 'category-nav', ctx: 'public', shot: '.sticky.top-18', run: async (page, vp) => { await openView(page, vp, 'Menu & Order'); } },
  { id: 'card-closeup', ctx: 'public', shot: (page) => page.locator('article').first(), run: async (page, vp) => { await openView(page, vp, 'Menu & Order'); } },
  { id: 'card-longname', ctx: 'public', shot: LONG_NAME_CARD, run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await LONG_NAME_CARD(page).scrollIntoViewIfNeeded(); await settle(page, 150);
  } },
  { id: 'navbar-cart-filled', ctx: 'public', shot: 'header', run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await addFirstDishes(page, 3); await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 150);
  } },
  { id: 'mobile-nav-open', ctx: 'public', maxWidth: 767, shot: 'view', run: async (page) => { await page.getByRole('button', { name: 'Toggle navigation menu' }).click(); await settle(page, 150); } },
  { id: 'product-modal', ctx: 'public', shot: 'view', run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await page.locator('article h3').first().click(); await settle(page, 200);
  } },
  { id: 'cart-empty', ctx: 'public', shot: 'view', run: async (page) => { await page.getByTestId('cart-button').click(); await settle(page, 200); } },
  { id: 'cart-review', ctx: 'public', shot: 'view', run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await addFirstDishes(page, 2); await page.getByTestId('cart-button').click(); await settle(page, 200);
  } },
  { id: 'cart-details', ctx: 'public', shot: 'view', run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await addFirstDishes(page, 2); await page.getByTestId('cart-button').click();
      await page.getByRole('button', { name: /Proceed to Details/ }).click(); await settle(page, 200);
  } },
  { id: 'cart-success', ctx: 'public', shot: 'view', run: async (page, vp) => {
      await openView(page, vp, 'Menu & Order'); await addFirstDishes(page, 2); await page.getByTestId('cart-button').click();
      await page.getByRole('button', { name: /Proceed to Details/ }).click();
      await page.getByPlaceholder('e.g. Rahul Sharma').fill('Rahul Sharma');
      await page.getByPlaceholder('10-digit phone number').fill('9876500000');
      await page.getByPlaceholder(/House \/ Flat No/).fill('Flat 12, Shreeram Plaza, Sector 4');
      await page.getByRole('button', { name: /Generate WhatsApp Order/ }).click();
      await page.getByText('Ref #NC-348180').waitFor(); await settle(page, 200);
  } },
  { id: 'track-order-empty', ctx: 'public', shot: 'full', run: async (page) => { await page.getByRole('button', { name: 'Track order' }).first().click(); await settle(page); } },
  { id: 'track-order-found', ctx: 'public', shot: 'full', run: async (page) => {
      await page.getByRole('button', { name: 'Track order' }).first().click();
      await page.getByPlaceholder('NC-123456').fill('NC-348177'); await page.getByRole('button', { name: 'Track order' }).last().click();
      await page.getByRole('heading', { name: 'Preparing your order' }).first().waitFor(); await settle(page, 200);
  } },
  { id: 'bulk-orders', ctx: 'public', shot: 'full', run: async (page, vp) => { await openView(page, vp, 'Bulk Orders'); } },
  { id: 'bulk-orders-sent', ctx: 'public', shot: 'view', run: async (page, vp) => {
      await openView(page, vp, 'Bulk Orders');
      await page.getByPlaceholder('e.g. Vikramaditya Rathore').fill('Vikram Rathore');
      await page.getByPlaceholder('10-digit mobile number').fill('9876500000');
      await page.locator('input[type=date]').fill('2026-12-01');
      await page.getByRole('button', { name: /Connect on WhatsApp for Bulk Quote/ }).click();
      await page.getByRole('heading', { name: /Bulk Order Request Prepared/ }).waitFor(); await settle(page, 200);
  } },
  { id: 'about-contact', ctx: 'public', shot: 'full', run: async (page, vp) => { await openView(page, vp, 'About & Contact'); } },
  { id: 'admin-login', ctx: 'public', shot: 'view', run: async (page, vp) => { await openView(page, vp, 'admin'); await page.getByRole('heading', { name: /Café Management Login/ }).waitFor(); await settle(page, 200); } },
  { id: 'admin-products', ctx: 'admin', shot: 'full', maxHeight: 3000, run: async (page, vp) => { await openAdmin(page, vp); } },
  { id: 'admin-categories', ctx: 'admin', shot: 'full', maxHeight: 3000, run: async (page, vp) => { await openAdmin(page, vp); await page.getByRole('button', { name: /^Categories/ }).click(); await settle(page, 150); } },
  { id: 'admin-settings', ctx: 'admin', shot: 'full', run: async (page, vp) => { await openAdmin(page, vp); await page.getByRole('button', { name: /Store & WhatsApp Settings/ }).click(); await settle(page, 150); } },
  { id: 'admin-orders', ctx: 'admin', shot: 'full', run: async (page, vp) => { await openAdmin(page, vp); await page.getByRole('button', { name: /WhatsApp Orders Log/ }).click(); await page.getByText('#NC-348176').waitFor(); await settle(page, 150); } },
  { id: 'admin-order-status-modal', ctx: 'admin', shot: 'view', run: async (page, vp) => {
      await openAdmin(page, vp); await page.getByRole('button', { name: /WhatsApp Orders Log/ }).click(); await page.getByText('#NC-348176').waitFor();
      await page.getByRole('button', { name: 'Update status' }).first().click(); await page.getByRole('dialog').waitFor(); await settle(page, 200);
  } },
  { id: 'admin-add-dish-modal', ctx: 'admin', shot: 'view', run: async (page, vp) => {
      await openAdmin(page, vp); await page.getByRole('button', { name: /Add New Dish/ }).click(); await page.getByText('Add New Menu Dish').waitFor(); await settle(page, 200);
  } },
];

// ---------------------------------------------------------------------------------------------------------------------
// Typography audit (runs inside the page + CDP)
// ---------------------------------------------------------------------------------------------------------------------
const CAP = (arr, n = 12) => ({ count: arr.length, samples: arr.slice(0, n) });

async function auditPage(page, context, vp, sceneId) {
  // Only enforce the role contract for the default pair (display first, text second).
  const roles = ALLOWED_FAMILIES.length === 2 && ALLOWED_FAMILIES[0] === 'Montserrat' ? { display: ALLOWED_FAMILIES[0], body: ALLOWED_FAMILIES[1] } : null;
  const dom = await page.evaluate((roles) => {
    const firstFamily = (ff) => ff.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
    };
    const sel = (el) => {
      const t = el.tagName.toLowerCase();
      const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
      return c ? `${t}.${c}` : t;
    };
    const census = {};
    const samples = {};
    const issues = { belowMinSize: [], inputsBelow16: [], italic: [], longUppercase: [], tightCaps: [], wideTracking: [], clipped: [], truncated: [], headingTruncated: [], priceNoTabular: [], headingLeading: [], paragraphLeading: [], smallParagraph: [], longParagraphMobile: [], roleMismatch: [] };
    let devanagari = 0;
    let rupeeNodes = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const text = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || !visible(el)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const fam = firstFamily(s.fontFamily);
      const px = parseFloat(s.fontSize);
      const key = `${fam} | ${s.fontWeight} | ${px}px | ${s.fontStyle}`;
      census[key] = (census[key] || 0) + 1;
      (samples[key] ||= []).length < 3 && samples[key].push(`${sel(el)} "${text.slice(0, 28)}"`);
      const lsEm = s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) / px;
      if (roles) {
        // Role contract: headings, buttons and table headers speak in the display face; labels, list/table cells in the text face.
        const displayHost = el.closest('h1,h2,h3,h4,h5,h6,button,th');
        const bodyHost = displayHost ? null : el.closest('label,td,option');
        if (displayHost && fam !== roles.display) issues.roleMismatch.push({ el: sel(el), expected: roles.display, got: fam, text: text.slice(0, 30) });
        const isFigure = /^[\u20B9\d\s,.:#A-Z-]+$/.test(text) && /\d/.test(text); // prices/refs in a table cell may use the display face
        if (bodyHost && fam !== roles.body && !(isFigure && fam === roles.display)) issues.roleMismatch.push({ el: sel(el), expected: roles.body, got: fam, text: text.slice(0, 30) });
      }
      if (/[\u0900-\u097F]/.test(text)) devanagari += (text.match(/[\u0900-\u097F]/g) || []).length;
      if (text.includes('\u20B9')) { rupeeNodes++; el.setAttribute('data-ty-rupee', '1'); }
      if (px < 12) issues.belowMinSize.push({ el: sel(el), px, text: text.slice(0, 40) });
      if (s.fontStyle === 'italic' || s.fontStyle === 'oblique') issues.italic.push({ el: sel(el), text: text.slice(0, 40) });
      if (s.textTransform === 'uppercase') {
        if (text.length > 32) issues.longUppercase.push({ el: sel(el), len: text.length });
        if (lsEm < 0.03 && px <= 14) issues.tightCaps.push({ el: sel(el), em: Number(lsEm.toFixed(3)), text: text.slice(0, 30) });
      }
      if (lsEm > 0.1) issues.wideTracking.push({ el: sel(el), em: Number(lsEm.toFixed(3)) });
      if (/montserrat/i.test(fam) && /(\u20B9\s?\d|^\d[\d,.:]*$)/.test(text) && !/tabular-nums/.test(s.fontVariantNumeric)) {
        issues.priceNoTabular.push({ el: sel(el), text: text.slice(0, 24) });
      }
      const lh = s.lineHeight === 'normal' ? 1.2 : parseFloat(s.lineHeight) / px;
      if (/^H[1-3]$/.test(el.tagName) && (lh < 1.05 || lh > 1.4)) issues.headingLeading.push({ el: sel(el), lh: Number(lh.toFixed(2)), px });
      if (el.tagName === 'P') {
        const full = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const clamped = s.webkitLineClamp && s.webkitLineClamp !== 'none'; // card teasers are exempt from the size floors
        if (full.length > 60 && (lh < 1.45 || lh > 1.8)) issues.paragraphLeading.push({ el: sel(el), lh: Number(lh.toFixed(2)), px });
        if (!clamped && full.length > 50 && px < 14) issues.smallParagraph.push({ el: sel(el), px, len: full.length });
        if (!clamped && window.innerWidth <= 480 && full.length > 120 && px < 16) issues.longParagraphMobile.push({ el: sel(el), px, len: full.length });
      }
      if (el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(s.overflowX) && s.textOverflow !== 'ellipsis' && !el.closest('[class*=scrollbar-none]') && !el.classList.contains('sr-only')) {
        issues.clipped.push({ el: sel(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: text.slice(0, 40) });
      }
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) issues.truncated.push({ el: sel(el), text: text.slice(0, 50) });
      if (/^H[1-3]$/.test(el.tagName) && ((s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1))) issues.headingTruncated.push({ el: sel(el), text: text.slice(0, 50) });
      // multi-line clamp (line-clamp-N) hiding text
      if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) issues.truncated.push({ el: sel(el), text: text.slice(0, 50), clamp: s.webkitLineClamp });
    }
    // form controls are not text nodes
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      const fam = firstFamily(s.fontFamily);
      const px = parseFloat(s.fontSize);
      const key = `${fam} | ${s.fontWeight} | ${px}px | ${s.fontStyle} [form control]`;
      census[key] = (census[key] || 0) + 1;
      (samples[key] ||= []).length < 3 && samples[key].push(sel(el));
      if (px < 16) issues.inputsBelow16.push({ el: sel(el), px });
      // The order-number field is an identifier, so it deliberately uses the display face.
      if (roles && el.id !== 'track-order-number' && el.type !== 'checkbox' && fam !== roles.body) issues.roleMismatch.push({ el: sel(el), expected: roles.body, got: fam });
    }
    const pageOverflowX = document.documentElement.scrollWidth - window.innerWidth;
    const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), weight: f.weight, style: f.style, status: f.status }));
    const out = {};
    for (const [k, v] of Object.entries(issues)) out[k] = { count: v.length, samples: v.slice(0, 12) };
    return { census, samples, issues: out, devanagari, rupeeNodes, pageOverflowX, faces };
  }, roles);

  // Which platform fonts actually painted the glyphs (web font vs. system fallback), via the DevTools protocol.
  const platform = {};
  const rupeeFonts = {};
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const collect = async (selector, into, limit) => {
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
      for (const nodeId of nodeIds.slice(0, limit)) {
        let res;
        try { res = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }); } catch { continue; }
        for (const f of res.fonts || []) {
          const k = `${f.familyName}${f.isCustomFont ? ' (web font)' : ' (system)'}`;
          into[k] = (into[k] || 0) + (f.glyphCount || 0);
        }
      }
    };
    await collect('body *', platform, 1500);
    await collect('[data-ty-rupee]', rupeeFonts, 300);
  } finally {
    await cdp.detach().catch(() => {});
  }
  await page.evaluate(() => document.querySelectorAll('[data-ty-rupee]').forEach((e) => e.removeAttribute('data-ty-rupee'))).catch(() => {});
  return { scene: sceneId, viewport: vp.width, ...dom, platformFonts: platform, rupeeFonts };
}

const MONO_RE = /mono|consolas|menlo|courier|sfmono|cascadia|lucida console|monaco/i;
const SYMBOL_RE = /emoji|symbol|dingbat|arial unicode|noto color|apple color|twemoji/i;
const DEVA_RE = /devanagari|nirmala|mukta|hind|kohinoor|sangam|mangal|lohit/i;

function judge(audit) {
  const v = [];
  const allowed = new Set(ALLOWED_FAMILIES);
  const codeScene = audit.scene === 'admin-login'; // the only place with <code> samples
  for (const [key, count] of Object.entries(audit.census)) {
    const [fam, weight] = key.split(' | ');
    if (MONO_RE.test(fam)) {
      if (!codeScene) v.push(`monospace used by ${count} element(s) outside <code>: ${key}`);
    } else if (!allowed.has(fam)) {
      v.push(`family "${fam}" used by ${count} element(s): ${key}`);
    } else if (ALLOWED_WEIGHTS[fam] && !ALLOWED_WEIGHTS[fam].includes(Number(weight))) {
      v.push(`weight ${weight} is outside the palette for ${fam} (${ALLOWED_WEIGHTS[fam].join('/')}): ${key} x${count}`);
    }
  }
  for (const [k, n] of Object.entries(audit.platformFonts)) {
    if (/\(system\)/.test(k) && !SYMBOL_RE.test(k) && !(codeScene && MONO_RE.test(k)) && !(DEVA_RE.test(k) && audit.devanagari > 0)) {
      v.push(`system font painted ${n} glyph(s): ${k}`);
    }
  }
  for (const [k, n] of Object.entries(audit.rupeeFonts || {})) {
    // The same element can also hold an emoji (the announcement text starts with one); emoji fonts never paint the rupee sign.
    if (/\(system\)/.test(k) && !SYMBOL_RE.test(k)) v.push(`the rupee sign is painted by a system font (${k}, ${n} glyphs): web fonts lack U+20B9 coverage or latin-ext did not load`);
  }
  if (audit.devanagari > 0 && !Object.keys(audit.platformFonts).some((k) => DEVA_RE.test(k))) v.push(`${audit.devanagari} Devanagari character(s) but no Devanagari-capable font painted them`);
  const I = audit.issues;
  if (I.belowMinSize.count) v.push(`${I.belowMinSize.count} text element(s) below 12px`);
  if (I.italic.count) v.push(`${I.italic.count} italic element(s)`);
  if (I.longUppercase.count) v.push(`${I.longUppercase.count} long uppercase string(s)`);
  if (I.tightCaps.count) v.push(`${I.tightCaps.count} uppercase label(s) without letter-spacing`);
  if (I.wideTracking.count) v.push(`${I.wideTracking.count} element(s) with letter-spacing > 0.1em`);
  if (I.priceNoTabular.count) v.push(`${I.priceNoTabular.count} Montserrat number/price(s) without tabular-nums`);
  if (I.headingLeading.count) v.push(`${I.headingLeading.count} h1-h3 with line-height outside 1.05-1.4`);
  if (I.paragraphLeading.count) v.push(`${I.paragraphLeading.count} long paragraph(s) with line-height outside 1.45-1.8`);
  if (I.smallParagraph.count) v.push(`${I.smallParagraph.count} paragraph(s) over 50 characters set below 14px`);
  if (I.longParagraphMobile.count) v.push(`${I.longParagraphMobile.count} long paragraph(s) (>120 characters) set below 16px on mobile`);
  if (audit.viewport <= 480 && I.inputsBelow16.count) v.push(`${I.inputsBelow16.count} form control(s) below 16px on mobile`);
  if (audit.pageOverflowX > 1) v.push(`page overflows horizontally by ${audit.pageOverflowX}px`);
  if (I.roleMismatch.count) v.push(`${I.roleMismatch.count} element(s) in the wrong family for their role (headings/buttons = display, labels/cells/inputs = text face)`);
  if (I.clipped.count) v.push(`${I.clipped.count} element(s) clip their text`);
  if (I.headingTruncated.count) v.push(`${I.headingTruncated.count} heading/title(s) cut off with an ellipsis (dish and category names must stay readable)`);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------
// Compare page (before vs after)
// ---------------------------------------------------------------------------------------------------------------------
function writeCompare(beforeDir, afterDir) {
  const read = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')); } catch { return null; } };
  const b = read(beforeDir), a = read(afterDir);
  if (!b || !a) { console.error('compare: both folders need a manifest.json (run capture for each label first)'); process.exit(2); }
  const rel = (d, f) => path.relative(HERE, path.join(d, f)).split(path.sep).join('/');
  const ids = [...new Set([...b.scenes, ...a.scenes].map((s) => `${s.id}@${s.viewport}`))];
  const rows = ids.map((k) => {
    const [id, vp] = k.split('@');
    const f = `${id}@${vp}.png`;
    const has = (m) => m.scenes.some((s) => s.id === id && String(s.viewport) === vp && s.ok);
    const cell = (m, d, t) => (has(m) ? `<a href="${rel(d, f)}"><img loading="lazy" src="${rel(d, f)}" alt="${t} ${k}"></a>` : '<em>missing</em>');
    return `<section><h2>${id} <small>${vp}px</small></h2><div class="row"><figure><figcaption>before</figcaption>${cell(b, beforeDir, 'before')}</figure><figure><figcaption>after</figcaption>${cell(a, afterDir, 'after')}</figure></div></section>`;
  });
  const html = `<!doctype html><meta charset="utf-8"><title>Typography before / after</title><style>body{font:14px system-ui;margin:16px;background:#eee}h2{margin:24px 0 6px}small{color:#666;font-weight:400}.row{display:flex;gap:12px;align-items:flex-start}figure{margin:0;flex:1;min-width:0;background:#fff;padding:6px}figcaption{font-weight:600;margin-bottom:4px}img{max-width:100%;height:auto;border:1px solid #ddd}</style><h1>Typography before / after</h1>${rows.join('\n')}`;
  const out = path.join(HERE, 'compare-before-after.html');
  fs.writeFileSync(out, html);
  console.log('wrote', out);
}

// ---------------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------------
async function main() {
  try {
    const res = await fetch(BASE + '/');
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (e) {
    console.error(`[capture] Cannot reach ${BASE} (${e.message}).\n  Start the front end first, in another terminal, from the project root:\n    npx vite --port 5199 --strictPort --host 127.0.0.1\n  (Do not restart a dev server that is already running on another port.)`);
    process.exit(2);
  }
  const { chromium } = loadPlaywright();
  const exe = findBrowser();
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--font-render-hinting=none', '--disable-lcd-text'] });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[capture] label="${label}" -> ${OUT_DIR}\n[capture] base=${BASE} browser=${exe || 'playwright bundled'} viewports=${VIEWPORT_WIDTHS.join(',')} audit=${AUDIT} strict=${STRICT}`);

  const manifest = { label, base: BASE, startedAt: new Date().toISOString(), viewports: VIEWPORT_WIDTHS, scenes: [], fontRequests: [], consoleProblems: [] };
  const audits = [];
  const failures = [];

  for (const vp of VIEWPORTS) {
    for (const kind of ['public', 'admin']) {
      const scenes = SCENES.filter((s) => s.ctx === kind && (!ONLY || ONLY.includes(s.id)) && (!s.maxWidth || vp.width <= s.maxWidth));
      for (const scene of scenes) {
        // fresh context per scene: no state leaks between scenes (the cart lives in localStorage)
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: scene.shot === 'full' && vp.isMobile ? 1 : vp.deviceScaleFactor, // keep long mobile pages small
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile,
          locale: 'en-IN',
          reducedMotion: 'reduce',
        });
        await installApiMocks(context);
        await context.addInitScript(({ admin }) => {
          window.open = () => null;
          try { localStorage.setItem('natkhat_cart_v2', '[]'); } catch {}
          if (admin) { try { localStorage.setItem('natkhat_admin_token_v2', 'fixture-token'); } catch {} }
        }, { admin: kind === 'admin' });
        const page = await context.newPage();
        const t0 = Date.now();
        const record = { id: scene.id, viewport: vp.width, file: `${scene.id}@${vp.width}.png`, ok: false };
        page.on('response', async (r) => {
          const u = r.url();
          if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u)) {
            let bytes = 0;
            try { bytes = (await r.body()).length; } catch {}
            manifest.fontRequests.push({ scene: scene.id, viewport: vp.width, url: u.replace(BASE, ''), status: r.status(), bytes });
          }
        });
        page.on('console', (m) => {
          const t = m.text();
          if (/font|csp|content security|refused to/i.test(t) && ['error', 'warning'].includes(m.type())) manifest.consoleProblems.push({ scene: scene.id, viewport: vp.width, type: m.type(), text: t.slice(0, 300) });
        });
        try {
          tick('goto');
          await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
          await page.addStyleTag({ content: FREEZE_CSS });
          await page.waitForSelector('header', { timeout: 20000 });
          await settle(page, 400);
          tick('run');
          await scene.run(page, vp);
          await settle(page, 150);
          tick('shot');
          const file = path.join(OUT_DIR, record.file);
          if (scene.shot === 'full') {
            await primeLazyImages(page);
            const h = await page.evaluate(() => document.documentElement.scrollHeight);
            record.pageHeight = h;
            const clip = scene.maxHeight && h > scene.maxHeight ? { x: 0, y: 0, width: vp.width, height: scene.maxHeight } : undefined;
            await page.screenshot({ path: file, fullPage: true, ...(clip ? { clip } : {}) });
          } else if (scene.shot === 'view') {
            await page.screenshot({ path: file });
          } else if (typeof scene.shot === 'function') {
            await scene.shot(page).screenshot({ path: file });
          } else {
            await page.locator(scene.shot).first().screenshot({ path: file });
          }
          record.ok = true;
          if (AUDIT) {
            const audit = await auditPage(page, context, vp, scene.id);
            audit.violations = judge(audit);
            audits.push(audit);
            record.violations = audit.violations.length;
            if (audit.violations.length) failures.push({ scene: scene.id, viewport: vp.width, violations: audit.violations });
          }
          console.log(`  ok   ${record.file}  (${((Date.now() - t0) / 1000).toFixed(1)}s)${record.violations ? `  audit findings: ${record.violations}` : ''}`);
        } catch (e) {
          record.error = String(e.message || e).split('\n')[0];
          console.log(`  FAIL ${record.file}: ${record.error}`);
          try { await page.screenshot({ path: path.join(OUT_DIR, `_failed-${record.file}`) }); } catch {}
        }
        manifest.scenes.push(record);
        await context.close();
      }
    }
  }
  await browser.close();

  manifest.finishedAt = new Date().toISOString();
  // Font weight on the wire: unique files per scene (what one page load downloads).
  const perScene = {};
  for (const r of manifest.fontRequests) {
    if (!/\.(woff2?|ttf|otf)(\?|$)/i.test(r.url)) continue;
    const k = `${r.scene}@${r.viewport}`;
    (perScene[k] ||= new Map()).set(r.url, r.bytes);
  }
  manifest.fontBytesPerScene = Object.fromEntries(Object.entries(perScene).map(([k, m]) => [k, { files: m.size, bytes: [...m.values()].reduce((x, y) => x + y, 0) }]));
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (AUDIT) fs.writeFileSync(path.join(OUT_DIR, 'typography-audit.json'), JSON.stringify({ allowedFamilies: ALLOWED_FAMILIES, failures, audits }, null, 1));

  const bad = manifest.scenes.filter((s) => !s.ok);
  console.log(`\n[capture] ${manifest.scenes.length - bad.length}/${manifest.scenes.length} scenes captured -> ${OUT_DIR}`);
  if (manifest.consoleProblems.length) console.log(`[capture] console font/CSP problems: ${manifest.consoleProblems.length} (see manifest.json)`);
  const home = manifest.fontBytesPerScene['home-hero@' + VIEWPORT_WIDTHS[0]];
  if (home) console.log(`[capture] font bytes downloaded by home-hero@${VIEWPORT_WIDTHS[0]}: ${home.files} file(s), ${(home.bytes / 1024).toFixed(0)} KB`);
  if (AUDIT) {
    const roll = {};
    for (const a of audits) for (const [k, n] of Object.entries(a.census)) roll[k] = (roll[k] || 0) + n;
    const fams = {};
    for (const [k, n] of Object.entries(roll)) { const f = k.split(' | ')[0]; fams[f] = (fams[f] || 0) + n; }
    console.log('[capture] elements by family:', JSON.stringify(fams));
    const platformRoll = {};
    for (const a of audits) for (const [k, n] of Object.entries(a.platformFonts)) platformRoll[k] = (platformRoll[k] || 0) + n;
    console.log('[capture] glyphs painted by font:', JSON.stringify(platformRoll));
    console.log(`[capture] audit: ${failures.length} scene(s) with findings (typography-audit.json)${STRICT ? '' : ' [report only; --strict makes findings fail the run]'}`);
    const rollup = {};
    for (const f of failures) for (const k of new Set(f.violations.map((v) => v.replace(/\d+/g, '#')))) rollup[k] = (rollup[k] || 0) + 1;
    for (const [k, n] of Object.entries(rollup).sort((x, y) => y[1] - x[1]).slice(0, 14)) console.log(`   - (${n} scenes) ${k.slice(0, 170)}`);
  }
  if (bad.length) process.exit(1);
  if (STRICT && failures.length) process.exit(1);
}

main().catch((e) => {
  console.error('[capture] fatal:', e);
  process.exit(1);
});

