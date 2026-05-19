import assert from "node:assert/strict";
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
