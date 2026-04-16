# Font Awesome Free Icons — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

## Goal

Replace emoji/Unicode button icons with Font Awesome Free solid icons for a consistent, professional, touch-friendly appearance.

## Approach

Install `@fortawesome/fontawesome-free` as an npm dependency. Import the SCSS entrypoints in `src/styles.scss`. Replace button text content with `<i className="fa-solid fa-...">` elements in `Toolbar.tsx` and `NavBar.tsx`.

## Installation

```
npm install @fortawesome/fontawesome-free
```

## CSS Integration

Add to the top of `src/styles.scss`:

```scss
@use '@fortawesome/fontawesome-free/scss/fontawesome';
@use '@fortawesome/fontawesome-free/scss/solid';
```

Only the `solid` subset is needed (no brands, no regular).

## Icon Map

| Button       | Element ID                   | FA icon class              |
|--------------|------------------------------|----------------------------|
| Open         | `#btn-open`                  | `fa-folder-open`           |
| Close        | `#btn-close`                 | `fa-xmark`                 |
| Rotate CCW   | `#btn-rotate-ccw`            | `fa-rotate-left`           |
| Rotate CW    | `#btn-rotate-cw`             | `fa-rotate-right`          |
| Fullscreen   | `#btn-fullscreen`            | `fa-expand`                |
| First page   | `#btn-first`                 | `fa-backward-step`         |
| Prev page    | `#btn-prev`                  | `fa-chevron-left`          |
| Next page    | `#btn-next`                  | `fa-chevron-right`         |
| Last page    | `#btn-last`                  | `fa-forward-step`          |
| Sepia        | `#btn-sepia`                 | `fa-sun`                   |
| Invert       | `#btn-invert`                | `fa-circle-half-stroke`    |
| Half mode    | `#btn-half`                  | `fa-table-columns`         |
| Bookmarks    | `#btn-toggle-bookmarks-nav`  | `fa-bookmark`              |

## Sizing

Remove the `font-size: $font-size-2xl` added to toolbar/nav-bar `button` rules in `styles.scss`. Add a targeted rule instead:

```scss
button .fa-solid {
  font-size: $font-size-2xl;
}
```

This keeps button sizing (min-height/min-width) decoupled from icon sizing.

## Files Changed

- `package.json` — add `@fortawesome/fontawesome-free` dependency
- `src/styles.scss` — add `@use` imports; replace direct `font-size` on buttons with targeted icon rule
- `src/components/Toolbar.tsx` — replace emoji content with `<i>` elements
- `src/components/NavBar.tsx` — replace emoji content with `<i>` elements

## Tests

No test changes needed — no tests assert on button text content.
