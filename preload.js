const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agroApi", {
  pickLogFile: () => ipcRenderer.invoke("pick-log-file"),
  findLatestLog: (dir) => ipcRenderer.invoke("find-latest-log", dir),
  startTail: (filePath, fromStart) => ipcRenderer.invoke("start-tail", filePath, fromStart),
  stopTail: () => ipcRenderer.invoke("stop-tail"),
  onLogLine: (handler) => ipcRenderer.on("log-line", (_evt, line) => handler(line)),
  toggleOverlay: (enabled) => ipcRenderer.invoke("toggle-overlay", enabled),
  setOverlayHate: (value) => ipcRenderer.send("overlay-hate", value),
  onOverlayHate: (handler) => ipcRenderer.on("overlay-hate", (_evt, value) => handler(value)),
});
