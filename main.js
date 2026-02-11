const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let stopTailFn = null;
let overlayWindow = null;
let lastOverlayState = { mobName: "", hate: 0 };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 240,
    height: 110,
    x: 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile("overlay.html");
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  overlayWindow.once("ready-to-show", () => {
    if (overlayWindow) overlayWindow.webContents.send("overlay-state", lastOverlayState);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function findLatestLog(logDir) {
  const entries = fs.readdirSync(logDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".txt"))
    .map((e) => {
      const full = path.join(logDir, e.name);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs };
    });
  if (!files.length) return "";
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0].path;
}

function startTail(filePath, fromStart, onLine) {
  let position = 0;
  let buffer = "";
  if (!fromStart) {
    try {
      position = fs.statSync(filePath).size;
    } catch {
      position = 0;
    }
  }

  function readNew() {
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return;
    }
    if (stats.size < position) position = 0;
    if (stats.size === position) return;

    const stream = fs.createReadStream(filePath, {
      start: position,
      end: stats.size - 1,
      encoding: "latin1",
    });

    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) onLine(line);
    });

    stream.on("end", () => {
      position = stats.size;
    });
  }

  const watcher = fs.watch(filePath, { persistent: true }, () => readNew());
  readNew();

  return () => watcher.close();
}

ipcMain.handle("pick-log-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "EQ Logs", extensions: ["txt"] }],
  });
  if (result.canceled || !result.filePaths.length) return "";
  return result.filePaths[0];
});

ipcMain.handle("find-latest-log", (_evt, logDir) => {
  try {
    return findLatestLog(logDir);
  } catch {
    return "";
  }
});

ipcMain.handle("start-tail", (_evt, filePath, fromStart) => {
  if (stopTailFn) {
    stopTailFn();
    stopTailFn = null;
  }
  if (!filePath) return false;
  stopTailFn = startTail(filePath, fromStart, (line) => {
    if (mainWindow) mainWindow.webContents.send("log-line", line);
  });
  return true;
});

ipcMain.handle("stop-tail", () => {
  if (stopTailFn) stopTailFn();
  stopTailFn = null;
  return true;
});

ipcMain.handle("toggle-overlay", (_evt, enabled) => {
  if (enabled) {
    if (!overlayWindow) createOverlayWindow();
    if (overlayWindow) overlayWindow.show();
  } else if (overlayWindow) {
    overlayWindow.hide();
  }
  return true;
});

ipcMain.on("overlay-state", (_evt, state) => {
  if (state && typeof state === "object") {
    lastOverlayState = { mobName: state.mobName || "", hate: state.hate || 0 };
  }
  if (overlayWindow) overlayWindow.webContents.send("overlay-state", lastOverlayState);
});
