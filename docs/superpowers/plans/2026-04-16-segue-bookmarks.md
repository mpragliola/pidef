# Segue Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `segue` flag to bookmarks that displays a visual arrow indicator in pills, and replace the clunky edit mode (red X buttons) with a proper edit modal.

**Architecture:** Extend the `Bookmark` interface with an optional `segue` boolean field. Long-pressing a pill now opens a modal (instead of toggling edit mode) with label input, segue toggle, and delete button. Modal styling uses a semi-transparent backdrop with centered container. Data flow: modal changes update in-memory state → confirm writes to JSON via IPC.

**Tech Stack:** TypeScript (renderer), HTML (modal), SCSS (modal styles), JSON serialization (no changes).

---

## Task 1: Extend Bookmark Interface and Update Pill Display

**Files:**
- Modify: `src/renderer.ts:1-30` (interface definition)
- Modify: `src/renderer.ts:670-710` (pill rendering)

### Step 1: Update the Bookmark interface to include segue field

In `src/renderer.ts`, find the `Bookmark` interface definition (around line 6-9) and update it:

```typescript
interface Bookmark {
  label: string;
  page: number;
  segue?: boolean; // optional, defaults to false
}
```

### Step 2: Update pill rendering to display segue arrow

In the `renderBookmarkBar()` function (around line 670), find the section where the label span is created and appended:

```typescript
const labelSpan = document.createElement("span");
labelSpan.textContent = bm.label;
pill.appendChild(labelSpan);
```

Replace it with:

```typescript
const labelSpan = document.createElement("span");
labelSpan.textContent = bm.label;
if (bm.segue) labelSpan.textContent += " ▶";
pill.appendChild(labelSpan);
```

### Step 3: Verify the change locally (no test needed yet)

The pills will now display "Label ▶" for bookmarks with `segue: true`. Legacy bookmarks (without the field) will render normally since `segue` defaults to falsy.

---

## Task 2: Add Modal HTML Structure

**Files:**
- Modify: `src/index.html:44-47` (after bookmark-bar, before nav-bar)

### Step 1: Add modal HTML template to index.html

After the `<div id="bookmark-bar">` section (line 44-47), add the modal HTML:

```html
  <div id="bookmark-edit-modal" class="hidden">
    <div id="bookmark-modal-backdrop"></div>
    <div id="bookmark-modal-content">
      <h2>Edit Bookmark</h2>
      <input type="text" id="bookmark-modal-label" placeholder="Bookmark label">
      <label id="bookmark-segue-label">
        <input type="checkbox" id="bookmark-modal-segue">
        Mark as segue
      </label>
      <button id="bookmark-modal-delete" class="destructive">Delete</button>
      <div id="bookmark-modal-buttons">
        <button id="bookmark-modal-cancel">Cancel</button>
        <button id="bookmark-modal-done">Done</button>
      </div>
    </div>
  </div>
```

Insert this right before the closing `</div>` of the canvas-container or before the nav-bar.

---

## Task 3: Add Modal Styles

**Files:**
- Modify: `src/styles.scss` (end of file, before closing brace)

### Step 1: Add modal CSS to styles.scss

Append these styles to the end of `src/styles.scss`:

```scss
// ============================================================================
// Bookmark Edit Modal
// ============================================================================

#bookmark-edit-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  &.hidden {
    display: none;
  }

  #bookmark-modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
  }

  #bookmark-modal-content {
    position: relative;
    background: var(--theme-bg-primary);
    border-radius: $border-radius-lg;
    padding: $spacing-lg;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: $spacing-md;

    h2 {
      margin: 0;
      font-size: $font-size-lg;
      color: var(--theme-text-primary);
    }

    #bookmark-modal-label {
      width: 100%;
      height: 44px;
      padding: $spacing-md;
      font-size: $font-size-base;
      background: var(--theme-bg-secondary);
      color: var(--theme-text-primary);
      border: $border-width solid var(--theme-border);
      border-radius: $border-radius-sm;
      box-sizing: border-box;
    }

    #bookmark-segue-label {
      display: flex;
      align-items: center;
      gap: $spacing-md;
      cursor: pointer;
      color: var(--theme-text-primary);
      font-size: $font-size-sm;

      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
      }
    }

    #bookmark-modal-delete {
      width: 100%;
      padding: $spacing-md;
      background: #cc3333;
      color: white;
      border: none;
      border-radius: $border-radius-sm;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;

      &:hover {
        background: #aa2222;
      }
    }

    #bookmark-modal-buttons {
      display: flex;
      gap: $spacing-md;
      justify-content: flex-end;
      margin-top: $spacing-sm;

      button {
        min-height: 44px;
        padding: $spacing-md $spacing-lg;
        font-size: $font-size-sm;
        border: none;
        border-radius: $border-radius-sm;
        cursor: pointer;
        font-weight: $font-weight-semibold;
      }

      #bookmark-modal-cancel {
        background: var(--theme-bg-secondary);
        color: var(--theme-text-primary);
        border: $border-width solid var(--theme-border);

        &:hover {
          background: var(--theme-bg-tertiary, var(--theme-bg-secondary));
        }
      }

      #bookmark-modal-done {
        background: var(--theme-button-active);
        color: white;

        &:hover {
          opacity: 0.9;
        }
      }
    }
  }
}
```

---

## Task 4: Replace Long-Press Behavior with Modal Opening

**Files:**
- Modify: `src/renderer.ts:660-710` (renderBookmarkBar function)

### Step 1: Remove the old edit mode UI logic from renderBookmarkBar

In the `renderBookmarkBar()` function, find and remove these lines:

```typescript
const removeBtn = document.createElement("button");
removeBtn.className = "pill-remove";
removeBtn.textContent = "×";
removeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  removeBookmark(bm.page);
});
pill.appendChild(removeBtn);
```

And remove the edit-mode class toggle:

```typescript
bar.classList.toggle("edit-mode", bookmarkEditMode);
```

The renderBookmarkBar function should only render pills without remove buttons. Long-press behavior is now handled separately.

### Step 2: Add long-press handler that opens the edit modal

After the pill click event listener (around line 704-707), replace the long-press logic:

Old code:
```typescript
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
```

New code:
```typescript
// Long-press (500ms) opens edit modal
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
const startLongPress = () => {
  longPressTimer = setTimeout(() => {
    openBookmarkEditModal(bm);
  }, 500);
};
const cancelLongPress = () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
};
pill.addEventListener("pointerdown", startLongPress);
pill.addEventListener("pointerup", cancelLongPress);
pill.addEventListener("pointercancel", cancelLongPress);
pill.addEventListener("pointermove", cancelLongPress);
```

### Step 3: Remove the edit mode state variable usage

Remove these lines from state initialization:

```typescript
let bookmarkEditMode = false;
```

And remove the toggle button event listener:

```typescript
document.getElementById("btn-toggle-bookmarks")!.addEventListener("click", () => {
  bookmarkBarVisible = !bookmarkBarVisible;
  localStorage.setItem("pidef-bookmarks-visible", bookmarkBarVisible.toString());
  document.getElementById("btn-toggle-bookmarks")!.classList.toggle("active", bookmarkBarVisible);
});
```

And remove initialization:

```typescript
bookmarkEditMode = false;
```

(Keep `bookmarkBarVisible` — that's still used for showing/hiding the bar itself.)

---

## Task 5: Implement openBookmarkEditModal Function

**Files:**
- Modify: `src/renderer.ts:720-800` (add new function after removeBookmark/addBookmark)

### Step 1: Add the openBookmarkEditModal function

Add this new function after `addBookmark()` (around line 725):

```typescript
let currentEditingBookmark: Bookmark | null = null;

function openBookmarkEditModal(bm: Bookmark): void {
  currentEditingBookmark = bm;

  const modal = document.getElementById("bookmark-edit-modal")!;
  const labelInput = document.getElementById("bookmark-modal-label") as HTMLInputElement;
  const segueCheckbox = document.getElementById("bookmark-modal-segue") as HTMLInputElement;

  labelInput.value = bm.label;
  segueCheckbox.checked = bm.segue ?? false;

  modal.classList.remove("hidden");
  labelInput.focus();
  labelInput.select();
}

function closeBookmarkEditModal(): void {
  const modal = document.getElementById("bookmark-edit-modal")!;
  modal.classList.add("hidden");
  currentEditingBookmark = null;
}
```

---

## Task 6: Implement Modal Label Editing and Save

**Files:**
- Modify: `src/renderer.ts:800-900` (add modal event listeners after initialization)

### Step 1: Add modal event listeners for Done and Cancel

Add this code after the main renderer initialization (around line 1095, after the localStorage load for bookmarks):

```typescript
// Modal event listeners
const bookmarkModal = document.getElementById("bookmark-edit-modal")!;
const bookmarkModalBackdrop = document.getElementById("bookmark-modal-backdrop")!;
const bookmarkModalLabel = document.getElementById("bookmark-modal-label") as HTMLInputElement;
const bookmarkModalDone = document.getElementById("bookmark-modal-done")!;
const bookmarkModalCancel = document.getElementById("bookmark-modal-cancel")!;

bookmarkModalDone.addEventListener("click", () => {
  if (!currentEditingBookmark) return;

  const newLabel = bookmarkModalLabel.value.trim();
  if (!newLabel) return;

  currentEditingBookmark.label = newLabel;
  currentEditingBookmark.segue = (document.getElementById("bookmark-modal-segue") as HTMLInputElement).checked;

  if (currentFilePath) {
    pidef.writeBookmarks(currentFilePath, bookmarks);
  }

  closeBookmarkEditModal();
  renderBookmarkBar();
});

bookmarkModalCancel.addEventListener("click", () => {
  closeBookmarkEditModal();
});

bookmarkModalBackdrop.addEventListener("click", () => {
  closeBookmarkEditModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !bookmarkModal.classList.contains("hidden")) {
    closeBookmarkEditModal();
  }
});

bookmarkModalLabel.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    bookmarkModalDone.click();
  }
});
```

---

## Task 7: Implement Delete Button with Confirmation

**Files:**
- Modify: `src/renderer.ts:850-920` (add delete handler in modal event listeners)

### Step 1: Add delete confirmation logic

Add this code to the modal event listeners section (after the Done click handler):

```typescript
const bookmarkModalDelete = document.getElementById("bookmark-modal-delete")!;

bookmarkModalDelete.addEventListener("click", () => {
  if (!currentEditingBookmark) return;

  const confirmed = confirm(`Delete bookmark "${currentEditingBookmark.label}"?`);
  if (!confirmed) return;

  const pageToRemove = currentEditingBookmark.page;
  bookmarks = bookmarks.filter((b) => b.page !== pageToRemove);

  if (currentFilePath) {
    pidef.writeBookmarks(currentFilePath, bookmarks);
  }

  closeBookmarkEditModal();
  renderBookmarkBar();
});
```

---

## Task 8: Clean Up Old Edit Mode Code

**Files:**
- Modify: `src/renderer.ts` (remove old edit mode functions)
- Modify: `src/styles.scss` (remove old edit-mode styles)

### Step 1: Remove old edit mode functions from renderer.ts

Find and delete the `showBookmarkInput()` function (around line 727-773). This is no longer used since we have a proper modal.

Also remove the add-bookmark button event listener that calls `showBookmarkInput()`:

```typescript
document.getElementById("btn-add-bookmark")!.addEventListener("click", () => {
  // ... this is the old add bookmark flow
});
```

Replace it with a simpler version that opens the new add-bookmark workflow, or keep the inline input approach if you prefer. For now, remove this and we'll handle add separately in next task if needed.

Actually, the `showBookmarkInput()` function was for adding NEW bookmarks (the "+" button), not editing. Keep the add bookmark flow as-is — we're only replacing the edit behavior. So **don't remove** `showBookmarkInput()` or the `btn-add-bookmark` listener.

Remove only the `bookmarkEditMode` state variable and related code.

### Step 2: Remove old edit-mode styles from styles.scss

Find and remove this section:

```scss
&.edit-mode .bookmark-pill .pill-remove {
  display: flex;
}
```

And remove the `.pill-remove` button styles:

```scss
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
```

---

## Task 9: Integration Test — Verify Full Workflow

**Files:**
- Test in running app (manual QA)

### Step 1: Open a PDF and add a bookmark

Run the app with `npm start` and open a PDF. Add a bookmark using the "+" button.

### Step 2: Long-press the bookmark pill

Long-press (hold for 500ms) the newly created bookmark. The edit modal should open with the label pre-filled and segue unchecked.

**Expected:** Modal appears, label is selected, segue is unchecked.

### Step 3: Edit the label in the modal

Change the label text and click "Done".

**Expected:** Modal closes, pill updates with new label, segue arrow not visible.

### Step 4: Long-press again and toggle segue

Long-press the pill again, check the "Mark as segue" checkbox, click "Done".

**Expected:** Modal closes, pill now shows arrow (e.g., "MyLabel ▶").

### Step 5: Toggle segue off

Long-press, uncheck "Mark as segue", click "Done".

**Expected:** Arrow disappears from pill.

### Step 6: Test delete with confirmation

Long-press the pill, click "Delete".

**Expected:** Confirmation dialog ("Delete this bookmark?") appears. Confirming removes the bookmark; cancelling keeps it.

### Step 7: Test modal cancellation

Add another bookmark. Long-press to open modal. Press Escape.

**Expected:** Modal closes, no changes saved.

Long-press again, click outside the modal (on backdrop).

**Expected:** Modal closes, no changes saved.

### Step 8: Verify persistence

Close and reopen the PDF.

**Expected:** All bookmarks with segue flags are restored correctly. Labels and segue states match what was saved.

### Step 9: Verify backwards compatibility

Create a test bookmark file without the `segue` field (manually edit the JSON):

```json
{
  "bookmarks": [
    { "label": "OldBookmark", "page": 2 }
  ]
}
```

Load a PDF with this file.

**Expected:** Bookmark loads, no arrow displayed, can edit and add segue flag normally.

---

## Commit Strategy

After each task, commit with a descriptive message:

- Task 1: `git commit -m "feat: add segue field to Bookmark interface, display arrow in pills"`
- Task 2: `git commit -m "feat: add bookmark edit modal HTML structure"`
- Task 3: `git commit -m "feat: add bookmark edit modal styles"`
- Task 4: `git commit -m "refactor: replace edit mode with modal open on long-press"`
- Task 5: `git commit -m "feat: implement openBookmarkEditModal and closeBookmarkEditModal functions"`
- Task 6: `git commit -m "feat: implement modal label editing and save functionality"`
- Task 7: `git commit -m "feat: implement delete button with confirmation in modal"`
- Task 8: `git commit -m "refactor: remove old edit mode UI code"`
- Task 9: (no commit for manual testing)

---

## Summary

This plan replaces the clunky long-press → red X UI with a proper modal for editing bookmarks. The `segue` flag is purely visual (a ▶ arrow), and all changes are backwards-compatible. The modal provides a clear, touch-friendly interface for label editing, segue toggling, and deletion with confirmation.
