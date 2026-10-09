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
  geminiApiKey: "你的金鑰",
  geminiModel: "gemini-3.1-flash-lite",
  appsScriptAuthUrl: "https://script.google.com/macros/s/XXXX/exec",
  requireLogin: true,
};
```

7. 重新整理 `voice_studio.html` 後：註冊 → 填 Gmail／密碼 →「發送驗證碼」→ 到信箱輸入 6 碼 →「驗證並註冊」

首次使用會自動建立試算表「小一助理帳號庫」（Users / Sessions / History / Pending）。

未設定 `appsScriptAuthUrl` 時為本機測試模式（驗證碼顯示在畫面上，不會真的寄信）。

## API（POST JSON）

| action | 說明 |
|--------|------|
| `sendRegisterCode` | `{ account, password, displayName? }` 寄 Gmail 驗證碼 |
| `register` | `{ account, code }` 驗證後建立帳號 |
| `login` | `{ account, password }` |
| `logout` | `{ token }` |
| `me` | `{ token }` |
| `appendHistory` | `{ token, line }` |
| `listHistory` | `{ token, limit? }` |

前端請用 `Content-Type: text/plain;charset=utf-8` 送 JSON，避免 CORS 預檢失敗。
