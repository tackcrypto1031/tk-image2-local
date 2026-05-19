import { app, BrowserWindow, ipcMain, Menu } from "electron";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCodexRunner } from "./codexRunner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = resolveProjectRoot(__dirname);
const runner = createCodexRunner({ workspaceDir: projectRoot });

let mainWindow = null;

app.setName("Codex 圖像畫布");

function createApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: "檔案",
      submenu: [
        { label: "關閉視窗", role: "close" },
        { type: "separator" },
        { label: "結束", role: "quit" }
      ]
    },
    {
      label: "編輯",
      submenu: [
        { label: "復原", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪下", role: "cut" },
        { label: "複製", role: "copy" },
        { label: "貼上", role: "paste" },
        { label: "全選", role: "selectAll" }
      ]
    },
    {
      label: "檢視",
      submenu: [
        { label: "重新載入", role: "reload" },
        { label: "強制重新載入", role: "forceReload" },
        { label: "開發者工具", role: "toggleDevTools" },
        { type: "separator" },
        { label: "實際大小", role: "resetZoom" },
        { label: "放大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { type: "separator" },
        { label: "切換全螢幕", role: "togglefullscreen" }
      ]
    },
    {
      label: "視窗",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "關閉", role: "close" }
      ]
    }
  ]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Codex 圖像畫布",
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f3f4f6",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const devUrl = process.env.BANANA_REMIX_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function userDataPath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

function projectDataPath(...segments) {
  return path.join(projectRoot, "data", ...segments);
}

function resolveProjectRoot(appDir) {
  if (process.env.BANANA_REMIX_PROJECT_DIR) {
    return path.resolve(process.env.BANANA_REMIX_PROJECT_DIR);
  }
  return findProjectRoot(process.cwd()) || findProjectRoot(path.resolve(appDir, "..")) || path.resolve(appDir, "..");
}

function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    if (isProjectRoot(current)) {
      return current;
    }
    if (path.basename(current).toLowerCase() === "win-unpacked" && path.basename(path.dirname(current)).toLowerCase() === "release") {
      const releaseParent = path.dirname(path.dirname(current));
      if (isProjectRoot(releaseParent)) {
        return releaseParent;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function isProjectRoot(directory) {
  return fsSync.existsSync(path.join(directory, "package.json")) && fsSync.existsSync(path.join(directory, "electron", "main.mjs"));
}

function registerIpcHandlers() {
  ipcMain.handle("codex-image:health", async () => runner.health());

  ipcMain.handle("codex-image:setup-cli", async () => runner.setupCodexCli());

  ipcMain.handle("codex-image:generate", async (_event, request = {}) => {
    const outputDir = projectDataPath("generated");
    return runner.generateImage({ ...request, outputDir });
  });

  ipcMain.handle("codex-image:auto-outpaint-prompt", async (_event, request = {}) => {
    return runner.autoOutpaintPrompt(request);
  });

  ipcMain.handle("codex-image:cancel", async (_event, jobId) => {
    return { cancelled: runner.cancel(jobId) };
  });

  ipcMain.handle("canvas:load", async () => {
    const filePath = userDataPath("canvas-state.json");
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  });

  ipcMain.handle("canvas:save", async (_event, elements) => {
    if (!Array.isArray(elements)) {
      throw new Error("Canvas state must be an array");
    }
    const filePath = userDataPath("canvas-state.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(elements, null, 2), "utf8");
    return { ok: true, filePath };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(createApplicationMenu());
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
