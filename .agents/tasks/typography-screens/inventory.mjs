#!/usr/bin/env node
/**
 * Typography class inventory for src/ and index.html (read-only, no dependencies).
 *
 *   node .agents/tasks/typography-screens/inventory.mjs            totals only
 *   node .agents/tasks/typography-screens/inventory.mjs lines      totals + file:line for every hit
 *   node .agents/tasks/typography-screens/inventory.mjs lines legacy   only the tokens that must disappear
 *
 * This is a progress tracker for the migration, NOT a verification. The proof is `capture.mjs after --strict`
 * (computed styles and the fonts the browser actually painted).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const showLines = process.argv.includes('lines');
const legacyOnly = process.argv.includes('legacy');

const files = [path.join(ROOT, 'index.html')];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets') walk(p); }
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})(path.join(ROOT, 'src'));

const T = (re) => new RegExp(re, 'g');
const groups = {
  // tokens that must be gone when the migration is finished (font-mono may remain on <code> only)
  'LEGACY font-serif': T('(?<![\\w-])font-serif\\b|--font-serif'),
  'LEGACY font-mono': T('(?<![\\w-])font-mono\\b'),
  'LEGACY text-[10px]/[11px]': T('(?<![\\w-])text-\\[1[01]px\\]'),
  'LEGACY family names': T("Playfair|Plus Jakarta|Plus\\+Jakarta|Inter\\b|Roboto|Space Grotesk|DM Sans|Poppins"),
  // informational
  'font-display': T('(?<![\\w-])font-display\\b'),
  'font-sans (explicit)': T('(?<![\\w-])font-sans\\b'),
  'font-medium/normal': T('(?<![\\w-])font-(medium|normal)\\b'),
  'font-semibold': T('(?<![\\w-])font-semibold\\b'),
  'font-bold': T('(?<![\\w-])font-bold\\b'),
  'font-extrabold/black': T('(?<![\\w-])font-(extrabold|black)\\b'),
  'italic': T('(?<![\\w-])(not-)?italic\\b'),
  'uppercase': T('(?<![\\w-])uppercase\\b'),
  'tracking-*': T('(?<![\\w-])tracking-[a-z0-9.\\[\\]-]+'),
  'tabular-nums': T('(?<![\\w-])tabular-nums\\b'),
  'text-xs': T('(?<![\\w-])text-xs\\b'),
  'text-sm': T('(?<![\\w-])text-sm\\b'),
  'text-base': T('(?<![\\w-])text-base\\b'),
  'line-clamp/truncate': T('(?<![\\w-])(line-clamp-\\d|truncate)\\b'),
};

console.log(`typography inventory (${files.length} files scanned under ${ROOT})\n`);
for (const [name, re] of Object.entries(groups)) {
  if (legacyOnly && !name.startsWith('LEGACY')) continue;
  const hits = [];
  let total = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const m = line.match(re);
      if (m) { total += m.length; hits.push(`${rel}:${i + 1}`); }
    });
  }
  console.log(`${name.padEnd(28)} ${String(total).padStart(4)}`);
  if (showLines && hits.length) {
    const byFile = {};
    for (const h of hits) { const [f, l] = [h.slice(0, h.lastIndexOf(':')), h.slice(h.lastIndexOf(':') + 1)]; (byFile[f] ||= []).push(l); }
    for (const [f, ls] of Object.entries(byFile)) console.log(`    ${f}: ${ls.join(', ')}`);
  }
}
