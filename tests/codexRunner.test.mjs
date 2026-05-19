import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCodexCliSetupScript,
  buildCodexCliSetupScriptBash,
  buildImagegenPrompt,
  commandInvocation,
  createCodexRunner,
  materializeDataUrlImages,
  validateImageFile
} from "../electron/codexRunner.mjs";

const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000002000000030806000000",
  "hex"
);

test("wraps Windows Codex command shims through cmd.exe", () => {
  const invocation = commandInvocation(
    "codex",
    ["exec", "--image", "C:\\tmp\\ref image.png", "-"],
    { platform: "win32", comspec: "C:\\Windows\\System32\\cmd.exe" }
  );

  assert.equal(invocation.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(invocation.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.equal(invocation.windowsVerbatimArguments, true);
  assert.equal(invocation.args[3].startsWith('""codex"'), true);
  assert.equal(invocation.args[3].endsWith('"-""'), true);
  assert.match(invocation.args[3], /"codex"/);
  assert.match(invocation.args[3], /"C:\\tmp\\ref image\.png"/);
});

test("materializes data URL images into a job directory", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-runner-test-"));
  try {
    const [imagePath] = await materializeDataUrlImages(
      [{ dataUrl: `data:image/png;base64,${TINY_PNG.toString("base64")}` }],
      tempDir
    );

    assert.equal(path.dirname(imagePath), tempDir);
    assert.equal(path.extname(imagePath), ".png");
    assert.deepEqual(await fs.readFile(imagePath), TINY_PNG);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("validates image output dimensions", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-image-test-"));
  try {
    const imagePath = path.join(tempDir, "out.png");
    await fs.writeFile(imagePath, TINY_PNG);
    const result = await validateImageFile(imagePath);

    assert.equal(result.type, "png");
    assert.equal(result.width, 2);
    assert.equal(result.height, 3);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("builds an imagegen prompt with an exact output path", () => {
  const prompt = buildImagegenPrompt({
    mode: "generate",
    prompt: "a clean product render",
    style: "Photorealism",
    aspectRatio: "1:1",
    outputPath: "D:\\out\\image.png",
    referenceImagePaths: []
  });

  assert.match(prompt, /Use the imagegen skill/);
  assert.match(prompt, /Preferred image generation model\/context: gpt-image-2/);
  assert.match(prompt, /Output path: D:\\out\\image\.png/);
  assert.match(prompt, /Aspect ratio: 1:1/);
});

test("health reports usable Codex imagegen capabilities", async () => {
  const runner = createCodexRunner({
    commandRunner: async (_command, args) => {
      if (args.join(" ") === "--version") {
        return { ok: true, code: 0, stdout: "codex-cli 0.130.0\n", stderr: "" };
      }
      if (args.join(" ") === "login status") {
        return { ok: true, code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
      }
      if (args.join(" ") === "exec --help") {
        return { ok: true, code: 0, stdout: "--image\n--output-last-message\n", stderr: "" };
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    }
  });

  const health = await runner.health();

  assert.equal(health.ok, true);
  assert.equal(health.checks.referenceImages, true);
  assert.equal(health.checks.outputLastMessage, true);
  assert.equal(health.blockingIssues.length, 0);
});

test("builds a Windows Codex CLI setup script that installs only when missing", () => {
  const script = buildCodexCliSetupScript({ codexBin: "codex" });

  assert.match(script, /\$codexCommand = Get-Command \$codexBin -ErrorAction SilentlyContinue/);
  assert.match(script, /if \(-not \$codexCommand\) \{/);
  assert.match(script, /npm install -g @openai\/codex@latest/);
  assert.match(script, /else \{\r?\n  Write-Host "已偵測到 Codex CLI/);
  assert.match(script, /& \$codexBin login/);
});

test("escapes custom Codex binary paths in the setup script", () => {
  const script = buildCodexCliSetupScript({ codexBin: "C:\\Tools\\Codex's\\codex.cmd" });

  assert.match(script, /\$codexBin = 'C:\\Tools\\Codex''s\\codex\.cmd'/);
});

test("builds a macOS bash Codex CLI setup script that installs only when missing", () => {
  const script = buildCodexCliSetupScriptBash({ codexBin: "codex" });

  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.match(script, /codexBin='codex'/);
  assert.match(script, /command -v "\$codexBin"/);
  assert.match(script, /npm install -g @openai\/codex@latest/);
  assert.match(script, /"\$codexBin" login/);
  assert.match(script, /pause_and_exit/);
});

test("escapes custom Codex binary paths with single quotes in the bash setup script", () => {
  const script = buildCodexCliSetupScriptBash({ codexBin: "/Users/me/Codex's bin/codex" });

  assert.match(script, /codexBin='\/Users\/me\/Codex'\\''s bin\/codex'/);
});

test("accepts generated image output even when Codex final message is empty", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-generate-test-"));
  try {
    const seen = { args: null, input: "" };
    const runner = createCodexRunner({
      workspaceDir: tempDir,
      commandRunner: async (_command, args, options = {}) => {
        seen.args = args;
        seen.input = options.input || "";
        const outputPath = seen.input.match(/^Output path: (.+)$/m)[1].trim();
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, TINY_PNG);
        const lastMessagePath = args[args.indexOf("--output-last-message") + 1];
        await fs.writeFile(lastMessagePath, "");
        return { ok: true, code: 0, stdout: "", stderr: "" };
      }
    });

    const result = await runner.generateImage({
      jobId: "job-1",
      mode: "generate",
      prompt: "a small square icon",
      aspectRatio: "1:1",
      outputDir: tempDir,
      images: []
    });

    assert.equal(seen.args.includes("--output-last-message"), true);
    assert.equal(seen.args[seen.args.indexOf("--cd") + 1], tempDir);
    assert.equal(seen.args[seen.args.indexOf("--sandbox") + 1], "workspace-write");
    assert.equal(seen.args[seen.args.indexOf("--add-dir") + 1], tempDir);
    assert.equal(result.width, 2);
    assert.equal(result.height, 3);
    assert.equal(result.contentType, "image/png");
    assert.match(result.dataUrl, /^data:image\/png;base64,/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("returns generated image when output file is ready before Codex exits", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-early-output-test-"));
  try {
    let commandSettled = false;
    let commandAborted = false;
    const runner = createCodexRunner({
      workspaceDir: tempDir,
      commandRunner: async (_command, _args, options = {}) => {
        const outputPath = options.input.match(/^Output path: (.+)$/m)[1].trim();
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await new Promise((resolve) => setTimeout(resolve, 25));
        await fs.writeFile(outputPath, TINY_PNG);
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1000);
          options.signal.addEventListener(
            "abort",
            () => {
              commandAborted = true;
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        });
        if (options.signal.aborted) {
          return { ok: false, code: null, stdout: "", stderr: "cancelled after output was ready" };
        }
        commandSettled = true;
        return { ok: true, code: 0, stdout: "", stderr: "" };
      }
    });

    const result = await runner.generateImage({
      jobId: "job-early",
      mode: "generate",
      prompt: "a small square icon",
      aspectRatio: "1:1",
      outputDir: tempDir,
      images: []
    });

    assert.equal(result.width, 2);
    assert.equal(result.height, 3);
    assert.equal(commandSettled, false);
    assert.equal(commandAborted, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("cancel aborts an active generation job", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-cancel-test-"));
  try {
    const runner = createCodexRunner({
      commandRunner: async (_command, _args, options = {}) => {
        await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
        return { ok: false, code: null, stdout: "", stderr: "cancelled" };
      }
    });

    const pending = runner.generateImage({
      jobId: "job-cancel",
      mode: "generate",
      prompt: "will be cancelled",
      outputDir: tempDir,
      images: []
    });
    runner.cancel("job-cancel");

    await assert.rejects(pending, /cancelled/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("auto outpaint prompt keeps output-last-message path before model override", async () => {
  const seen = { args: null };
  const runner = createCodexRunner({
    textModel: "gpt-5.5",
    workspaceDir: path.resolve("example-workspace"),
    commandRunner: async (_command, args) => {
      seen.args = args;
      const lastMessagePath = args[args.indexOf("--output-last-message") + 1];
      await fs.writeFile(lastMessagePath, "expand the scene naturally");
      return { ok: true, code: 0, stdout: "", stderr: "" };
    }
  });

  const result = await runner.autoOutpaintPrompt({
    jobId: "auto-test",
    image: `data:image/png;base64,${TINY_PNG.toString("base64")}`
  });

  assert.equal(result, "expand the scene naturally");
  assert.equal(seen.args[seen.args.indexOf("--cd") + 1], path.resolve("example-workspace"));
  assert.match(seen.args[seen.args.indexOf("--output-last-message") + 1], /last-message\.txt$/);
  assert.equal(seen.args[seen.args.indexOf("--model") + 1], "gpt-5.5");
});
