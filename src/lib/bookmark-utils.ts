/**
 * Utility functions for displaying and locating bookmarks in the UI.
 *
 * Bookmarks are user-defined page markers stored as JSON in a sidecar file
 * alongside the open PDF (e.g. `myscore.pdf.bookmarks.json`). Each bookmark
 * has at minimum a `page` number and a human-readable `title` string.
 *
 * These helpers are pure functions that operate on bookmark data already loaded
 * into memory — they do not perform any I/O. Persistence (reading/writing the
 * JSON file) is handled separately in `src/bookmarks.ts`.
 *
 * Typical use-cases covered here:
 *   - Truncating a bookmark title to fit inside a small pill indicator.
 *   - Finding which bookmark "covers" the current page (i.e. the most recent
 *     bookmark at or before the current page number).
 */
import { Bookmark } from '../bookmarks';

/**
 * Extracts a short numeric prefix (with optional trailing letter) from a
 * bookmark title, for use in compact "small" pill display mode.
 *
 * Examples:
 *   `"12 — Autumn Leaves"`  → `"12"`
 *   `"4b. Blues in F"`      → `"4b"`
 *   `"Intro"`               → `""` (no leading digits)
 *
 * @param title - Full bookmark title string.
 * @returns     - The leading digit(s) plus optional letter, or `""` if the
 *               title does not start with a number.
 */
export function extractLeadingChars(title: string): string {
  // Match one or more digits at the start of the string, optionally followed
  // by a single ASCII letter (e.g. "4b" for a sub-section like "4b. Blues").
  const match = title.match(/^(\d+[a-zA-Z]?)/);
  return match ? match[1] : '';
}

/**
 * Formats a bookmark title for display inside a pill indicator according to
 * the requested size mode.
 *
 * Three size modes are supported to accommodate different amounts of available
 * screen real estate:
 *
 *   `'s'` (small)  — Shows only the leading numeric prefix extracted by
 *                    `extractLeadingChars`. If the title has no leading
 *                    digits, falls back to the generic placeholder `'#bookmark'`.
 *
 *   `'m'` (medium) — Shows up to the first 12 characters of the title,
 *                    appending `'...'` if truncated.
 *
 *   `'l'` (large)  — Shows the full title, untruncated.
 *
 * @param title - Full bookmark title.
 * @param mode  - Display size: `'s'` | `'m'` | `'l'`.
 * @returns     - Formatted string ready for rendering inside a pill element.
 */
export function formatPillContent(title: string, mode: 's' | 'm' | 'l'): string {
  switch (mode) {
    case 's': {
      const leading = extractLeadingChars(title);
      // If the title has no leading number (e.g. "Intro", "Coda"), there is
      // nothing meaningful to show in the tiny pill. Fall back to a generic
      // bookmark glyph/label so the pill is never visually empty.
      return leading || '#bookmark';
    }
    case 'm':
      return title.length > 12 ? title.substring(0, 12) + '...' : title;
    case 'l':
      return title;
  }
}

/**
 * Finds the nearest bookmark at or before `currentPage` (i.e. the bookmark
 * that "owns" the current page in a sequential reading flow).
 *
 * The algorithm is a linear scan that keeps track of the highest bookmark page
 * that does not exceed `currentPage`. Because bookmarks are not assumed to be
 * sorted, all entries are examined.
 *
 * Example: bookmarks at pages [1, 5, 10, 15], currentPage = 12
 *   → returns the bookmark at page 10 (closest without going over).
 *
 * If no bookmark exists at or before `currentPage` (e.g. currentPage is before
 * the first bookmark), both returned values are `null`.
 *
 * @param bookmarks   - Array of all bookmarks for the current document.
 * @param currentPage - The 1-based page number currently displayed.
 * @returns           - `{ page, index }` of the nearest qualifying bookmark,
 *                      or `{ page: null, index: null }` if none qualifies.
 */
export function findNearestBookmark(
  bookmarks: Bookmark[],
  currentPage: number
): { page: number | null; index: number | null } {
  if (bookmarks.length === 0) return { page: null, index: null };
  let nearest: { page: number; index: number } | null = null;
  for (let i = 0; i < bookmarks.length; i++) {
    // Only consider bookmarks whose page is at or before the current page —
    // bookmarks ahead of the reader are not "active" yet.
    if (bookmarks[i].page <= currentPage) {
      // Among all qualifying candidates, keep the one with the highest page
      // number (i.e. the most recently passed bookmark).
      if (!nearest || bookmarks[i].page > nearest.page) {
        nearest = { page: bookmarks[i].page, index: i };
      }
    }
  }
  return { page: nearest?.page ?? null, index: nearest?.index ?? null };
}
