# Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named bookmarks to PDFs, stored in a companion `.json` file, accessible via a wrapping pill bar below the canvas with in-app create/delete and a visibility toggle.

**Architecture:** A pure Node.js module (`src/bookmarks.ts`) handles companion file I/O; two IPC channels expose it to the renderer; `renderer.ts` owns the in-memory bookmark state and renders/manages a `#bookmark-bar` DOM element inserted between the canvas container and the nav bar.

**Tech Stack:** TypeScript, Electron IPC (`ipcMain`/`ipcRenderer`), Vitest (unit tests), SCSS.

---

## File Map

| File | Change |
|------|--------|
| `src/bookmarks.ts` | **Create** — `Bookmark` type, `readBookmarks`, `writeBookmarks` |
| `tests/unit/bookmarks.test.ts` | **Create** — unit tests for the above |
| `src/main.ts` | **Modify** — add two `ipcMain.handle` calls |
| `src/preload.ts` | **Modify** — extend `PidefAPI` interface + `window.pidef` object |
| `src/index.html` | **Modify** — add `#bookmark-bar` and `#btn-toggle-bookmarks` |
| `src/styles.scss` | **Modify** — style the bookmark bar and pills |
| `src/renderer.ts` | **Modify** — types, state, load/clear, render, add, remove, toggle |

---

## Task 1: Pure bookmark module + unit tests

**Files:**
- Create: `src/bookmarks.ts`
- Create: `tests/unit/bookmarks.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/bookmarks.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBookmarks, writeBookmarks, Bookmark } from '../../src/bookmarks';

let tmpDir: string;
let pdfPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pidef-bookmarks-test-'));
  pdfPath = path.join(tmpDir, 'test.pdf');
  fs.writeFileSync(pdfPath, '%PDF-1.4');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readBookmarks', () => {
  it('returns [] when companion file does not exist', () => {
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('returns [] when companion file is malformed JSON', () => {
    fs.writeFileSync(`${pdfPath}.json`, 'not json');
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('returns [] when bookmarks field is not an array', () => {
    fs.writeFileSync(`${pdfPath}.json`, JSON.stringify({ bookmarks: 'bad' }));
    expect(readBookmarks(pdfPath)).toEqual([]);
  });

  it('reads bookmarks and returns them sorted by page', () => {
    const raw: Bookmark[] = [
      { label: 'Chorus', page: 3 },
      { label: 'Intro', page: 0 },
    ];
    fs.writeFileSync(`${pdfPath}.json`, JSON.stringify({ bookmarks: raw }));
    expect(readBookmarks(pdfPath)).toEqual([
      { label: 'Intro', page: 0 },
      { label: 'Chorus', page: 3 },
    ]);
  });
});

describe('writeBookmarks', () => {
  it('writes bookmarks sorted by page', () => {
    const bookmarks: Bookmark[] = [
      { label: 'Bridge', page: 7 },
      { label: 'Intro', page: 1 },
    ];
    writeBookmarks(pdfPath, bookmarks);
    const raw = JSON.parse(fs.readFileSync(`${pdfPath}.json`, 'utf-8'));
    expect(raw.bookmarks).toEqual([
      { label: 'Intro', page: 1 },
      { label: 'Bridge', page: 7 },
    ]);
  });

  it('round-trips: write then read returns same bookmarks', () => {
    const bookmarks: Bookmark[] = [
      { label: 'Chorus', page: 4 },
      { label: 'Intro', page: 1 },
    ];
    writeBookmarks(pdfPath, bookmarks);
    expect(readBookmarks(pdfPath)).toEqual([
      { label: 'Intro', page: 1 },
      { label: 'Chorus', page: 4 },
    ]);
  });

  it('writes empty bookmarks array correctly', () => {
    writeBookmarks(pdfPath, []);
    expect(readBookmarks(pdfPath)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/bookmarks.test.ts
```
Expected: FAIL with "Cannot find module '../../src/bookmarks'"

- [ ] **Step 3: Implement bookmarks.ts**

`src/bookmarks.ts`:
```typescript
import * as fs from "fs";

export interface Bookmark {
  label: string;
  page: number; // 0-indexed
}

interface BookmarkFile {
  bookmarks: Bookmark[];
}

export function readBookmarks(pdfPath: string): Bookmark[] {
  const jsonPath = `${pdfPath}.json`;
  try {
    if (!fs.existsSync(jsonPath)) return [];
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as BookmarkFile;
    if (!Array.isArray(data.bookmarks)) return [];
    return data.bookmarks.slice().sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

export function writeBookmarks(pdfPath: string, bookmarks: Bookmark[]): void {
  const jsonPath = `${pdfPath}.json`;
  const tmpPath = `${jsonPath}.tmp`;
  const sorted = bookmarks.slice().sort((a, b) => a.page - b.page);
  const content = JSON.stringify({ bookmarks: sorted }, null, 2);
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, jsonPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/bookmarks.test.ts
```
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/bookmarks.ts tests/unit/bookmarks.test.ts
git commit -m "feat: add bookmarks file I/O module with unit tests"
```

---

## Task 2: IPC wiring (main.ts + preload.ts)

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Add IPC handlers to main.ts**

Add this import at the top of `src/main.ts`, after the existing imports:
```typescript
import { readBookmarks, writeBookmarks, Bookmark } from "./bookmarks";
```

Add these two handlers at the end of `src/main.ts`, before `app.whenReady()`:
```typescript
ipcMain.handle("read-bookmarks", (_event, pdfPath: string): Bookmark[] => {
  return readBookmarks(pdfPath);
});

ipcMain.handle("write-bookmarks", (_event, pdfPath: string, bookmarks: Bookmark[]): void => {
  writeBookmarks(pdfPath, bookmarks);
});
```

- [ ] **Step 2: Extend PidefAPI in preload.ts**

In `src/preload.ts`, add `Bookmark` interface before the `PidefAPI` interface:
```typescript
interface Bookmark {
  label: string;
  page: number;
}
```

Add these two lines to the `PidefAPI` interface:
```typescript
readBookmarks: (pdfPath: string) => Promise<Bookmark[]>;
writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => Promise<void>;
```

Add these two lines to the `window.pidef` object:
```typescript
readBookmarks: (pdfPath: string) => ipcRenderer.invoke("read-bookmarks", pdfPath),
writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => ipcRenderer.invoke("write-bookmarks", pdfPath, bookmarks),
```

- [ ] **Step 3: Verify TypeScript compiles**

Ask the user to run:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/preload.ts
git commit -m "feat: add IPC channels for bookmark read/write"
```

---

## Task 3: HTML structure

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Add toggle button to toolbar**

In `src/index.html`, add this button inside `#toolbar`, after `#btn-fullscreen`:
```html
<button id="btn-toggle-bookmarks" title="Bookmarks">🔖</button>
```

- [ ] **Step 2: Add bookmark bar between canvas-container and nav-bar**

In `src/index.html`, insert this `div` between the closing `</div>` of `#canvas-container` and `<div id="nav-bar">`:
```html
<div id="bookmark-bar" class="hidden">
  <div id="bookmark-pills"></div>
  <button id="btn-add-bookmark" title="Add bookmark for current page">+</button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: add bookmark bar and toggle button to HTML"
```

---

## Task 4: Bookmark bar styles

**Files:**
- Modify: `src/styles.scss`

- [ ] **Step 1: Add toggle button style to the toolbar section**

In `src/styles.scss`, inside the `#toolbar { ... }` block, after the `#btn-fullscreen` rule, add:
```scss
#btn-toggle-bookmarks {
  font-size: $font-size-lg;
  padding: $spacing-lg $spacing-xl;
  min-height: $touch-target-lg;
  min-width: $touch-target-lg;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    background: var(--theme-button-active);
  }
}
```

- [ ] **Step 2: Add bookmark bar styles**

In `src/styles.scss`, add a new section after the `// NAVIGATION BAR` section:
```scss
// ============================================================================
// BOOKMARK BAR
// ============================================================================

#bookmark-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-lg;
  background: var(--theme-bg-secondary);
  border-top: $border-width solid var(--theme-border);

  &.hidden {
    display: none;
  }

  &.edit-mode .bookmark-pill .pill-remove {
    display: flex;
  }

  #bookmark-pills {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    flex: 1;
    align-items: center;
  }

  #btn-add-bookmark {
    min-height: 32px;
    min-width: 32px;
    padding: $spacing-xs $spacing-md;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    flex-shrink: 0;
  }

  #bookmark-input-wrap {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    flex: 1;

    input {
      height: 32px;
      padding: $spacing-xs $spacing-md;
      font-size: $font-size-sm;
      background: var(--theme-bg-primary);
      color: var(--theme-text-primary);
      border: $border-width solid var(--theme-border);
      border-radius: $border-radius-sm;
      min-width: 120px;
    }

    button {
      min-height: 32px;
      padding: $spacing-xs $spacing-md;
      font-size: $font-size-sm;
    }
  }
}

.bookmark-pill {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: $spacing-xs $spacing-md;
  font-size: $font-size-xs;
  border-radius: 16px;
  white-space: nowrap;
  cursor: pointer;

  &.highlighted {
    background: var(--theme-button-active);
    border-color: var(--theme-text-secondary);
  }

  .pill-remove {
    display: none;
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #cc3333;
    color: white;
    font-size: 10px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    padding: 0;
    line-height: 1;
    min-height: unset;
    min-width: unset;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.scss
git commit -m "feat: add bookmark bar styles"
```

---

## Task 5: Renderer — types, state, load/clear

**Files:**
- Modify: `src/renderer.ts`

- [ ] **Step 1: Add Bookmark interface and extend PidefAPI**

In `src/renderer.ts`, after the `FileRecord` interface (line 1–4), add:
```typescript
interface Bookmark {
  label: string;
  page: number;
}
```

In the `PidefAPI` interface, add these two methods:
```typescript
readBookmarks: (pdfPath: string) => Promise<Bookmark[]>;
writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => Promise<void>;
```

- [ ] **Step 2: Add bookmark state variables**

In `src/renderer.ts`, in the `// ── State ──` section, add after `let currentFilePath = "";`:
```typescript
// Bookmark state
let bookmarks: Bookmark[] = [];
let bookmarkBarVisible = false;
let bookmarkEditMode = false;
```

- [ ] **Step 3: Add load and clear functions**

In `src/renderer.ts`, add these two functions in the `// ── File loading ──` section, before `loadFile`:
```typescript
async function loadBookmarksForFile(filePath: string): Promise<void> {
  bookmarks = await pidef.readBookmarks(filePath);
}

function clearBookmarks(): void {
  bookmarks = [];
  bookmarkEditMode = false;
}
```

- [ ] **Step 4: Call loadBookmarksForFile in loadFile**

In the `loadFile` function, add `await loadBookmarksForFile(filePath);` right before the existing `await pidef.addRecentFile(filePath, currentPage);` line:
```typescript
await loadBookmarksForFile(filePath);
await pidef.addRecentFile(filePath, currentPage);
updateUI();
draw();
```

- [ ] **Step 5: Call clearBookmarks in closePdf**

In the `closePdf` function, add `clearBookmarks();` right after `rendering.clear();`:
```typescript
surfCache.clear();
rendering.clear();
clearBookmarks();
updateUI();
draw();
```

- [ ] **Step 6: Initialize bookmarkBarVisible from localStorage**

In the `// ── Init ──` section at the bottom of `src/renderer.ts`, add after the `rotationSteps` initialization:
```typescript
bookmarkBarVisible = localStorage.getItem("pidef-bookmarks-visible") === "true";
if (bookmarkBarVisible) {
  document.getElementById("btn-toggle-bookmarks")!.classList.add("active");
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Ask the user to run:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: add bookmark state, load/clear wiring in renderer"
```

---

## Task 6: Renderer — render bar, toggle, add, remove

**Files:**
- Modify: `src/renderer.ts`

- [ ] **Step 1: Add renderBookmarkBar function**

Add this function in `src/renderer.ts` after the `clearBookmarks` function:

```typescript
function renderBookmarkBar(): void {
  const bar = document.getElementById("bookmark-bar")!;
  const pills = document.getElementById("bookmark-pills")!;

  // Show the bar only when a PDF is open and the user has bookmarks visible
  const shouldShow = pdfDoc !== null && bookmarkBarVisible;
  bar.classList.toggle("hidden", !shouldShow);
  bar.classList.toggle("edit-mode", bookmarkEditMode);

  pills.innerHTML = "";

  for (const bm of bookmarks) {
    const pill = document.createElement("button");
    pill.className = "bookmark-pill";
    if (bm.page === currentPage) pill.classList.add("highlighted");

    const labelSpan = document.createElement("span");
    labelSpan.textContent = bm.label;
    pill.appendChild(labelSpan);

    const removeBtn = document.createElement("button");
    removeBtn.className = "pill-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeBookmark(bm.page);
    });
    pill.appendChild(removeBtn);

    // Long-press (500ms) enters edit mode
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const startLongPress = () => {
      longPressTimer = setTimeout(() => {
        bookmarkEditMode = true;
        renderBookmarkBar();
      }, 500);
    };
    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    pill.addEventListener("pointerdown", startLongPress);
    pill.addEventListener("pointerup", cancelLongPress);
    pill.addEventListener("pointercancel", cancelLongPress);
    pill.addEventListener("pointermove", cancelLongPress);

    pill.addEventListener("click", () => {
      if (bookmarkEditMode) return;
      goToPage(bm.page);
    });

    pills.appendChild(pill);
  }
}
```

- [ ] **Step 2: Add removeBookmark function**

Add this function after `renderBookmarkBar`:
```typescript
function removeBookmark(page: number): void {
  bookmarks = bookmarks.filter((b) => b.page !== page);
  if (bookmarks.length === 0) bookmarkEditMode = false;
  if (currentFilePath) pidef.writeBookmarks(currentFilePath, bookmarks);
  renderBookmarkBar();
}
```

- [ ] **Step 3: Add addBookmark and showBookmarkInput functions**

Add these after `removeBookmark`:
```typescript
function addBookmark(label: string, page: number): void {
  bookmarks = [...bookmarks.filter((b) => b.page !== page), { label, page }]
    .sort((a, b) => a.page - b.page);
  if (currentFilePath) pidef.writeBookmarks(currentFilePath, bookmarks);
  renderBookmarkBar();
}

function showBookmarkInput(): void {
  const bar = document.getElementById("bookmark-bar")!;
  const addBtn = document.getElementById("btn-add-bookmark")!;
  addBtn.style.display = "none";

  const wrap = document.createElement("div");
  wrap.id = "bookmark-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.value = `p.${currentPage + 1}`;

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✓";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✕";

  wrap.appendChild(input);
  wrap.appendChild(confirmBtn);
  wrap.appendChild(cancelBtn);
  bar.appendChild(wrap);

  input.focus();
  input.select();

  let closed = false;
  function closeInput() {
    if (closed) return;
    closed = true;
    wrap.remove();
    addBtn.style.display = "";
  }
  function confirm() {
    const label = input.value.trim();
    if (label) addBookmark(label, currentPage);
    closeInput();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); confirm(); }
    if (e.key === "Escape") closeInput();
  });
  confirmBtn.addEventListener("click", confirm);
  cancelBtn.addEventListener("click", closeInput);
  // Delay blur-close so confirm/cancel clicks fire first
  input.addEventListener("blur", () => setTimeout(closeInput, 150));
}
```

- [ ] **Step 4: Wire toggle button click handler**

In the DOM event listeners section of `src/renderer.ts`, add after the `btn-fullscreen` listener:
```typescript
document.getElementById("btn-toggle-bookmarks")!.addEventListener("click", () => {
  bookmarkBarVisible = !bookmarkBarVisible;
  localStorage.setItem("pidef-bookmarks-visible", bookmarkBarVisible.toString());
  document.getElementById("btn-toggle-bookmarks")!.classList.toggle("active", bookmarkBarVisible);
  renderBookmarkBar();
});
```

- [ ] **Step 5: Wire add-bookmark button click handler**

In the DOM event listeners section, add:
```typescript
document.getElementById("btn-add-bookmark")!.addEventListener("click", () => {
  if (!pdfDoc) return;
  const existing = bookmarks.find((b) => b.page === currentPage);
  if (existing) {
    // Pill for this page is already highlighted — nothing to do
    return;
  }
  showBookmarkInput();
});
```

- [ ] **Step 6: Exit edit mode on outside click**

Add this in the `// ── Keyboard ──` section (near other document-level listeners):
```typescript
document.addEventListener("pointerdown", (e) => {
  if (!bookmarkEditMode) return;
  const bar = document.getElementById("bookmark-bar")!;
  if (!bar.contains(e.target as Node)) {
    bookmarkEditMode = false;
    renderBookmarkBar();
  }
});
```

- [ ] **Step 7: Also update pill highlight when using the page slider**

The slider handler updates labels inline without calling `updateUI()`, so the highlighted pill won't update on slider navigation. In the `pageSlider` `"input"` listener's `.then()` callback, add `renderBookmarkBar();` after the `navLabel.textContent` line:
```typescript
pageLabel.textContent = `Page ${currentPage + 1} / ${nPages}`;
navLabel.textContent = `Page ${currentPage + 1} / ${nPages}`;
renderBookmarkBar();
if (currentFilePath && pdfDoc) {
```

- [ ] **Step 8: Call renderBookmarkBar from updateUI**

In the `updateUI` function, add `renderBookmarkBar();` at the very end of the function body (after the final `}` of the if/else block, before the closing `}`):
```typescript
function updateUI() {
  if (pdfDoc) {
    const text = `Page ${currentPage + 1} / ${nPages}`;
    pageLabel.textContent = text;
    navLabel.textContent = text;
    pageSlider.max = String(nPages - 1);
    pageSlider.value = String(currentPage);
    welcomeScreen.style.display = "none";
    document.title = `pidef`;
  } else {
    pageLabel.textContent = "";
    navLabel.textContent = "";
    pageSlider.max = "1";
    pageSlider.value = "0";
    welcomeScreen.style.display = "";
  }
  renderBookmarkBar();
}
```

- [ ] **Step 9: Verify TypeScript compiles**

Ask the user to run:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 10: Run unit tests**

Ask the user to run:
```bash
npx vitest run tests/unit
```
Expected: all tests PASS (including the new bookmarks tests from Task 1)

- [ ] **Step 11: Manual smoke test**

Ask the user to:
1. Build and launch: `npm start`
2. Open a PDF
3. Tap the 🔖 button — the bookmark bar appears below the page (empty, with just a + button)
4. Tap + — an input appears pre-filled with "p.1"; type "Intro" and press Enter
5. The "Intro" pill appears; tapping it on a different page returns to page 1
6. Long-press the pill — edit mode activates (× badge appears); tap × to remove; pill disappears
7. Tap 🔖 again — bar hides; tap again — bar reappears with any saved bookmarks
8. Rotate the surface — bookmark bar rotates with it
9. Check that `<your-pdf>.pdf.json` was created alongside the PDF with correct content
10. Close and reopen the PDF — bookmarks are restored

- [ ] **Step 12: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: render bookmark bar, add/remove/toggle bookmarks"
```
