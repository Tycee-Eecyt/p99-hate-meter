const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agroApi", {
  pickLogFile: () => ipcRenderer.invoke("pick-log-file"),
  findLatestLog: (dir) => ipcRenderer.invoke("find-latest-log", dir),
  findDefaultLatestLog: () => ipcRenderer.invoke("find-default-latest-log"),
  startTail: (filePath, fromStart) => ipcRenderer.invoke("start-tail", filePath, fromStart),
  stopTail: () => ipcRenderer.invoke("stop-tail"),
  onLogLine: (handler) => ipcRenderer.on("log-line", (_evt, line) => handler(line)),
  toggleOverlay: (enabled) => ipcRenderer.invoke("toggle-overlay", enabled),
  setOverlayState: (state) => ipcRenderer.send("overlay-state", state),
  onOverlayState: (handler) => ipcRenderer.on("overlay-state", (_evt, state) => handler(state)),
});
