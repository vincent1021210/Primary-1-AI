// 複製成 config.local.js 後填入你的金鑰與 Apps Script 網址
window.APP_CONFIG = {
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  /** 未登入時的預設稱呼（登入後改用帳號顯示名稱） */
  displayName: "",
  /**
   * Google Apps Script 網頁應用程式網址（…/exec）
   * 部署步驟見 desktop/apps_script/README.md
   */
  appsScriptAuthUrl: "",
  /** 有設定 appsScriptAuthUrl 時，是否強制登入才可用助理（預設 true） */
  requireLogin: true,
  /** true 才會記住登入、重新整理自動進去；預設請保持 false */
  autoRestoreLogin: false,
};
