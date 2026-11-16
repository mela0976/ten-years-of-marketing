# 決策智慧：十年

## 本機執行
`npm ci && npm run dev`
音效於第一次點擊「開始」後啟動；純色與頂點色 3D 物件不使用圖片貼圖。

## 建置
`npm test && npm run build && npm run check`
`npm run preview` 可預覽 `dist/`。

## 部署
將資料夾推送到 GitHub repository 的 `main` 分支。
GitHub Actions 會建置並部署 `dist/` 到 GitHub Pages。
