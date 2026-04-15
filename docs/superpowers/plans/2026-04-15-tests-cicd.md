# Tests & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **NOTE — npm constraint:** Per CLAUDE.md, do **not** run `npm build`, `npm test`, or any npm script yourself. For every "Ask user to run:" step, tell the user the exact command and wait for them to report the output before continuing.

**Goal:** Add Vitest unit tests for the main-process file-management logic, Playwright E2E tests for the full Electron app, and a GitHub Actions CI workflow that gates every push on build + typecheck + unit + E2E.

**Architecture:** Pure file-management functions are extracted from `src/main.ts` into `src/recent-files.ts` so they can be imported in unit tests without pulling in Electron. E2E tests use Playwright's built-in `_electron.launch()` to spin up the real app, send IPC messages, and assert on DOM state.

**Tech Stack:** Vitest (unit), @playwright/test with Electron (E2E), pdf-lib (test fixture), GitHub Actions (CI)

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/recent-files.ts` | Exported pure functions: load/save/add/update recent files |
| Modify | `src/main.ts` | Import from recent-files.ts; remove extracted code; pass dataDir to all calls |
| Create | `vitest.config.ts` | Vitest config targeting `tests/unit/` |
| Create | `playwright.config.ts` | Playwright config targeting `tests/e2e/` |
| Modify | `package.json` | Add devDependencies + test scripts |
| Create | `tests/unit/recent-files.test.ts` | Vitest unit tests for recent-files.ts |
| Create | `tests/e2e/fixtures/generate-pdf.ts` | Generates a temp multi-page PDF via pdf-lib |
| Create | `tests/e2e/app.spec.ts` | Smoke: launch, welcome screen, title |
| Create | `tests/e2e/navigation.spec.ts` | Open PDF, page label, next/prev/first/last, keyboard |
| Create | `tests/e2e/fullscreen.spec.ts` | F11 enters fullscreen, Escape exits |
| Create | `tests/e2e/filters.spec.ts` | Sepia / invert / sharpen button active-class toggle |
| Create | `.github/workflows/ci.yml` | build → typecheck → unit → e2e jobs |

---

## Task 1: Add dev dependencies and config files

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Update package.json**

Replace the `devDependencies` and `scripts` sections with:

```json
{
  "name": "pidef",
  "version": "1.0.0",
  "description": "Minimal PDF reader with touchscreen swipe navigation",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc && sass src/styles.scss dist/styles.css && cp src/index.html dist/index.html",
    "start": "npm run build && electron dist/main.js",
    "dev": "npm run build && electron dist/main.js",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "electron": "^35.0.0",
    "pdfjs-dist": "^3.11.174"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "pdf-lib": "^1.17.1",
    "sass": "^1.87.0",
    "typescript": "^5.8.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Create playwright.config.ts**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
});
```

- [ ] **Step 4: Ask user to install dependencies**

Ask user to run: `npm install`

Expected: packages install with no errors; `node_modules/vitest`, `node_modules/@playwright`, `node_modules/pdf-lib` appear.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts playwright.config.ts
git commit -m "chore: add vitest, playwright, pdf-lib dev dependencies"
```

---

## Task 2: Create src/recent-files.ts

**Files:**
- Create: `src/recent-files.ts`

This extracts the pure file-management logic from `main.ts` into a module with no Electron dependency, making it unit-testable.

- [ ] **Step 1: Create src/recent-files.ts**

```typescript
import * as fs from "fs";
import * as path from "path";

export interface FileRecord {
  path: string;
  page: number;
}

export const RECENT_FILES_MAX = 10;

function recentFilesPath(dataDir: string): string {
  return path.join(dataDir, "recent-files.json");
}

export function loadRecentFiles(dataDir: string): FileRecord[] {
  try {
    const filePath = recentFilesPath(dataDir);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const files = JSON.parse(data);
      if (Array.isArray(files)) {
        return files.map((f) =>
          typeof f === "string" ? { path: f, page: 0 } : f
        );
      }
    }
  } catch (err) {
    console.error("Failed to load recent files:", err);
  }
  return [];
}

export function saveRecentFiles(files: FileRecord[], dataDir: string): void {
  try {
    const filePath = recentFilesPath(dataDir);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(files, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save recent files:", err);
  }
}

export function addRecentFile(
  filePath: string,
  dataDir: string,
  page: number = 0
): void {
  let files = loadRecentFiles(dataDir);
  files = files.filter((f) => f.path !== filePath);
  files.unshift({ path: filePath, page });
  files = files.slice(0, RECENT_FILES_MAX);
  saveRecentFiles(files, dataDir);
}

export function updateFilePage(
  filePath: string,
  page: number,
  dataDir: string
): void {
  let files = loadRecentFiles(dataDir);
  const file = files.find((f) => f.path === filePath);
  if (file) {
    file.page = page;
    saveRecentFiles(files, dataDir);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/recent-files.ts
git commit -m "refactor: extract recent-files logic into src/recent-files.ts"
```

---

## Task 3: Update src/main.ts to use recent-files.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace the top of main.ts**

Replace lines 1–5 (the imports):

```typescript
import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import {
  FileRecord,
  loadRecentFiles,
  addRecentFile,
  updateFilePage,
} from "./recent-files";
```

- [ ] **Step 2: Remove extracted definitions**

Delete the following from main.ts (they now live in recent-files.ts):
- `const RECENT_FILES_MAX = 10;`
- `interface FileRecord { ... }`
- `function getRecentFilesPath(): string { ... }`
- `function loadRecentFiles(): FileRecord[] { ... }`
- `function saveRecentFiles(files: FileRecord[]): void { ... }`
- `function addRecentFile(filePath: string, page: number = 0): void { ... }`
- `function updateFilePage(filePath: string, page: number): void { ... }`

- [ ] **Step 3: Update the four call sites to pass app.getPath("userData")**

In `openFileDialog` (around line 153 in the original):
```typescript
// Change:
addRecentFile(filePath);
// To:
addRecentFile(filePath, app.getPath("userData"));
```

In `ipcMain.handle("get-recent-files", ...)`:
```typescript
ipcMain.handle("get-recent-files", () => {
  return loadRecentFiles(app.getPath("userData"));
});
```

In `ipcMain.handle("add-recent-file", ...)`:
```typescript
ipcMain.handle("add-recent-file", (_event, filePath: string, page?: number) => {
  addRecentFile(filePath, app.getPath("userData"), page ?? 0);
});
```

In `ipcMain.handle("update-file-page", ...)`:
```typescript
ipcMain.handle("update-file-page", (_event, filePath: string, page: number) => {
  updateFilePage(filePath, page, app.getPath("userData"));
});
```

- [ ] **Step 4: Ask user to verify the build still compiles**

Ask user to run: `npm run build`

Expected: exits 0, `dist/main.js` and `dist/preload.js` are present.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "refactor: wire main.ts to use recent-files module"
```

---

## Task 4: Unit tests for recent-files.ts

**Files:**
- Create: `tests/unit/recent-files.test.ts`

- [ ] **Step 1: Create tests/unit/recent-files.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FileRecord,
  RECENT_FILES_MAX,
  loadRecentFiles,
  addRecentFile,
  updateFilePage,
} from '../../src/recent-files';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadRecentFiles', () => {
  it('returns [] when no file exists', () => {
    const result = loadRecentFiles(tmpDir);
    expect(result).toEqual([]);
  });

  it('migrates old string[] format to FileRecord[]', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'recent-files.json'),
      JSON.stringify(['/a/b.pdf', '/c/d.pdf'])
    );
    const result = loadRecentFiles(tmpDir);
    expect(result).toEqual([
      { path: '/a/b.pdf', page: 0 },
      { path: '/c/d.pdf', page: 0 },
    ]);
  });

  it('reads current FileRecord[] format correctly', () => {
    const records: FileRecord[] = [
      { path: '/a/b.pdf', page: 3 },
      { path: '/c/d.pdf', page: 7 },
    ];
    fs.writeFileSync(
      path.join(tmpDir, 'recent-files.json'),
      JSON.stringify(records)
    );
    expect(loadRecentFiles(tmpDir)).toEqual(records);
  });
});

describe('addRecentFile', () => {
  it('adds a new entry at the front', () => {
    addRecentFile('/a/b.pdf', tmpDir, 0);
    const result = loadRecentFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ path: '/a/b.pdf', page: 0 });
  });

  it('deduplicates: moves an existing path to the front', () => {
    addRecentFile('/a/b.pdf', tmpDir, 0);
    addRecentFile('/c/d.pdf', tmpDir, 2);
    addRecentFile('/a/b.pdf', tmpDir, 5);
    const result = loadRecentFiles(tmpDir);
    expect(result[0]).toEqual({ path: '/a/b.pdf', page: 5 });
    expect(result.filter((f) => f.path === '/a/b.pdf')).toHaveLength(1);
  });

  it('trims list to RECENT_FILES_MAX entries', () => {
    for (let i = 0; i <= RECENT_FILES_MAX; i++) {
      addRecentFile(`/file${i}.pdf`, tmpDir, 0);
    }
    expect(loadRecentFiles(tmpDir)).toHaveLength(RECENT_FILES_MAX);
  });
});

describe('updateFilePage', () => {
  it('updates the page number for a known path', () => {
    addRecentFile('/a/b.pdf', tmpDir, 0);
    updateFilePage('/a/b.pdf', 42, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result.find((f) => f.path === '/a/b.pdf')?.page).toBe(42);
  });

  it('is a no-op for an unknown path', () => {
    addRecentFile('/a/b.pdf', tmpDir, 0);
    updateFilePage('/unknown.pdf', 99, tmpDir);
    const result = loadRecentFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/a/b.pdf');
  });
});
```

- [ ] **Step 2: Ask user to run unit tests**

Ask user to run: `npm run test:unit`

Expected output:
```
✓ tests/unit/recent-files.test.ts (8)
  ✓ loadRecentFiles > returns [] when no file exists
  ✓ loadRecentFiles > migrates old string[] format to FileRecord[]
  ✓ loadRecentFiles > reads current FileRecord[] format correctly
  ✓ addRecentFile > adds a new entry at the front
  ✓ addRecentFile > deduplicates: moves an existing path to the front
  ✓ addRecentFile > trims list to RECENT_FILES_MAX entries
  ✓ updateFilePage > updates the page number for a known path
  ✓ updateFilePage > is a no-op for an unknown path

Test Files  1 passed (1)
Tests       8 passed (8)
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/recent-files.test.ts
git commit -m "test: add unit tests for recent-files module"
```

---

## Task 5: E2E PDF fixture

**Files:**
- Create: `tests/e2e/fixtures/generate-pdf.ts`

- [ ] **Step 1: Create tests/e2e/fixtures/generate-pdf.ts**

```typescript
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Generates a minimal PDF with `pageCount` blank A4 pages,
 * writes it to a temp file, and returns the file path.
 * Caller is responsible for deleting the file when done.
 */
export async function generateTestPdf(pageCount: number = 3): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([595, 842]); // A4 portrait
  }
  const pdfBytes = await pdfDoc.save();
  const tmpPath = path.join(
    os.tmpdir(),
    `pidef-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );
  fs.writeFileSync(tmpPath, pdfBytes);
  return tmpPath;
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/fixtures/generate-pdf.ts
git commit -m "test: add E2E PDF fixture generator"
```

---

## Task 6: E2E smoke tests

**Files:**
- Create: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Create tests/e2e/app.spec.ts**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('App smoke', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('launches without crashing', async () => {
    expect(app).toBeTruthy();
  });

  test('welcome screen is visible on startup', async () => {
    await expect(window.locator('#welcome-screen')).toBeVisible();
  });

  test('window title is pidef', async () => {
    await expect(window).toHaveTitle('pidef');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/app.spec.ts
git commit -m "test: add E2E smoke tests"
```

---

## Task 7: E2E navigation tests

**Files:**
- Create: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Create tests/e2e/navigation.spec.ts**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { generateTestPdf } from './fixtures/generate-pdf';

test.describe('Navigation', () => {
  let app: ElectronApplication;
  let window: Page;
  let pdfPath: string;

  test.beforeEach(async () => {
    pdfPath = await generateTestPdf(3);
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Open the PDF by sending the IPC message from the main process
    await app.evaluate(({ BrowserWindow }, filePath) => {
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', filePath);
    }, pdfPath);

    // Wait for the PDF to finish loading
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3', {
      timeout: 15000,
    });
  });

  test.afterEach(async () => {
    await app.close();
    fs.unlinkSync(pdfPath);
  });

  test('page label shows page 1 of 3 after opening', async () => {
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('next button advances to page 2', async () => {
    await window.click('#btn-next');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
  });

  test('prev button goes back to page 1', async () => {
    await window.click('#btn-next');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
    await window.click('#btn-prev');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('last button jumps to final page', async () => {
    await window.click('#btn-last');
    await expect(window.locator('#page-label')).toHaveText('Page 3 / 3');
  });

  test('first button returns to page 1', async () => {
    await window.click('#btn-last');
    await expect(window.locator('#page-label')).toHaveText('Page 3 / 3');
    await window.click('#btn-first');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });

  test('ArrowRight key advances page', async () => {
    await window.keyboard.press('ArrowRight');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
  });

  test('ArrowLeft key goes back a page', async () => {
    await window.keyboard.press('ArrowRight');
    await expect(window.locator('#page-label')).toHaveText('Page 2 / 3');
    await window.keyboard.press('ArrowLeft');
    await expect(window.locator('#page-label')).toHaveText('Page 1 / 3');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/navigation.spec.ts
git commit -m "test: add E2E navigation tests"
```

---

## Task 8: E2E fullscreen tests

**Files:**
- Create: `tests/e2e/fullscreen.spec.ts`

- [ ] **Step 1: Create tests/e2e/fullscreen.spec.ts**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Fullscreen', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    // Ensure we exit fullscreen before closing so the window tears down cleanly
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win.isFullScreen()) win.setFullScreen(false);
    });
    await app.close();
  });

  test('F11 enters fullscreen', async () => {
    await window.keyboard.press('F11');
    // Give the IPC round-trip and OS fullscreen animation time to complete
    await window.waitForTimeout(1000);
    const isFullscreen = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen()
    );
    expect(isFullscreen).toBe(true);
  });

  test('Escape exits fullscreen', async () => {
    await window.keyboard.press('F11');
    await window.waitForTimeout(1000);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(1000);
    const isFullscreen = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isFullScreen()
    );
    expect(isFullscreen).toBe(false);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/fullscreen.spec.ts
git commit -m "test: add E2E fullscreen tests"
```

---

## Task 9: E2E filter toggle tests

**Files:**
- Create: `tests/e2e/filters.spec.ts`

- [ ] **Step 1: Create tests/e2e/filters.spec.ts**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

test.describe('Filters', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: [path.resolve('dist/main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('sepia button gains active class on click', async () => {
    await window.click('#btn-sepia');
    await expect(window.locator('#btn-sepia')).toHaveClass(/active/);
  });

  test('sepia button loses active class on second click', async () => {
    await window.click('#btn-sepia');
    await window.click('#btn-sepia');
    await expect(window.locator('#btn-sepia')).not.toHaveClass(/active/);
  });

  test('invert button gains active class on click', async () => {
    await window.click('#btn-invert');
    await expect(window.locator('#btn-invert')).toHaveClass(/active/);
  });

  test('invert button loses active class on second click', async () => {
    await window.click('#btn-invert');
    await window.click('#btn-invert');
    await expect(window.locator('#btn-invert')).not.toHaveClass(/active/);
  });

  test('sharpen button gains active class on click', async () => {
    await window.click('#btn-sharpen');
    await expect(window.locator('#btn-sharpen')).toHaveClass(/active/);
  });

  test('sharpen button loses active class on second click', async () => {
    await window.click('#btn-sharpen');
    await window.click('#btn-sharpen');
    await expect(window.locator('#btn-sharpen')).not.toHaveClass(/active/);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/filters.spec.ts
git commit -m "test: add E2E filter toggle tests"
```

---

## Task 10: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit

  test-e2e:
    needs: [build, test-unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - name: Install system dependencies for Electron
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            xvfb \
            libgbm-dev \
            libnss3 \
            libatk-bridge2.0-0 \
            libdrm2 \
            libxkbcommon0 \
            libgtk-3-0 \
            libxss1 \
            libasound2
      - name: Run E2E tests
        run: xvfb-run --auto-servernum npm run test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (build, typecheck, unit, e2e)"
```

---

## Final verification

- [ ] **Ask user to run the full E2E suite locally** (requires the app to be built first):

Ask user to run: `npm run build && npm run test:e2e`

Expected: all specs in `tests/e2e/` pass.

- [ ] **Ask user to run all tests together**:

Ask user to run: `npm run test:unit`

Expected: 8 unit tests pass.

- [ ] **Push branch and confirm CI goes green on GitHub Actions**
