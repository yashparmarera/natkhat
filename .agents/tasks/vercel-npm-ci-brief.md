# Brief: Vercel `npm ci` fails with ERESOLVE (esbuild / vite 8)

## Goal
Find out why the Vercel install step fails, and produce a **verified** fix that can be applied to the repo afterwards.

This is an investigation. **Do not modify, stage, commit or push anything in the repo.** The only file you may write inside the repo is the report named at the bottom. All experiments happen in scratch copies under `$env:TEMP`.

## Repo
- Root: `c:\Users\yashs\Downloads\natkhat-café` (Windows, PowerShell: use `;` not `&&`, `$env:TEMP` not `%TEMP%`). Branch `main`, GitHub `yashparmarera/natkhat`.
- Vite 8 + React front end with Tailwind 4 (`@tailwindcss/vite`), a Node server (`server.ts`, run with `tsx`), Drizzle ORM + Postgres (Supabase).
- npm scripts: `dev` and `start` = `tsx server.ts`; `build` = `vite build`; `lint` = `tsc --noEmit`; `test` = `tsx --test test/*.test.ts`; `db:migrate`, `db:migrate-data`, `db:verify`, `db:provision-admin` = `tsx scripts/...`. The `db:*` scripts touch a real database: never run them.
- `local.env` and `.env*` hold real secrets (git-ignored). Never open, print or copy them.

## The failure
The Vercel build of commit `a678b63` (branch `main`) failed at the install step. Build machine: Linux, 2 cores, 8 GB, Vercel CLI 65.11.0. The log does not show the Node or npm versions. Log excerpt (quotes around version ranges removed):

```
Running "install" command: `npm ci`...
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error While resolving: vite@8.3.6
npm error Found: esbuild@0.25.12
npm error node_modules/esbuild
npm error   dev esbuild@^0.25.0 from the root project
npm error   esbuild@^0.25.4 from drizzle-kit@0.31.11
npm error   node_modules/drizzle-kit
npm error     dev drizzle-kit@^0.31.11 from the root project
npm error Could not resolve dependency:
npm error peerOptional esbuild@^0.27.0 || ^0.28.0 from vite@8.3.6
npm error node_modules/vite
npm error   vite@^8.3.0 from the root project
npm error   peer vite@^5.2.0 || ^6 || ^7 || ^8 from @tailwindcss/vite@4.3.5
npm error   1 more (@vitejs/plugin-react)
npm error Conflicting peer dependency: esbuild@0.28.2
npm error Fix the upstream dependency conflict, or retry this command with --force or --legacy-peer-deps
Error: [BUILD_UTILS_SPAWN_1] Command "npm ci" exited with 1
```

The log also shows `.vercelignore` removing 191 files, all under `.agents/skills/...`. That is expected and is not an error.

## What we already know vs. what to verify
Known: the two most recent commits (`f146b29` Navbar logo, `a678b63` agent task files) did not touch `package.json` or `package-lock.json`. The conflict was already present in the first commit `9fcfc9b`.

Hypothesis (verify, do not assume): the root devDependency `esbuild ^0.25.0` keeps esbuild on 0.25.x. Vite 8.3.6 declares esbuild as an optional peer at `^0.27.0 || ^0.28.0`. npm validates an optional peer whenever that package is present in the tree, so it raises ERESOLVE.

Open question: why would this not have been noticed locally? Candidates: a different npm version, `legacy-peer-deps` or `force` set in a project/user `.npmrc` or an env var, or a lockfile generated under different settings.

## Questions to answer (give evidence: exact commands and their output)

### 1. Environment and reproduction
1. Record `node -v`, `npm -v`, and every npm setting that relaxes peer checks: `npm config get legacy-peer-deps`, `npm config get force`, `npm config get strict-peer-deps`, the project `.npmrc` (if any), `~/.npmrc` (settings only, never auth tokens), and `npm_config_*` environment variables.
2. Read `package.json` (`engines`, `devDependencies`, `overrides`), `vercel.json` (installCommand, buildCommand, framework, outputDirectory), `.vercelignore` and `.npmrc`, if they exist. Read `.agents/tasks/vercel-deploy-readiness-brief.md` for the intended Vercel setup (context only; do not re-audit the deployment).
3. Create `$env:TEMP/natkhat-ci-repro` containing ONLY `package.json`, `package-lock.json` and `.npmrc` (if one exists and holds no secrets). Run a clean `npm ci` there with the local npm, then with other majors via `npx --yes npm@10 ci` and `npx --yes npm@11 ci` (Vercel's Node 22 image ships npm 10, its Node 24 image ships npm 11). `npm ci --dry-run` is fine for speed, but do at least one real install. Report which combinations fail.
4. If it does not reproduce, say exactly what differs between your run and Vercel's (npm version, config, lockfile). Do not conclude "it works" without explaining the Vercel failure.

### 2. Root cause in this repo's actual files
1. From `package.json` and `package-lock.json`: which esbuild versions are in the lock, where (root vs nested), and what depends on each (vite, drizzle-kit, tsx, anything else). Is the lock in sync with `package.json`?
2. Is the root `esbuild` devDependency used by the project? Search the repo (excluding `node_modules`, `dist`, `.git`, `.agents`) for `esbuild` in `scripts/`, `server.ts`, `vite.config.*`, `package.json` scripts and other config files.

### 3. Candidate fixes (test each in the scratch copy)
For each: does a clean `npm ci` pass on npm 10 AND npm 11, and which packages change in the lock?
- **A.** Raise the root `esbuild` devDependency into Vite's range (for example `^0.28.0`) and regenerate the lock with `npm install --package-lock-only` (or a full `npm install`) in the scratch copy. Confirm drizzle-kit and tsx still work with their own nested esbuild.
- **B.** Remove the root `esbuild` devDependency (only if 2.2 shows nothing uses it) and regenerate the lock.
- **C.** Workaround: `legacy-peer-deps=true` in a committed `.npmrc`, or `npm ci --legacy-peer-deps` as the Vercel install command. State the downsides.
- **D.** `overrides` in `package.json`. State the downsides.

Prefer a fix that keeps Vite 8 (no major downgrade), passes `npm ci` with no flags, and moves as few packages as possible. Recommend one and say why.

### 4. Verify the recommended fix end to end
Make a FULL copy of the working tree at `$env:TEMP/natkhat-fix-verify` (robocopy; exclude `node_modules`, `dist`, `.git`, `.vercel`, `local.env`, `.env*`, `*.db`). Apply the fix there, then from a clean state run: `npm ci`, `npm run lint`, `npm test`, `npm run build`. Also run `npx tsx --version` and `npx drizzle-kit --version`.

If a test fails or is skipped because it needs a database or secrets, run the same step on an unmodified copy to get a baseline, so regressions can be told apart from environment limits. Never run anything that connects to a real database or uses real credentials.

### 5. Linux lockfile check
Vercel builds on Linux and the lockfile was probably created on Windows. Confirm `package-lock.json` (after the fix) has entries for the linux-x64 glibc builds of the platform-specific optional packages the toolchain needs, for example `@esbuild/linux-x64`, the Rolldown binding for Vite 8 (`@rolldown/binding-linux-x64-gnu`), `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, and anything similar you find in the lock. If npm supports it, also try `npm ci --dry-run --os=linux --cpu=x64 --libc=glibc`. Report any that are missing.

### 6. Hand-off artifacts
Save the exact `package.json` and `package-lock.json` that passed step 4 in `$env:TEMP/natkhat-fix-verify/` (leave them there; do not delete scratch folders) and give their full paths in the report. Include a unified diff of `package.json` and a summary of lockfile changes (package: old -> new).

## Report
Write it to `c:\Users\yashs\Downloads\natkhat-café\.agents\tasks\vercel-npm-ci-investigation.md`. Keep it short and concrete:
1. Root cause in two or three plain sentences.
2. Why it behaves differently locally vs. on Vercel (or why it does not).
3. Options table: A to D, with pass/fail on npm 10 and npm 11, and lock changes.
4. Recommendation and the exact steps to apply it to the repo.
5. Verification evidence: commands run and outcomes.
6. Anything else you directly observed that could break the Vercel build right after install (for example `vite build` warnings or missing Linux binaries). Observed facts only.

Mark confirmed facts separately from inferences.

## Constraints
- No changes to tracked or untracked files in the repo other than the report. No `git add`, `commit`, `push`, `stash`, `checkout` or `reset`. No `npm install` inside the repo itself. No edits to `.gitignore`.
- Never print or copy secret values (`local.env`, `.env*`, tokens in `.npmrc`).
- Give long commands (`npm ci`, `npm run build`) an explicit timeout of several minutes.
