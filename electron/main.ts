import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc-handlers.js";

let consoleWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let suggestionWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development";

function createWindow(urlHash: string, options: Electron.BrowserWindowConstructorOptions) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    ...options
  });

  const entry = isDev
    ? `http://localhost:5173/${urlHash}`
    : `file://${path.join(app.getAppPath(), "dist/index.html")}${urlHash}`;

  void win.loadURL(entry);
  win.once("ready-to-show", () => win.show());
  return win;
}

function createConsoleWindow() {
  consoleWindow = createWindow("#console", {
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "ovo 控制台界面",
    frame: true,
    backgroundColor: "#0a0a14"
  });
}

function createFloatingWindow() {
  floatingWindow = createWindow("#float", {
    width: 64,
    height: 64,
    x: 1480,
    y: 80,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    title: "ovo 悬浮球"
  });
}

function createSuggestionWindow() {
  suggestionWindow = createWindow("#panel", {
    width: 420,
    height: 860,
    x: 0,
    y: 60,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: true,
    title: "ovo 建议面板"
  });
}

function createAllWindows() {
  createConsoleWindow();
  createFloatingWindow();
  createSuggestionWindow();
}

app.whenReady().then(() => {
  createAllWindows();
  registerIpcHandlers({
    getConsoleWindow: () => consoleWindow,
    getFloatingWindow: () => floatingWindow,
    getSuggestionWindow: () => suggestionWindow
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createAllWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
