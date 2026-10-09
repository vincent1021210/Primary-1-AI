/**
 * 小一帳號：Apps Script（Gmail 驗證碼）優先；未設定網址時本機備援。
 * 註冊：Gmail + 郵件驗證碼；密碼至少 8 碼。
 */
(function (global) {
  const STORAGE_KEY = "xiaoYiAuthSession";
  const TEMP_SESSION_KEY = "xiaoYiAuthSessionTemp";
  const IDB_NAME = "xiaoYiAuthDB";
  const IDB_STORE = "kv";
  const LOCAL_USERS_KEY = "xiaoYiUsersDB";
  const LOCAL_HISTORY_KEY = "xiaoYiHistoryDB";
  const LOCAL_PENDING_KEY = "xiaoYiPendingReg";
  const MIN_PASSWORD_LEN = 8;

  /** IndexedDB 雙寫：部分 Android TWA 關閉 App 後比純 localStorage 更穩 */
  function openIdb() {
    return new Promise((resolve) => {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function idbSet(key, value) {
    const db = await openIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbGet(key) {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbRemove(key) {
    const db = await openIdb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  const SECURITY_QUESTIONS = [
    "你小學班導的名字？",
    "你第一隻寵物叫什麼？",
    "你出生的城市是哪裡？",
  ];

  function normalizeAnswer(answer) {
    return String(answer || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function cfg() {
    return global.APP_CONFIG || {};
  }

  /**
   * 手機版：永久保持登入（localStorage + IndexedDB）
   * 網頁版：僅本次分頁有效（sessionStorage；刷新需重登）
   * 由各入口頁設定 window.XIAO_YI_PLATFORM = "mobile" | "desktop"
   */
  function preferPersistentLogin() {
    if (cfg().persistentLogin === true) return true;
    if (cfg().persistentLogin === false) return false;
    return String(global.XIAO_YI_PLATFORM || "").toLowerCase() === "mobile";
  }

  // #region agent log
  fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'keep-login-verify',hypothesisId:'A',location:'auth.js:boot',message:'auth boot platform',data:{platform:String(global.XIAO_YI_PLATFORM||''),preferPersistent:preferPersistentLogin(),hasLs:Boolean(localStorage.getItem(STORAGE_KEY)),hasTemp:Boolean((()=>{try{return sessionStorage.getItem(TEMP_SESSION_KEY)}catch(_){return null}})())},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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

  function parseSessionRaw(raw, clearFn) {
    try {
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.token || !data?.account) return null;
      if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) {
        if (typeof clearFn === "function") clearFn();
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function loadSession() {
    // 網頁版：只讀本次分頁的 sessionStorage（刷新即失效）
    if (!preferPersistentLogin()) {
      try {
        const temp = parseSessionRaw(
          sessionStorage.getItem(TEMP_SESSION_KEY),
          () => sessionStorage.removeItem(TEMP_SESSION_KEY)
        );
        if (temp) return { ...temp, persistent: false };
      } catch (_) {}
      return null;
    }

    // 手機版：永久保持登入
    const persistent = parseSessionRaw(localStorage.getItem(STORAGE_KEY), () =>
      localStorage.removeItem(STORAGE_KEY)
    );
    if (persistent) return { ...persistent, persistent: true };

    try {
      const temp = parseSessionRaw(sessionStorage.getItem(TEMP_SESSION_KEY), () =>
        sessionStorage.removeItem(TEMP_SESSION_KEY)
      );
      if (temp) {
        saveSession(temp);
        return { ...temp, persistent: true };
      }
    } catch (_) {}
    return null;
  }

  /** 手機：IndexedDB → localStorage；網頁：僅 sessionStorage */
  async function loadSessionAsync() {
    if (!preferPersistentLogin()) {
      return loadSession();
    }
    try {
      const idbRaw = await idbGet(STORAGE_KEY);
      const fromIdb = parseSessionRaw(
        typeof idbRaw === "string" ? idbRaw : null,
        () => idbRemove(STORAGE_KEY)
      );
      if (fromIdb) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fromIdb));
        } catch (_) {}
        return { ...fromIdb, persistent: true };
      }
    } catch (_) {}
    return loadSession();
  }

  /**
   * 手機：寫入 localStorage + IndexedDB（關閉 App 仍在）
   * 網頁：只寫 sessionStorage（刷新需重登；不覆寫手機永久登入）
   */
  function saveSession(session) {
    if (!session?.token) {
      clearSession();
      return;
    }
    const data = {
      token: session.token,
      account: session.account,
      displayName: session.displayName || session.account,
      expiresAt: session.expiresAt || "",
      backend: session.backend || (useRemote() ? "appscript" : "local"),
    };
    const payload = JSON.stringify(data);
    const persistent = preferPersistentLogin();

    if (persistent) {
      try {
        localStorage.setItem(STORAGE_KEY, payload);
      } catch (_) {}
      idbSet(STORAGE_KEY, payload).catch(() => {});
      try {
        sessionStorage.removeItem(TEMP_SESSION_KEY);
      } catch (_) {}
    } else {
      try {
        sessionStorage.setItem(TEMP_SESSION_KEY, payload);
      } catch (_) {}
      // 網頁版不清除手機版的永久登入殘留，避免同瀏覽器互相踢掉
    }
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'keep-login-verify',hypothesisId:'D',location:'auth.js:saveSession',message:'session saved',data:{persistent,platform:String(global.XIAO_YI_PLATFORM||''),account:String(data.account||'').slice(0,3)+'***',backend:data.backend||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  /** 登出：兩邊工作階段都清（含永久與暫存） */
  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    try {
      sessionStorage.removeItem(TEMP_SESSION_KEY);
    } catch (_) {}
    idbRemove(STORAGE_KEY).catch(() => {});
  }

  /**
   * 是否允許自動還原登入：
   * - 有可用 session 時為 true
   * - 或設定檔明確 autoRestoreLogin: true
   */
  function autoRestoreLogin() {
    if (cfg().autoRestoreLogin === true) return true;
    return Boolean(loadSession()?.token);
  }

  /** 清除本機全部帳號／工作階段／歷史／待驗證資料 */
  function clearAllLocalData() {
    clearSession();
    localStorage.removeItem(LOCAL_USERS_KEY);
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    localStorage.removeItem(LOCAL_PENDING_KEY);
    [
      "xiaoYiAuthSession",
      "xiaoYiUsersDB",
      "xiaoYiHistoryDB",
      "xiaoYiPendingReg",
      "xiaoYiKeepLoggedIn",
    ].forEach((k) => localStorage.removeItem(k));
    try {
      if (global.indexedDB?.deleteDatabase) {
        global.indexedDB.deleteDatabase(IDB_NAME);
      }
    } catch (_) {}
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
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-json',hypothesisId:'A',location:'auth.js:api:start',message:'auth api call start',data:{action:String(action||''),urlHost:(()=>{try{return new URL(url).host}catch(_){return'bad-url'}})(),urlEndsExec:/\/exec\/?$/.test(url),payloadKeys:Object.keys(payload||{})},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload }),
        redirect: "follow",
      });
    } catch (netErr) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-json',hypothesisId:'D',location:'auth.js:api:fetch-fail',message:'auth fetch network error',data:{action:String(action||''),error:String(netErr&&netErr.message||netErr)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error(`無法連線帳號服務：${netErr?.message || netErr}`);
    }
    const text = await res.text();
    const head = String(text || "").slice(0, 180).replace(/\s+/g, " ");
    const looksHtml = /<!doctype html|<html|accounts\.google|sign.?in/i.test(
      text || ""
    );
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-json',hypothesisId:'B',location:'auth.js:api:response',message:'auth api raw response',data:{action:String(action||''),status:res.status,ok:res.ok,finalUrl:String(res.url||'').slice(0,120),contentType:String(res.headers.get('content-type')||''),bodyLen:(text||'').length,looksHtml,bodyHead:head},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-json',hypothesisId:'C',location:'auth.js:api:parse-fail',message:'auth response not JSON',data:{action:String(action||''),status:res.status,looksHtml,bodyHead:head},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error(
        (looksHtml
          ? "Apps Script 回傳登入／授權頁（非 JSON）。請重新部署網頁應用程式，存取權選「任何人」，並確認網址結尾是 /exec"
          : "Apps Script 回應不是 JSON，請確認已部署為「任何人可存取」") +
          `［診斷 status=${res.status} type=${String(res.headers.get("content-type") || "").slice(0, 40)} head=${head.slice(0, 80)}］`
      );
    }
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-json',hypothesisId:'E',location:'auth.js:api:parsed',message:'auth api parsed JSON',data:{action:String(action||''),ok:Boolean(data&&data.ok),error:String((data&&data.error)||'').slice(0,120),keys:data&&typeof data==='object'?Object.keys(data):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!data?.ok) {
      throw new Error(data?.error || "請求失敗");
    }
    return data;
  }

  function validateSecurity(question, answer) {
    const q = String(question || "").trim();
    const a = normalizeAnswer(answer);
    if (!q) throw new Error("請選擇安全問題");
    if (!SECURITY_QUESTIONS.includes(q)) {
      throw new Error("請選擇有效的安全問題");
    }
    if (a.length < 1) throw new Error("請填寫安全問題答案");
    return { question: q, answerNorm: a };
  }

  /** 寄送註冊驗證碼（本機模式會回傳 demoCode 供測試） */
  async function sendRegisterCode(
    account,
    password,
    displayName,
    securityQuestion,
    securityAnswer
  ) {
    const key = normalizeAccount(account);
    if (!isGmail(key)) {
      throw new Error("註冊帳號必須是 Gmail（例：name@gmail.com）");
    }
    if (String(password || "").length < MIN_PASSWORD_LEN) {
      throw new Error(`密碼至少 ${MIN_PASSWORD_LEN} 個字`);
    }
    const sec = validateSecurity(securityQuestion, securityAnswer);

    if (useRemote()) {
      return api("sendRegisterCode", {
        account: key,
        password,
        displayName: displayName || key.split("@")[0],
        securityQuestion: sec.question,
        securityAnswer: sec.answerNorm,
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
    const answerHash = await sha256Hex(`${sec.answerNorm}::${salt}`);
    localStorage.setItem(
      LOCAL_PENDING_KEY,
      JSON.stringify({
        account: key,
        displayName: String(displayName || key.split("@")[0]).trim(),
        salt,
        passwordHash,
        codeHash,
        securityQuestion: sec.question,
        answerHash,
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
      securityQuestion: pending.securityQuestion || "",
      answerHash: pending.answerHash || "",
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

  /** 查詢帳號的安全問題（不回傳答案） */
  async function getSecurityQuestion(account) {
    const key = normalizeAccount(account);
    if (!key) throw new Error("請先輸入帳號（Gmail）");

    if (useRemote()) {
      return api("getSecurityQuestion", { account: key });
    }

    const user = loadLocalUsers()[key];
    if (!user) throw new Error("找不到此帳號，請確認是否輸入正確");
    if (!user.securityQuestion || !user.answerHash) {
      throw new Error(
        "此帳號尚未設定安全問題（舊帳號）。請用原密碼登入，或清除本機資料後重新註冊。"
      );
    }
    return {
      ok: true,
      account: key,
      question: user.securityQuestion,
    };
  }

  /** 答對安全問題後重設密碼 */
  async function resetPassword(account, answer, newPassword) {
    const key = normalizeAccount(account);
    const newPass = String(newPassword || "");
    const ans = normalizeAnswer(answer);
    if (!key) throw new Error("請輸入帳號");
    if (!ans) throw new Error("請輸入安全問題答案");
    if (newPass.length < MIN_PASSWORD_LEN) {
      throw new Error(`新密碼至少 ${MIN_PASSWORD_LEN} 個字`);
    }

    if (useRemote()) {
      return api("resetPassword", {
        account: key,
        securityAnswer: ans,
        newPassword: newPass,
      });
    }

    const db = loadLocalUsers();
    const user = db[key];
    if (!user) throw new Error("找不到此帳號");
    if (!user.answerHash || !user.salt) {
      throw new Error("此帳號未設定安全問題，無法重設");
    }
    const expect = await sha256Hex(`${ans}::${user.salt}`);
    if (expect !== user.answerHash) {
      throw new Error("安全問題答案不正確");
    }
    user.passwordHash = await sha256Hex(`${newPass}::${user.salt}`);
    db[key] = user;
    saveLocalUsers(db);
    clearSession();
    return { ok: true, account: key, message: "密碼重設成功，請用新密碼登入" };
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
        if (session.backend === "local") {
          clearSession();
          return null;
        }
        return session;
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
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (
        /未登入|工作階段已過期|帳號不存在|unauthorized|401|禁止/i.test(msg)
      ) {
        clearSession();
        return null;
      }
      // 同一次工作階段內：網路／非 JSON 暫時錯誤仍保留 session
      return session;
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
    SECURITY_QUESTIONS,
    isGmail,
    authUrl,
    requireLogin,
    useRemote,
    preferPersistentLogin,
    sendRegisterCode,
    register,
    login,
    getSecurityQuestion,
    resetPassword,
    logout,
    refreshMe,
    appendHistory,
    listHistory,
    getUser,
    isLoggedIn,
    displayName,
    loadSession,
    loadSessionAsync,
    saveSession,
    clearSession,
    clearAllLocalData,
    autoRestoreLogin,
  };
})(window);
