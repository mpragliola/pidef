import * as fs from "fs";
import * as path from "path";

export interface FileRecord {
  path: string;
  page: number;
  halfMode?: boolean;
}

export const RECENT_FILES_MAX = 10;

function recentFilesPath(dataDir: string): string {
  return path.join(dataDir, "recent-files.json");
}

export function loadRecentFiles(dataDir: string): FileRecord[] {
  try {
    const filePath = recentFilesPath(dataDir);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const files = JSON.parse(data);
      if (Array.isArray(files)) {
        return files.map((f) =>
          typeof f === "string" ? { path: f, page: 0 } : f
        );
      }
    }
  } catch (err) {
    console.error("Failed to load recent files:", err);
  }
  return [];
}

export function saveRecentFiles(files: FileRecord[], dataDir: string): void {
  try {
    const filePath = recentFilesPath(dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(files, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save recent files:", err);
  }
}

export function addRecentFile(
  filePath: string,
  page: number = 0,
  dataDir: string
): void {
  let files = loadRecentFiles(dataDir);
  const existing = files.find((f) => f.path === filePath);
  files = files.filter((f) => f.path !== filePath);
  files.unshift({ path: filePath, page, halfMode: existing?.halfMode });
  files = files.slice(0, RECENT_FILES_MAX);
  saveRecentFiles(files, dataDir);
}

export function updateFilePage(
  filePath: string,
  page: number,
  dataDir: string
): void {
  let files = loadRecentFiles(dataDir);
  const file = files.find((f) => f.path === filePath);
  if (file) {
    file.page = page;
    saveRecentFiles(files, dataDir);
  }
}

export function updateFileHalfMode(
  filePath: string,
  halfMode: boolean,
  dataDir: string
): void {
  let files = loadRecentFiles(dataDir);
  const file = files.find((f) => f.path === filePath);
  if (file) {
    file.halfMode = halfMode;
    saveRecentFiles(files, dataDir);
  }
}
