import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

const RECENT_FILES_MAX = 10;

function getRecentFilesPath(): string {
  return path.join(app.getPath("userData"), "recent-files.json");
}

function loadRecentFiles(): string[] {
  try {
    const filePath = getRecentFilesPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const files = JSON.parse(data);
      return Array.isArray(files) ? files : [];
    }
  } catch (err) {
    console.error("Failed to load recent files:", err);
  }
  return [];
}

function saveRecentFiles(files: string[]): void {
  try {
    const filePath = getRecentFilesPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(files, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save recent files:", err);
  }
}

function addRecentFile(filePath: string): void {
  let files = loadRecentFiles();
  // Remove if already present
  files = files.filter((f) => f !== filePath);
  // Add to front
  files.unshift(filePath);
  // Keep only the most recent N
  files = files.slice(0, RECENT_FILES_MAX);
  saveRecentFiles(files);
}

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
    addRecentFile(filePath);
    mainWindow.webContents.send("open-file", filePath);
  }
}

ipcMain.handle("open-file-dialog", openFileDialog);

ipcMain.handle("get-recent-files", () => {
  return loadRecentFiles();
});

ipcMain.handle("add-recent-file", (_event, filePath: string) => {
  addRecentFile(filePath);
});

ipcMain.handle("toggle-fullscreen", () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.handle("get-fullscreen", () => {
  return mainWindow?.isFullScreen() ?? false;
});

app.whenReady().then(() => {
  const filePath = process.argv.find((arg, i) => i > 0 && arg.endsWith(".pdf"));
  createWindow(filePath);
});

app.on("window-all-closed", () => {
  app.quit();
});
