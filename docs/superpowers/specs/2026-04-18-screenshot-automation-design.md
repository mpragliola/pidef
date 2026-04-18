# Screenshot Automation — Design Spec

**Date:** 2026-04-18

## Purpose

Generate committed reference screenshots of pidef's main app states for documentation purposes. Screenshots are committed to `docs/screenshots/` and updated by running a dedicated npm script manually or via CI.

## Fixture PDF

`docs/fixtures/bach-cello-suite-1-bwv1007.pdf` — Bach Cello Suite No. 1 in G major (BWV 1007), sourced from IMSLP. Public domain. Committed once; referenced by the script at a fixed relative path.

Source URL: https://imslp.eu/files/imglnks/euimg/e/e2/IMSLP480706-PMLP164349-bachNBAVI,2suiteI(G-Dur)BWV1007textI.pdf

## Output

`docs/screenshots/` — committed to the repo. Files are overwritten on each run. No subdirectories or versioning.

| Filename | State captured |
|---|---|
| `01-welcome.png` | App at startup, no file open (welcome screen) |
| `02-pdf-open.png` | PDF open, page 1, normal reading view |
| `03-half-mode.png` | Half-mode active, left half visible |
| `04-bookmarks-bar.png` | Bookmark bar in 1-line mode, one bookmark added |
| `05-bookmarks-overlay.png` | Bookmark overlay open |
| `06-fullscreen.png` | Fullscreen mode, PDF visible |
| `07-rotated-90.png` | UI rotated 90° CW, PDF visible |
| `08-recent-files.png` | Recent files menu open |

Window size: 1280×800 for all shots except fullscreen (uses actual screen bounds).

## Script

**File:** `scripts/take-screenshots.ts`

Standalone TypeScript script. Not a Playwright test file — no `test()` wrappers, no assertions. Uses `@playwright/test`'s `_electron` launcher directly (same package already installed).

**Run with:** `npm run screenshots` → added to `package.json` as `"screenshots": "tsx scripts/take-screenshots.ts"`. Uses `tsx` (added as dev dep if not present) for zero-config TS execution without a separate tsconfig step.

### Execution flow

1. Resolve `FIXTURE_PDF` and `OUT_DIR` paths relative to project root.
2. `fs.mkdirSync(OUT_DIR, { recursive: true })`.
3. **Instance 1** — no args, 1280×800:
   - Wait for `#welcome-screen` visible.
   - Screenshot → `01-welcome.png`.
   - Close.
4. **Instance 2** — PDF path as CLI arg, 1280×800:
   - Wait for `#nav-label` to match `/Page \d+ \/ \d+/` (PDF loaded).
   - Screenshot → `02-pdf-open.png`.
   - Click half-mode button → wait 400ms → screenshot → `03-half-mode.png`.
   - Exit half-mode. Add bookmark via `#btn-add-bookmark`. Toggle bookmark bar to 1-line mode → screenshot → `04-bookmarks-bar.png`.
   - Open bookmark overlay → screenshot → `05-bookmarks-overlay.png`. Close overlay.
   - `setFullScreen(true)` via `app.evaluate` → wait for fullscreen confirmed → screenshot → `06-fullscreen.png`. Exit fullscreen.
   - Click rotation button once (→ 90°) → wait 400ms → screenshot → `07-rotated-90.png`.
   - Close.
5. **Instance 3** — no args, 1280×800:
   - Open PDF via `send('open-file', FIXTURE_PDF)` IPC (populates recent files history).
   - Close and relaunch (Instance 4) — no args.
   - Open recent files menu (button `#btn-recent-files`, exact ID to confirm during implementation) → screenshot → `08-recent-files.png`.
   - Close.

Each screenshot is preceded by a 400ms wait to let animations (220ms slide + buffer) settle.

### State-driving patterns

Uses the same IPC and selector patterns as the existing e2e specs:
- Open file: `app.evaluate(({ BrowserWindow }, p) => BrowserWindow.getAllWindows()[0].webContents.send('open-file', p), filePath)`
- Fullscreen: `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true))`
- Clicks/keyboard: `page.click('#selector')`, `page.keyboard.press('...')`

## CI Workflow

**File:** `.github/workflows/screenshots.yml`

Triggers:
- Push to `master`
- Manual `workflow_dispatch`

Steps:
1. `actions/checkout@v4` with `persist-credentials: true` (default token has write access)
2. `actions/setup-node@v4` with Node 18
3. `npm ci`
4. Install Playwright Electron deps: `npx playwright install --with-deps chromium`
5. `npm run build`
6. `xvfb-run --auto-servernum npm run screenshots` (required for headless Linux CI)
7. Commit `docs/screenshots/` if changed:
   ```
   git config user.name "github-actions[bot]"
   git config user.email "github-actions[bot]@users.noreply.github.com"
   git add docs/screenshots/
   git diff --cached --quiet || git commit -m "chore: update screenshots" && git push
   ```

The `|| true` guard ensures the workflow doesn't fail when there are no changes.

## Files changed

| File | Change |
|---|---|
| `docs/fixtures/bach-cello-suite-1-bwv1007.pdf` | New — Bach score fixture (committed manually by developer) |
| `docs/screenshots/*.png` | New — generated output (8 files) |
| `scripts/take-screenshots.ts` | New — screenshot script |
| `package.json` | Add `"screenshots"` script; add `tsx` to devDependencies if absent |
| `.github/workflows/screenshots.yml` | New — CI workflow |
| `.gitignore` | No change needed (docs/ is tracked) |

## Notes

- The fixture PDF must be committed before the script or CI can run.
- The script is idempotent: rerunning it overwrites existing screenshots.
- Recent-files state persists in Electron's userData. On CI, each run starts with a clean userData dir, so Instance 3/4 pattern is required to populate history before capturing the recent-files shot. On Linux CI, `xvfb-run` may be needed — the workflow should wrap the screenshot command with it if running headlessly.
