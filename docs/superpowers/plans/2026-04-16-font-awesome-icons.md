# Font Awesome Free Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all emoji/Unicode button icons with Font Awesome Free solid icons via the npm package.

**Architecture:** Install `@fortawesome/fontawesome-free` as a dependency, import its SCSS solid subset in `src/styles.scss`, and replace button text content with `<i className="fa-solid fa-...">` elements in `Toolbar.tsx` and `NavBar.tsx`. Icon sizing is controlled by a single targeted CSS rule decoupled from button sizing.

**Tech Stack:** Font Awesome Free 6.x, SCSS `@use`, React TSX

---

### Task 1: Install Font Awesome Free

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
npm install @fortawesome/fontawesome-free
```

Expected: package added to `dependencies` in `package.json`, `node_modules/@fortawesome/fontawesome-free` present.

- [ ] **Step 2: Verify SCSS files are available**

```bash
ls node_modules/@fortawesome/fontawesome-free/scss/
```

Expected: output includes `fontawesome.scss` and `solid.scss`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @fortawesome/fontawesome-free"
```

---

### Task 2: Wire Font Awesome SCSS and fix icon sizing

**Files:**
- Modify: `src/styles.scss`

- [ ] **Step 1: Add Font Awesome SCSS imports**

At the very top of `src/styles.scss`, before the existing `@use 'sass:map';` line, add:

```scss
@use '@fortawesome/fontawesome-free/scss/fontawesome';
@use '@fortawesome/fontawesome-free/scss/solid';
```

So the top of the file becomes:

```scss
@use '@fortawesome/fontawesome-free/scss/fontawesome';
@use '@fortawesome/fontawesome-free/scss/solid';
@use 'sass:map';
```

- [ ] **Step 2: Remove font-size from nav-bar buttons**

In the `#nav-bar button` block (around line 514), remove the `font-size: $font-size-2xl;` line that was added previously:

```scss
  button {
    min-height: $touch-target-xl;
    min-width: $touch-target-xl;
    padding: $spacing-xs $spacing-md;
    border-radius: $border-radius-sm + 2px;
    cursor: pointer;
    font-weight: $font-weight-semibold;

    &.active { ... }
    &.active-2 { ... }
  }
```

- [ ] **Step 3: Remove font-size from toolbar buttons**

In the `#toolbar button` block (around line 683), remove the `font-size: $font-size-2xl;` line:

```scss
  button {
    min-height: $touch-target-xl;
    min-width: $touch-target-xl;
    padding: $spacing-xs $spacing-md;
    border-radius: $border-radius-sm + 2px;
    cursor: pointer;
    font-weight: $font-weight-semibold;
  }
```

- [ ] **Step 4: Add targeted icon sizing rule**

After the global `button { ... }` block (around line 194), add:

```scss
button .fa-solid {
  font-size: $font-size-2xl;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/styles.scss
git commit -m "style: integrate Font Awesome Free SCSS and set icon size"
```

---

### Task 3: Replace icons in Toolbar

**Files:**
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: Replace all button icon content**

Replace the full return value of `Toolbar` with:

```tsx
  return (
    <div id="toolbar">
      <button id="btn-open" title="Open PDF" onClick={() => pidef.openFileDialog()}>
        <i className="fa-solid fa-folder-open" />
      </button>

      <button id="btn-close" title="Close PDF" disabled={!pdfDoc} onClick={closePdf}>
        <i className="fa-solid fa-xmark" />
      </button>

      <span id="top-bar-title">{topBarTitle}</span>

      <button
        id="btn-rotate-ccw"
        title="Rotate 90° counter-clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('ccw')}
      >
        <i className="fa-solid fa-rotate-left" />
      </button>
      <button
        id="btn-rotate-cw"
        title="Rotate 90° clockwise"
        disabled={!pdfDoc}
        className={rotationSteps !== 0 ? 'active' : ''}
        onClick={() => rotate('cw')}
      >
        <i className="fa-solid fa-rotate-right" />
      </button>

      <button
        id="btn-fullscreen"
        title="Fullscreen F11"
        onClick={() => pidef.toggleFullscreen()}
      >
        <i className="fa-solid fa-expand" />
      </button>
    </div>
  );
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat: replace Toolbar emoji icons with Font Awesome"
```

---

### Task 4: Replace icons in NavBar

**Files:**
- Modify: `src/components/NavBar.tsx`

- [ ] **Step 1: Replace all button icon content**

Replace the return JSX of `NavBar` with:

```tsx
  return (
    <div id="nav-bar">
      <div id="nav-left">
        <button id="btn-first" title="First page" disabled={disabled} onClick={goFirst}>
          <i className="fa-solid fa-backward-step" />
        </button>
        <button id="btn-prev" title="Previous page" disabled={disabled} onClick={goPrev}>
          <i className="fa-solid fa-chevron-left" />
        </button>
      </div>
      <div id="nav-center">
        <input
          type="range"
          id="page-slider"
          min={0}
          max={nPages > 0 ? nPages - 1 : 1}
          value={currentPage}
          disabled={disabled}
          onChange={e => {
            if (!pdfDoc) return;
            const now = Date.now();
            if (now - sliderThrottleRef.current < SLIDER_THROTTLE_MS) return;
            sliderThrottleRef.current = now;
            const idx = parseInt(e.target.value, 10);
            if (idx !== currentPage) goToPage(idx);
          }}
        />
        <span id="nav-label">{label}</span>
      </div>
      <div id="nav-right">
        <button id="btn-next" title="Next page" disabled={disabled} onClick={goNext}>
          <i className="fa-solid fa-chevron-right" />
        </button>
        <button id="btn-last" title="Last page" disabled={disabled} onClick={goLast}>
          <i className="fa-solid fa-forward-step" />
        </button>
        <button
          id="btn-sepia"
          title="Sepia tone"
          disabled={disabled}
          className={sepiaEnabled ? 'active' : ''}
          onClick={toggleSepia}
        >
          <i className="fa-solid fa-sun" />
        </button>
        <button
          id="btn-invert"
          title="Invert colors"
          disabled={disabled}
          className={invertEnabled ? 'active' : ''}
          onClick={toggleInvert}
        >
          <i className="fa-solid fa-circle-half-stroke" />
        </button>
        <button
          id="btn-half"
          title="Half page mode"
          disabled={disabled}
          className={halfMode ? 'active' : ''}
          onClick={toggleHalfMode}
        >
          <i className="fa-solid fa-table-columns" />
        </button>
        <button
          id="btn-toggle-bookmarks-nav"
          title="Bookmarks"
          disabled={disabled}
          onPointerDown={handleBookmarkPointerDown}
          onPointerUp={handleBookmarkPointerUp}
          onPointerCancel={handleBookmarkPointerUp}
          onClick={handleBookmarkClick}
        >
          <i className="fa-solid fa-bookmark" />
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NavBar.tsx
git commit -m "feat: replace NavBar emoji icons with Font Awesome"
```

---

### Task 5: Verify build

**Files:** none modified

- [ ] **Step 1: Ask the user to build and verify**

Per project rules, do not run `npm build` — ask the user to run it:

```
npm run build
```

Expected: build succeeds with no errors. Font Awesome CSS and font files are copied to `dist/`.

- [ ] **Step 2: Visual check**

Ask the user to launch the app and confirm:
- All 13 buttons show FA solid icons (no emoji)
- Icons are ~24px (matching `$font-size-2xl`)
- Button touch targets remain 56×56px minimum
- Active states (sepia, invert, half, rotate) still show correctly
