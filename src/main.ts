import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import {
  loadRecentFiles,
  addRecentFile,
  updateFilePage,
} from "./recent-files";
import { readBookmarks, writeBookmarks, Bookmark } from "./bookmarks";

// Debug logging to file
const debugLogFile = "/tmp/pidef-brightness-debug.log";
function debugLog(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ${msg}\n`;
  try {
    fs.appendFileSync(debugLogFile, line);
  } catch (e) {
    // ignore
  }
  console.log(`[brightness] ${msg}`);
}

let mainWindow: BrowserWindow | null = null;

// Check brightnessctl is available at startup
exec("which brightnessctl", (err) => {
  if (!err) {
    debugLog("brightnessctl is available");
  } else {
    debugLog("WARNING: brightnessctl not found. Install with: sudo apt install brightnessctl");
  }
});

function createWindow(filePath?: string) {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    title: "pidef",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    if (filePath) {
      mainWindow!.webContents.send("open-file", filePath);
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open PDF",
          accelerator: "CmdOrCtrl+O",
          click: () => openFileDialog(),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Fullscreen",
          accelerator: "F11",
          click: () => mainWindow?.webContents.send("toggle-fullscreen"),
        },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

async function openFileDialog() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open PDF",
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
    properties: ["openFile"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    addRecentFile(filePath, 0, app.getPath("userData"));
    mainWindow.webContents.send("open-file", filePath);
  }
}

ipcMain.handle("open-file-dialog", openFileDialog);

ipcMain.handle("get-recent-files", () => {
  const files = loadRecentFiles(app.getPath("userData"));
  return files.filter((f) => fs.existsSync(f.path));
});

ipcMain.handle("add-recent-file", (_event, filePath: string, page?: number) => {
  addRecentFile(filePath, page ?? 0, app.getPath("userData"));
});

ipcMain.handle("update-file-page", (_event, filePath: string, page: number) => {
  updateFilePage(filePath, page, app.getPath("userData"));
});

ipcMain.handle("toggle-fullscreen", () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.handle("get-fullscreen", () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle("set-brightness", (_event, level: number) => {
  const clamped = Math.max(0.1, Math.min(1.0, level));
  const percentage = Math.round(clamped * 100);
  // Try without sudo first (if udev rules are set up), fall back to sudo
  let cmd = `brightnessctl set ${percentage}%`;
  debugLog(`Executing: ${cmd}`);
  return new Promise<void>((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err && err.message.includes("Permission denied")) {
        // Fall back to sudo if no udev rule
        debugLog(`Permission denied, trying with sudo`);
        cmd = `sudo brightnessctl set ${percentage}%`;
        exec(cmd, (err2) => {
          if (err2) {
            debugLog(`Error: ${err2.message}`);
            reject(err2);
          } else {
            debugLog(`Success (via sudo): brightness set to ${percentage}%`);
            resolve();
          }
        });
      } else if (err) {
        debugLog(`Error: ${err.message}`);
        reject(err);
      } else {
        debugLog(`Success: brightness set to ${percentage}%`);
        resolve();
      }
    });
  });
});

ipcMain.handle("read-bookmarks", (_event, pdfPath: string): Bookmark[] => {
  return readBookmarks(pdfPath);
});

ipcMain.handle("write-bookmarks", (_event, pdfPath: string, bookmarks: Bookmark[]): void => {
  writeBookmarks(pdfPath, bookmarks);
});

app.whenReady().then(() => {
  const filePath = process.argv.find((arg, i) => i > 0 && arg.endsWith(".pdf"));
  createWindow(filePath);
});

app.on("window-all-closed", () => {
  app.quit();
});
