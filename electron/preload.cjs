const API_METHODS = [
  "health",
  "setupCodexCli",
  "generate",
  "autoOutpaintPrompt",
  "cancel",
  "loadCanvas",
  "saveCanvas"
];

function createCodexImageBridge(ipcRenderer) {
  return {
    health: () => ipcRenderer.invoke("codex-image:health"),
    setupCodexCli: () => ipcRenderer.invoke("codex-image:setup-cli"),
    generate: (request) => ipcRenderer.invoke("codex-image:generate", request),
    autoOutpaintPrompt: (request) => ipcRenderer.invoke("codex-image:auto-outpaint-prompt", request),
    cancel: (jobId) => ipcRenderer.invoke("codex-image:cancel", jobId),
    loadCanvas: () => ipcRenderer.invoke("canvas:load"),
    saveCanvas: (elements) => ipcRenderer.invoke("canvas:save", elements)
  };
}

try {
  const { contextBridge, ipcRenderer } = require("electron");
  contextBridge.exposeInMainWorld("codexImage", createCodexImageBridge(ipcRenderer));
} catch {
  // Tests import this file in plain Node where Electron is not available.
}

module.exports = {
  API_METHODS,
  createCodexImageBridge
};
