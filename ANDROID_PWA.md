# 小一 PWA → Android App（Bubblewrap）實戰

你的正式 PWA 網址（GitHub Pages）：

- 網站：https://vincent1021210.github.io/Primary-1-AI/
- Manifest：https://vincent1021210.github.io/Primary-1-AI/manifest.json

---

## 第一階段：確認 PWA（已在本專案完成）

本倉庫已包含：

| 檔案 | 用途 |
|------|------|
| `manifest.json` | PWA 清單 |
| `sw.js` | Service Worker |
| `icons/icon-192.png`、`icon-512.png` | App 圖示 |
| `.well-known/assetlinks.json` | TWA 去網址列（打包後再填指紋） |

請先開啟 GitHub → Settings → Pages，確認網站可開。

用 Chrome 開網站 → F12 → Application → Manifest / Service Workers 應為正常。

---

## 第二階段：本機安裝

```bat
npm install -g @bubblewrap/cli
bubblewrap --version
```

需已安裝 Node.js LTS。

---

## 第三階段：打包

在空白資料夾執行（路徑請改成你的）：

```bat
mkdir %USERPROFILE%\Desktop\xiao-yi-android
cd %USERPROFILE%\Desktop\xiao-yi-android

bubblewrap init --manifest https://vincent1021210.github.io/Primary-1-AI/manifest.json
```

問答建議：

- 下載 Java / Android SDK：輸入 `Y`
- Domain / Start URL：沿用預設（應為 `vincent1021210.github.io` 與 `/Primary-1-AI/...`）
- Application ID：建議 `com.vincent1021210.primary1ai`

產生簽章：

```bat
bubblewrap keygen
```

（記住密碼；保管好 `android.keystore`）

編譯：

```bat
bubblewrap build
```

產出：

- `app-release-signed.apk` → 手機測試安裝
- `app-release-bundle.aab` → 上架 Play 商店

---

## 第四階段：去掉頂部網址列（Digital Asset Links）

1. `bubblewrap build` 結束後，終端機／專案內會有 `assetlinks.json`（含 SHA-256）。
2. 把指紋貼進本倉庫的 `.well-known/assetlinks.json`（替換 `REPLACE_WITH_...`），`package_name` 需與 Application ID 一致。
3. 提交並推上 GitHub，確認可開啟：

   https://vincent1021210.github.io/Primary-1-AI/.well-known/assetlinks.json

4. 手機重裝／清除 App 資料後再開，網址列應消失。

驗證工具（可選）：

https://developers.google.com/digital-asset-links/tools/generator

---

## 方案 A：網站直接發佈 APK

本倉庫已提供：

| 路徑 | 說明 |
|------|------|
| `download.html` | 一鍵下載＋安裝教學＋QR Code |
| `downloads/xiao-yi-assistant.apk` | 已簽章 APK |
| `.well-known/assetlinks.json` | 去頂部網址列 |

公開網址：https://vincent1021210.github.io/Primary-1-AI/download.html

GitHub Pages 會以二進位提供 `.apk`；頁面另加 `download` 屬性強制下載。重新打包後請覆蓋 `downloads/xiao-yi-assistant.apk` 再 push。

功能邏輯在網頁端：多數更新只需改網站，使用者重開 App 即生效，不必重裝 APK。

---

## 注意

- 金鑰倉 `android.keystore` 與密碼勿上傳公開倉庫（請留在本機 `Desktop/xiao-yi-android`）。
- Gemini 金鑰勿寫進 Git；線上請用本機 `localStorage` 設定（見 README）。
