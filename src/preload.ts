import { ipcRenderer } from "electron";

(window as any).pidef = {
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  onOpenFile: (cb: (path: string) => void) => {
    ipcRenderer.on("open-file", (_e, path) => cb(path));
  },
  onToggleFullscreen: (cb: () => void) => {
    ipcRenderer.on("toggle-fullscreen", () => cb());
  },
};
