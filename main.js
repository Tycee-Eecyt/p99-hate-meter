const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage } = require("electron");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let stopTailFn = null;
let overlayWindow = null;
let graphOverlayWindow = null;
let lastOverlayState = {
  mobName: "",
  hate: 0,
  damage: 0,
  fluxCount: 0,
  fluxHate: 0,
  procCount: 0,
  procHate: 0,
  primaryWeapon: "Primary: Unknown",
  secondaryWeapon: "Secondary: Unknown",
  resetCountdown: 0,
  resetAtMs: 0,
};
const itemStatsCache = new Map();

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildTrayIcon() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  const fromFile = nativeImage.createFromPath(iconPath);
  if (!fromFile.isEmpty()) return fromFile.resize({ width: 16, height: 16 });

  const fallbackSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path d="M14 50L50 14" stroke="#ececef" stroke-width="7" stroke-linecap="round"/>
      <path d="M14 14L50 50" stroke="#ececef" stroke-width="7" stroke-linecap="round"/>
      <rect x="9" y="47" width="12" height="6" rx="2" fill="#d4a440"/>
      <rect x="43" y="47" width="12" height="6" rx="2" fill="#d4a440"/>
      <rect x="9" y="11" width="12" height="6" rx="2" fill="#d4a440"/>
      <rect x="43" y="11" width="12" height="6" rx="2" fill="#d4a440"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(`data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`).resize({ width: 16, height: 16 });
}

function createTray() {
  if (tray) return;

  const trayIcon = buildTrayIcon();

  tray = new Tray(trayIcon);
  tray.setToolTip("P99 Hate Meter");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => showMainWindow() },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showMainWindow());
}

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
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 320,
    height: 320,
    x: 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 250,
    minHeight: 240,
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

function createGraphOverlayWindow() {
  graphOverlayWindow = new BrowserWindow({
    width: 460,
    height: 280,
    x: 320,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  graphOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  graphOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  graphOverlayWindow.loadFile("graph-overlay.html");
  graphOverlayWindow.on("closed", () => {
    graphOverlayWindow = null;
  });
  graphOverlayWindow.once("ready-to-show", () => {
    if (graphOverlayWindow) graphOverlayWindow.webContents.send("overlay-state", lastOverlayState);
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) app.quit();
});

app.on("activate", () => {
  if (mainWindow) {
    showMainWindow();
    return;
  }
  createWindow();
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

function findDefaultLatestLog() {
  const candidateDirs = getDefaultEverQuestBaseDirs().map((dir) => path.join(dir, "Logs"));

  let latestPath = "";
  let latestMtime = -1;

  for (const dir of candidateDirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) continue;
        const full = path.join(dir, entry.name);
        const stat = fs.statSync(full);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestPath = full;
        }
      }
    } catch {
      // Ignore missing/unreadable candidate directories.
    }
  }

  return latestPath;
}

function getDefaultEverQuestBaseDirs() {
  const home = os.homedir();
  return [
    path.join(home, "EverQuest"),
    path.join(home, "Desktop", "EverQuest"),
    path.join(home, "OneDrive", "Desktop", "EverQuest"),
    path.join(home, "Documents", "EverQuest"),
    path.join(home, "Games", "EverQuest"),
  ];
}

function extractCharacterNameFromLogPath(logFilePath) {
  const name = path.basename(logFilePath || "");
  const match = name.match(/^eqlog_([^_]+)_/i);
  return match ? match[1] : "";
}

function resolveEverQuestBaseFromLogPath(logFilePath) {
  if (!logFilePath) return "";
  const logDir = path.dirname(logFilePath);
  if (path.basename(logDir).toLowerCase() === "logs") {
    return path.dirname(logDir);
  }
  return logDir;
}

function findInventoryFileInBase(eqBaseDir, characterName) {
  try {
    const targetName = `${(characterName || "").toLowerCase()}-inventory.txt`;
    const entries = fs.readdirSync(eqBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lowerName = entry.name.toLowerCase();
      if (!lowerName.endsWith("-inventory.txt")) continue;
      if (targetName && lowerName === targetName) {
        return path.join(eqBaseDir, entry.name);
      }
    }
    if (!targetName) {
      const fallback = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith("-inventory.txt"));
      if (fallback) return path.join(eqBaseDir, fallback.name);
    }
  } catch {
    // Ignore unreadable directories.
  }
  return "";
}

function resolveInventoryFilePath(logFilePath) {
  const characterName = extractCharacterNameFromLogPath(logFilePath);
  const candidates = [];
  const fromLog = resolveEverQuestBaseFromLogPath(logFilePath);
  if (fromLog) candidates.push(fromLog);
  for (const dir of getDefaultEverQuestBaseDirs()) {
    if (!candidates.includes(dir)) candidates.push(dir);
  }

  for (const baseDir of candidates) {
    const inventoryPath = findInventoryFileInBase(baseDir, characterName);
    if (inventoryPath) return { inventoryPath, characterName, baseDir };
  }

  return { inventoryPath: "", characterName, baseDir: "" };
}

function parseInventoryWeaponRows(content) {
  const rows = content.split(/\r?\n/);
  const result = { primary: null, secondary: null };

  for (const row of rows) {
    if (!row || /^Location\t/i.test(row)) continue;
    const cols = row.split("\t");
    if (cols.length < 5) continue;
    const slot = cols[0].trim().toLowerCase();
    if (slot !== "primary" && slot !== "secondary") continue;
    const item = {
      slot,
      name: cols[1].trim(),
      id: Number(cols[2]),
    };
    result[slot] = item;
  }

  return result;
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectCount < 5) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(fetchText(nextUrl, redirectCount + 1));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", (err) => reject(err));
  });
}

async function fetchItemStatsFromWiki(itemName) {
  const cacheKey = (itemName || "").toLowerCase();
  if (!cacheKey) return null;
  if (itemStatsCache.has(cacheKey)) return itemStatsCache.get(cacheKey);

  const slug = encodeURIComponent(itemName.replace(/\s+/g, "_"));
  const url = `https://wiki.project1999.com/${slug}`;
  const html = await fetchText(url);
  const delayMatch = html.match(/Atk Delay:\s*(\d+)/i);
  const dmgMatch = html.match(/\bDMG:\s*(\d+)/i);

  const stats = delayMatch && dmgMatch ? { damage: Number(dmgMatch[1]), delay: Number(delayMatch[1]), sourceUrl: url } : null;
  itemStatsCache.set(cacheKey, stats);
  return stats;
}

async function buildWeaponStatsFromInventory(logFilePath) {
  const resolved = resolveInventoryFilePath(logFilePath);
  if (!resolved.inventoryPath) {
    return {
      ok: false,
      error: "Could not find character inventory file in your EverQuest folder.",
      characterName: resolved.characterName,
      inventoryPath: "",
    };
  }

  let content = "";
  try {
    content = fs.readFileSync(resolved.inventoryPath, "latin1");
  } catch {
    return {
      ok: false,
      error: "Found inventory file, but failed to read it.",
      characterName: resolved.characterName,
      inventoryPath: resolved.inventoryPath,
    };
  }

  const parsed = parseInventoryWeaponRows(content);
  if (!parsed.primary && !parsed.secondary) {
    return {
      ok: false,
      error: "Inventory file did not contain Primary/Secondary rows.",
      characterName: resolved.characterName,
      inventoryPath: resolved.inventoryPath,
    };
  }

  async function resolveSlot(slotData) {
    if (!slotData) return null;
    if (!slotData.name || slotData.name.toLowerCase() === "empty" || !slotData.id) {
      return {
        ...slotData,
        isEmpty: true,
        damage: 0,
        delay: 0,
        foundStats: true,
      };
    }
    try {
      const stats = await fetchItemStatsFromWiki(slotData.name);
      if (!stats) return { ...slotData, isEmpty: false, foundStats: false, damage: 0, delay: 0 };
      return { ...slotData, isEmpty: false, foundStats: true, damage: stats.damage, delay: stats.delay, sourceUrl: stats.sourceUrl };
    } catch {
      return { ...slotData, isEmpty: false, foundStats: false, damage: 0, delay: 0 };
    }
  }

  const primary = await resolveSlot(parsed.primary);
  const secondary = await resolveSlot(parsed.secondary);

  return {
    ok: true,
    characterName: resolved.characterName,
    inventoryPath: resolved.inventoryPath,
    primary,
    secondary,
  };
}

function startTail(filePath, fromStart, onLine) {
  let position = 0;
  let buffer = "";
  let readInProgress = false;
  let pendingRead = false;
  let closed = false;
  if (!fromStart) {
    try {
      position = fs.statSync(filePath).size;
    } catch {
      position = 0;
    }
  }

  function readNew() {
    if (closed) return;
    if (readInProgress) {
      pendingRead = true;
      return;
    }

    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return;
    }
    if (stats.size < position) position = 0;
    if (stats.size === position) return;

    readInProgress = true;
    const endPosition = stats.size;
    const stream = fs.createReadStream(filePath, {
      start: position,
      end: endPosition - 1,
      encoding: "latin1",
    });

    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) onLine(line);
    });

    stream.on("end", () => {
      position = endPosition;
      readInProgress = false;
      if (pendingRead) {
        pendingRead = false;
        readNew();
      }
    });

    stream.on("error", () => {
      readInProgress = false;
      if (pendingRead) {
        pendingRead = false;
        readNew();
      }
    });
  }

  const watcher = fs.watch(filePath, { persistent: true }, () => readNew());
  readNew();

  return () => {
    closed = true;
    watcher.close();
  };
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

ipcMain.handle("find-default-latest-log", () => {
  try {
    return findDefaultLatestLog();
  } catch {
    return "";
  }
});

ipcMain.handle("load-inventory-weapon-stats", async (_evt, logFilePath) => {
  try {
    return await buildWeaponStatsFromInventory(logFilePath);
  } catch {
    return { ok: false, error: "Failed to load inventory weapon stats." };
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

ipcMain.handle("toggle-graph-overlay", (_evt, enabled) => {
  if (enabled) {
    if (!graphOverlayWindow) createGraphOverlayWindow();
    if (graphOverlayWindow) graphOverlayWindow.show();
  } else if (graphOverlayWindow) {
    graphOverlayWindow.hide();
  }
  return true;
});

ipcMain.on("overlay-state", (_evt, state) => {
  if (state && typeof state === "object") {
    lastOverlayState = {
      mobName: state.mobName || "",
      hate: state.hate || 0,
      damage: state.damage || 0,
      fluxCount: state.fluxCount || 0,
      fluxHate: state.fluxHate || 0,
      procCount: state.procCount || 0,
      procHate: state.procHate || 0,
      primaryWeapon: state.primaryWeapon || "Primary: Unknown",
      secondaryWeapon: state.secondaryWeapon || "Secondary: Unknown",
      resetCountdown: state.resetCountdown || 0,
      resetAtMs: state.resetAtMs || 0,
    };
  }
  if (overlayWindow) overlayWindow.webContents.send("overlay-state", lastOverlayState);
  if (graphOverlayWindow) graphOverlayWindow.webContents.send("overlay-state", lastOverlayState);
});

ipcMain.on("request-reset-hate", () => {
  if (mainWindow) mainWindow.webContents.send("reset-hate");
  lastOverlayState = {
    mobName: "",
    hate: 0,
    damage: 0,
    fluxCount: 0,
    fluxHate: 0,
    procCount: 0,
    procHate: 0,
    primaryWeapon: lastOverlayState.primaryWeapon || "Primary: Unknown",
    secondaryWeapon: lastOverlayState.secondaryWeapon || "Secondary: Unknown",
    resetCountdown: 0,
    resetAtMs: 0,
  };
  if (overlayWindow) overlayWindow.webContents.send("overlay-state", lastOverlayState);
  if (graphOverlayWindow) graphOverlayWindow.webContents.send("overlay-state", lastOverlayState);
});

ipcMain.on("request-load-inventory", () => {
  if (mainWindow) mainWindow.webContents.send("request-load-inventory");
});
