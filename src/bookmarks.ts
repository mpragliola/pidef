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
