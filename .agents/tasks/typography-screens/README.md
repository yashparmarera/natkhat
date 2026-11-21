# Typography screenshots and tooling

Everything for the typography overhaul that is not the plan itself. Nothing in this folder is imported by the app.
The plan is `../typography-plan.md`.

| Path | What it is |
|---|---|
| `before/` | 53 screenshots (27 scenes at 1440px, 26 at 390px) of the site before the change, plus `manifest.json` (font requests, console problems) and `typography-audit.json` (computed styles, fonts the browser actually painted, findings). |
| `before-responsive/` | The header, menu, card, category-bar and product-modal scenes at 1280, 1024, 768 and 360px, same audit. |
| `preview-approx/` | A rough preview of the planned look: the old code with the new fonts injected from `preview-target.css`. It is not the implementation; sizes, weights and wrapping fixes are not applied. |
| `capture.mjs` | Screenshot and typography-audit tool. Writes into a folder named after the label you pass. |
| `inventory.mjs` | Counts and `file:line` lists of the typography classes. A progress tracker, not a verification. |
| `preview-target.css` | The CSS behind `preview-approx/`. |
| `baseline-src/` | Created by the implementer in plan step 0: copies of every file that will be edited (the project has no git history, so this is the only "before" for the code). |
| `after/`, `after-responsive/`, `compare-before-after.html` | Created by the implementer and reviewer. |

## Running the tools

All commands run from the project root in PowerShell. The path contains an accented letter, so quote it.

```powershell
# 1. Front end for the screenshots. Do not use `npm run dev` (it needs server config and a database) and
#    do not touch a dev server that is already running on another port.
Start-Process -FilePath (Get-Command npx.cmd).Source -ArgumentList 'vite','--port','5199','--strictPort','--host','127.0.0.1' `
  -WorkingDirectory 'c:\Users\yashs\Downloads\natkhat-café' -WindowStyle Hidden -PassThru   # note the PID, stop it when done

# 2. Capture + audit (about 5 minutes for the default 1440 and 390 sets)
node .agents/tasks/typography-screens/capture.mjs before                   # report only
node .agents/tasks/typography-screens/capture.mjs after --strict           # exit 1 on any finding
node .agents/tasks/typography-screens/capture.mjs after-responsive --viewports 1280,1024,768,360 `
  --only home-hero,navbar-cart-filled,menu-grid,card-longname,product-modal,category-nav --strict

# re-run a few scenes and fold them into an existing folder
node .agents/tasks/typography-screens/capture.mjs after --only product-modal --viewports 1440 --merge

# side-by-side page
node .agents/tasks/typography-screens/capture.mjs compare before after     # writes compare-before-after.html

# progress tracker while editing
node .agents/tasks/typography-screens/inventory.mjs lines legacy
```

* The backend is never contacted. Every `/api/*` call is answered by a fixture inside the script and the admin session is a
  fake token in `localStorage`, so no secrets, database or `data/*.db` are involved.
* Playwright is not a project dependency. On first run the script installs `playwright-core` into
  `%TEMP%\natkhat-typography-tools` and drives the installed Chrome or Edge.
* Tailwind scans the whole project folder, so these files (and the plan) can add a few unused utilities to a local
  build. `.vercelignore` excludes `.agents`, so deployments are unaffected.
