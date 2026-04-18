# Screenshot Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `npm run screenshots` script that boots Electron via Playwright, drives the app through 8 documented states, and saves PNGs to `docs/screenshots/`; plus a CI workflow that runs it on push to master.

**Architecture:** A standalone `scripts/take-screenshots.ts` TypeScript script uses `@playwright/test`'s `_electron` launcher (already installed) to boot multiple Electron instances sequentially. Each instance is driven to a specific app state before a screenshot is taken. The script is completely separate from the test suite. A GitHub Actions workflow runs it headlessly with `xvfb-run` and commits any changed screenshots back to master.

**Tech Stack:** TypeScript, `tsx` (zero-config TS runner), `@playwright/test` (`_electron` API), Electron IPC patterns from existing e2e specs, GitHub Actions.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/fixtures/bach-cello-suite-1-bwv1007.pdf` | Add (manual) | Fixture PDF — developer downloads before running |
| `docs/screenshots/*.png` | Generate | 8 output screenshots |
| `scripts/take-screenshots.ts` | Create | Screenshot script |
| `package.json` | Modify | Add `screenshots` script + `tsx` devDep |
| `.github/workflows/screenshots.yml` | Create | CI workflow |

---

## Task 1: Commit the fixture PDF

**Files:**
- Add: `docs/fixtures/bach-cello-suite-1-bwv1007.pdf`

> The PDF has already been downloaded to `docs/fixtures/bach-cello-suite-1-bwv1007.pdf` (450KB, public domain from IMSLP).

- [ ] **Step 1: Verify the file exists**

```bash
file docs/fixtures/bach-cello-suite-1-bwv1007.pdf
ls -lh docs/fixtures/bach-cello-suite-1-bwv1007.pdf
```

Expected: `PDF document, version 1.7`, ~450KB.

- [ ] **Step 2: Commit**

```bash
git add docs/fixtures/bach-cello-suite-1-bwv1007.pdf
git commit -m "chore: add Bach BWV1007 score as screenshot fixture (public domain)"
```

---

## Task 2: Add `tsx` and the `screenshots` npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install tsx as a dev dependency**

```bash
npm install --save-dev tsx
```

- [ ] **Step 2: Add the `screenshots` script to `package.json`**

In `package.json`, inside `"scripts"`, add after the `"test:e2e"` line:

```json
"screenshots": "tsx scripts/take-screenshots.ts"
```

The scripts block should now look like:

```json
"scripts": {
  "build": "tsc --project tsconfig.main.json && vite build",
  "build:main": "tsc --project tsconfig.main.json",
  "build:renderer": "vite build",
  "start": "npm run build && electron dist/main.js",
  "dev": "npm run build && electron dist/main.js",
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:e2e": "playwright test",
  "screenshots": "tsx scripts/take-screenshots.ts"
},
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tsx and screenshots npm script"
```

---

## Task 3: Write the screenshot script

**Files:**
- Create: `scripts/take-screenshots.ts`

- [ ] **Step 1: Create the scripts directory**

```bash
mkdir -p scripts docs/screenshots
```

- [ ] **Step 2: Write the script**

Create `scripts/take-screenshots.ts` with the following content:

```typescript
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PDF = path.join(ROOT, 'docs/fixtures/bach-cello-suite-1-bwv1007.pdf');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const DIST_MAIN = path.join(ROOT, 'dist/main.js');
const SETTLE_MS = 400;

fs.mkdirSync(OUT_DIR, { recursive: true });

async function launch(args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [DIST_MAIN, ...args] });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1280, 800);
  });
  return { app, page };
}

async function openPdf(app: ElectronApplication, page: Page, filePath: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, fp) => {
    BrowserWindow.getAllWindows()[0].webContents.send('open-file', fp);
  }, filePath);
  await page.waitForSelector('#nav-label', { timeout: 15000 });
  await page.waitForFunction(
    () => /Page \d+ \/ \d+/.test(document.querySelector('#nav-label')?.textContent ?? ''),
    { timeout: 15000 }
  );
}

async function shot(page: Page, filename: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(OUT_DIR, filename) });
  console.log(`  ✓ ${filename}`);
}

async function captureWelcome(): Promise<void> {
  console.log('Instance 1: welcome screen');
  const { app, page } = await launch();
  await page.waitForSelector('#welcome-screen', { timeout: 10000 });
  await shot(page, '01-welcome.png');
  await app.close();
}

async function capturePdfStates(): Promise<void> {
  console.log('Instance 2: PDF states');
  const { app, page } = await launch([FIXTURE_PDF]);
  await page.waitForFunction(
    () => /Page \d+ \/ \d+/.test(document.querySelector('#nav-label')?.textContent ?? ''),
    { timeout: 15000 }
  );

  // 02 — normal PDF view
  await shot(page, '02-pdf-open.png');

  // 03 — half-mode (left half)
  await page.click('#btn-half');
  await shot(page, '03-half-mode.png');
  // Exit half-mode
  await page.click('#btn-half');
  await page.waitForTimeout(SETTLE_MS);

  // 04 — bookmark bar with one bookmark
  await page.click('#btn-add-bookmark');
  await page.waitForTimeout(200);
  await page.click('#btn-toggle-bookmarks-nav'); // cycle to 1-line mode
  await shot(page, '04-bookmarks-bar.png');

  // 05 — bookmark overlay open
  // Open overlay: click the bookmark toggle button twice more (1-line → all → back? No:
  // cycle is hidden→1-line→all→hidden. We're at 1-line. Click once more → all mode.
  // Overlay is separate: look for bookmark overlay button in BookmarkBar.
  // From BookmarkBar.tsx: there is a "show overlay" button inside the bar.
  // Click the overlay-open button (id: btn-open-bookmark-overlay, confirmed below).
  await page.click('#btn-open-bookmark-overlay');
  await shot(page, '05-bookmarks-overlay.png');
  // Close overlay
  await page.click('#bookmark-overlay-backdrop');
  await page.waitForTimeout(SETTLE_MS);

  // 06 — fullscreen
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await page.waitForFunction(
    () => document.body.classList.contains('fullscreen') ||
          window.outerHeight === window.screen.height,
    { timeout: 10000 }
  );
  await shot(page, '06-fullscreen.png');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await page.waitForTimeout(1000);

  // 07 — rotated 90° CW
  await page.click('#btn-rotate-cw');
  await shot(page, '07-rotated-90.png');
  // Restore rotation
  await page.click('#btn-rotate-ccw');

  await app.close();
}

async function captureRecentFiles(): Promise<void> {
  console.log('Instance 3: populate recent files history');
  const { app } = await launch();
  await openPdf(app, await app.firstWindow(), FIXTURE_PDF);
  await app.close();

  console.log('Instance 4: recent files on welcome screen');
  const { app: app2, page: page2 } = await launch();
  await page2.waitForSelector('#welcome-screen', { timeout: 10000 });
  await page2.waitForSelector('#recent-files-list li', { timeout: 10000 });
  await shot(page2, '08-recent-files.png');
  await app2.close();
}

(async () => {
  console.log('Taking screenshots...');
  await captureWelcome();
  await capturePdfStates();
  await captureRecentFiles();
  console.log(`Done. Screenshots saved to docs/screenshots/`);
})();
```

- [ ] **Step 3: Verify the btn-open-bookmark-overlay ID exists in the codebase**

```bash
grep -rn "btn-open-bookmark-overlay\|overlay.*button\|btn.*overlay" src/components/BookmarkBar.tsx
```

If the ID doesn't exist, find the actual button that opens the overlay:

```bash
grep -n "overlay\|Overlay" src/components/BookmarkBar.tsx | head -20
```

Update the `page.click('#btn-open-bookmark-overlay')` call in the script to use the correct selector.

- [ ] **Step 4: Commit**

```bash
git add scripts/take-screenshots.ts docs/screenshots/.gitkeep 2>/dev/null; \
git add scripts/take-screenshots.ts
git commit -m "feat: add take-screenshots script"
```

---

## Task 4: Smoke-test the script locally

**Files:** (none changed — this is a verification step)

- [ ] **Step 1: Ensure a fresh build exists**

Ask the user to run:
```bash
npm run build
```

- [ ] **Step 2: Run the script**

Ask the user to run:
```bash
npm run screenshots
```

Expected output:
```
Taking screenshots...
Instance 1: welcome screen
  ✓ 01-welcome.png
Instance 2: PDF states
  ✓ 02-pdf-open.png
  ✓ 03-half-mode.png
  ✓ 04-bookmarks-bar.png
  ✓ 05-bookmarks-overlay.png
  ✓ 06-fullscreen.png
  ✓ 07-rotated-90.png
Instance 3: populate recent files history
Instance 4: recent files on welcome screen
  ✓ 08-recent-files.png
Done. Screenshots saved to docs/screenshots/
```

- [ ] **Step 3: Verify the files**

```bash
ls -lh docs/screenshots/
```

Expected: 8 PNG files, each > 10KB.

- [ ] **Step 4: Visually review**

Open each PNG and confirm it shows the expected state. Fix any issues in `scripts/take-screenshots.ts` (wrong selector, wrong wait, etc.) and re-run.

- [ ] **Step 5: Commit the generated screenshots**

```bash
git add docs/screenshots/
git commit -m "chore: add initial reference screenshots"
```

---

## Task 5: Add `.gitkeep` and document the fixture requirement

**Files:**
- Modify: `README.md` (if it exists) or skip

- [ ] **Step 1: Check if README mentions running the app**

```bash
head -50 README.md 2>/dev/null || echo "no README"
```

If there is a README with a "Running" section, add a note about screenshots. If there's no README, skip this step.

- [ ] **Step 2: Add screenshots section to README (if README exists)**

Find the "Running" or "Development" section and add after it:

```markdown
## Screenshots

Reference screenshots are stored in `docs/screenshots/`. To regenerate them:

```bash
npm run build
npm run screenshots  # or: xvfb-run npm run screenshots on headless Linux
```

The fixture PDF (`docs/fixtures/bach-cello-suite-1-bwv1007.pdf`) must exist before running. It is committed to the repository.
```

- [ ] **Step 3: Commit if README was changed**

```bash
git add README.md
git commit -m "docs: document screenshot generation command"
```

---

## Task 6: Add the CI workflow

**Files:**
- Create: `.github/workflows/screenshots.yml`

- [ ] **Step 1: Create the workflows directory if needed**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `.github/workflows/screenshots.yml`:

```yaml
name: Update Screenshots

on:
  push:
    branches: [master]
  workflow_dispatch:

jobs:
  screenshots:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright deps
        run: npx playwright install --with-deps chromium

      - name: Install xvfb
        run: sudo apt-get install -y xvfb

      - name: Build
        run: npm run build

      - name: Take screenshots
        run: xvfb-run --auto-servernum npm run screenshots

      - name: Commit screenshots
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/screenshots/
          git diff --cached --quiet || (git commit -m "chore: update screenshots [skip ci]" && git push)
```

The `[skip ci]` tag prevents the commit from triggering another screenshots run.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/screenshots.yml
git commit -m "ci: add screenshots workflow"
```

---

## Self-Review

**Spec coverage:**
- ✅ Fixture PDF at `docs/fixtures/` — Task 1
- ✅ Output to `docs/screenshots/` — Task 3
- ✅ 8 screenshots (01–08) — Task 3 (`capturePdfStates`, `captureWelcome`, `captureRecentFiles`)
- ✅ `npm run screenshots` script — Task 2
- ✅ `tsx` as runner — Task 2
- ✅ CI workflow on push to master + `workflow_dispatch` — Task 6
- ✅ `xvfb-run` in CI — Task 6
- ✅ Commits back to master only when changed — Task 6 (`git diff --cached --quiet` guard)
- ✅ Window size 1280×800 — not explicitly set in `launch()`. **Gap:** Playwright's `_electron` launcher doesn't directly set window size; the Electron `BrowserWindow` is sized by `main.ts`. Check `main.ts` for default window size and whether it needs overriding.

**Placeholder scan:** No TBDs. Step 3 of Task 3 explicitly handles the uncertain `btn-open-bookmark-overlay` selector with a verification command and fallback instruction.

**Type consistency:** `ElectronApplication`, `Page` used consistently throughout. `launch()` returns `{ app, page }` and all call sites destructure it consistently.
