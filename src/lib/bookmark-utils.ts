// src/lib/bookmark-utils.ts
import { Bookmark } from '../bookmarks';

export function extractLeadingChars(title: string): string {
  const match = title.match(/^(\d+[a-zA-Z]?)/);
  return match ? match[1] : '';
}

export function formatPillContent(title: string, mode: 's' | 'm' | 'l'): string {
  switch (mode) {
    case 's': {
      const leading = extractLeadingChars(title);
      return leading || '#bookmark';
    }
    case 'm':
      return title.length > 12 ? title.substring(0, 12) + '...' : title;
    case 'l':
      return title;
  }
}

export function findNearestBookmark(
  bookmarks: Bookmark[],
  currentPage: number
): { page: number | null; index: number | null } {
  if (bookmarks.length === 0) return { page: null, index: null };
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
