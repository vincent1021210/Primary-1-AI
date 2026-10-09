// 可公開部署的非機密設定（GitHub Pages 會載入）
// Gemini 金鑰請放 config.local.js（本機）或瀏覽器本機儲存，勿提交金鑰
window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
  geminiModel: "gemini-3.1-flash-lite",
  displayName: "",
  appsScriptAuthUrl:
    "https://script.google.com/macros/s/AKfycbwRKjoCWgJv2gD_fETWkxTWnap9V0NNFwYBbvzVfFRa-ZqaKjJxwxljtM1w42E1JtMINg/exec",
  requireLogin: true,
  autoRestoreLogin: false,
});
