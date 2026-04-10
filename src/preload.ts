import { ipcRenderer } from "electron";

interface FileRecord {
  path: string;
  page: number;
}

interface PidefAPI {
  openFileDialog: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  getFullscreen: () => Promise<boolean>;
  getRecentFiles: () => Promise<FileRecord[]>;
  addRecentFile: (path: string, page?: number) => Promise<void>;
  updateFilePage: (path: string, page: number) => Promise<void>;
  onOpenFile: (cb: (path: string) => void) => void;
  onToggleFullscreen: (cb: () => void) => void;
}

(window as any).pidef = {
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  getRecentFiles: () => ipcRenderer.invoke("get-recent-files"),
  addRecentFile: (path: string, page?: number) => ipcRenderer.invoke("add-recent-file", path, page),
  updateFilePage: (path: string, page: number) => ipcRenderer.invoke("update-file-page", path, page),
  onOpenFile: (cb: (path: string) => void) => {
    ipcRenderer.on("open-file", (_e, path) => cb(path));
  },
  onToggleFullscreen: (cb: () => void) => {
    ipcRenderer.on("toggle-fullscreen", () => cb());
  },
};
