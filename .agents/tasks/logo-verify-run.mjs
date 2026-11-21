// logo-verify-run.mjs - one-command wrapper around logo-verify-ui.mjs. ASCII-only on purpose.
// Usage (from the project root):
//   node .agents/tasks/logo-verify-run.mjs [--mode=build|dev] [--only=assets,head,navbar,footer,admin] [--root=<project root>]
//   --mode=build (default): `vite build` into a TEMP outDir (never touches dist/, which other processes rebuild) + `vite preview` of that output on :5322.
//   --mode=dev            : `vite` dev server on :5321 serving the working tree (fast; what you see is the source, not the production bundle).
// It starts only its own child processes and always stops them. It also proves public/images/logo.png was not modified (SHA-256 before/after).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const opt = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const root = path.resolve(opt('root', path.resolve(here, '..', '..')));
const mode = opt('mode', 'build');
const only = opt('only', '');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const logoPath = path.join(root, 'public', 'images', 'logo.png');
const EXPECTED_SHA = 'E567CF0990186B79D28AB897DC3E5A07CE62CB8704E94ABB8CBD515D9FBA90B5';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(vite)) { console.log(`FAIL vite not found at ${vite} (run npm ci first)`); process.exit(2); }
const shaBefore = sha(logoPath);
if (shaBefore !== EXPECTED_SHA) console.log(`WARN logo.png SHA-256 is ${shaBefore}, not the ${EXPECTED_SHA} this plan was written against`);

let server = null;
let code = 1;
try {
  let port;
  if (mode === 'build') {
    const outDir = path.join(os.tmpdir(), 'natkhat-logo-build');
    console.log(`> vite build --outDir ${outDir} --emptyOutDir  (cwd ${root})`);
    const b = spawn(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: root, stdio: 'inherit' });
    const bc = await new Promise((res) => b.on('exit', res));
    if (bc !== 0) { console.log(`FAIL vite build exited ${bc}`); process.exit(1); }
    const builtLogo = path.join(outDir, 'images', 'logo.png');
    console.log(fs.existsSync(builtLogo) && sha(builtLogo) === shaBefore ? 'PASS build output images/logo.png is byte-identical to public/images/logo.png' : 'FAIL build output images/logo.png missing or different');
    port = 5322;
    server = spawn(process.execPath, [vite, 'preview', '--outDir', outDir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  } else {
    port = 5321;
    server = spawn(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  }
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch {} if (!up) await sleep(500); }
  if (!up) { console.log(`FAIL ${mode} server did not come up on :${port}`); process.exit(1); }

  const shots = path.join(os.tmpdir(), 'natkhat_logo_verify');
  const v = spawn(process.execPath, [path.join(here, 'logo-verify-ui.mjs'), `http://127.0.0.1:${port}/`, shots, ...(only ? [`--only=${only}`] : [])], { stdio: 'inherit' });
  code = (await new Promise((res) => v.on('exit', res))) ?? 1;

  const shaAfter = sha(logoPath);
  console.log(shaAfter === shaBefore ? `PASS logo.png untouched (SHA-256 ${shaAfter})` : 'FAIL logo.png CHANGED during the run - this must never happen');
  if (shaAfter !== shaBefore) code = 1;
} finally {
  try { server && server.kill(); } catch {}
  await sleep(600);
}
process.exit(code);
