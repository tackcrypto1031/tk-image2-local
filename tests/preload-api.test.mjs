import assert from "node:assert/strict";
import test from "node:test";
import { API_METHODS, createCodexImageBridge } from "../electron/preload.cjs";

test("preload exposes only the intended Codex image bridge methods", () => {
  assert.deepEqual(API_METHODS, [
    "health",
    "setupCodexCli",
    "generate",
    "autoOutpaintPrompt",
    "cancel",
    "loadCanvas",
    "saveCanvas"
  ]);
});

test("preload bridge invokes whitelisted IPC channels", async () => {
  const calls = [];
  const bridge = createCodexImageBridge({
    invoke: async (channel, payload) => {
      calls.push({ channel, payload });
      return { ok: true, channel, payload };
    }
  });

  await bridge.health();
  await bridge.setupCodexCli();
  await bridge.generate({ prompt: "test" });
  await bridge.autoOutpaintPrompt({ image: "data:image/png;base64,AA==" });
  await bridge.cancel("job-1");
  await bridge.loadCanvas();
  await bridge.saveCanvas([{ id: "1" }]);

  assert.deepEqual(calls.map((call) => call.channel), [
    "codex-image:health",
    "codex-image:setup-cli",
    "codex-image:generate",
    "codex-image:auto-outpaint-prompt",
    "codex-image:cancel",
    "canvas:load",
    "canvas:save"
  ]);
});
