import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadConfigFromFile } from "vite";

test("Vite builds renderer assets with relative paths for Electron loadFile", async () => {
  const result = await loadConfigFromFile(
    { command: "build", mode: "production" },
    path.resolve("vite.config.ts")
  );

  assert.equal(result?.config?.base, "./");
});
