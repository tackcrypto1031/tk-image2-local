# Electron Codex Imagegen Design

## Goal

Convert the existing Nano Banana / Gemini browser-only infinite canvas into a Windows-first Electron desktop app that generates images through the local Codex CLI `imagegen` skill.

## Decisions

- React/Vite remains the renderer and keeps the current canvas, note, drawing, image upload, import, export, outpaint, and edit workflows.
- Electron main process becomes the only privileged backend. The renderer never receives Node APIs, file system APIs, API keys, or a raw `ipcRenderer`.
- Image generation is available only inside Electron. Plain `npm run dev` can still display the renderer, but generation prompts users to start Electron.
- The first version generates one candidate per request. Users can regenerate to get another candidate.
- Generated PNG files are stored under the project folder at `data/generated/`.
- Canvas autosave is stored under Electron `app.getPath("userData")/canvas-state.json` and restored on app launch.
- Object removal and local edits keep the existing red-mask visual workflow. The red mask is composited into the reference image and sent to Codex imagegen as a visual instruction.
- Codex CLI path defaults to `codex`. `BANANA_REMIX_CODEX_BIN` can override it. Text model defaults to the user's Codex config; `BANANA_REMIX_CODEX_MODEL` can override it.
- Real Codex imagegen jobs run one at a time. A later version can add a queue if needed.

## Architecture

Electron is split into three surfaces:

- `electron/main.mjs`: creates the app window, registers IPC handlers, stores runtime state, and owns cancellation.
- `electron/preload.cjs`: exposes a narrow `window.codexImage` API with `health`, `generate`, `autoOutpaintPrompt`, `cancel`, `loadCanvas`, and `saveCanvas`.
- `electron/codexRunner.mjs`: pure Node implementation for Codex preflight, data URL file materialization, command invocation, output validation, and prompt construction.

The renderer talks only to `window.codexImage`. In non-Electron browser mode, `window.codexImage` is absent and generation fails with a clear desktop-only message.

## Data Flow

1. The renderer collects selected notes as prompt text and selected images/drawings as data URLs.
2. The renderer calls `window.codexImage.generate()` with a typed request.
3. Electron main writes reference images to a temporary job directory.
4. `codexRunner` runs `codex exec --cd <project> --sandbox workspace-write --add-dir <project>/data/generated --image <reference> --output-last-message <file> -` with a prompt that tells child Codex to use the `imagegen` built-in image tool and save a PNG to the exact output path.
5. Success is determined by output image existence plus image validation, not by the final message format.
6. Main returns a data URL, file path, dimensions, and content type to the renderer.
7. The renderer shows the result in the existing modal and can add it to canvas.

## Error Handling

- Health checks report Codex CLI version, login status, `--image` support, and `--output-last-message` support.
- Windows command execution wraps Codex through `cmd.exe /d /s /c` with `windowsVerbatimArguments`.
- Cancellation kills the active child process and returns a cancelled error to the renderer.
- Missing Electron bridge, missing Codex CLI, missing login, missing output image, corrupt output image, and unsupported data URLs each return explicit messages.

## Testing

- `node:test` covers the pure runner without launching Electron.
- Runner tests verify Windows command wrapping, health flag detection, reference image arguments, output validation, empty final messages, and cancellation.
- A preload whitelist test ensures only the intended bridge methods are exposed.
- Build verification covers the React renderer and Electron main/preload syntax.

## Out Of Scope

- Real OpenAI Images API mask editing.
- Multi-candidate concurrent generation.
- Installer polish, auto-updates, app icons, and code signing.
- Cloud deployment or browser-based generation.
