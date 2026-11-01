// 可公開部署的非機密設定（GitHub Pages 會載入）
// Gemini 金鑰請放 config.local.js（本機）或瀏覽器本機儲存，勿提交金鑰
window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  geminiViaBackend: true,
  displayName: "",
  /** Google Identity Services 網頁用戶端（僅 Client ID；勿放 Client Secret） */
  googleClientId:
    "354935544437-1vrje0je178afce6nturpghuu5r16qp6.apps.googleusercontent.com",
  /** Android 用戶端（APK 原生登入識別；requestIdToken 仍用上面 Web ID） */
  googleClientIdAndroid:
    "354935544437-7hlcghqle12ar776mgeofdku0b8f7ap7.apps.googleusercontent.com",
  appsScriptAuthUrl:
    "https://script.google.com/macros/s/AKfycbyWft_wINCMGxdTzMMmIcAzSKZKDkssiyt7auex1Zz22EqB34DxLfKpLeS4Pv-wdPEk/exec",
  requireLogin: true,
  autoRestoreLogin: false,
});
