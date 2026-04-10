import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;

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
    mainWindow.webContents.send("open-file", result.filePaths[0]);
  }
}

ipcMain.handle("open-file-dialog", openFileDialog);

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
