# 小一帳號庫（Google Apps Script）

以 **試算表** 當資料庫：Gmail 註冊（郵件驗證碼）、登入、工作階段 token、每人歷史紀錄。密碼 **至少 8 碼**，以 **SHA-256 + salt** 儲存。

## 部署

1. 開啟 [Google Apps Script](https://script.google.com/) →「新增專案」
2. 將 `Code.gs` 全部貼上，儲存
3. **部署 → 新增部署作業 → 應用程式**
   - 執行身分：自己
   - 具有存取權的使用者：**任何人**
4. 首次執行寄信時，Google 會要求授權 **Gmail／郵件** 權限，請允許
5. 複製「網頁應用程式網址」（形如 `https://script.google.com/macros/s/.../exec`）
6. 貼到本機 `config.local.js`：

```js
window.APP_CONFIG = {
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  geminiViaBackend: true,
  appsScriptAuthUrl: "https://script.google.com/macros/s/XXXX/exec",
  requireLogin: true,
};
```

7. **設定後端 Gemini 金鑰（必要）**  
   在 Apps Script 編輯器：**專案設定 → 指令碼屬性** 新增：
   - `GEMINI_API_KEY`＝你的 AI Studio 金鑰（`AQ.` 或 `AIza`）
   - `GEMINI_MODEL`＝`gemini-3.1-flash-lite`（可選，有預設值）  
   然後 **部署 → 管理部署作業 → 編輯 → 新版本 → 部署**（程式碼更新後一定要出新版）。

8. 重新整理 `voice_studio.html` 後：註冊 → 填 Gmail／密碼 →「發送驗證碼」→ 到信箱輸入 6 碼 →「驗證並註冊」

首次使用會自動建立試算表「小一助理帳號庫」（Users / Sessions / History / Pending）。

未設定 `appsScriptAuthUrl` 時為本機測試模式（驗證碼顯示在畫面上，不會真的寄信）。

## 語音流程（後端代理）

```
手機錄音 → POST geminiAssist（含 base64 音訊 + token）
         → Apps Script 讀 GEMINI_API_KEY
         → 呼叫 Gemini 3.1 Flash-Lite
         → 回傳文字給 App 朗讀／執行動作
```

注意：錄音請盡量短（約 20 秒內），過長 base64 可能被 Apps Script 拒收。

## API（POST JSON）

| action | 說明 |
|--------|------|
| `sendRegisterCode` | `{ account, password, displayName? }` 寄 Gmail 驗證碼 |
| `register` | `{ account, code }` 驗證後建立帳號 |
| `login` | `{ account, password }` |
| `googleLogin` | `{ idToken, displayName? }` Google 一鍵登入（後端驗證 ID Token） |
| `logout` | `{ token }` |
| `me` | `{ token }` |
| `appendHistory` | `{ token, line }` |
| `listHistory` | `{ token, limit? }` |
| `geminiAssist` | `{ token, userText?, systemInstruction?, audio?, image?, model? }` 後端呼叫 Gemini |

前端請用 `Content-Type: text/plain;charset=utf-8` 送 JSON，避免 CORS 預檢失敗。
