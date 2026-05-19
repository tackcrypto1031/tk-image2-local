# Electron Codex Imagegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop version of the canvas that generates images through Codex CLI `imagegen`.

**Architecture:** React/Vite remains the renderer. Electron main owns privileged filesystem, Codex CLI, cancellation, and persistence work. A preload bridge exposes a narrow typed API to the renderer.

**Tech Stack:** React 19, Vite 6, TypeScript renderer, Electron main/preload JavaScript, Node `node:test`.

---

### Task 1: Runner Tests And Implementation

**Files:**
- Create: `tests/codexRunner.test.mjs`
- Create: `electron/codexRunner.mjs`

- [ ] Write failing `node:test` tests for command wrapping, data URL materialization, image validation, health checks, successful generation, and cancellation.
- [ ] Run `npm test -- tests/codexRunner.test.mjs` and confirm it fails because `electron/codexRunner.mjs` does not exist.
- [ ] Implement `createCodexRunner`, `commandInvocation`, `materializeDataUrlImages`, `validateImageFile`, and `buildImagegenPrompt`.
- [ ] Run `npm test -- tests/codexRunner.test.mjs` and confirm the tests pass.

### Task 2: Electron Main And Preload

**Files:**
- Create: `tests/preload-api.test.mjs`
- Create: `electron/preload.cjs`
- Create: `electron/main.mjs`

- [ ] Write a failing preload whitelist test that expects `health`, `generate`, `autoOutpaintPrompt`, `cancel`, `loadCanvas`, and `saveCanvas`.
- [ ] Run `npm test -- tests/preload-api.test.mjs` and confirm it fails because preload does not exist.
- [ ] Implement `preload.cjs` with `contextBridge.exposeInMainWorld`.
- [ ] Implement `main.mjs` with `BrowserWindow`, secure web preferences, IPC handlers, Codex runner, and canvas persistence.
- [ ] Run the preload test and a syntax import check for main.

### Task 3: Renderer Integration

**Files:**
- Modify: `App.tsx`
- Modify: `components/ImageEditModal.tsx`
- Modify: `types.ts`
- Create: `electron.d.ts`

- [ ] Remove `@google/genai` usage and replace generation calls with `window.codexImage.generate()`.
- [ ] Convert normal generation to one-result output while preserving the existing modal actions.
- [ ] Convert outpainting and auto-prompt generation to the bridge.
- [ ] Convert image edit modal red-mask generation to the bridge.
- [ ] Add autosave load on mount and save-on-change through the bridge.
- [ ] Show generation phase, elapsed seconds, and cancel action.

### Task 4: Scripts, Metadata, And Docs

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `README.md`
- Modify: `metadata.json`
- Modify: `.gitignore`

- [ ] Add Electron dependencies and scripts: `dev:electron`, `build:electron`, `pack:electron`, and `test`.
- [ ] Remove Gemini env injection from Vite.
- [ ] Update docs and metadata from Nano Banana/Gemini to Codex Imagegen desktop usage.
- [ ] Ignore Electron generated runtime output and build artifacts.

### Task 5: Verification

**Commands:**
- `npm install`
- `npm test`
- `npm run build`
- `npm run pack:electron`
- `codex --version`
- `codex login status`

- [ ] Run dependency install to materialize lockfile and Electron packages.
- [ ] Run the complete test suite and read the output.
- [ ] Run renderer build and Electron packaging.
- [ ] Run Codex CLI health commands.
- [ ] Report changed files, simplifications, verification evidence, and remaining risks.
