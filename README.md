# 小一 AI 語音助理（Primary-1-AI）

免費語音助理：喚醒詞、Gemini 糾錯、天氣／導航／計算、YouTube 播放、Gmail 註冊登入。

## 網頁版（GitHub Pages）

部署後網址（約數分鐘生效）：

**https://vincent1021210.github.io/Primary-1-AI/**

或直接開啟：

**https://vincent1021210.github.io/Primary-1-AI/desktop/voice_studio.html**

### 啟用 Pages

1. GitHub 倉庫 → **Settings** → **Pages**
2. Build and deployment → Source：**Deploy from a branch**
3. Branch：**main**（或 `master`）／資料夾：**/ (root)**
4. Save

### 線上 Gemini 金鑰（勿提交到 Git）

瀏覽器主控台執行一次（會存在本機）：

```js
localStorage.setItem("xiaoYiGeminiApiKey", "你的_Gemini_API_Key");
location.reload();
```

本機開發請複製 `desktop/config.example.js` → `desktop/config.local.js` 填入金鑰。

## 本機啟動

雙擊 `啟動語音助手.bat`，以 Chrome／Edge 開啟，並允許麥克風。

## 主要檔案

| 路徑 | 說明 |
|------|------|
| `desktop/voice_studio.html` | 主畫面 |
| `desktop/apps_script/` | Google 試算表帳號庫 |
| `extension/` | Chrome 擴充功能（選用） |
