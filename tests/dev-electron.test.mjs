import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { resolveDevToolPaths, validateDevToolPaths } from "../scripts/dev-electron.mjs";

test("dev electron launcher resolves local tool entrypoints without npm shims", () => {
  const projectRoot = path.resolve("sample-app");
  const toolPaths = resolveDevToolPaths(projectRoot);

  assert.equal(toolPaths.nodeCommand, process.execPath);
  assert.equal(toolPaths.viteBin, path.join(projectRoot, "node_modules", "vite", "bin", "vite.js"));
  assert.equal(toolPaths.electronCli, path.join(projectRoot, "node_modules", "electron", "cli.js"));
  assert.ok(!toolPaths.viteBin.includes(`${path.sep}npm${path.sep}`));
  assert.ok(!toolPaths.electronCli.includes(`${path.sep}npm${path.sep}`));
});

test("dev electron launcher reports missing local dev dependencies", () => {
  const projectRoot = path.resolve("missing-dev-deps");
  const toolPaths = resolveDevToolPaths(projectRoot);

  assert.throws(
    () => validateDevToolPaths(toolPaths),
    /Missing development dependencies/
  );
});

test("Windows launcher dependency preflight lets Electron repair a missing binary", () => {
  const launcher = readFileSync(new URL("../start.bat", import.meta.url), "utf8");
  const dependencyCheck = launcher.match(/^:check_dependencies\r?\n([\s\S]*?)(?=\r?\n:\w)/m)?.[1] ?? "";

  assert.match(dependencyCheck, /node_modules\\electron\\cli\.js/i);
  assert.doesNotMatch(dependencyCheck, /node_modules\\electron\\dist\\electron\.exe/i);
});

test("Windows launcher does not use a second post-install batch label jump", () => {
  const launcher = readFileSync(new URL("../start.bat", import.meta.url), "utf8");

  assert.doesNotMatch(launcher, /call\s+:ensure_electron_runtime/i);
});

test("Windows launcher prefers dev mode in source checkouts", () => {
  const launcher = readFileSync(new URL("../start.bat", import.meta.url), "utf8");

  assert.match(launcher, /SOURCE_CHECKOUT/i);
  assert.match(launcher, /BANANA_REMIX_USE_PACKAGED/i);
  assert.match(launcher, /goto dev_mode/i);
});

test("macOS launcher exists and is executable", () => {
  const launcherPath = new URL("../start.command", import.meta.url);
  const stat = statSync(launcherPath);

  assert.equal(stat.isFile(), true);
  assert.equal((stat.mode & 0o111) !== 0, true, "start.command should be executable (chmod +x)");
});

test("macOS launcher uses bash shebang and respects source checkout vs packaged app", () => {
  const launcher = readFileSync(new URL("../start.command", import.meta.url), "utf8");

  assert.match(launcher, /^#!\/usr\/bin\/env bash/);
  assert.match(launcher, /SOURCE_CHECKOUT/);
  assert.match(launcher, /BANANA_REMIX_USE_PACKAGED/);
  assert.match(launcher, /release\/mac/);
  assert.match(launcher, /npm run dev:electron/);
});

test("macOS launcher dependency preflight matches the Windows electron CLI check", () => {
  const launcher = readFileSync(new URL("../start.command", import.meta.url), "utf8");

  assert.match(launcher, /node_modules\/electron\/cli\.js/);
  assert.doesNotMatch(launcher, /node_modules\/electron\/dist\/electron\.exe/);
});
