import http from "node:http";
import { spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:3000";

const children = new Set();

function spawnCommand(command, args, options = {}) {
  const commandLine = [command, ...args].map(quoteWindowsCmdArg).join(" ");
  const child = process.platform === "win32"
    ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], {
        ...options,
        windowsVerbatimArguments: true
      })
    : spawn(command, args, options);
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function quoteWindowsCmdArg(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
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

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";

const vite = spawnCommand(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1"], {
  stdio: "inherit"
});

vite.on("exit", (code) => {
  if (code !== 0 && children.size > 0) {
    cleanup(code || 1);
  }
});

await waitForUrl(DEV_URL);

const electron = spawnCommand(electronCommand, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    BANANA_REMIX_DEV_URL: DEV_URL,
    BANANA_REMIX_PROJECT_DIR: process.cwd()
  }
});

electron.on("exit", (code) => cleanup(code || 0));
