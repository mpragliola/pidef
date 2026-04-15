# Tests & CI/CD Design

**Date:** 2026-04-15  
**Scope:** Add Vitest unit tests, Playwright E2E tests, and GitHub Actions CI to the pidef Electron PDF reader.

---

## 1. Goals

- Unit-test the pure Node.js logic in the main process (recent-files management)
- E2E-test the real Electron app: launch, PDF navigation, fullscreen, filter toggles
- Gate every push/PR on build, typecheck, unit tests, and E2E tests via GitHub Actions

---

## 2. New dependencies

| Package | Type | Purpose |
|---|---|---|
| `vitest` | devDependency | Unit test runner |
| `@playwright/test` | devDependency | E2E runner with built-in Electron support |
| `pdf-lib` | devDependency | Programmatic PDF generation for test fixtures |

---

## 3. Project structure

```
src/
  recent-files.ts          # extracted: FileRecord, pure file-management functions
  main.ts                  # imports from recent-files.ts (no logic change)
  preload.ts               # unchanged
  renderer.ts              # unchanged
tests/
  unit/
    recent-files.test.ts   # Vitest unit tests for recent-files.ts
  e2e/
    fixtures/
      generate-pdf.ts      # creates a 3-page PDF via pdf-lib at a temp path
    app.spec.ts            # smoke: launch, welcome screen, title
    navigation.spec.ts     # open PDF, page label, next/prev/first/last, keyboard
    fullscreen.spec.ts     # F11 enters fullscreen, Escape exits
    filters.spec.ts        # sepia/invert/sharpen button active-class toggling
.github/
  workflows/
    ci.yml                 # build → typecheck → unit → e2e
```

---

## 4. Refactor: extract `src/recent-files.ts`

Move the following out of `main.ts` into `src/recent-files.ts`:

- `FileRecord` interface
- `RECENT_FILES_MAX` constant
- `getRecentFilesPath()` — uses `app.getPath('userData')` from Electron; accept an override parameter for testability
- `loadRecentFiles(dir?: string)`
- `saveRecentFiles(files, dir?: string)`
- `addRecentFile(filePath, page, dir?: string)`
- `updateFilePage(filePath, page, dir?: string)`

The `dir` override parameter allows unit tests to redirect I/O to a temp directory without mocking `app`. `main.ts` calls all functions without the override (default behaviour unchanged).

---

## 5. Unit tests (`tests/unit/recent-files.test.ts`)

Runner: Vitest. Each test gets a fresh temp directory; cleaned up in `afterEach`.

| Test | Assertion |
|---|---|
| `loadRecentFiles` — no file | returns `[]` |
| `loadRecentFiles` — old `string[]` format | migrates each string to `{ path, page: 0 }` |
| `loadRecentFiles` — current `FileRecord[]` format | returns records accurately |
| `addRecentFile` — new entry | appears at index 0 |
| `addRecentFile` — duplicate path | deduped, moved to front |
| `addRecentFile` — 11th entry | list trimmed to 10 |
| `updateFilePage` — known path | page number updated, persisted |
| `updateFilePage` — unknown path | list unchanged |

---

## 6. E2E tests

Runner: `@playwright/test` with `_electron.launch({ args: ['dist/main.js'] })`.

Each spec file launches and closes its own app instance via `beforeEach`/`afterEach`.

### `app.spec.ts`
- App launches without throwing
- `#welcome-screen` is visible
- Window title is `"pidef"`

### `navigation.spec.ts`
- Send IPC `open-file` with a generated 3-page PDF path
- `#page-label` reads `"Page 1 / 3"`
- Click `#btn-next` → `"Page 2 / 3"`
- Click `#btn-prev` → `"Page 1 / 3"`
- Click `#btn-last` → `"Page 3 / 3"`
- Click `#btn-first` → `"Page 1 / 3"`
- Press `ArrowRight` → `"Page 2 / 3"`
- Press `ArrowLeft` → `"Page 1 / 3"`

### `fullscreen.spec.ts`
- Press `F11` → `electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())` returns `true`
- Press `Escape` → same call returns `false`

### `filters.spec.ts`
- Click `#btn-sepia` → element has class `active`
- Click `#btn-sepia` again → class `active` removed
- Same pattern for `#btn-invert` and `#btn-sharpen`

### Fixture: `generate-pdf.ts`
Uses `pdf-lib` to create a minimal 3-page PDF at a temp file path. Returns the path. Caller is responsible for deleting it.

---

## 7. CI workflow (`.github/workflows/ci.yml`)

Trigger: `push` and `pull_request` on `master`.

```
build → typecheck → test-unit → test-e2e
```

All jobs run on `ubuntu-latest`, Node 20 (via `actions/setup-node@v4`).

| Job | Key steps |
|---|---|
| `build` | `npm ci` → `npm run build` → upload `dist/` artifact |
| `typecheck` | download artifact → `npx tsc --noEmit` |
| `test-unit` | download artifact → `npx vitest run` |
| `test-e2e` | download artifact → `sudo apt-get install -y xvfb libgbm-dev` → `npx playwright install-deps` → `npx playwright install chromium` → `xvfb-run npx playwright test` |

The `dist/` artifact is shared across jobs to avoid redundant TypeScript compilation.

---

## 8. Package.json scripts additions

```json
"test": "vitest run",
"test:unit": "vitest run tests/unit",
"test:e2e": "playwright test"
```

Vitest config lives in `vitest.config.ts`; Playwright config in `playwright.config.ts`.

---

## 9. Out of scope

- Coverage reporting / thresholds
- Linting (no ESLint currently configured)
- Deployment / release workflow
- Testing the brightness control (requires `brightnessctl` system binary)
