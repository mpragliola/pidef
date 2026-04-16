# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign pidef's UI to improve touch interaction, reorganize toolbar, add intelligent bookmark display modes (hidden/1-line/all/overlay), and implement overlay mode for quick bookmark access.

**Architecture:** Add state variables for bookmark display modes and width control. Restructure top bar (Open, Close, Rotate with centered nearest bookmark title). Expand nav bar with view/filter buttons and Save. Add vertical control stack to bookmark bar. Implement 4 bookmark display modes with nearest pill highlighting. Create overlay mode with vertical scrollable pills on page border. All elements rotate with PDF. User preferences persist in localStorage.

**Tech Stack:** TypeScript (renderer), HTML (structure), SCSS (styling with touch targets), Existing bookmark system (no changes).

---

## Task 1: Add State Variables and Helper Functions

**Files:**
- Modify: `src/renderer.ts:50-100` (state declarations)
- Modify: `src/renderer.ts:750-850` (add helper functions)

- [ ] **Step 1: Add bookmark display mode state variables**

After the existing bookmark state variables (around line 54), add:

```typescript
// Bookmark display modes
let bookmarkDisplayMode: 'hidden' | '1-line' | 'all' | 'overlay' = '1-line';
let bookmarkWidthMode: 's' | 'm' | 'l' = 'm';
let showTopBarTitle = true;
let nearestBookmarkPage: number | null = null;
let nearestBookmarkIndex: number | null = null;
let overlayActiveFromMode: 'hidden' | '1-line' | 'all' = '1-line';
```

- [ ] **Step 2: Add helper function to find nearest bookmark**

After `addBookmark()` function, add:

```typescript
function findNearestBookmark(): { page: number | null; index: number | null } {
  if (bookmarks.length === 0) return { page: null, index: null };
  
  // Find the bookmark with the largest page number that is <= currentPage
  let nearest: { page: number; index: number } | null = null;
  for (let i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].page <= currentPage) {
      if (!nearest || bookmarks[i].page > nearest.page) {
        nearest = { page: bookmarks[i].page, index: i };
      }
    }
  }
  
  return { page: nearest?.page ?? null, index: nearest?.index ?? null };
}
```

- [ ] **Step 3: Add helper function to extract leading digit(s)+letter(s)**

```typescript
function extractLeadingChars(title: string): string {
  const match = title.match(/^(\d+[a-zA-Z]?)/);
  return match ? match[1] : '';
}
```

- [ ] **Step 4: Add helper function to format pill content based on width mode**

```typescript
function formatPillContent(title: string, mode: 's' | 'm' | 'l'): string {
  switch (mode) {
    case 's': {
      const leading = extractLeadingChars(title);
      return leading || '#bookmark';
    }
    case 'm': {
      return title.length > 12 ? title.substring(0, 12) + '...' : title;
    }
    case 'l':
      return title;
  }
}
```

- [ ] **Step 5: Add function to update nearest bookmark state**

```typescript
function updateNearestBookmark(): void {
  const { page, index } = findNearestBookmark();
  nearestBookmarkPage = page;
  nearestBookmarkIndex = index;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: add bookmark display mode state variables and helper functions"
```

---

## Task 2: Restructure Top Bar HTML and Logic

**Files:**
- Modify: `src/index.html:10-22`
- Modify: `src/renderer.ts:800-900` (top bar rendering)

- [ ] **Step 1: Update top bar HTML structure**

Replace the toolbar section (lines 10-22) with:

```html
  <div id="toolbar">
    <button id="btn-open" title="Open PDF">📁</button>
    <button id="btn-close" title="Close PDF">✕</button>
    <span id="top-bar-title"></span>
    <button id="btn-rotate" title="Rotate 90° clockwise">↻</button>
  </div>
```

- [ ] **Step 2: Add function to render top bar**

After `renderBookmarkBar()` function, add:

```typescript
function renderTopBar(): void {
  const titleSpan = document.getElementById("top-bar-title")!;
  
  if (showTopBarTitle && nearestBookmarkPage !== null && nearestBookmarkIndex !== null) {
    titleSpan.textContent = bookmarks[nearestBookmarkIndex].label;
  } else {
    titleSpan.textContent = '';
  }
}
```

- [ ] **Step 3: Call renderTopBar() on page change**

In the `goToPage()` function, after updating `currentPage`, add:

```typescript
updateNearestBookmark();
renderTopBar();
renderBookmarkBar();
```

- [ ] **Step 4: Call renderTopBar() on bookmark changes**

In `addBookmark()` and `removeBookmark()` functions, add `renderTopBar();` and `updateNearestBookmark();` before `renderBookmarkBar();`

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/renderer.ts
git commit -m "feat: restructure top bar with open, close, title, rotate buttons"
```

---

## Task 3: Reorganize Nav Bar and Add Controls

**Files:**
- Modify: `src/index.html:66-73`
- Modify: `src/renderer.ts` (nav bar event handlers)

- [ ] **Step 1: Update nav bar HTML structure**

Replace the nav-bar section (lines 66-73) with:

```html
  <div id="nav-bar">
    <div id="nav-left">
      <button id="btn-first" title="First page">⏮</button>
      <button id="btn-prev" title="Previous page">◀</button>
    </div>
    <div id="nav-center">
      <input type="range" id="page-slider" min="0" max="1" value="0">
      <span id="nav-label"></span>
    </div>
    <div id="nav-right">
      <button id="btn-next" title="Next page">▶</button>
      <button id="btn-last" title="Last page">⏭</button>
      <button id="btn-save" title="Save">💾</button>
      <button id="btn-sepia" title="Sepia tone">🟫</button>
      <button id="btn-invert" title="Invert colors">⚫</button>
      <button id="btn-sharpen" title="Sharpen">✨</button>
      <button id="btn-fullscreen" title="Fullscreen F11">⛶</button>
      <button id="btn-toggle-bookmarks-nav" title="Bookmarks">🔖</button>
    </div>
  </div>
```

- [ ] **Step 2: Update nav-bar event listeners**

Find and remove the old toolbar button event listeners (sepia, invert, sharpen, fullscreen, toggle-bookmarks). They will be re-added in the nav bar section.

Add new listeners in initialization for the nav bar buttons. Keep the same functionality as before but now they're in the nav bar.

- [ ] **Step 3: Commit**

```bash
git add src/index.html src/renderer.ts
git commit -m "feat: reorganize nav bar with view/filter buttons and save"
```

---

## Task 4: Add Bookmark Bar Control Stack

**Files:**
- Modify: `src/index.html:44-47`
- Modify: `src/renderer.ts` (bookmark bar initialization)

- [ ] **Step 1: Update bookmark bar HTML**

Replace lines 44-47 with:

```html
  <div id="bookmark-bar" class="hidden">
    <div id="bookmark-controls">
      <button id="btn-add-bookmark" title="Add bookmark">+</button>
      <button id="btn-width-control" title="Width: s/m/l">s</button>
      <button id="btn-title-toggle" title="Toggle title">Aa</button>
      <button id="btn-bookmark-tri-state" title="Hide/1-line/All">●</button>
    </div>
    <div id="bookmark-pills"></div>
  </div>
```

- [ ] **Step 2: Add width control button handler**

In initialization code, add:

```typescript
document.getElementById("btn-width-control")!.addEventListener("click", () => {
  const modes: ('s' | 'm' | 'l')[] = ['s', 'm', 'l'];
  const currentIndex = modes.indexOf(bookmarkWidthMode);
  bookmarkWidthMode = modes[(currentIndex + 1) % modes.length];
  document.getElementById("btn-width-control")!.textContent = bookmarkWidthMode;
  localStorage.setItem("pidef-bookmark-width-mode", bookmarkWidthMode);
  renderBookmarkBar();
});
```

- [ ] **Step 3: Add Aa toggle button handler**

```typescript
document.getElementById("btn-title-toggle")!.addEventListener("click", () => {
  showTopBarTitle = !showTopBarTitle;
  localStorage.setItem("pidef-show-top-bar-title", showTopBarTitle.toString());
  renderTopBar();
});
```

- [ ] **Step 4: Add tri-state button handler**

```typescript
document.getElementById("btn-bookmark-tri-state")!.addEventListener("click", () => {
  const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
  const currentIndex = modes.indexOf(bookmarkDisplayMode as any);
  bookmarkDisplayMode = modes[(currentIndex + 1) % modes.length];
  localStorage.setItem("pidef-bookmark-display-mode", bookmarkDisplayMode);
  renderBookmarkBar();
});
```

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/renderer.ts
git commit -m "feat: add bookmark bar control buttons (width, title toggle, tri-state)"
```

---

## Task 5: Implement Bookmark Display Mode Rendering

**Files:**
- Modify: `src/renderer.ts:660-730` (renderBookmarkBar)

- [ ] **Step 1: Update renderBookmarkBar to handle all modes**

Replace the existing `renderBookmarkBar()` function with:

```typescript
function renderBookmarkBar(): void {
  const bar = document.getElementById("bookmark-bar")!;
  const pills = document.getElementById("bookmark-pills")!;
  
  // Hide bar if overlay mode is active
  if (bookmarkDisplayMode === 'overlay') {
    bar.classList.add("hidden");
    return;
  }
  
  // Show/hide bar based on display mode
  const shouldShow = pdfDoc !== null && bookmarkDisplayMode !== 'hidden';
  bar.classList.toggle("hidden", !shouldShow);
  
  pills.innerHTML = "";
  
  if (!shouldShow) return;
  
  // Render pills based on mode
  let pillsToShow: Bookmark[] = [];
  if (bookmarkDisplayMode === '1-line') {
    pillsToShow = bookmarks;
  } else if (bookmarkDisplayMode === 'all') {
    pillsToShow = bookmarks;
  }
  
  for (const bm of pillsToShow) {
    const pill = document.createElement("button");
    pill.className = "bookmark-pill";
    
    // Highlight nearest pill
    if (nearestBookmarkIndex !== null && bookmarks[nearestBookmarkIndex].page === bm.page) {
      pill.classList.add("highlighted");
    }
    
    // Format content based on width mode
    const content = formatPillContent(bm.label, bookmarkWidthMode);
    const leading = extractLeadingChars(bm.label);
    
    if (bookmarkWidthMode === 's' || (bookmarkWidthMode === 'm' && leading)) {
      // Show leading chars bold and bigger
      const span = document.createElement("span");
      span.innerHTML = `<strong class="pill-leading">${leading}</strong>`;
      if (bookmarkWidthMode === 'm') {
        const rest = content.substring(leading.length);
        span.innerHTML += rest;
      }
      pill.appendChild(span);
    } else {
      pill.textContent = content;
    }
    
    // Add segue arrow if applicable
    if (bm.segue) {
      pill.textContent += ' ▶';
    }
    
    // Click handler
    pill.addEventListener("click", () => {
      goToPage(bm.page);
    });
    
    pills.appendChild(pill);
  }
  
  // Center nearest pill in 1-line mode
  if (bookmarkDisplayMode === '1-line' && nearestBookmarkIndex !== null) {
    setTimeout(() => {
      const nearestPill = pills.children[nearestBookmarkIndex!] as HTMLElement;
      if (nearestPill) {
        nearestPill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 0);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: implement bookmark display modes (hidden, 1-line, all) with nearest pill highlighting"
```

---

## Task 6: Implement Bookmark Mode Cycling

**Files:**
- Modify: `src/renderer.ts` (bookmarks button handler)

- [ ] **Step 1: Update bookmarks button click handler**

Find the bookmarks button handler (btn-toggle-bookmarks) and update it to cycle through modes:

```typescript
document.getElementById("btn-toggle-bookmarks")!.addEventListener("click", () => {
  const modes: ('hidden' | '1-line' | 'all')[] = ['hidden', '1-line', 'all'];
  const currentIndex = modes.indexOf(bookmarkDisplayMode as any);
  bookmarkDisplayMode = modes[(currentIndex + 1) % modes.length];
  overlayActiveFromMode = bookmarkDisplayMode;
  localStorage.setItem("pidef-bookmark-display-mode", bookmarkDisplayMode);
  renderBookmarkBar();
});
```

Also update the nav bar button (btn-toggle-bookmarks-nav) with the same handler.

- [ ] **Step 2: Add long-press handler for overlay mode**

```typescript
// Long-press detection for bookmarks button
let bookmarkButtonLongPressTimer: ReturnType<typeof setTimeout> | null = null;
const bookmarkButton = document.getElementById("btn-toggle-bookmarks")!;

bookmarkButton.addEventListener("pointerdown", () => {
  bookmarkButtonLongPressTimer = setTimeout(() => {
    bookmarkDisplayMode = 'overlay';
    renderBookmarkBar();
  }, 500);
});

bookmarkButton.addEventListener("pointerup", () => {
  if (bookmarkButtonLongPressTimer) {
    clearTimeout(bookmarkButtonLongPressTimer);
    bookmarkButtonLongPressTimer = null;
  }
});

bookmarkButton.addEventListener("pointercancel", () => {
  if (bookmarkButtonLongPressTimer) {
    clearTimeout(bookmarkButtonLongPressTimer);
    bookmarkButtonLongPressTimer = null;
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: implement bookmark button click to cycle modes and long-press for overlay"
```

---

## Task 7: Create Overlay Mode UI and Logic

**Files:**
- Modify: `src/index.html` (add overlay modal)
- Modify: `src/renderer.ts` (overlay rendering)

- [ ] **Step 1: Add overlay modal HTML**

After the bookmark-bar section, add:

```html
  <div id="bookmark-overlay" class="hidden">
    <div id="bookmark-overlay-backdrop"></div>
    <div id="bookmark-overlay-pills"></div>
  </div>
```

- [ ] **Step 2: Add overlay rendering function**

```typescript
function renderBookmarkOverlay(): void {
  const overlay = document.getElementById("bookmark-overlay")!;
  const pillsContainer = document.getElementById("bookmark-overlay-pills")!;
  
  if (bookmarkDisplayMode !== 'overlay') {
    overlay.classList.add("hidden");
    return;
  }
  
  overlay.classList.remove("hidden");
  pillsContainer.innerHTML = "";
  
  // Render pills stacked vertically with larger fonts
  for (const bm of bookmarks) {
    const pill = document.createElement("button");
    pill.className = "overlay-pill";
    
    // Highlight nearest pill
    if (nearestBookmarkIndex !== null && bookmarks[nearestBookmarkIndex].page === bm.page) {
      pill.classList.add("highlighted");
    }
    
    // Format content (use full or medium width in overlay)
    const leading = extractLeadingChars(bm.label);
    const content = formatPillContent(bm.label, 'l');
    
    if (leading) {
      pill.innerHTML = `<strong class="pill-leading">${leading}</strong> ${content.substring(leading.length)}`;
    } else {
      pill.textContent = content;
    }
    
    // Click handler - jump to page and close overlay
    pill.addEventListener("click", () => {
      goToPage(bm.page);
      bookmarkDisplayMode = overlayActiveFromMode;
      renderBookmarkBar();
    });
    
    pillsContainer.appendChild(pill);
  }
}
```

- [ ] **Step 3: Update renderBookmarkBar to call renderBookmarkOverlay**

At the end of `renderBookmarkBar()`, add:

```typescript
renderBookmarkOverlay();
```

- [ ] **Step 4: Add overlay close handlers**

```typescript
const overlay = document.getElementById("bookmark-overlay")!;
const backdrop = document.getElementById("bookmark-overlay-backdrop")!;

backdrop.addEventListener("click", () => {
  bookmarkDisplayMode = overlayActiveFromMode;
  renderBookmarkBar();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
    bookmarkDisplayMode = overlayActiveFromMode;
    renderBookmarkBar();
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/renderer.ts
git commit -m "feat: implement overlay mode with vertical pill stack and interactions"
```

---

## Task 8: Add Styling for Touch Targets and Rounded Corners

**Files:**
- Modify: `src/styles.scss` (button and modal styles)

- [ ] **Step 1: Update button styling for larger touch targets**

In the button styles section, update all button definitions to have minimum 44px height:

```scss
button {
  min-height: 44px;
  min-width: 44px;
  padding: $spacing-md $spacing-lg;
  border-radius: $border-radius-sm + 2px;  // Slightly rounder
  cursor: pointer;
  font-weight: $font-weight-semibold;
}
```

- [ ] **Step 2: Add nav bar layout styles**

```scss
#nav-bar {
  display: flex;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-lg;
  background: var(--theme-bg-secondary);
  border-top: $border-width solid var(--theme-border);
  
  #nav-left, #nav-right {
    display: flex;
    gap: $spacing-sm;
  }
  
  #nav-center {
    flex: 1;
    display: flex;
    gap: $spacing-md;
    align-items: center;
  }
}
```

- [ ] **Step 3: Add bookmark bar control stack styles**

```scss
#bookmark-bar {
  #bookmark-controls {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    padding: $spacing-sm;
  }
  
  #bookmark-pills {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    overflow-y: auto;
  }
}
```

- [ ] **Step 4: Add pill formatting styles**

```scss
.bookmark-pill, .overlay-pill {
  .pill-leading {
    font-weight: bold;
    font-size: 1.2em;
  }
}

.overlay-pill {
  font-size: 1.2em;  // Larger fonts in overlay
}
```

- [ ] **Step 5: Add overlay modal styles**

```scss
#bookmark-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 1000;
  
  &.hidden {
    display: none;
  }
  
  #bookmark-overlay-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
  }
  
  #bookmark-overlay-pills {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    padding: $spacing-lg;
    overflow-y: auto;
    background: var(--theme-bg-primary);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/styles.scss
git commit -m "feat: add touch target sizing (44-48px) and rounded corners to all buttons"
```

---

## Task 9: Add localStorage Persistence

**Files:**
- Modify: `src/renderer.ts` (initialization)

- [ ] **Step 1: Load preferences from localStorage on init**

In the initialization code (near the bottom of the file), add:

```typescript
// Load user preferences from localStorage
bookmarkDisplayMode = (localStorage.getItem("pidef-bookmark-display-mode") as any) || '1-line';
bookmarkWidthMode = (localStorage.getItem("pidef-bookmark-width-mode") as any) || 'm';
showTopBarTitle = localStorage.getItem("pidef-show-top-bar-title") !== 'false';

// Update UI to reflect loaded preferences
if (pdfDoc !== null) {
  renderBookmarkBar();
  renderTopBar();
  document.getElementById("btn-width-control")!.textContent = bookmarkWidthMode;
}
```

- [ ] **Step 2: Verify all state changes save to localStorage**

Ensure all mode change handlers include localStorage.setItem() calls (they should from previous tasks).

- [ ] **Step 3: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: persist user preferences (display mode, width mode, title visibility) to localStorage"
```

---

## Task 10: Implement Rotation Awareness

**Files:**
- Modify: `src/renderer.ts` (apply rotation transforms)
- Modify: `src/styles.scss` (rotation-aware positioning)

- [ ] **Step 1: Update renderBookmarkBar to apply rotation transform**

In `renderBookmarkBar()`, before rendering pills, get the current rotation and apply transform:

```typescript
const bar = document.getElementById("bookmark-bar")!;
const rotationDegrees = pdfRotation * 90; // Assuming pdfRotation is 0, 1, 2, 3
bar.style.transform = `rotate(${rotationDegrees}deg)`;
```

- [ ] **Step 2: Update overlay positioning for rotation**

In `renderBookmarkOverlay()`, apply rotation:

```typescript
const overlay = document.getElementById("bookmark-overlay-pills")!;
const rotationDegrees = pdfRotation * 90;
overlay.style.transform = `rotate(${rotationDegrees}deg)`;
```

- [ ] **Step 3: Update top bar and nav bar for rotation**

Apply the same rotation transforms to toolbar and nav-bar.

- [ ] **Step 4: Add CSS for rotation positioning**

```scss
#bookmark-overlay-pills {
  position: fixed;
  right: 0;
  // Rotation handled via JavaScript transform
  transform-origin: top right;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts src/styles.scss
git commit -m "feat: implement rotation awareness for all UI elements"
```

---

## Task 11: Update Nearest Bookmark on Page and Bookmark Changes

**Files:**
- Modify: `src/renderer.ts` (goToPage, addBookmark, removeBookmark, loadBookmarksForFile)

- [ ] **Step 1: Call updateNearestBookmark in goToPage**

In `goToPage()`, after updating currentPage, add:

```typescript
updateNearestBookmark();
renderTopBar();
```

- [ ] **Step 2: Call updateNearestBookmark in loadBookmarksForFile**

```typescript
async function loadBookmarksForFile(filePath: string): Promise<void> {
  bookmarks = await pidef.readBookmarks(filePath);
  updateNearestBookmark();
}
```

- [ ] **Step 3: Call updateNearestBookmark in addBookmark and removeBookmark**

```typescript
function addBookmark(label: string, page: number): void {
  // ... existing code ...
  updateNearestBookmark();
  renderTopBar();
  renderBookmarkBar();
}

function removeBookmark(page: number): void {
  // ... existing code ...
  updateNearestBookmark();
  renderTopBar();
  renderBookmarkBar();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer.ts
git commit -m "feat: update nearest bookmark on page and bookmark changes"
```

---

## Task 12: Integration Testing — Verify Full Workflow

**Files:**
- Manual testing in running app

- [ ] **Step 1: Start the app and open a PDF**

```bash
npm run build
npm start
```

- [ ] **Step 2: Test top bar**

- Open a PDF with bookmarks
- Verify top bar shows: Open | Title | Rotate
- Verify title shows nearest bookmark
- Click Aa button - title should toggle on/off
- Verify title persists in new page loads

- [ ] **Step 3: Test bookmark display modes**

- Click bookmarks button (in nav bar) - cycles through hidden → 1-line → all → hidden
- In 1-line mode: verify single scrollable row, nearest pill highlighted and centered
- In all mode: verify all pills shown, nearest highlighted
- In hidden mode: verify bookmark bar not visible

- [ ] **Step 4: Test overlay mode**

- Long-press bookmarks button - overlay should appear on right border
- Verify pills stacked vertically, scrollable
- Verify nearest pill highlighted
- Click a pill - should jump to page and return to previous mode
- Click backdrop - overlay closes, returns to previous mode
- Press Escape - overlay closes

- [ ] **Step 5: Test width control**

- Click width button in bookmark bar - cycles through s → m → l
- Verify pills display accordingly (digits only, truncated, full)
- Verify leading digits are bold and bigger
- Verify "#bookmark" appears if no leading digits

- [ ] **Step 6: Test tri-state button**

- Click tri-state button in bookmark bar - cycles through hide → 1-line → all
- Verify it matches the bookmarks button cycling

- [ ] **Step 7: Test rotation**

- Rotate PDF - verify all UI elements rotate with it
- Verify overlay positioning adjusts for rotation
- Verify top bar, nav bar, bookmark bar all rotate

- [ ] **Step 8: Test persistence**

- Set preferences (mode, width, title toggle)
- Close and reopen the app
- Verify preferences are restored

- [ ] **Step 9: Report completion**

All features working as designed. Ready for code review.

---

## Summary

This implementation adds 7 major UI enhancements across 12 tasks. The bookmark system gains intelligent display modes (hidden/1-line/all/overlay) with a nearest-pill highlighting system. The top bar is simplified to show nearest bookmark title. The nav bar is reorganized with all view/filter buttons. All buttons are sized for touch interaction. Rotation awareness ensures all elements rotate correctly with the PDF. User preferences persist in localStorage.
