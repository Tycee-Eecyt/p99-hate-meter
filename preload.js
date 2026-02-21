const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agroApi", {
  pickLogFile: () => ipcRenderer.invoke("pick-log-file"),
  findLatestLog: (dir) => ipcRenderer.invoke("find-latest-log", dir),
  findDefaultLatestLog: () => ipcRenderer.invoke("find-default-latest-log"),
  loadInventoryWeaponStats: (logFilePath) => ipcRenderer.invoke("load-inventory-weapon-stats", logFilePath),
  startTail: (filePath, fromStart) => ipcRenderer.invoke("start-tail", filePath, fromStart),
  stopTail: () => ipcRenderer.invoke("stop-tail"),
  onLogLine: (handler) => ipcRenderer.on("log-line", (_evt, line) => handler(line)),
  toggleOverlay: (enabled) => ipcRenderer.invoke("toggle-overlay", enabled),
  toggleGraphOverlay: (enabled) => ipcRenderer.invoke("toggle-graph-overlay", enabled),
  setOverlayState: (state) => ipcRenderer.send("overlay-state", state),
  onOverlayState: (handler) => ipcRenderer.on("overlay-state", (_evt, state) => handler(state)),
  requestResetHate: () => ipcRenderer.send("request-reset-hate"),
  onResetHate: (handler) => ipcRenderer.on("reset-hate", () => handler()),
  requestLoadInventory: () => ipcRenderer.send("request-load-inventory"),
  onRequestLoadInventory: (handler) => ipcRenderer.on("request-load-inventory", () => handler()),
});
