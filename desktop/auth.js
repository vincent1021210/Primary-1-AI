/**
 * 小一帳號：Apps Script（Gmail 驗證碼）優先；未設定網址時本機備援。
 * 註冊：Gmail + 郵件驗證碼；密碼至少 8 碼。
 */
(function (global) {
  const STORAGE_KEY = "xiaoYiAuthSession";
  const LOCAL_USERS_KEY = "xiaoYiUsersDB";
  const LOCAL_HISTORY_KEY = "xiaoYiHistoryDB";
  const LOCAL_PENDING_KEY = "xiaoYiPendingReg";
  const MIN_PASSWORD_LEN = 8;

  function cfg() {
    return global.APP_CONFIG || {};
  }

  function authUrl() {
    return String(cfg().appsScriptAuthUrl || "").trim();
  }

  function requireLogin() {
    return cfg().requireLogin !== false;
  }

  function useRemote() {
    return Boolean(authUrl());
  }

  function isGmail(account) {
    return /^[a-z0-9._%+-]+@gmail\.com$/i.test(String(account || "").trim());
  }

  function normalizeAccount(account) {
    return String(account || "")
      .trim()
      .toLowerCase();
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.token || !data?.account) return null;
      if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function saveSession(session) {
    if (!session?.token) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: session.token,
        account: session.account,
        displayName: session.displayName || session.account,
        expiresAt: session.expiresAt || "",
        backend: session.backend || (useRemote() ? "appscript" : "local"),
      })
    );
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** 是否允許用本機 token 自動登入（預設 false：每次都要輸入密碼） */
  function autoRestoreLogin() {
    return cfg().autoRestoreLogin === true;
  }

  /** 清除本機全部帳號／工作階段／歷史／待驗證資料 */
  function clearAllLocalData() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LOCAL_USERS_KEY);
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    localStorage.removeItem(LOCAL_PENDING_KEY);
    [
      "xiaoYiAuthSession",
      "xiaoYiUsersDB",
      "xiaoYiHistoryDB",
      "xiaoYiPendingReg",
    ].forEach((k) => localStorage.removeItem(k));
    return true;
  }

  function loadLocalUsers() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalUsers(db) {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(db || {}));
  }

  function loadLocalHistory() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalHistory(db) {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(db || {}));
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(String(text));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function randomToken() {
    if (global.crypto?.randomUUID) return crypto.randomUUID();
    return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function randomCode6() {
    return String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  }

  async function api(action, payload = {}) {
    const url = authUrl();
    if (!url) {
      throw new Error("尚未設定 appsScriptAuthUrl（請見 config.local.js）");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(
        "Apps Script 回應不是 JSON，請確認已部署為「任何人可存取」"
      );
    }
    if (!data?.ok) {
      throw new Error(data?.error || "請求失敗");
    }
    return data;
  }

  /** 寄送註冊驗證碼（本機模式會回傳 demoCode 供測試） */
  async function sendRegisterCode(account, password, displayName) {
    const key = normalizeAccount(account);
    if (!isGmail(key)) {
      throw new Error("註冊帳號必須是 Gmail（例：name@gmail.com）");
    }
    if (String(password || "").length < MIN_PASSWORD_LEN) {
      throw new Error(`密碼至少 ${MIN_PASSWORD_LEN} 個字`);
    }

    if (useRemote()) {
      return api("sendRegisterCode", {
        account: key,
        password,
        displayName: displayName || key.split("@")[0],
      });
    }

    // 本機備援：無法真的寄信，將驗證碼顯示於畫面（僅測試用）
    const db = loadLocalUsers();
    if (db[key]) throw new Error("此 Gmail 已被註冊，請直接登入");
    const prev = JSON.parse(localStorage.getItem(LOCAL_PENDING_KEY) || "null");
    if (
      prev?.account === key &&
      prev.sentAt &&
      Date.now() - prev.sentAt < 60000
    ) {
      throw new Error("請稍候再寄驗證碼（約 60 秒）");
    }
    const code = randomCode6();
    const salt = randomToken();
    const passwordHash = await sha256Hex(`${password}::${salt}`);
    const codeHash = await sha256Hex(`${code}::${salt}`);
    localStorage.setItem(
      LOCAL_PENDING_KEY,
      JSON.stringify({
        account: key,
        displayName: String(displayName || key.split("@")[0]).trim(),
        salt,
        passwordHash,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        sentAt: Date.now(),
      })
    );
    return {
      ok: true,
      account: key,
      message: `本機測試模式：驗證碼已產生（請看下方）`,
      demoCode: code,
    };
  }

  async function register(account, password, displayName, code) {
    const key = normalizeAccount(account);
    const codeStr = String(code || "").trim();
    if (!isGmail(key)) throw new Error("註冊帳號必須是 Gmail");
    if (!/^\d{6}$/.test(codeStr)) throw new Error("請輸入 6 位數驗證碼");

    if (useRemote()) {
      const data = await api("register", { account: key, code: codeStr });
      saveSession({ ...data, backend: "appscript" });
      return data;
    }

    const pending = JSON.parse(
      localStorage.getItem(LOCAL_PENDING_KEY) || "null"
    );
    if (!pending || pending.account !== key) {
      throw new Error("請先取得驗證碼");
    }
    if (Date.now() > pending.expiresAt) {
      localStorage.removeItem(LOCAL_PENDING_KEY);
      throw new Error("驗證碼已過期，請重新寄送");
    }
    const expect = await sha256Hex(`${codeStr}::${pending.salt}`);
    if (expect !== pending.codeHash) throw new Error("驗證碼錯誤");

    const db = loadLocalUsers();
    if (db[key]) throw new Error("此 Gmail 已被註冊，請直接登入");
    db[key] = {
      displayName: pending.displayName || key,
      salt: pending.salt,
      passwordHash: pending.passwordHash,
      createdAt: new Date().toISOString(),
    };
    saveLocalUsers(db);
    localStorage.removeItem(LOCAL_PENDING_KEY);
    const session = {
      ok: true,
      account: key,
      displayName: db[key].displayName,
      token: randomToken(),
      expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      backend: "local",
    };
    saveSession(session);
    return session;
  }

  async function login(account, password) {
    const key = normalizeAccount(account);
    if (!key) throw new Error("請輸入帳號（Gmail）");
    if (String(password || "").length < MIN_PASSWORD_LEN) {
      throw new Error(`密碼至少 ${MIN_PASSWORD_LEN} 個字`);
    }

    if (useRemote()) {
      const data = await api("login", { account: key, password });
      saveSession({ ...data, backend: "appscript" });
      return data;
    }

    const db = loadLocalUsers();
    const user = db[key];
    if (!user) throw new Error("帳號或密碼錯誤");
    const passwordHash = await sha256Hex(`${password}::${user.salt}`);
    if (passwordHash !== user.passwordHash) throw new Error("帳號或密碼錯誤");
    const session = {
      ok: true,
      account: key,
      displayName: user.displayName || key,
      token: randomToken(),
      expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      backend: "local",
    };
    saveSession(session);
    return session;
  }

  async function logout() {
    const session = loadSession();
    if (session?.token && useRemote()) {
      try {
        await api("logout", { token: session.token });
      } catch (_) {}
    }
    clearSession();
  }

  async function refreshMe() {
    const session = loadSession();
    if (!session?.token) return null;
    if (!useRemote() || session.backend === "local") {
      const db = loadLocalUsers();
      const user = db[session.account];
      if (!user) {
        clearSession();
        return null;
      }
      saveSession({
        ...session,
        displayName: user.displayName || session.account,
        backend: "local",
      });
      return loadSession();
    }
    try {
      const data = await api("me", { token: session.token });
      saveSession({ ...session, ...data, backend: "appscript" });
      return loadSession();
    } catch (_) {
      clearSession();
      return null;
    }
  }

  async function appendHistory(line) {
    const session = loadSession();
    if (!session?.token) return;
    if (!useRemote() || session.backend === "local") {
      const db = loadLocalHistory();
      const list = Array.isArray(db[session.account]) ? db[session.account] : [];
      list.unshift({
        line: String(line || "").slice(0, 2000),
        createdAt: new Date().toISOString(),
      });
      db[session.account] = list.slice(0, 100);
      saveLocalHistory(db);
      return;
    }
    try {
      await api("appendHistory", { token: session.token, line });
    } catch (_) {}
  }

  async function listHistory(limit = 20) {
    const session = loadSession();
    if (!session?.token) return [];
    if (!useRemote() || session.backend === "local") {
      const db = loadLocalHistory();
      const list = Array.isArray(db[session.account]) ? db[session.account] : [];
      return list.slice(0, limit);
    }
    const data = await api("listHistory", { token: session.token, limit });
    return data.items || [];
  }

  function getUser() {
    return loadSession();
  }

  function isLoggedIn() {
    return Boolean(loadSession()?.token);
  }

  function displayName() {
    const s = loadSession();
    return (
      String(s?.displayName || s?.account || "").trim() ||
      String(cfg().displayName || "").trim() ||
      ""
    );
  }

  // clearAuthDataOnce: true，或網址加 ?clearAuth=1，載入時清空本機全部帳號
  try {
    const q = String(global.location?.search || "");
    if (cfg().clearAuthDataOnce === true || /(?:\?|&)clearAuth=1(?:&|$)/.test(q)) {
      clearAllLocalData();
      console.info("[小一] 已清除本機全部帳號資料");
    }
  } catch (_) {}

  global.XiaoYiAuth = {
    MIN_PASSWORD_LEN,
    isGmail,
    authUrl,
    requireLogin,
    useRemote,
    sendRegisterCode,
    register,
    login,
    logout,
    refreshMe,
    appendHistory,
    listHistory,
    getUser,
    isLoggedIn,
    displayName,
    loadSession,
    clearSession,
    clearAllLocalData,
    autoRestoreLogin,
  };
})(window);
