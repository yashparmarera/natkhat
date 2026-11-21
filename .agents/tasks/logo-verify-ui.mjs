// logo-verify-ui.mjs - read-only UI check for the logo rollout. ASCII-only on purpose (Windows PowerShell 5.1 pitfalls).
// Usage: node .agents/tasks/logo-verify-ui.mjs <baseUrl> [screenshotDir] [--only=assets,head,navbar,footer,admin]
//   baseUrl: a running copy of the app (any Vite dev/preview server). Only GET requests are sent.
//   --only : run just these sections (default: all). assets = /images/logo.png, /favicon.png, /og-image.jpg over HTTP;
//            head = favicon + og:image + twitter:image tags; navbar = logo at 320..1280 px; footer = cream tile; admin = login card + top bar.
// Drives its own throwaway headless Chrome/Edge (temp profile) over CDP; needs Node 22+ (global WebSocket + fetch). Exit code 1 on any FAIL.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ARGS = process.argv.slice(2);
const POS = ARGS.filter((a) => !a.startsWith('--'));
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (section) => ONLY.length === 0 || ONLY.includes(section);
const BASE = (POS[0] || 'http://127.0.0.1:5199/').replace(/\/?$/, '/');
const SHOTS = POS[1] || path.join(os.tmpdir(), 'natkhat_logo_verify');
fs.mkdirSync(SHOTS, { recursive: true });
const EXPECT_LOGO_BYTES = 711030;
const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) { console.log('FAIL no Chrome/Edge found'); process.exit(1); }

const CDP_PORT = 9360 + Math.floor(Math.random() * 30);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'natkhat-verify-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(browser, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

let fails = 0;
const ok = (name, detail = '') => console.log(`PASS ${name}${detail ? '  ' + detail : ''}`);
const bad = (name, detail = '') => { fails++; console.log(`FAIL ${name}${detail ? '  ' + detail : ''}`); };
const check = (cond, name, detail) => (cond ? ok(name, detail) : bad(name, detail));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`); const l = await r.json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(400);
  }
  throw new Error('CDP not ready');
}
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) this.listeners.slice().forEach((l) => l(m)); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  once(method, timeout = 40000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + method)), timeout); const l = (m) => { if (m.method === method) { clearTimeout(t); this.listeners = this.listeners.filter((x) => x !== l); res(m.params); } }; this.listeners.push(l); }); }
}
let cdp;
const js = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
const open = async (w, seed = {}) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 640 });
  let p = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url: BASE }); await p; await sleep(900);
  await js(`(() => { localStorage.clear(); ${Object.entries(seed).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return true; })()`);
  p = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url: BASE }); await p; await sleep(1700);
  await js('document.fonts.ready.then(() => true)');
};
const shot = async (name, clip) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
const clickText = (text) => js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().indexOf(${JSON.stringify(text)}) !== -1 && x.offsetParent !== null); if (!b) return false; b.click(); return true; })()`);
const CART = JSON.stringify([{ product: { id: 'v', name: 'V', slug: 'v', description: '', pricePaise: 12000, categoryId: 'c', dietary: 'veg', image: '', isAvailable: true, isFeatured: false, displayOrder: 1 }, quantity: 12 }]);
const IMG = 'img[src="/images/logo.png"]';

try {
  // ---------- static assets over HTTP (GET only). A missing static file returns the SPA index.html with 200, so check type + signature, not only status.
  if (want('assets')) {
    const logoRes = await fetch(BASE + 'images/logo.png'); const logoBuf = Buffer.from(await logoRes.arrayBuffer());
    check(logoRes.status === 200 && /image\/png/.test(logoRes.headers.get('content-type') || '') && logoBuf.length === EXPECT_LOGO_BYTES, 'GET /images/logo.png -> 200 image/png, 711030 bytes', `${logoRes.status} ${logoRes.headers.get('content-type')} ${logoBuf.length}`);
    for (const [p, type] of [['favicon.png', /image\/png/], ['og-image.jpg', /image\/jpeg/]]) {
      const r = await fetch(BASE + p); const b = Buffer.from(await r.arrayBuffer());
      const sig = p.endsWith('png') ? b.slice(0, 4).toString('hex') === '89504e47' : b.slice(0, 2).toString('hex') === 'ffd8';
      check(r.status === 200 && type.test(r.headers.get('content-type') || '') && sig, `GET /${p} -> 200 real image (not the SPA index.html fallback)`, `${r.status} ${r.headers.get('content-type')} ${b.length} bytes`);
    }
  }

  const ws = new WebSocket(await wsUrl()); await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  cdp = new Cdp(ws); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  // ---------- <head>: favicon + social preview
  if (want('head')) {
    await open(1280);
    const head = await js(`(() => { const g = (s, a) => { const e = document.querySelector(s); return e ? e.getAttribute(a) : null; }; return { icon: g('link[rel="icon"]', 'href'), touch: g('link[rel="apple-touch-icon"]', 'href'), og: g('meta[property="og:image"]', 'content'), tw: g('meta[name="twitter:image"]', 'content'), title: document.title }; })()`);
    check(head.icon === '/favicon.png' && head.touch === '/favicon.png', '<link rel=icon / apple-touch-icon> -> /favicon.png', JSON.stringify({ icon: head.icon, touch: head.touch }));
    check(/^https:\/\/[^/]+\/og-image\.jpg$/.test(head.og || '') && head.og === head.tw, 'og:image and twitter:image are the same absolute https URL', `${head.og} | ${head.tw}`);
    check(/Natkhat Caf/.test(head.title), '<title> text unchanged', head.title);
  }

  // ---------- Navbar at several widths (cart with subtotal = worst case)
  if (want('navbar')) {
    for (const w of [320, 375, 768, 820, 1024, 1280]) {
      await open(w, { natkhat_cart_v2: CART });
      const m = await js(`(() => { const b = document.querySelector('header button[aria-label="Natkhat Caf\\u00e9 Home"]'); if (!b) return { err: 'home button missing' }; const i = b.querySelector('img'); const r = i ? i.getBoundingClientRect() : null; const nav = document.querySelector('header nav'); return { hasImg: !!i, src: i && i.getAttribute('src'), alt: i && i.getAttribute('alt'), nat: i && [i.naturalWidth, i.naturalHeight], w: r && +r.width.toFixed(1), h: r && +r.height.toFixed(1), spanLeft: !!b.querySelector('span.font-serif'), navShown: getComputedStyle(nav).display !== 'none', headerH: +document.querySelector('header').getBoundingClientRect().height.toFixed(1), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      if (m.err) { bad(`navbar @${w}`, m.err); continue; }
      const full = m.h * 3;
      check(m.hasImg && m.src === '/images/logo.png' && m.nat && m.nat[0] === 2172 && !m.spanLeft && /Natkhat Caf/.test(m.alt || ''), `navbar @${w}: <img src=/images/logo.png> loaded, old text span gone, alt=${JSON.stringify(m.alt)}`);
      check(m.w >= Math.min(100, full * 0.8), `navbar @${w}: logo not crushed`, `box ${m.w}x${m.h} (full size ${full}x${m.h}); page overflow ${m.docOverflow}px (overflow at 768-959px with a cart is the header's own pre-existing problem, measured before any logo)`);
      check(m.headerH <= 73.5, `navbar @${w}: header height still 72px (+1px border)`, `${m.headerH}`);
      await shot(`navbar_${w}`, { x: 0, y: 0, width: w, height: 125 });
    }
  }

  // ---------- Footer logo on a light tile
  if (want('footer')) {
    await open(1280);
    const f = await js(`(() => { const i = document.querySelector('footer ${IMG}'); if (!i) return { err: 'no footer logo' }; i.scrollIntoView({ block: 'center' }); const t = i.parentElement; const cs = getComputedStyle(t); const r = i.getBoundingClientRect(); return { tag: t.tagName, bg: cs.backgroundColor, radius: cs.borderRadius, w: +r.width.toFixed(1), h: +r.height.toFixed(1), textWordmark: !!document.querySelector('footer h3.font-serif') }; })()`);
    await sleep(300);
    if (f.err) bad('footer', f.err);
    else {
      check(f.bg === 'rgb(247, 241, 228)' && f.h >= 40 && !f.textWordmark, 'footer: logo sits on a cream (#F7F1E4) tile inside the h3, old text heading gone', JSON.stringify(f));
      await shot('footer_1280');
    }
    await open(375);
    const f2 = await js(`(() => { const i = document.querySelector('footer ${IMG}'); if (!i) return null; i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    await sleep(300);
    check(!!f2 && f2.w >= 100, 'footer @375: logo visible', JSON.stringify(f2));
    await shot('footer_375');
  }

  // ---------- Admin login card + logged-in top bar (the fake token only changes client UI state; no login attempt is made)
  if (want('admin')) {
    for (const w of [375, 1280]) {
      await open(w);
      check(await clickText('Staff Portal'), `admin @${w}: opened Staff Portal`);
      await sleep(1500);
      const a = await js(`(() => { const h1 = document.querySelector('main h1'); const i = document.querySelector('main ${IMG}'); const r = i && i.getBoundingClientRect(); return { hasLogo: !!i, w: r && +r.width.toFixed(1), h: r && +r.height.toFixed(1), shieldTileLeft: !!document.querySelector('main div.w-12.h-12'), h1: h1 && h1.textContent.trim() }; })()`);
      check(a.hasLogo && a.w >= 100 && !a.shieldTileLeft && /Management Login/.test(a.h1 || ''), `admin login @${w}: logo replaces the Shield tile, heading text kept`, JSON.stringify(a));
      await shot(`admin_login_${w}`);
    }
    await open(1280, { natkhat_admin_token_v2: 'verify-fake-token' });
    await clickText('Staff Portal'); await sleep(1500);
    const t = await js(`(() => { const i = document.querySelector('main ${IMG}'); const badge = [...document.querySelectorAll('main span')].find((s) => s.textContent.trim() === 'Staff CMS'); const r = i && i.getBoundingClientRect(); return { hasLogo: !!i, h: r && +r.height.toFixed(1), badge: !!badge, serifNameLeft: !!document.querySelector('main span.font-serif.text-2xl') }; })()`);
    check(t.hasLogo && t.badge && !t.serifNameLeft, 'admin top bar: logo + "Staff CMS" badge, old serif name span gone', JSON.stringify(t));
    await shot('admin_topbar_1280', { x: 0, y: 0, width: 1280, height: 330 });
  }
} catch (e) {
  bad('script error', String(e && e.stack ? e.stack : e).slice(0, 500));
} finally {
  try { cdp && cdp.ws.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {}
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}  sections: ${ONLY.length ? ONLY.join(',') : 'all'}  screenshots: ${SHOTS}`);
  process.exit(fails === 0 ? 0 : 1);
}
