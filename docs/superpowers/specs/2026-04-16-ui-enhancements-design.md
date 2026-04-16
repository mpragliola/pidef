# UI Enhancements Design

**Date:** 2026-04-16
**Status:** Approved

## Overview

Comprehensive redesign of pidef's UI to improve touch interaction, navigation clarity, and bookmark management. Seven interconnected features reorganize the toolbar, add intelligent bookmark display modes, and introduce an overlay mode for quick bookmark access.

## Section 1: Layout Redesign

### Top Bar (Simplified)
- **Left:** Open (icon) | Close button (44px touch target)
- **Center:** Nearest bookmark title (plain text, centered on page, not on available space)
- **Right:** Rotate button (44px touch target)
- **Changes:** Remove page numbers; add rounded corners to all buttons
- **Rotation:** All elements rotate with PDF

### Bottom Nav Bar (Expanded)
- **Left:** First, Prev buttons
- **Center:** Page slider with page count label
- **Right:** Next, Last, Save buttons
- **Above/adjacent:** View/filter buttons (Sepia, Invert, Sharpen, Fullscreen, Toggle Bookmarks)
- **Touch targets:** 44-48px with rounded corners
- **Rotation:** All elements rotate with PDF

### Bookmark Bar (Conditional)
- **Side:** Vertical stack of controls — "+" | Width (s/m/l) | "Aa" | Tri-state
- **Main area:** Bookmark pills (displayed based on mode)
- **Hidden when:** Overlay mode active
- **Rotation:** Rotates with PDF, maintains side position relative to rotation

---

## Section 2: Bookmark Display Modes (Feature 4)

Four states controlled by `bookmarkDisplayMode` state variable:

### Mode: hidden
- Bookmark bar not visible
- Click bookmarks button → cycle to 1-line

### Mode: 1-line
- Single scrollable row of pills
- **Nearest previous bookmark highlighted** with distinct background color
- Nearest pill centered in view if possible
- Click bookmarks button → cycle to all

### Mode: all
- All bookmarks visible in full (current behavior)
- Nearest pill highlighted with distinct background
- Click bookmarks button → cycle to hidden

### Mode: overlay
- **Trigger:** Long-press bookmarks button
- Pills stack vertically on **right border** of page (relative to rotation)
- Scrollable
- Semi-transparent backdrop
- Larger fonts than regular pills
- Nearest pill highlighted
- **Close overlay:** Click pill (jump + return to previous mode), click away, or press Escape
- **Hidden:** Nav bar, bookmark bar (only top bar visible)

### Switching Modes
- **Bookmarks button (click):** Cycle through hidden → 1-line → all → hidden
- **Bookmarks button (long-press):** Enter overlay, return to previous mode on interaction
- **Tri-state button:** Direct toggle between hide/1-line/all

---

## Section 3: Top Bar Title Display (Feature 5)

### Nearest Bookmark Title
- **Display:** Nearest previous bookmark title, plain text, centered on **page** (not in available space)
- **Logic:** If on page 5 with bookmarks at pages 2, 4, 7, 10 → show page 4's title
- **Toggleable:** "Aa" button (44px touch target) in bookmark bar controls visibility
- **Persistence:** User preference saved to localStorage (`showTopBarTitle`)

### Nearest Bookmark Logic
- Recalculate on every page change
- Recalculate when bookmarks added/removed
- Return null if no bookmarks exist

---

## Section 4: Pill Width Control (Feature 3)

### Width Control Button
- Located in bookmark bar control stack
- **s (small):** Pills show only leading digit(s)+letter(s) or "#bookmark" if none found
  - Example: "4", "13A", "05f", "#bookmark"
- **m (medium):** Pills show ~10-12 characters of full title with ellipsis
  - Example: "4 Chapter...", "13 Introduc..."
- **l (large):** Pills show full title
  - Example: "4 Chapter: The Journey Begins", "13 Introduction to Modern Physics"

### Display in Pills
- **Leading digit(s)+letter(s):** Bold and bigger (only in pills, not elsewhere)
- **Rest of title:** Normal font
- **Touch target:** 44-48px button with rounded corners
- **Persistence:** User preference saved to localStorage (`bookmarkWidthMode`)

---

## Section 5: Tri-State Bookmark Bar (Feature 4)

### Tri-State Button
- Located in bookmark bar control stack
- Cycles through: hide → 1-line → all → hide
- **44-48px touch target** with rounded corners
- Direct toggle to any mode

### Behavior
- Respects current `bookmarkDisplayMode`
- Clicking cycles to next mode
- Does not affect overlay mode (separate trigger)

---

## Section 6: Overlay Mode Details (Feature 7)

### Trigger
- Long-press bookmarks button (the 🔖 button in nav bar)

### Display
- Full-screen or semi-transparent modal overlay
- Pills stacked vertically on **right border** of page (relative to rotation)
- Scrollable
- Larger fonts than regular pills (increase font-size by ~20-30%)
- Leading digit(s)+letter(s) bold and bigger
- Nearest pill highlighted with distinct background

### Interactions
- **Click a pill:** Jump to bookmark page, close overlay, return to previous display mode
- **Click backdrop (away):** Close overlay, return to previous mode
- **Escape key:** Close overlay, return to previous mode

### Hidden Elements When Overlay Active
- Nav bar (bottom)
- Bookmark bar (bottom, controls and pills)
- Only top bar visible (Open, Title, Rotate)

---

## Section 7: Touch Targets & Styling (Feature 6)

### Minimum Touch Targets
All buttons: **44x44px minimum, preferably 48x48px**
- Open (icon, top-left)
- Close (top-left)
- Rotate (top-right)
- "+" add bookmark (bookmark bar)
- Width control (bookmark bar)
- "Aa" toggle (bookmark bar)
- Tri-state (bookmark bar)
- All nav bar buttons (First, Prev, Next, Last, Save, view/filter)

### Button Styling
- **Rounded corners:** Slightly rounder than current (increase `border-radius` by ~2-3px)
- **Consistency:** Match existing button styles, maintain visual hierarchy
- **Hover/active states:** Maintain existing hover behavior

---

## Section 8: Rotation Awareness

### All Elements Rotate With PDF
- **Top bar:** Open stays left, Rotate stays right (relative to page rotation)
- **Nav bar:** Rotates, layout adjusts
- **Bookmark bar:** Controls and pills rotate, maintain side position relative to rotation
- **Overlay mode:** Pills appear on right border relative to current rotation
- **Title centering:** Centered on rotated page view

### Implementation
- Follow existing HUD rotation pattern (brightness control already rotates)
- Apply same rotation transform to all new/modified elements

---

## Section 9: Data Model & State Management

### New State Variables
- `bookmarkDisplayMode`: 'hidden' | '1-line' | 'all' | 'overlay' (default: '1-line')
- `bookmarkWidthMode`: 's' | 'm' | 'l' (default: 'm')
- `showTopBarTitle`: boolean (default: true)
- `nearestBookmarkPage`: number | null (page of nearest previous bookmark, null if none)
- `overlayActiveFromMode`: 'hidden' | '1-line' | 'all' (remembers which mode to return to after overlay closes)

### Derived Values
- `nearestBookmarkIndex`: index in bookmarks array at `nearestBookmarkPage`
- `formattedLeadingChars(title)`: extracts and returns leading digit(s)+letter(s) from title
- `truncatedTitle(title, mode)`: returns title based on width mode (s/m/l)

### Updates on Page Change
- Recalculate `nearestBookmarkPage`
- Update `nearestBookmarkIndex`
- Re-render top bar title if visible

### Updates on Bookmark Changes
- Recalculate `nearestBookmarkPage` (bookmark added/removed might change nearest)
- Update bookmarks array
- Save to JSON file via IPC

### localStorage Persistence
- `pidef-bookmark-display-mode`: 'hidden' | '1-line' | 'all'
- `pidef-bookmark-width-mode`: 's' | 'm' | 'l'
- `pidef-show-top-bar-title`: true | false
- Restore on app load

### Existing Data Structures
- Bookmark interface (from segue feature): `{ label: string, page: number, segue?: boolean }`
- No changes needed; these enhancements are additive
- Bookmarks stored in JSON companion files (existing system)

---

## Section 10: Testing Checklist

- [ ] Top bar displays nearest bookmark title correctly, updates on page change
- [ ] "Aa" button toggles title visibility, persists preference
- [ ] Bookmarks button click cycles through modes (hidden → 1-line → all → hidden)
- [ ] Bookmarks button long-press enters overlay mode
- [ ] Overlay shows pills stacked vertically, scrollable, on right border
- [ ] Clicking pill in overlay jumps to page and returns to previous mode
- [ ] Clicking away from overlay closes it and returns to previous mode
- [ ] Escape key closes overlay
- [ ] Width control (s/m/l) correctly formats pill display
- [ ] Leading digit(s)+letter(s) are bold and bigger in pills
- [ ] Nearest pill is highlighted in all modes (1-line, all, overlay)
- [ ] Nearest pill is centered (or as centered as possible) in 1-line mode
- [ ] Tri-state button directly cycles through hide/1-line/all
- [ ] All buttons are 44-48px touch targets
- [ ] All placements rotate correctly with PDF
- [ ] User preferences persist across app reload
- [ ] Overlay hides nav bar and bookmark bar
- [ ] No page numbers in top bar
- [ ] Open button is an icon (not text)

---

## Summary

This cohesive update reorganizes pidef's UI for better touch interaction and bookmark management. The new bookmark display modes provide flexibility (hidden/1-line/all/overlay), while the top bar redesign simplifies navigation. All elements scale properly for touch targets and rotate intelligently with the PDF. The system maintains backwards compatibility with existing bookmarks while adding powerful new display and control options.
