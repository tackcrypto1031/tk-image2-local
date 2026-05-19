import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEV_URL = "http://127.0.0.1:3000";

const children = new Set();
const currentFile = fileURLToPath(import.meta.url);

function spawnCommand(command, args, options = {}) {
  const child = spawn(command, args, options);
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

async function waitForUrl(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canReach(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function canReach(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function cleanup(exitCode = 0) {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(exitCode);
}

export function resolveDevToolPaths(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  return {
    nodeCommand: process.execPath,
    viteBin: path.join(root, "node_modules", "vite", "bin", "vite.js"),
    electronCli: path.join(root, "node_modules", "electron", "cli.js")
  };
}

export function validateDevToolPaths(toolPaths) {
  const missing = [
    ["Vite", toolPaths.viteBin],
    ["Electron", toolPaths.electronCli]
  ].filter(([, filePath]) => !existsSync(filePath));

  if (missing.length === 0) {
    return;
  }

  const details = missing.map(([label, filePath]) => `  - ${label}: ${filePath}`).join("\n");
  const launcherHint = process.platform === "darwin" ? "start.command" : "start.bat";
  throw new Error(`Missing development dependencies:\n${details}\nRun ${launcherHint} again, or run npm install --include=dev.`);
}

async function main() {
  const projectRoot = process.cwd();
  const toolPaths = resolveDevToolPaths(projectRoot);
  validateDevToolPaths(toolPaths);

  if (process.env.BANANA_REMIX_DEV_ELECTRON_CHECK === "1") {
    console.log(`vite=${toolPaths.viteBin}`);
    console.log(`electron=${toolPaths.electronCli}`);
    return;
  }

  process.on("SIGINT", () => cleanup(130));
  process.on("SIGTERM", () => cleanup(143));

  const vite = spawnCommand(toolPaths.nodeCommand, [toolPaths.viteBin, "--host", "127.0.0.1"], {
    cwd: projectRoot,
    stdio: "inherit"
  });

  vite.on("exit", (code) => {
    if (code !== 0 && children.size > 0) {
      cleanup(code || 1);
    }
  });

  await waitForUrl(DEV_URL);

  const electron = spawnCommand(toolPaths.nodeCommand, [toolPaths.electronCli, "."], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      BANANA_REMIX_DEV_URL: DEV_URL,
      BANANA_REMIX_PROJECT_DIR: projectRoot
    }
  });

  electron.on("exit", (code) => cleanup(code || 0));
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error.message);
    cleanup(1);
  });
}
