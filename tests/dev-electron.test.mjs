import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
