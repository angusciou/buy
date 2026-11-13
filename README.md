# 台股趨勢突破選股（單機版 PWA）

大盤濾網 → 多頭排列 + 創高突破 + 量能 → 籌碼/營收防呆 → ATR 部位計算。
功能：監控清單、設定與備份（JSON）、可安裝到手機/桌面。不需後端、不需帳號。

## 本機執行
```bash
npm install
npm run dev
```

## 部署到 GitHub Pages
```bash
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin https://github.com/<帳號>/<repo>.git
git push -u origin main
```
然後 Repo → Settings → Pages → Source 選 **GitHub Actions**。之後 push 到 main 會自動建置發布，網址為 `https://<帳號>.github.io/<repo>/`。

## 安裝成 App
- Android / 桌面 Chrome、Edge：右上「安裝」按鈕。
- iPhone：Safari → 分享 → 加入主畫面。

## 資料
- 設定、監控清單、籌碼欄位、K 線快取都存在這台裝置的瀏覽器（localStorage）。換裝置請用「設定與備份」匯出／匯入 JSON。
- TWSE 不開放瀏覽器跨來源請求，目前透過公開中繼（CorsProxy / AllOrigins），可能不穩或限流。
- 工具僅為篩選輔助，不構成投資建議。
