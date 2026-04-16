# Segue Bookmarks Design

**Date:** 2026-04-16
**Status:** Approved

## Overview

Extend the existing bookmarks system with a **segue flag** — an optional annotation that marks a bookmark as the start of a section that flows directly into the next. When active, a triangular arrow (▶) appears in the bookmark pill to visually indicate the transition. This is purely decorative; segue flags do not change page navigation behavior.

## Section 1: Data Model & Storage

Extend the `Bookmark` interface with an optional `segue` field:

```typescript
interface Bookmark {
  label: string;
  page: number;
  segue?: boolean; // optional, defaults to false
}
```

The JSON companion file format becomes:

```json
{
  "bookmarks": [
    { "label": "Intro", "page": 1, "segue": false },
    { "label": "Chorus", "page": 4, "segue": true },
    { "label": "Bridge", "page": 7, "segue": false }
  ]
}
```

**Backwards compatibility:** Existing bookmark files without the `segue` field will load fine; the field defaults to `false` (no arrow indicator).

**Storage:** The `bookmarks.ts` module requires no changes — it already handles generic JSON serialization and will preserve the `segue` field automatically.

## Section 2: Pill UI & Visual Indicator

When rendering bookmark pills, if `segue === true`, append a triangular arrow (▶) to the right of the label text:

**Example display:**
- Normal bookmark: `[Chorus]`
- Segue bookmark: `[Chorus ▶]`

The arrow uses the same font size as the label with a small left margin (2–4px). Pill dimensions remain unchanged; the arrow is part of the text flow.

## Section 3: Edit Modal (Long-Press Interaction)

Long-pressing a bookmark pill opens a modal dialog containing:

### Modal Structure

- **Title:** "Edit Bookmark"
- **Label input field:** Text input pre-filled with the current bookmark label, auto-focused
- **Segue toggle:** Checkbox with label "Mark as segue"
- **Delete button:** Full-width, red/destructive styling, positioned at bottom

### Interaction Flow

1. **Long-press pill** → Modal opens
2. **Edit label:** User types in the input field
3. **Toggle segue:** Check/uncheck the segue box
4. **Confirm:** Click "Done" or press Enter in the input field → saves changes, closes modal
5. **Cancel:** Click outside modal, press Escape, or click Cancel button → discards changes
6. **Delete:** Click Delete button → confirmation dialog ("Delete this bookmark?") → on confirm, removes bookmark and closes modal

### Modal Styling

- Semi-transparent backdrop (prevents interaction with pills behind)
- Centered container with padding and rounded corners
- Label input: standard text input, 100% width within modal
- Segue toggle: checkbox with descriptive label
- Delete button: red/destructive color, full width, positioned at bottom
- Cancel and Done buttons: standard styling, positioned at bottom

## Section 4: Implementation Notes

### Files Modified

1. **`renderer.ts`**
   - Extend `Bookmark` interface definition to include `segue?: boolean`
   - Update pill rendering: append ` ▶` to the label text when `segue === true`
   - Add modal HTML rendering logic (create modal on long-press)
   - Add event handlers: toggle segue checkbox, confirm/cancel, delete with confirmation

2. **`index.html`**
   - Add modal template: `<div id="bookmark-edit-modal">` with input, toggle, and button elements

3. **`styles.scss`**
   - Modal backdrop: semi-transparent overlay
   - Modal container: centered, rounded, shadow
   - Input and toggle styling
   - Delete button: destructive red styling (matches existing red button patterns)

4. **`bookmarks.ts`**
   - No changes required (existing serialization handles the new field)

### Data Flow

- User opens PDF → bookmarks loaded via IPC (includes any `segue` flags)
- User long-presses pill → modal opens, displays current label and segue state
- User toggles segue checkbox → updates in-memory `bookmarks` array
- User clicks "Done" → calls `pidef.writeBookmarks()` with updated array (including `segue` field)
- Pill re-renders with ▶ if `segue === true`

## Section 5: Testing Checklist

- Bookmarks without `segue` field (legacy files) load and render correctly (no arrow)
- Long-press opens modal with correct label and segue state pre-filled
- Toggling segue checkbox updates pill rendering (arrow appears/disappears)
- Label edits save correctly
- Delete button opens confirmation and removes bookmark on confirm
- Escape and click-outside both cancel the modal without saving changes
- Changes persist across file reopens (saved to JSON)
