import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_CODEX_BIN = process.env.BANANA_REMIX_CODEX_BIN || "codex";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const OUTPUT_READY_POLL_MS = 100;
const OUTPUT_READY_STABLE_MS = 250;

export function createCodexRunner({
  commandRunner = runCommand,
  codexBin = DEFAULT_CODEX_BIN,
  textModel = process.env.BANANA_REMIX_CODEX_MODEL || "",
  workspaceDir = process.env.BANANA_REMIX_PROJECT_DIR || process.cwd()
} = {}) {
  const activeJobs = new Map();
  const resolvedWorkspaceDir = path.resolve(workspaceDir);

  return {
    async health() {
      const version = await safeRun(commandRunner, codexBin, ["--version"], { timeoutMs: 8000 });
      const auth = await safeRun(commandRunner, codexBin, ["login", "status"], { timeoutMs: 12000 });
      const execHelp = await safeRun(commandRunner, codexBin, ["exec", "--help"], { timeoutMs: 8000 });
      const blockingIssues = [];

      if (!version.ok) {
        blockingIssues.push(`Codex CLI unavailable: ${version.error || version.stderr || "unknown error"}`);
      }
      if (!auth.ok) {
        blockingIssues.push(`Codex login status failed: ${auth.error || auth.stderr || "unknown error"}`);
      }
      if (!execHelp.ok || !execHelp.stdout?.includes("--image") || !execHelp.stdout?.includes("--output-last-message")) {
        blockingIssues.push("Codex exec does not expose required --image and --output-last-message flags");
      }

      return {
        ok: blockingIssues.length === 0,
        checks: {
          codexVersion: firstText(version),
          authStatus: firstText(auth),
          referenceImages: Boolean(execHelp.stdout?.includes("--image")),
          outputLastMessage: Boolean(execHelp.stdout?.includes("--output-last-message")),
          codexBin,
          imageModel: DEFAULT_IMAGE_MODEL
        },
        blockingIssues
      };
    },

    async generateImage(request = {}) {
      const jobId = stringValue(request.jobId) || `job-${Date.now()}`;
      const outputDir = stringValue(request.outputDir);
      if (!outputDir) {
        throw new Error("outputDir is required");
      }
      const controller = new AbortController();
      activeJobs.set(jobId, controller);
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-codex-"));
      try {
        const referenceImagePaths = await materializeDataUrlImages(request.images || [], tempDir);
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${sanitizeFileName(jobId)}.png`);
        const outputLastMessagePath = path.join(tempDir, "last-message.txt");
        const prompt = buildImagegenPrompt({
          mode: request.mode || "generate",
          prompt: request.prompt || "",
          style: request.style || "",
          aspectRatio: request.aspectRatio || "1:1",
          outputPath,
          referenceImagePaths
        });

        if (controller.signal.aborted) {
          throw new Error("Generation cancelled");
        }

        const args = [
          "exec",
          "--skip-git-repo-check",
          "--cd",
          resolvedWorkspaceDir,
          "--sandbox",
          "workspace-write",
          "--add-dir",
          outputDir,
          "--output-last-message",
          outputLastMessagePath
        ];
        if (textModel) {
          args.push("--model", textModel);
        }
        for (const imagePath of referenceImagePaths) {
          args.push("--image", imagePath);
        }
        args.push("-");

        const outputWatchController = new AbortController();
        const stopOutputWatch = () => outputWatchController.abort();
        controller.signal.addEventListener("abort", stopOutputWatch, { once: true });
        const commandPromise = commandRunner(codexBin, args, {
          timeoutMs: request.timeoutMs || DEFAULT_TIMEOUT_MS,
          input: prompt,
          signal: controller.signal
        }).then(
          (result) => ({ type: "command", result }),
          (error) => ({ type: "command-error", error })
        );
        const outputReadyPromise = waitForStableImageFile(outputPath, {
          signal: outputWatchController.signal
        }).then(
          (image) => ({ type: "output-ready", image }),
          (error) => ({ type: "output-error", error })
        );

        try {
          const completed = await Promise.race([commandPromise, outputReadyPromise]);
          if (completed.type === "output-ready") {
            const generatedImage = await createGeneratedImageResult(jobId, outputPath, completed.image);
            controller.abort();
            return generatedImage;
          }
          stopOutputWatch();
          if (completed.type === "command-error") {
            throw completed.error;
          }
          if (completed.type === "output-error") {
            throw completed.error;
          }
          if (!completed.result.ok) {
            throw new Error(completed.result.stderr || completed.result.error || "Codex image generation failed");
          }

          return createGeneratedImageResult(jobId, outputPath);
        } finally {
          stopOutputWatch();
          controller.signal.removeEventListener("abort", stopOutputWatch);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error("Generation cancelled");
        }
        throw error;
      } finally {
        activeJobs.delete(jobId);
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    async autoOutpaintPrompt(request = {}) {
      const jobId = stringValue(request.jobId) || `auto-${Date.now()}`;
      const controller = new AbortController();
      activeJobs.set(jobId, controller);
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "banana-codex-auto-"));
      try {
        const [imagePath] = await materializeDataUrlImages([{ dataUrl: request.image }], tempDir);
        const outputLastMessagePath = path.join(tempDir, "last-message.txt");
        const prompt = [
          "Analyze the attached expansion-task image.",
          "It shows an existing image placed inside a larger transparent or empty canvas.",
          "Return one concise image-generation instruction for filling the empty area naturally.",
          "Return only the instruction text. No markdown.",
          "",
          `User guidance: ${request.prompt || "Continue the scene naturally."}`
        ].join("\n");
        const args = ["exec", "--skip-git-repo-check", "--cd", resolvedWorkspaceDir, "--output-last-message", outputLastMessagePath];
        if (textModel) {
          args.push("--model", textModel);
        }
        args.push("--image", imagePath, "-");
        if (controller.signal.aborted) {
          throw new Error("Generation cancelled");
        }
        const result = await commandRunner(codexBin, args, {
          timeoutMs: request.timeoutMs || 5 * 60 * 1000,
          input: prompt,
          signal: controller.signal
        });
        if (!result.ok) {
          throw new Error(result.stderr || result.error || "Codex auto prompt failed");
        }
        const finalMessage = await fs.readFile(outputLastMessagePath, "utf8").catch(() => "");
        const text = finalMessage.trim();
        if (!text) {
          throw new Error("Codex did not return an auto prompt");
        }
        return text;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error("Generation cancelled");
        }
        throw error;
      } finally {
        activeJobs.delete(jobId);
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    cancel(jobId) {
      const controller = activeJobs.get(jobId);
      if (!controller) {
        return false;
      }
      controller.abort();
      return true;
    }
  };
}

export function buildImagegenPrompt({ mode, prompt, style, aspectRatio, outputPath, referenceImagePaths = [] }) {
  const modeGuidance = {
    generate: "Generate one new image from the prompt.",
    edit: "Use the attached image(s) as references and creatively remix or edit them according to the prompt.",
    outpaint: "Extend the attached expansion-task image naturally. Fill empty or transparent areas while preserving the existing image.",
    inpaint: "Use the attached red-mask composite. Change only the red highlighted area and keep the rest natural."
  };
  return [
    "Use the imagegen skill's default built-in image_gen tool to generate one raster PNG image.",
    `Preferred image generation model/context: ${DEFAULT_IMAGE_MODEL}.`,
    `Output path: ${outputPath}`,
    "Save the final generated PNG to the exact output path above. Create parent directories if needed.",
    "Do not create SVG, HTML, text-only, JSON-only, or placeholder output.",
    "",
    `Mode: ${mode || "generate"}`,
    modeGuidance[mode] || modeGuidance.generate,
    `Aspect ratio: ${aspectRatio || "1:1"}`,
    style ? `Style: ${style}` : "Style: Default",
    "",
    "User prompt:",
    prompt || "Create a polished image from the provided context.",
    "",
    referenceImagePaths.length
      ? `Reference image paths:\n${referenceImagePaths.join("\n")}`
      : "No reference images."
  ].join("\n");
}

export async function materializeDataUrlImages(images, directory) {
  await fs.mkdir(directory, { recursive: true });
  const paths = [];
  for (const [index, image] of images.entries()) {
    const dataUrl = typeof image === "string" ? image : image?.dataUrl;
    if (!dataUrl) {
      continue;
    }
    const parsed = parseDataUrl(dataUrl);
    const filePath = path.join(directory, `reference-${String(index + 1).padStart(3, "0")}.${parsed.ext}`);
    await fs.writeFile(filePath, parsed.buffer);
    paths.push(filePath);
  }
  return paths;
}

export async function validateImageFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 16) {
    throw new Error(`Output image is missing or empty: ${filePath}`);
  }
  const buffer = await fs.readFile(filePath);
  const type = detectImageType(buffer);
  if (!type) {
    throw new Error(`Unsupported or corrupt image output: ${filePath}`);
  }
  const dimensions = readImageDimensions(buffer, type);
  if (!dimensions) {
    throw new Error(`Image dimensions could not be read: ${filePath}`);
  }
  return { ok: true, filePath, type, size: stat.size, ...dimensions };
}

async function waitForStableImageFile(filePath, { signal, pollMs = OUTPUT_READY_POLL_MS, stableMs = OUTPUT_READY_STABLE_MS } = {}) {
  let lastSignature = "";
  let stableSince = 0;
  while (true) {
    throwIfAborted(signal);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isFile() && stat.size > 16) {
      const image = await validateImageFile(filePath).catch(() => null);
      if (image) {
        const signature = `${stat.size}:${stat.mtimeMs}`;
        const now = Date.now();
        if (signature === lastSignature) {
          if (now - stableSince >= stableMs) {
            return image;
          }
        } else {
          lastSignature = signature;
          stableSince = now;
        }
      }
    }
    await abortableDelay(pollMs, signal);
  }
}

async function createGeneratedImageResult(jobId, outputPath, image = null) {
  const validatedImage = image || await validateImageFile(outputPath);
  const buffer = await fs.readFile(outputPath);
  return {
    id: jobId,
    filePath: outputPath,
    dataUrl: `data:image/${validatedImage.type};base64,${buffer.toString("base64")}`,
    width: validatedImage.width,
    height: validatedImage.height,
    contentType: `image/${validatedImage.type === "jpg" ? "jpeg" : validatedImage.type}`
  };
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError() {
  const error = new Error("Output image watch cancelled");
  error.name = "AbortError";
  return error;
}

export function commandInvocation(command, args, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== "win32") {
    return { command, args, windowsVerbatimArguments: false };
  }
  const commandLine = [command, ...args].map(quoteWindowsCmdArg).join(" ");
  return {
    command: options.comspec || process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    windowsVerbatimArguments: true
  };
}

function runCommand(command, args, { timeoutMs, signal, input } = {}) {
  return new Promise((resolve, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      fn(value);
    };
    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          finish(reject, new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
        },
        { once: true }
      );
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => finish(resolve, { ok: code === 0, code, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function safeRun(commandRunner, command, args, options) {
  try {
    return await commandRunner(command, args, options);
  } catch (error) {
    return { ok: false, code: null, stdout: "", stderr: "", error: error.message };
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error("Unsupported image data URL");
  }
  const mimeType = match[1].toLowerCase();
  const extByMime = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  const ext = extByMime[mimeType];
  if (!ext) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }
  return { mimeType, ext, buffer: Buffer.from(match[2], "base64") };
}

function detectImageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "gif";
  }
  return null;
}

function readImageDimensions(buffer, type) {
  if (type === "png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (type === "gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (type === "jpg") {
    return readJpegDimensions(buffer);
  }
  return null;
}

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function quoteWindowsCmdArg(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sanitizeFileName(value) {
  return String(value || "generated")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generated";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(result) {
  return result.stdout?.trim() || result.stderr?.trim() || result.error || null;
}
