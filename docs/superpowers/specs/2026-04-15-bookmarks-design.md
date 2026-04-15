# Bookmarks Design

**Date:** 2026-04-15
**Status:** Approved

## Overview

Named jump points (bookmarks) for quick page navigation in PDFs that have no built-in outlines. Bookmarks are created inside the app and stored in a companion JSON file alongside the PDF. A touch-friendly pill bar provides one-tap navigation during performance.

## Section 1: Data Model & Storage

Companion file lives next to the PDF with the same name plus `.json`:

```
/music/mysong.pdf
/music/mysong.pdf.json
```

Format:

```json
{
  "bookmarks": [
    { "label": "Intro", "page": 1 },
    { "label": "Chorus", "page": 4 },
    { "label": "Bridge", "page": 7 }
  ]
}
```

- Bookmarks are stored sorted by page number.
- The companion file is read when a PDF is opened (silently ignored if absent).
- Written back whenever bookmarks are added or removed.
- A new module `src/bookmarks.ts` owns the data structure and serialization.

## Section 2: IPC / File Access

Renderer accesses the filesystem via two IPC channels added to `main.ts` and exposed through `preload.ts`:

- `pidef:read-bookmarks(pdfPath)` → returns parsed bookmark array, or `[]` if no companion file exists.
- `pidef:write-bookmarks(pdfPath, bookmarks)` → writes the companion JSON atomically (write to `.tmp`, then rename) to prevent corruption on crash.

`bookmarks.ts` in the renderer owns in-memory state and calls these two IPC wrappers. The rest of the renderer reads from that module.

## Section 3: UI Components

### Bookmark bar

- Wrapping (not scrollable) horizontal row of pill buttons.
- Sits between the canvas and the existing nav bar.
- Pills wrap to additional lines if needed; bar height is variable.
- Hidden automatically when there are no bookmarks.
- Rotates with the surface (same as the HUD).

### Bookmark pills

- Each pill shows the bookmark label; tapping jumps to that page instantly.
- Touch target: **32px** (secondary UI element within dedicated bar).
- All other touch targets (toolbar, nav bar) remain at 44px minimum.

### Toggle button

- Added to the existing toolbar alongside fullscreen and open.
- Shows/hides the bookmark bar.
- State persists in `localStorage` across sessions.

### Add bookmark button

- "+" button at the right end of the bookmark bar (visible when the bar is shown).
- Also visible in the toolbar when the bar is visible.

## Section 4: Creating and Managing Bookmarks

### Adding

- Tapping "+" opens a small inline label input directly in the bar (not a modal).
- Pre-filled with `p.N` (current page number) as a default label.
- Confirming (Enter or checkmark) adds the bookmark and saves the companion file.
- Cancelling (Escape or tap outside) discards the input.
- Bookmarks are always sorted by page number after insertion.

### No duplicates

- If the current page already has a bookmark, tapping "+" highlights that pill instead of opening the input.

### Removing

- Long-pressing a bookmark pill enters edit mode — all pills show a small "×" badge.
- Tapping "×" removes that bookmark and saves the companion file.
- Tapping anywhere outside exits edit mode.

### Order

- Bookmarks are always sorted by page number, both in storage and in the displayed bar.
