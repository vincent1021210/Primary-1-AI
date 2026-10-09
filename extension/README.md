# AI 朗讀（免費 TTS Chrome 擴充功能）

使用瀏覽器內建 **Web Speech API**，零成本、無需 API Key、無字數限制。

## 功能

- 網頁反白文字 → 右鍵 → **AI 朗讀**
- Popup：貼上文字朗讀、語速（0.5x–2x）、語言自動偵測、選擇系統語音
- 暫停／繼續／停止

## 安裝（Chrome / Edge）

1. 開啟 `chrome://extensions`（Edge：`edge://extensions`）
2. 右上角開啟「開發人員模式」
3. 點「載入未封裝項目」
4. 選擇本資料夾：`extension`

## 技術說明

| 項目 | 說明 |
|------|------|
| Manifest | V3 |
| 語音引擎 | `window.speechSynthesis`（系統／瀏覽器語音包） |
| 為何有 content script | Service Worker **無法**使用 `speechSynthesis`，朗讀必須在頁面或 Popup 執行 |

## 檔案結構

```
extension/
├── manifest.json
├── background.js      # 右鍵選單、注入腳本
├── content.js         # 網頁內朗讀
├── lib/
│   ├── language.js    # 中英語言偵測
│   └── tts.js         # TTS 核心
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
```

## 使用提示

- **Edge** 通常有較自然的線上中文語音，音質較佳。
- 部分頁面（`chrome://`、擴充功能商店、PDF 內嵌檢視）可能無法注入腳本，請改用 Popup 貼上文字。
- 語音清單依作業系統與瀏覽器而異；可在 Popup 手動挑選。
