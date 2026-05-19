import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importHistoryStateModule() {
  const sourcePath = path.resolve("useHistoryState.ts");
  const source = (await fs.readFile(sourcePath, "utf8")).replace(
    /import\s+\{[^}]+\}\s+from\s+['"]react['"];?/,
    "const useState = () => { throw new Error('React hooks are not available in this unit test'); }; const useCallback = (fn) => fn; const useRef = (value) => ({ current: value });"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    },
    fileName: sourcePath
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("history state applies consecutive updates against the latest snapshot", async () => {
  const {
    applyHistorySet,
    createHistorySnapshot,
    getHistoryCurrentState
  } = await importHistoryStateModule();

  let snapshot = createHistorySnapshot(["initial"]);
  snapshot = applyHistorySet(snapshot, (items) => [...items, "first"], { addToHistory: true }, []);
  snapshot = applyHistorySet(snapshot, (items) => [...items, "second"], { addToHistory: true }, []);

  assert.deepEqual(getHistoryCurrentState(snapshot, []), ["initial", "first", "second"]);
  assert.equal(snapshot.currentIndex, 2);
  assert.equal(snapshot.history.length, 3);
});

test("history state clamps out-of-range indexes before applying updates", async () => {
  const {
    applyHistorySet,
    getHistoryCurrentState
  } = await importHistoryStateModule();

  const brokenSnapshot = {
    history: [["initial"]],
    currentIndex: 5
  };
  const repairedSnapshot = applyHistorySet(
    brokenSnapshot,
    (items) => [...items, "safe"],
    { addToHistory: true },
    []
  );

  assert.deepEqual(getHistoryCurrentState(repairedSnapshot, []), ["initial", "safe"]);
  assert.equal(repairedSnapshot.currentIndex, 1);
});

test("history state falls back instead of returning undefined for an empty history", async () => {
  const {
    getHistoryCurrentState
  } = await importHistoryStateModule();

  assert.deepEqual(getHistoryCurrentState({ history: [], currentIndex: 0 }, ["fallback"]), ["fallback"]);
});
