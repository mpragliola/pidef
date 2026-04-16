import { ipcRenderer } from "electron";

interface FileRecord {
  path: string;
  page: number;
  halfMode?: boolean;
}

interface Bookmark {
  label: string;
  page: number;
}

interface PidefAPI {
  openFileDialog: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  getFullscreen: () => Promise<boolean>;
  setBrightness: (level: number) => Promise<void>;
  getRecentFiles: () => Promise<FileRecord[]>;
  addRecentFile: (path: string, page?: number) => Promise<void>;
  updateFilePage: (path: string, page: number) => Promise<void>;
  updateFileHalfMode: (path: string, halfMode: boolean) => Promise<void>;
  readBookmarks: (pdfPath: string) => Promise<Bookmark[]>;
  writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => Promise<void>;
  onOpenFile: (cb: (path: string) => void) => void;
  onToggleFullscreen: (cb: () => void) => void;
}

(window as any).pidef = {
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  setBrightness: (level: number) => ipcRenderer.invoke("set-brightness", level),
  getRecentFiles: () => ipcRenderer.invoke("get-recent-files"),
  addRecentFile: (path: string, page?: number) => ipcRenderer.invoke("add-recent-file", path, page),
  updateFilePage: (path: string, page: number) => ipcRenderer.invoke("update-file-page", path, page),
  updateFileHalfMode: (path: string, halfMode: boolean) => ipcRenderer.invoke("update-file-half-mode", path, halfMode),
  readBookmarks: (pdfPath: string) => ipcRenderer.invoke("read-bookmarks", pdfPath),
  writeBookmarks: (pdfPath: string, bookmarks: Bookmark[]) => ipcRenderer.invoke("write-bookmarks", pdfPath, bookmarks),
  onOpenFile: (cb: (path: string) => void) => {
    ipcRenderer.on("open-file", (_e, path) => cb(path));
  },
  onToggleFullscreen: (cb: () => void) => {
    ipcRenderer.on("toggle-fullscreen", () => cb());
  },
};
