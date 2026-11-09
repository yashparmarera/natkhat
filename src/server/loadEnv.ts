import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * Local-development env loader (side-effect module, imported first by config.ts).
 * - Skipped on Vercel: the host injects env vars.
 * - Reads `.env`, then `local.env` from process.cwd().
 * - Never overrides a variable already set (host wins, then `.env`, then `local.env`).
 * - Skips placeholder values and NODE_ENV/VERCEL. Never logs values.
 */
const PLACEHOLDER = /your[-_ ]|YOUR-|\[YOUR|MY_|<.*>|changeme/i;

export function isPlaceholder(value: string | undefined): boolean {
  if (value === undefined) return false;
  return PLACEHOLDER.test(value);
}

function loadFile(file: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const parsed = dotenv.parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'NODE_ENV' || key === 'VERCEL') continue;
    if (isPlaceholder(value)) continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

if (!process.env.VERCEL) {
  loadFile(path.resolve(process.cwd(), '.env'));
  loadFile(path.resolve(process.cwd(), 'local.env'));
}
