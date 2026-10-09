# Android 保持登入與「加密後台」說明

## 結論（Bubblewrap TWA）

本專案 APK 是 **Trusted Web Activity（TWA）**：由 Chrome 開啟 GitHub Pages，**不是** App 內 WebView。

因此這類程式**無法使用**：

```text
webView.addJavascriptInterface(..., "AndroidBackgroundAuth")
EncryptedSharedPreferences + @JavascriptInterface
```

網頁裡的 `window.AndroidBackgroundAuth` 在 TWA 下永遠不存在。

## 手機版實際作法（已實作）

| 項目 | 作法 |
|------|------|
| 入口 | `mobile/voice_studio.html` |
| 保持登入 | `localStorage` + IndexedDB 寫入 session（token） |
| 登出 | 才清除 |
| 網頁版 | 只用 `sessionStorage`（刷新需重登） |
| **不存密碼** | 只存登入後的 session／token，不存明文密碼 |

關閉 App 後再打開，只要本機還有 session，就不會再出現登入畫面。

## 若一定要 EncryptedSharedPreferences

必須改成 **WebView 殼**（或把 TWA fallback 當主路徑並自訂 WebView），才能掛 JS Bridge。這會失去標準 TWA 體驗，需另開一輪改造與重新簽名打包。

## APK 啟動網址

`xiao-yi-android` 的 `launchUrl` 應指向：

`/Primary-1-AI/mobile/voice_studio.html`

改完後請在本機重新 `gradlew assembleRelease` 並更新 `downloads/xiao-yi-assistant.apk`。
