# AI 語音助手（本機版）

融合 **語音轉文字（STT）** 與 **文字轉語音（TTS）**，完全免費、無需 API Key。

## 推薦啟動（雙向融合）

雙擊上層資料夾：

`啟動語音助手.bat`

會開啟本機網頁：`http://127.0.0.1:8765/voice_studio.html`（請用 Chrome／Edge，並允許麥克風）。

| 功能 | 操作 |
|------|------|
| 聽寫 | 點「開始聽寫」說話，文字寫入共用文字區 |
| 朗讀 | 點「朗讀」把文字區內容讀出來 |
| 標點 | 可開啟「停頓自動加標點」 |

## 純朗讀視窗（系統 SAPI，可不開瀏覽器）

```bat
python desktop\tts_app.py
```

或雙擊：`啟動朗讀.bat`

## 帳號系統（Google Apps Script 資料庫）

詳見 `desktop/apps_script/README.md`：把 `Code.gs` 部署成網頁應用程式，將網址填入 `config.local.js` 的 `appsScriptAuthUrl`。支援註冊／登入、依帳號稱呼，以及每人獨立對話歷史。

## 相關附件

- 附件一：免費 TTS（Web Speech／系統語音）
- 附件三：免費 STT（SpeechRecognition）
- 附件四：TTS + STT 融合架構
