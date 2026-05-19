import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("sidebar collapse transform stays in one CSS rule", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(app, /isMenuCollapsed\s*\?\s*'tool-panel--collapsed'\s*:\s*''/);
  assert.doesNotMatch(app, /-translate-x-full|translate-x-0/);
  assert.match(styles, /\.tool-panel\s*{[\s\S]*?transform:\s*translateX\(0\)\s+rotate\(-0\.35deg\);[\s\S]*?}/);
  assert.match(styles, /\.tool-panel--collapsed\s*{[\s\S]*?transform:\s*translateX\(calc\(-100% - 1rem\)\)\s+rotate\(-0\.35deg\);[\s\S]*?}/);
});
