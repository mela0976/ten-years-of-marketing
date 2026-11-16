# 《決策智慧：十年》3D 網頁遊戲規格

Three.js + Vite 的靜態網頁遊戲，部署到 GitHub Pages。對象是行銷人員：一章一分鐘、十章十分鐘，先動手再讀字。

## 範圍與邊界

- 只在本資料夾（`game3d/`）內讀寫。**不要讀取、複製或引用上層資料夾的任何 PDF、InDesign 或圖片。** 唯一可讀的外部檔案是 `../POC/light.js`（內容來源）與 `../POC/SPEC-LIGHT.md`（互動規則參考）。
- 把 `../POC/light.js` 的內容轉成 `src/content.js`（ES module，`export default`）。文字一字不改；`bluff` 區塊不需要搬。
- 不做《報表吹牛》、不做進階版，只做「十年」十章加人格卡。
- 不執行 `git init`、`git commit`、`git push`，不建立遠端儲存庫，不呼叫 `gh`。只把檔案準備好。
- 程式碼從簡：不引入狀態管理、UI 框架、物理引擎或動畫函式庫。相依套件只允許 `three`、`vite`，以及建置資產用的 `@gltf-transform/*`、`draco3dgltf`（devDependencies）。

## 專案結構

```
game3d/
├── index.html
├── package.json
├── vite.config.js            # base: './'
├── .gitignore                # node_modules、dist
├── .github/workflows/deploy.yml
├── README.md                 # 本機執行、建置、部署三段，各三行以內
├── scripts/
│   ├── build-models.mjs      # 以程式產生 GLB 並套用 Draco
│   ├── build-audio.sh        # 以 ffmpeg 合成音效
│   └── check-dist.mjs        # 部署前檢查
├── public/
│   ├── models/*.glb
│   ├── audio/*.mp3
│   └── draco/                # 從 three/examples/jsm/libs/draco/gltf 複製的解碼器
├── src/
│   ├── main.js
│   ├── content.js
│   ├── logic.js              # 純函式：人格判定、拉桿判定、識破率
│   ├── logic.test.mjs        # node --test
│   ├── scene/                # 場景、相機、各章舞台
│   ├── ui/                   # DOM 介面
│   └── style.css
```

建置後的 `dist/` 應為：`index.html`、`assets/`（壓縮後的 js 與 css）、`models/`、`audio/`、`draco/`。

## GitHub Pages 的硬性要求

- `vite.config.js` 設 `base: './'`。程式中所有資源路徑一律相對（`./models/bottle.glb`），以 `import.meta.env.BASE_URL` 或相對字串組合，不可出現以 `/` 開頭的絕對路徑。
- 所有檔名與資料夾一律小寫、以連字號分隔，副檔名小寫。程式中的路徑字串與實際檔名大小寫必須完全一致。
- 不使用任何 CDN、外部字型或外部請求。Draco 解碼器放在 `public/draco/`，以相對路徑設定 `DRACOLoader.setDecoderPath`。
- `dist/` 總大小不超過 5 MB；單一檔案不超過 1.5 MB；不產生 `.br` 檔。
- `.github/workflows/deploy.yml`：push 到 `main` 時以 Node 22 執行 `npm ci`、`npm run build`，用 `actions/configure-pages`、`actions/upload-pages-artifact`（path: `dist`）、`actions/deploy-pages` 部署。權限 `pages: write`、`id-token: write`、`contents: read`。

## 資產

**模型**（`scripts/build-models.mjs`，`npm run build:models`）

以 `@gltf-transform/core` 直接用程式建立低面數網格（不需要 Blender），用頂點色或純色材質，不使用貼圖；再以 `@gltf-transform/functions` 的 `draco()` 壓縮後輸出。至少產生：

- `bottle.glb`：瓶子（旋轉體，約 300–600 個三角形）。遊戲中複製三個並各自上色。
- `tablet.glb`：立著的報告板（圓角薄板加支架）。
- `figure.glb`：低面數人形（頭、身體兩個部件即可），用於人群與三位角色。
- `gate.glb`：年份拱門。

每個 GLB 小於 50 KB。產生後的 GLB 要提交進版本庫（放在 `public/models/`），建置時不必重跑。

**貼圖**：遊戲不使用圖片貼圖（純色與頂點色），因此不需要 KTX2。3D 物件上的文字用 `CanvasTexture` 在執行時繪製。這一點寫進 README 的一句話即可。

**音效**（`scripts/build-audio.sh`，以 ffmpeg 的 `sine`／`anoisesrc` 等濾鏡合成，不下載任何素材）

- `click.mp3`、`correct.mp3`、`wrong.mp3`、`flip.mp3`：各不超過 0.4 秒、小於 20 KB。
- `bgm.mp3`：約 20 秒可循環的低調環境音，96 kbps 單聲道，小於 300 KB。
- 音訊在第一次使用者手勢後才啟動；右上角一顆靜音切換，預設開啟音效、背景音樂音量低。靜音狀態存 `localStorage`（try/catch）。

## 畫面與美術方向

- 一條在深色空間中向前延伸的「十年長廊」：十座年份拱門沿著 z 軸排開，每座拱門後是一個小舞台。相機在章與章之間平滑滑行（自寫 tween，約 1.2 秒，ease in-out）。
- 低面數、平塗、少量柔和燈光（一盞半球光加一盞方向光），霧化遠景。主色一個（墨綠 `#1f6f5c` 系），警示色一個（朱紅 `#d6452b` 系），其餘為深灰藍與米白。不要霓虹、不要粒子特效堆疊、不要後製濾鏡。
- 所有閱讀文字用 DOM 疊在 canvas 上（清晰、可選取、可被螢幕閱讀器讀到）。3D 負責物件與手感。
- 少用次要標籤與說明文字，讓版面自己說明。不要 emoji。介面全部繁體中文（台灣用語）。內文至少 17px，按鈕至少 18px、觸控高度至少 48px。
- 頁面頂端一條十格進度列，目前年份亮起。
- 手機直式 375×812 可完整操作，無水平捲動；`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`；視窗縮放時更新相機。直式時相機拉遠或提高視角，確保舞台物件不被下方 DOM 面板遮住。
- 尊重 `prefers-reduced-motion`：相機改為淡入淡出切換，物件動畫縮短。
- 分頁不可見時（`visibilitychange`）暫停渲染迴圈與音樂。
- WebGL 無法使用時，顯示一句說明並以純 DOM 方式仍可玩完十章（互動用按鈕與 `<input type="range">` 替代）。

## 流程

開場畫面：標題、`intro` 一句、一顆「開始」。按下後啟動音訊並進入 2018。

每章三拍（細節見 `../POC/SPEC-LIGHT.md` 的「十年：每章三拍」與五種小互動的判定規則，判定規則必須一致）：

1. **老闆訊息**：下方 DOM 聊天泡泡與兩顆快速回覆。
2. **小互動**：在 3D 舞台上操作，並且每個互動都要有等效的 DOM 按鈕或鍵盤操作（左右方向鍵、Enter、空白鍵）。
3. **一句帶走**：大字 `takeaway`、小字 `book` 與 `source`、一顆「下一年」。

各章的 3D 舞台：

| 年 | 類型 | 舞台 |
| --- | --- | --- |
| 2018 | pick | 兩塊立著的報告板（`tablet.glb`），板面用 `CanvasTexture` 畫出標題與兩行數字。指到時微微前傾，點選後正解亮主色、錯的轉暗。 |
| 2019 | slider | 一排十個月曆方塊，拉桿每加一年就多立起一塊。揭曉時正解那一塊亮起。 |
| 2020 | slider | 一根直立圓柱分成兩色，隨拉桿改變比例。揭曉時旁邊升起正解比例的第二根圓柱對照。 |
| 2021 | swipe | 一張浮在空中的彈出視窗卡片，可拖曳左右甩出，跟手傾斜。 |
| 2022 | slider | 100 個人形（`InstancedMesh`，10×10），隨拉桿把對應數量上成警示色。揭曉時顯示正解的人數。 |
| 2023 | swipe | 同 2021 的卡片，卡面是文案；每張甩出後立即顯示對錯。 |
| 2024 | pick | 三個人形站在台上，頭上以 `CanvasTexture` 標牌標示身分；點選後一個哨子（簡單幾何體）落到正解頭上。 |
| 2025 | stop | 一根隨時間長高的主色柱（報表成效）與一群逐格減少的人形（新客比例）。舞台前方一顆紅色大按鈕可按，DOM 也有同一顆「停」。 |
| 2026 | agent | 架上三個瓶子（`bottle.glb`），各自顏色與標牌。玩家選完後，一道掃描光依序掃過三瓶，停在 AI 選的那瓶。 |
| 2027 | 終章 | 只有老闆訊息。回覆後一張大卡在 3D 中翻面，翻到正面時切換為 DOM 人格卡。 |

指標互動用 `Raycaster`，同時支援滑鼠與觸控（pointer events）。拖曳時不可捲動頁面（`touch-action: none` 只加在 canvas 上）。

人格卡內容與判定見 `../POC/SPEC-LIGHT.md` 的「十年：人格卡」，含 `再玩一次` 與 `複製結果`。

進度用 `localStorage` 保存（try/catch），重新整理後回到同一章的開頭。

## 驗證（全部通過才算完成）

- `npm test`：`node --test src/logic.test.mjs`。涵蓋 `../POC/SPEC-LIGHT.md` 驗證第 6、8 項（人格窮舉、拉桿判定），以及第 6 章「答對三張以上算對」、第 8 章 `goodUntilTick` 判定。
- `npm run build`：無錯誤、無警告超過 chunk 大小限制（必要時設定合理的 `chunkSizeWarningLimit` 並說明）。
- `npm run check`（`scripts/check-dist.mjs`）：
  1. `dist/` 總大小 ≤ 5 MB，單檔 ≤ 1.5 MB，逐檔列出大小。
  2. `dist/index.html` 與 `dist/assets/*.js`、`*.css` 中沒有以 `"/assets`、`"/models`、`"/audio`、`"/draco` 開頭的絕對路徑，也沒有 `http://`、`https://` 的外部資源請求（`w3.org` 的 XML 命名空間字串除外）。
  3. `dist/` 內所有檔名皆為小寫；程式引用的每個 `models/`、`audio/`、`draco/` 路徑都能在 `dist/` 找到大小寫完全相同的檔案。
  4. 每個 GLB 都含 `KHR_draco_mesh_compression` 擴充。
- `npm run preview` 可在本機開啟（Vite 預設埠）。

## 完成回報

列出：檔案清單、`npm test`、`npm run build`、`npm run check` 的完整輸出、`dist/` 逐檔大小，以及與本規格不同之處與理由。未能驗證的項目明確寫出。
