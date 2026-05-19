# Codex 圖像畫布

透過本機 Codex CLI `imagegen` 生成圖片的 Electron 桌面無限畫布，支援拖放圖片、便條、繪圖、圖像生成、混圖、擴圖、紅色遮罩編輯、自動儲存、匯入與匯出。

<img width="2386" height="1532" alt="2026-05-19_131528" src="https://github.com/user-attachments/assets/f57e7339-8711-4197-aa4e-d42a6ecd70b3" />

https://github.com/user-attachments/assets/62f8569c-7496-4d3b-a74f-1734baaa839a

原設計概念為 Prompt Case 做的Ai Studio工具，我拿來改XD
請支持原大神~~ https://www.threads.com/@prompt_case

## 需求與依賴

### 系統依賴

- Windows 10/11：`start.bat`、Codex CLI 安裝/登入輔助視窗、目前的 Electron 打包設定都以 Windows 為主要目標。
- Node.js 與 npm：建議 Node.js 20 LTS 以上。此版本已用 Node.js `v24.15.0`、npm `11.12.1` 驗證。
- Git：用來 clone / pull / push 專案。
- Codex CLI：圖片生成需要本機 `codex` 指令與 `imagegen` 能力。若尚未安裝，可用 `npm install -g @openai/codex@latest` 安裝。
- Codex 登入狀態：圖片生成前需完成 `codex login`，可用 `codex login status` 檢查。

### npm 依賴

執行 `npm install` 會依照 `package-lock.json` 安裝所有 transitive dependencies。以下是本工具直接宣告的 top-level dependencies：

| 類型 | 套件 | 版本 |
| --- | --- | --- |
| runtime | `react` | `^19.1.1` |
| runtime | `react-dom` | `^19.1.1` |
| dev/build | `@types/node` | `^22.14.0` |
| dev/build | `@vitejs/plugin-react` | `^5.0.0` |
| dev/build | `electron` | `^42.1.0` |
| dev/build | `electron-builder` | `^26.0.12` |
| dev/build | `typescript` | `~5.8.2` |
| dev/build | `vite` | `^6.2.0` |

不需要 Gemini API key；本工具會從 Electron main process 呼叫本機 Codex CLI 來生成 PNG。

## 安裝

```bash
git clone https://github.com/tackcrypto1031/tk-image2-local.git
cd tk-image2-local
npm install
```

檢查 Codex CLI：

```bash
codex --version
codex login status
```

若尚未安裝或尚未登入：

```bash
npm install -g @openai/codex@latest
codex login
```

## 啟動桌面工具

在本資料夾雙擊 `start.bat`。

啟動器會優先開啟 `release/win-unpacked/Codex Image Canvas.exe`。如果打包版不存在，會自動執行 `npm install` 並改用 Electron 開發模式。

手動啟動 Electron 與 Vite renderer：

```bash
npm run dev:electron
```

單獨執行 `npm run dev` 只會開啟 renderer。圖片生成需要 Electron，因為後台會從 main process 呼叫本機 Codex CLI。

## 可選環境變數

- `BANANA_REMIX_CODEX_BIN`：自訂 Codex CLI 執行檔路徑，預設為 `codex`。
- `BANANA_REMIX_CODEX_MODEL`：子 Codex worker 使用的文字模型，預設使用本機 Codex 設定。
- `BANANA_REMIX_PROJECT_DIR`：專案根目錄；生成圖片會存到此目錄底下的 `data/generated/`。
- `BANANA_REMIX_DEV_URL`：Electron 開發模式載入的 renderer URL，通常由 `scripts/dev-electron.mjs` 自動設定。

## 建置

```bash
npm run build
npm run pack:electron
```

`pack:electron` 會在 `release/` 底下建立未封裝安裝器的 Windows 版本。`release/` 是本機建置產物，不會納入 git。

生成完成的 PNG 會存放在專案資料夾的 `data/generated/`，不會放到 Electron 的 AppData。`data/generated/` 與 `data/logs/` 都是本機執行資料，不會納入 git。

## 驗證

```bash
npm test
npm run build
```
