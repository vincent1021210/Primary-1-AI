(() => {
  const els = {
    text: document.getElementById("text"),
    interim: document.getElementById("interim"),
    lang: document.getElementById("lang"),
    voice: document.getElementById("voice"),
    rate: document.getElementById("rate"),
    rateValue: document.getElementById("rateValue"),
    btnListen: document.getElementById("btnListen"),
    btnWake: document.getElementById("btnWake"),
    btnSpeak: document.getElementById("btnSpeak"),
    btnStop: document.getElementById("btnStop"),
    btnStopSpeak: document.getElementById("btnStopSpeak"),
    btnClear: document.getElementById("btnClear"),
    btnCopy: document.getElementById("btnCopy"),
    btnLoadAi: document.getElementById("btnLoadAi"),
    btnTestGemini: document.getElementById("btnTestGemini"),
    btnCloseSearch: document.getElementById("btnCloseSearch"),
    aiStatus: document.getElementById("aiStatus"),
    aiProgress: document.getElementById("aiProgress"),
    wakeStatus: document.getElementById("wakeStatus"),
    corePreview: document.getElementById("corePreview"),
    micLevelFill: document.getElementById("micLevelFill"),
    micMeterHint: document.getElementById("micMeterHint"),
    searchPanel: document.getElementById("searchPanel"),
    searchTitle: document.getElementById("searchTitle"),
    searchText: document.getElementById("searchText"),
    searchFrame: document.getElementById("searchFrame"),
    navConfirmPanel: document.getElementById("navConfirmPanel"),
    navConfirmInput: document.getElementById("navConfirmInput"),
    navConfirmHint: document.getElementById("navConfirmHint"),
    navConfirmCountdown: document.getElementById("navConfirmCountdown"),
    navConfirmProgress: document.getElementById("navConfirmProgress"),
    btnNavConfirm: document.getElementById("btnNavConfirm"),
    btnNavCancel: document.getElementById("btnNavCancel"),
    status: document.getElementById("status"),
    badge: document.getElementById("badge"),
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    btnToggleSidebar: document.getElementById("btnToggleSidebar"),
    btnOpenSidebar: document.getElementById("btnOpenSidebar"),
    btnNewChat: document.getElementById("btnNewChat"),
    btnFocusPrompt: document.getElementById("btnFocusPrompt"),
    btnToggleTools: document.getElementById("btnToggleTools"),
    btnOpenSettings: document.getElementById("btnOpenSettings"),
    btnOpenSettingsMobile: document.getElementById("btnOpenSettingsMobile"),
    btnCloseTools: document.getElementById("btnCloseTools"),
    btnCloseSettings: document.getElementById("btnCloseSettings"),
    toolsDrawer: document.getElementById("toolsDrawer"),
    settingsDrawer: document.getElementById("settingsDrawer"),
    promptForm: document.getElementById("promptForm"),
    promptInput: document.getElementById("promptInput"),
    btnSend: document.getElementById("btnSend"),
    modelChip: document.getElementById("modelChip"),
    hero: document.getElementById("hero"),
    heroGreeting: document.getElementById("heroGreeting"),
    chatWrap: document.querySelector(".chat-wrap"),
    chatThread: document.getElementById("chatThread"),
    recentList: document.getElementById("recentList"),
    btnClearRecent: document.getElementById("btnClearRecent"),
    userName: document.getElementById("userName"),
    userAvatar: document.getElementById("userAvatar"),
    authGate: document.getElementById("authGate"),
    authTitle: document.getElementById("authTitle"),
    authAccount: document.getElementById("authAccount"),
    authDisplayName: document.getElementById("authDisplayName"),
    authPassword: document.getElementById("authPassword"),
    authTogglePassword: document.getElementById("authTogglePassword"),
    authSubmitBtn: document.getElementById("authSubmitBtn"),
    authToggleLink: document.getElementById("authToggleLink"),
    forgotPasswordLink: document.getElementById("forgotPasswordLink"),
    registerSecurityZone: document.getElementById("registerSecurityZone"),
    forgotPasswordZone: document.getElementById("forgotPasswordZone"),
    regQuestion: document.getElementById("regQuestion"),
    regAnswer: document.getElementById("regAnswer"),
    securityQuestionLabel: document.getElementById("securityQuestionLabel"),
    securityAnswer: document.getElementById("securityAnswer"),
    newPassword: document.getElementById("newPassword"),
    authSendCodeBtn: document.getElementById("authSendCodeBtn"),
    authCode: document.getElementById("authCode"),
    authError: document.getElementById("authError"),
    authOk: document.getElementById("authOk"),
    authHint: document.getElementById("authHint"),
    authAccountLabel: document.getElementById("authAccountLabel"),
    btnLogout: document.getElementById("btnLogout"),
  };

  /** @type {'login' | 'register' | 'forgot'} */
  let authMode = "login";
  let authCodeCooldownTimer = null;

  const RECENT_KEY = "xiao_yi_recent_chats";

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const tagState = AutoTag.createTaggerState();

  let recognition = null;
  let listening = false;
  let wantListen = false;
  /** 打字對話：只顯示文字、不朗讀 */
  let silentChat = false;
  /** @type {'dictation' | 'wake'} */
  let listenMode = "dictation";
  let tagQueue = Promise.resolve();
  const wakeSession = WakeWord.createSession({
    timeoutMs: WakeWord.AWAKE_TIMEOUT_MS || 20000,
  });
  /** 防止 stop()/onend 互相觸發造成 aborted 重啟迴圈 */
  let listenGeneration = 0;
  let ignoreEndOnce = false;
  let ttsPausedListen = false;
  /** 手機 Web Speech 切段拼圖：最終句快取 + 靜音計時 */
  let finalTranscriptCache = "";
  let lastInterimTranscript = "";
  let silenceTimer = null;
  let pendingWokeWaitTimer = null;
  /** 小一說完後可直接續說的時間 */
  const FOLLOW_UP_MS_DESKTOP = 8000;
  const FOLLOW_UP_MS_MOBILE = 15000;
  /** 完全安靜多久才認定講完（手機 isFinal 過敏感，需拼圖） */
  const SILENCE_MS_DESKTOP = 1200;
  const SILENCE_MS_MOBILE = 1500;
  /** 結果面板顯示 5 秒後自動消失 */
  const SEARCH_PANEL_AUTO_HIDE_MS = 0; // 0 = 不自動隱藏
  let searchPanelHideTimer = null;

  /** 降噪麥克風串流 + 音量視覺化 */
  let micStream = null;
  let micAudioCtx = null;
  let micAnalyser = null;
  let micMeterRaf = null;

  /** 導航二階段確認（語音 + 可編輯 + 倒數） */
  const navConfirm = {
    active: false,
    destination: "",
    travelMode: "driving",
    paused: false,
    secondsLeft: 3,
    tickTimer: null,
    totalMs: 3000,
  };

  function setStatus(msg) {
    els.status.textContent = msg || "";
  }

  function setBadge(mode, label) {
    els.badge.className = "badge" + (mode ? ` ${mode}` : "");
    els.badge.textContent = label;
  }

  function setWakeUi(state, preview = "") {
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'wake-ui',hypothesisId:'A',location:'voice_studio.js:setWakeUi',message:'setWakeUi called',data:{state,preview:String(preview||'').slice(0,40),wantListen,listening,listenMode,navConfirmActive:navConfirm.active,btnWake:els.btnWake?.textContent||'',wakeStatusBefore:els.wakeStatus?.textContent||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (els.wakeStatus) {
      const map = {
        idle: "待命：說「小一小一」或「你好」後再下指令",
        listening: "監聽中：請說「小一小一」或「你好」…",
        awake: "已喚醒：正在聽取核心命令…",
        done: "已擷取命令",
      };
      els.wakeStatus.textContent = map[state] || map.idle;
    }
    if (els.corePreview) {
      els.corePreview.textContent = preview
        ? `核心命令：${preview}`
        : "";
    }
  }

  function formatRate(v) {
    const n = Number(v);
    return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
  }

  function refreshAiStatus() {
    const gemini = window.GeminiTagger?.getState?.();
    const webllm = window.WebLLMTagger?.getState?.();

    if (gemini?.ready) {
      els.aiStatus.textContent = `Gemini 已設定（${gemini.modelId}）`;
      if (els.modelChip) {
        els.modelChip.textContent = /flash/i.test(gemini.modelId || "")
          ? "Flash"
          : "Gemini";
        els.modelChip.title = gemini.modelId || "Gemini";
      }
      if (els.btnLoadAi) {
        els.btnLoadAi.textContent = "載入 WebLLM 備援（可選）";
        els.btnLoadAi.disabled =
          webllm?.status === "loading" || webllm?.status === "ready";
      }
      return;
    }

    if (webllm?.status === "ready") {
      els.aiStatus.textContent = `本地 WebLLM 就緒（${webllm.modelId}）`;
      if (els.btnLoadAi) {
        els.btnLoadAi.textContent = "AI 標籤已啟用";
        els.btnLoadAi.disabled = true;
      }
      return;
    }

    if (webllm?.status === "loading") {
      els.aiStatus.textContent = webllm.progressText || "正在載入 WebLLM…";
      if (els.aiProgress) els.aiProgress.textContent = webllm.progressText || "";
      if (els.btnLoadAi) {
        els.btnLoadAi.textContent = "載入中…";
        els.btnLoadAi.disabled = true;
      }
      return;
    }

    els.aiStatus.textContent = "標籤備援：規則引擎／可測 Gemini 或載入 WebLLM";
    if (els.btnLoadAi) {
      els.btnLoadAi.textContent = "載入 WebLLM 智慧標籤";
      els.btnLoadAi.disabled = false;
    }
  }

  function bindAi() {
    window.GeminiTagger?.onChange?.(refreshAiStatus);
    window.WebLLMTagger?.onChange?.(refreshAiStatus);
    refreshAiStatus();
  }

  async function loadWebllm() {
    if (!window.WebLLMTagger) {
      setStatus("WebLLM 模組尚未就緒");
      return;
    }
    try {
      setStatus("開始下載本地模型…");
      await window.WebLLMTagger.ensureEngine();
      setStatus("本地 AI 標籤已就緒");
      refreshAiStatus();
    } catch (err) {
      setStatus(err?.message || "WebLLM 載入失敗");
    }
  }

  async function testGemini() {
    if (!window.GeminiTagger?.apiKeyPresent?.()) {
      setStatus("尚未設定 Gemini API Key");
      return;
    }
    setStatus("正在測試 Gemini 小一大腦…");
    try {
      const loc = await resolveLocationTextForGemini();
      const result = await window.GeminiTagger.assist(
        "小一小一，算一百二十五乘以八是多少",
        loc
      );
      const preview = (result.speak || result.raw || "").slice(0, 80);
      setStatus(
        `Gemini 測試成功：${result.actions?.[0]?.type || "對話"}｜${preview}`
      );
      if (result.speak) speakText(result.speak);
    } catch (err) {
      const msg = err?.message || String(err);
      if (/prepayment|credits|402|depleted|not found|404/i.test(msg)) {
        setStatus(
          `Gemini 失敗：${msg}（請確認模型名／額度；可改用本機備援）`
        );
      } else {
        setStatus(`Gemini 測試失敗：${msg}`);
      }
    }
  }

  function refreshHeroVisibility() {
    const hasLog = Boolean(
      els.chatThread?.children?.length || els.text?.value?.trim()
    );
    els.hero?.classList.toggle("dimmed", hasLog);
    els.chatWrap?.classList.toggle("has-log", hasLog);
  }

  /** 對話氣泡：user（右灰泡）｜assistant（左文字）｜system */
  function appendChatBubble(role, text) {
    const body = String(text || "").trim();
    if (!body || !els.chatThread) return;
    // 避免與上一則小一訊息完全重複
    const last = els.chatThread.lastElementChild;
    if (
      role === "assistant" &&
      last?.classList.contains("msg-assistant") &&
      last.querySelector(".msg-bubble")?.textContent === body
    ) {
      return;
    }
    const row = document.createElement("div");
    row.className = `msg msg-${role}`;
    if (role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "msg-avatar";
      avatar.setAttribute("aria-label", "小一");
      row.appendChild(avatar);
    }
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = body;
    row.appendChild(bubble);
    els.chatThread.appendChild(row);
    els.chatThread.scrollTop = els.chatThread.scrollHeight;
    refreshHeroVisibility();
  }

  function loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveRecent(items) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 20)));
  }

  function deleteRecent(title) {
    const next = loadRecent().filter((x) => x !== title);
    saveRecent(next);
    renderRecent();
    setStatus("已刪除一筆近期對話");
  }

  function clearAllRecent() {
    saveRecent([]);
    renderRecent();
    setStatus("已清除全部近期對話");
  }

  function renderRecent() {
    if (!els.recentList) return;
    const items = loadRecent();
    els.recentList.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "recent-empty";
      empty.textContent = "尚無近期對話";
      empty.style.cursor = "default";
      els.recentList.appendChild(empty);
      return;
    }
    items.forEach((title) => {
      const li = document.createElement("li");
      li.title = title;

      const label = document.createElement("span");
      label.className = "recent-title";
      label.textContent = title;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "recent-del";
      del.title = "刪除";
      del.setAttribute("aria-label", `刪除：${title}`);
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRecent(title);
      });

      li.appendChild(label);
      li.appendChild(del);
      li.addEventListener("click", () => {
        if (els.promptInput) {
          els.promptInput.value = title;
          els.promptInput.focus();
        }
      });
      els.recentList.appendChild(li);
    });
  }

  function pushRecent(title) {
    const t = String(title || "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 36);
    if (!t) return;
    const next = [t, ...loadRecent().filter((x) => x !== t)];
    saveRecent(next);
    renderRecent();
  }

  function writeTagged(tagged) {
    if (!tagged) return;
    els.text.value += (els.text.value ? "\n" : "") + tagged;
    pushRecent(tagged);
    refreshHeroVisibility();
    window.XiaoYiAuth?.appendHistory?.(tagged);
  }

  function currentUserLabel() {
    return (
      window.XiaoYiAuth?.displayName?.() ||
      String(window.APP_CONFIG?.displayName || "").trim() ||
      "你好"
    );
  }

  function applyUserChrome() {
    const name = currentUserLabel();
    if (els.heroGreeting) {
      els.heroGreeting.textContent = `${name}，想做什麼嗎？`;
    }
    if (els.userName) els.userName.textContent = name;
    if (els.userAvatar) els.userAvatar.textContent = name.slice(0, 1) || "一";
  }

  function setAuthError(msg) {
    if (!els.authError) return;
    if (msg) {
      els.authError.hidden = false;
      els.authError.textContent = msg;
    } else {
      els.authError.hidden = true;
      els.authError.textContent = "";
    }
  }

  function setAuthOk(msg) {
    if (!els.authOk) return;
    if (msg) {
      els.authOk.hidden = false;
      els.authOk.textContent = msg;
    } else {
      els.authOk.hidden = true;
      els.authOk.textContent = "";
    }
  }

  function setAuthLocked(locked) {
    document.body.classList.toggle("auth-locked", Boolean(locked));
    if (els.authGate) {
      els.authGate.setAttribute("aria-hidden", locked ? "false" : "true");
    }
    // #region agent log
    const gate = els.authGate;
    const cs = gate ? getComputedStyle(gate) : null;
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-bypass',hypothesisId:'E',location:'voice_studio.js:setAuthLocked',message:'auth lock toggled',data:{locked:Boolean(locked),bodyHasClass:document.body.classList.contains('auth-locked'),gateDisplay:cs?.display||null,gatePointer:cs?.pointerEvents||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  function setAuthLoginMode() {
    authMode = "login";
    syncAuthUiMode();
  }

  function syncAuthUiMode() {
    const isReg = authMode === "register";
    const isForgot = authMode === "forgot";

    if (els.authTitle) {
      els.authTitle.textContent = isForgot
        ? "重設密碼"
        : isReg
          ? "Gmail 註冊"
          : "帳號登入";
    }
    if (els.authSubmitBtn) {
      els.authSubmitBtn.textContent = isForgot
        ? "驗證並修改密碼"
        : isReg
          ? "驗證並註冊"
          : "登入";
    }
    if (els.authToggleLink) {
      els.authToggleLink.textContent =
        isReg || isForgot
          ? "已有帳號？返回登入"
          : "沒有帳號？立即註冊";
    }
    if (els.forgotPasswordLink) {
      els.forgotPasswordLink.hidden = isForgot || isReg;
      if (isForgot || isReg) {
        els.forgotPasswordLink.setAttribute("hidden", "");
      } else {
        els.forgotPasswordLink.removeAttribute("hidden");
      }
    }
    if (els.authAccountLabel) {
      els.authAccountLabel.textContent = isReg ? "Gmail" : "帳號（Gmail）";
    }
    if (els.authAccount) {
      els.authAccount.placeholder = "name@gmail.com";
      els.authAccount.type = "email";
    }
    if (els.authPassword) {
      els.authPassword.placeholder = "至少 8 個字";
      els.authPassword.minLength = 8;
      els.authPassword.autocomplete = isReg
        ? "new-password"
        : "current-password";
    }

    // 密碼欄：忘記密碼模式隱藏
    document.querySelectorAll(".auth-password-field").forEach((el) => {
      if (isForgot) {
        el.hidden = true;
        el.setAttribute("hidden", "");
      } else {
        el.hidden = false;
        el.removeAttribute("hidden");
      }
    });

    document.querySelectorAll(".auth-register-only").forEach((el) => {
      if (isReg) {
        el.hidden = false;
        el.removeAttribute("hidden");
      } else {
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    });

    document.querySelectorAll(".auth-forgot-only").forEach((el) => {
      if (isForgot) {
        el.hidden = false;
        el.removeAttribute("hidden");
      } else {
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    });

    els.authGate?.classList.toggle("is-register", isReg);
    els.authGate?.classList.toggle("is-forgot", isForgot);

    if (!isReg) {
      if (els.authCode) els.authCode.value = "";
      if (els.authDisplayName) els.authDisplayName.value = "";
      if (els.regAnswer) els.regAnswer.value = "";
    }
    if (!isForgot) {
      if (els.securityAnswer) els.securityAnswer.value = "";
      if (els.newPassword) els.newPassword.value = "";
      if (els.securityQuestionLabel) els.securityQuestionLabel.textContent = "";
    }

    if (els.authHint) {
      els.authHint.textContent = isForgot
        ? "答對安全問題即可在本機重設密碼（無需寄信）"
        : isReg
          ? "註冊需 Gmail 驗證碼與安全問題；密碼至少 8 碼"
          : "註冊需 Gmail 驗證碼、安全問題；密碼至少 8 碼";
    }
    setAuthError("");
    setAuthOk("");
  }

  function startSendCodeCooldown(sec = 60) {
    if (!els.authSendCodeBtn) return;
    let left = sec;
    els.authSendCodeBtn.disabled = true;
    els.authSendCodeBtn.textContent = `${left}s 後可重寄`;
    if (authCodeCooldownTimer) clearInterval(authCodeCooldownTimer);
    authCodeCooldownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(authCodeCooldownTimer);
        authCodeCooldownTimer = null;
        els.authSendCodeBtn.disabled = false;
        els.authSendCodeBtn.textContent = "發送驗證碼";
        return;
      }
      els.authSendCodeBtn.textContent = `${left}s 後可重寄`;
    }, 1000);
  }

  async function unlockAppAfterLogin() {
    setAuthLocked(false);
    applyUserChrome();
    setStatus(`${currentUserLabel()}，已登入`);
    try {
      const items = await window.XiaoYiAuth?.listHistory?.(12);
      if (Array.isArray(items) && items.length) {
        const lines = items
          .map((it) => String(it.line || "").trim())
          .filter(Boolean)
          .reverse();
        if (lines.length && !els.text.value.trim()) {
          els.text.value = lines.join("\n");
          renderRecent();
          refreshHeroVisibility();
        }
      }
    } catch (_) {}
    if (pendingNativeCmd) {
      const cmd = pendingNativeCmd;
      pendingNativeCmd = "";
      try {
        await runNativeWakeCommand(cmd);
      } catch (_) {}
    }
  }

  async function initAuthGate() {
    const auth = window.XiaoYiAuth;
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-bypass',hypothesisId:'A',location:'voice_studio.js:initAuthGate:start',message:'init auth gate',data:{hasAuth:Boolean(auth),requireLogin:Boolean(auth?.requireLogin?.()),hasUrl:Boolean(auth?.authUrl?.()),cfgRequire:window.APP_CONFIG?.requireLogin},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!auth) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-bypass',hypothesisId:'A',location:'voice_studio.js:initAuthGate:noAuth',message:'no XiaoYiAuth unlock',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setAuthLocked(false);
      return;
    }
    const url = auth.authUrl?.();
    if (els.authHint) {
      els.authHint.textContent = url
        ? "註冊需 Gmail 驗證碼（寄到信箱）；密碼至少 8 碼。資料存在 Google 試算表。"
        : "本機測試：註冊仍需 Gmail 格式與驗證碼（碼會顯示在畫面上）。部署 Apps Script 後會真的寄信。";
    }
    // 僅明確 requireLogin: false 時跳過登入畫面
    if (!auth.requireLogin?.()) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-bypass',hypothesisId:'A',location:'voice_studio.js:initAuthGate:skipRequire',message:'requireLogin false unlock',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setAuthLocked(false);
      applyUserChrome();
      return;
    }
    setAuthLocked(true);
    syncAuthUiMode();
    const allowRestore = auth.autoRestoreLogin?.() === true;
    // 預設不自動用舊 token 進系統，避免「不用密碼就進去」
    if (!allowRestore) {
      auth.clearSession?.();
    }
    const session = allowRestore ? auth.loadSession?.() : null;
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'B',location:'voice_studio.js:initAuthGate:session',message:'local session check',data:{allowRestore,hasToken:Boolean(session?.token),account:session?.account?String(session.account).slice(0,3)+'***':'',backend:session?.backend||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (allowRestore && session?.token) {
      const me = await auth.refreshMe?.();
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'B',location:'voice_studio.js:initAuthGate:refreshMe',message:'session refresh result',data:{restored:Boolean(me),account:me?.account?String(me.account).slice(0,3)+'***':''},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (me) {
        await unlockAppAfterLogin();
        return;
      }
    }
    setAuthLocked(true);
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'C',location:'voice_studio.js:initAuthGate:stayLocked',message:'stay on login gate',data:{bodyLocked:document.body.classList.contains('auth-locked'),allowRestore},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  function initChromeUi() {
    applyUserChrome();
    const model = String(
      window.APP_CONFIG?.geminiModel ||
        window.GeminiTagger?.getState?.()?.modelId ||
        "Flash"
    );
    if (els.modelChip) {
      els.modelChip.textContent = /flash/i.test(model) ? "Flash" : model;
      els.modelChip.title = model;
    }
    renderRecent();
    refreshHeroVisibility();
  }

  async function tagRawSentence(raw, meta) {
    let body = "";
    if (window.GeminiTagger?.apiKeyPresent?.()) {
      try {
        body = await window.GeminiTagger.tag(raw);
      } catch (_) {}
    }
    if (!body && window.WebLLMTagger?.getState?.()?.ready) {
      try {
        body = await window.WebLLMTagger.tag(raw);
      } catch (_) {}
    }
    if (!body) body = AutoTag.tagByRules(raw);
    return AutoTag.withTimeline(body, meta);
  }

  function onFlushRaw(raw, meta) {
    tagQueue = tagQueue
      .then(async () => {
        const tagged = await tagRawSentence(raw, meta);
        writeTagged(tagged);
        setStatus(`已加標籤：${tagged.trim().slice(0, 48)}…`);
      })
      .catch(() => {
        writeTagged(AutoTag.withTimeline(AutoTag.tagByRules(raw), meta));
      });
    return tagQueue;
  }

  function appendFinal(text) {
    // 手機停頓較長，加長累積避免句子被提早切斷
    AutoTag.pushChunk(tagState, text, onFlushRaw, isMobileOrTwa() ? 1600 : 900);
  }

  function followUpMs() {
    return isMobileOrTwa() ? FOLLOW_UP_MS_MOBILE : FOLLOW_UP_MS_DESKTOP;
  }

  function silenceMs() {
    return isMobileOrTwa() ? SILENCE_MS_MOBILE : SILENCE_MS_DESKTOP;
  }

  function clearSpeechPuzzle() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    finalTranscriptCache = "";
    lastInterimTranscript = "";
  }

  function clearPendingWokeWait() {
    if (pendingWokeWaitTimer) {
      clearTimeout(pendingWokeWaitTimer);
      pendingWokeWaitTimer = null;
    }
  }

  /** 拼圖完成：把湊齊的完整句子一次送進喚醒／指令流程 */
  function processAssembledWakeSpeech(fullText) {
    const full = String(fullText || "").trim();
    if (!full) return;

    if (navConfirm.active) {
      els.interim.textContent = `導航確認中：${full}`;
      if (handleNavConfirmSpeech(full, true)) return;
    }

    const out = WakeWord.processResult(
      wakeSession,
      full,
      true,
      onWakeTimeout
    );

    switch (out.kind) {
      case "listening":
        els.interim.textContent = `監聽中：${full}`;
        break;

      case "woke":
      case "woke_wait":
        setBadge("awake", "已喚醒");
        setWakeUi("awake", "");
        els.interim.textContent = "已喚醒，請繼續說指令…";
        setStatus("已喚醒，請繼續說完整指令…");
        clearPendingWokeWait();
        {
          const wake = String(out.wakeWord || wakeSession.wakeWord || "");
          pendingWokeWaitTimer = setTimeout(() => {
            pendingWokeWaitTimer = null;
            if (!wakeSession.isAwake || finalTranscriptCache) return;
            if (navConfirm.active) return;
            const name = currentUserLabel();
            const prefix =
              name && name !== "你好" ? `${name}，` : "";
            if (/^你好$|^您好$/.test(wake)) {
              speakText(`${prefix}你好`);
            } else {
              speakText(`${prefix}在！請說完整指令，例如導航或查天氣。`);
            }
          }, silenceMs() + 300);
        }
        break;

      case "command_partial":
      case "command_final": {
        const cmd = String(out.coreCommand || "").trim();
        clearPendingWokeWait();
        WakeWord.sleep(wakeSession);
        els.interim.textContent = "";
        if (isUnclearCommand(cmd)) {
          askPleaseRepeat();
        } else {
          setStatus(`完整指令：『${cmd}』`);
          executeCommand(cmd);
        }
        setTimeout(() => {
          if (navConfirm.active) return;
          if (wakeSession.isAwake) return;
          if (wantListen && listenMode === "wake") {
            setWakeUi("listening");
            setBadge("listening", "喚醒監聽");
          }
        }, 800);
        break;
      }

      default:
        els.interim.textContent = "";
        break;
    }
  }

  function flushSpeechPuzzle() {
    silenceTimer = null;
    let full = String(finalTranscriptCache || "").trim();
    const interim = String(lastInterimTranscript || "").trim();
    // 若最後只剩 interim（尚未變 final），一併併入，避免長句尾端被吃掉
    if (interim) {
      full = WakeWord.mergeSpeechFragments
        ? WakeWord.mergeSpeechFragments(full, interim)
        : `${full}${interim}`;
    }
    finalTranscriptCache = "";
    lastInterimTranscript = "";
    full = String(full || "").trim();
    if (!full) return;
    if (listenMode === "wake") {
      processAssembledWakeSpeech(full);
    } else {
      appendFinal(full);
      els.interim.textContent = "";
    }
  }

  /** 動態拼圖：isFinal 只累積，靜音滿額才送出 */
  function onSpeechPuzzleResult(event) {
    let interimTranscript = "";
    let gotVoice = false;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const piece = result[0]?.transcript || "";
      if (!piece) continue;
      gotVoice = true;
      if (result.isFinal) {
        finalTranscriptCache = WakeWord.mergeSpeechFragments
          ? WakeWord.mergeSpeechFragments(finalTranscriptCache, piece)
          : `${finalTranscriptCache}${piece}`;
        lastInterimTranscript = "";
      } else {
        interimTranscript += piece;
      }
    }
    if (interimTranscript) lastInterimTranscript = interimTranscript;

    // 使用者開口時打斷 TTS，避免喇叭回授蓋掉指令（搭配 echoCancellation）
    if (gotVoice && synth?.speaking) {
      try {
        synth.cancel();
      } catch (_) {}
      ttsPausedListen = false;
    }

    const showing = `${finalTranscriptCache || ""}${interimTranscript || lastInterimTranscript || ""}`.trim();
    if (showing) {
      els.interim.textContent = `聽取中：${showing}`;
      setStatus(`聽取中：${showing}`);
      if (listenMode === "wake" && wakeSession.isAwake) {
        setBadge("awake", "聽取中");
        setWakeUi("awake", showing);
      } else if (listenMode === "wake") {
        setBadge("listening", "聽取中");
      } else {
        setBadge("listening", "聽寫中");
      }
    }

    if (!finalTranscriptCache && !interimTranscript && !lastInterimTranscript) {
      return;
    }

    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (
        String(finalTranscriptCache || "").trim() ||
        String(lastInterimTranscript || "").trim()
      ) {
        flushSpeechPuzzle();
      } else {
        silenceTimer = null;
      }
    }, silenceMs());
  }

  /** 說完／打斷後開啟續聽，使用者說話小一就回話 */
  function armFollowUpAfterSpeak() {
    if (!(wantListen && listenMode === "wake")) return;
    if (typeof WakeWord.openFollowUp !== "function") return;
    const ms = followUpMs();
    const sec = Math.round(ms / 1000);
    WakeWord.openFollowUp(
      wakeSession,
      ms,
      () => {
        setWakeUi("listening");
        setBadge("listening", "喚醒監聽");
        setStatus("續聽結束，請再說「小一小一」或「你好」");
        els.interim.textContent = "";
      },
      wakeSession.wakeWord || "小一小一"
    );
    setWakeUi("awake", "");
    setBadge("awake", `續聽 ${sec} 秒`);
    setStatus(`請在 ${sec} 秒內繼續說指令，小一會回話`);
    els.interim.textContent = `續聽中（${sec} 秒）…`;
  }

  /** 手動停止朗讀（按鈕）；已取消語音打斷 */
  function stopSpeaking(reason = "已停止朗讀") {
    ttsPausedListen = false;
    try {
      synth.cancel();
    } catch (_) {}
    if (wantListen && listenMode === "wake") {
      armFollowUpAfterSpeak();
      setStatus(`${reason}；請在 5 秒內繼續說`);
    } else if (wantListen) {
      setBadge("listening", "聽寫中");
      setStatus(reason);
    } else {
      setBadge("", "就緒");
      setStatus(reason);
    }
  }

  function speakText(text, onDone, options = {}) {
    const content = String(text || "").trim();
    if (!content) return;
    if (!options.skipChat) appendChatBubble("assistant", content);

    // 打字對話：不念出，只顯示氣泡
    if (silentChat || options.silent) {
      if (onDone) onDone();
      setBadge("", "就緒");
      return;
    }

    // 朗讀期間暫停辨識（已取消語音打斷，避免喇叭回授誤觸）
    const shouldResume = wantListen;
    if (shouldResume && recognition && listening) {
      ttsPausedListen = true;
      ignoreEndOnce = true;
      try {
        recognition.stop();
      } catch (_) {}
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (shouldResume && wantListen) {
        ttsPausedListen = false;
        startListen(listenMode, true);
      }
      if (onDone) onDone();
      // 說完後 5 秒內說話 → 小一繼續回話／執行（不必再喚醒）
      if (wantListen && listenMode === "wake") {
        armFollowUpAfterSpeak();
      } else if (wantListen) {
        setBadge("listening", "聽寫中");
      } else {
        setBadge("", "就緒");
      }
    };

    const startUtter = () => {
      try {
        synth.cancel();
      } catch (_) {}
      const utter = new SpeechSynthesisUtterance(content);
      utter.lang = els.lang.value || "zh-TW";
      utter.rate = Math.min(2, Math.max(0.5, Number(els.rate.value) || 1));
      const voice = pickVoice(utter.lang);
      if (voice) {
        utter.voice = voice;
        if (voice.lang) utter.lang = voice.lang;
      }
      utter.onstart = () => {
        setBadge("speaking", "朗讀中");
      };
      utter.onend = finish;
      utter.onerror = finish;
      try {
        synth.speak(utter);
      } catch (_) {
        finish();
      }
      // Android 部分機種 speak 後短暫無反應，逾時仍恢復監聽
      if (isMobileOrTwa()) {
        setTimeout(() => {
          if (!settled && !synth.speaking) finish();
        }, 12000);
      }
    };

    // Android Chrome 語音引擎常需等 voiceschanged
    if (!synth.getVoices?.().length) {
      const onVoices = () => {
        synth.removeEventListener("voiceschanged", onVoices);
        startUtter();
      };
      synth.addEventListener("voiceschanged", onVoices);
      setTimeout(startUtter, 350);
    } else {
      startUtter();
    }
  }

  function closeSearchPanel() {
    if (searchPanelHideTimer) {
      clearTimeout(searchPanelHideTimer);
      searchPanelHideTimer = null;
    }
    if (!els.searchPanel) return;
    els.searchPanel.classList.add("hidden");
    if (els.searchFrame) els.searchFrame.src = "about:blank";
    if (els.searchText) {
      els.searchText.textContent = "";
      els.searchText.classList.add("hidden");
    }
  }

  function showSearchPanel(title, { text = "", url = "" } = {}) {
    if (!els.searchPanel) return;
    els.searchPanel.classList.remove("hidden");
    if (els.searchTitle) els.searchTitle.textContent = title;
    if (els.searchText) {
      if (text) {
        els.searchText.textContent = text;
        els.searchText.classList.remove("hidden");
      } else {
        els.searchText.textContent = "";
        els.searchText.classList.add("hidden");
      }
    }
    if (els.searchFrame) {
      if (url) {
        els.searchFrame.classList.remove("hidden");
        els.searchFrame.src = url;
      } else {
        els.searchFrame.src = "about:blank";
        els.searchFrame.classList.add("hidden");
      }
    }
    els.searchPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // 結果面板不自動消失，僅由「關閉結果」手動關閉
    if (searchPanelHideTimer) {
      clearTimeout(searchPanelHideTimer);
      searchPanelHideTimer = null;
    }
  }

  function isWeatherQuery(q) {
    return /天氣|氣溫|下雨|weather|forecast/i.test(q);
  }

  function extractWeatherPlace(q) {
    let place = String(q || "")
      .replace(
        /天氣|氣溫|氣象|預報|搜尋|尋找|查詢一下|查一下|幫我查|查詢|幫我|請問|今天|明天|這裡|這邊|附近|目前|當地|本地|定位|如何|怎樣|怎麼樣|什麼|狀況|呢|嗎|啊|呀|喔|哦|的|查/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    // 殘留字串中優先取出已知城市名（避免「新竹 如何」整段拿去 geocode）
    const cityKeys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
    for (const city of cityKeys) {
      if (place.includes(city)) {
        place = city;
        break;
      }
    }
    // 只剩動詞／虛詞 → 視為未指定地名，改走 GPS
    if (/^(一下|看看|一下下)$/.test(place)) {
      place = "";
    }
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F',location:'voice_studio.js:extractWeatherPlace',message:'extracted weather place',data:{query:String(q||''),place,useGpsExpected:!place},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // 空字串 = 用 GPS 查目前位置（不再預設台北）
    return place;
  }

  function parseLatLngPlace(text) {
    const m = String(text || "").trim().match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
    );
    if (!m) return null;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    return { latitude, longitude };
  }

  function wantsGpsWeather(q, place) {
    const text = String(q || "");
    const forceGps = /這裡|這邊|附近|目前|當地|本地|定位/.test(text);
    const placeIsCoords = Boolean(parseLatLngPlace(place));
    const useGps = forceGps || !place || placeIsCoords;
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'B',location:'voice_studio.js:wantsGpsWeather',message:'gps weather decision',data:{query:text,place,forceGps,placeIsCoords,useGps},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return useGps;
  }

  // Open-Meteo 對部分中文地名回傳空結果，需別名／座標備援
  const CITY_ALIASES = {
    台北: "Taipei",
    臺北: "Taipei",
    台北市: "Taipei",
    臺北市: "Taipei",
    新北: "New Taipei",
    新北市: "New Taipei",
    桃園: "Taoyuan",
    桃園市: "Taoyuan",
    新竹: "Hsinchu",
    新竹市: "Hsinchu",
    台中: "Taichung",
    臺中: "Taichung",
    台中市: "Taichung",
    臺中市: "Taichung",
    台南: "Tainan",
    臺南: "Tainan",
    台南市: "Tainan",
    臺南市: "Tainan",
    高雄: "Kaohsiung",
    高雄市: "Kaohsiung",
    基隆: "Keelung",
    嘉義: "Chiayi",
    宜蘭: "Yilan",
    花蓮: "Hualien",
    台東: "Taitung",
    臺東: "Taitung",
    澎湖: "Penghu",
    金門: "Kinmen",
  };

  const CITY_COORDS = {
    Taipei: { name: "台北", latitude: 25.033, longitude: 121.5654 },
    Hsinchu: { name: "新竹", latitude: 24.8138, longitude: 120.9675 },
    Taichung: { name: "台中", latitude: 24.1477, longitude: 120.6736 },
    Tainan: { name: "台南", latitude: 22.9997, longitude: 120.227 },
    Kaohsiung: { name: "高雄", latitude: 22.6273, longitude: 120.3014 },
  };

  const WEATHER_CODE_ZH = {
    0: "晴朗",
    1: "大致晴朗",
    2: "多雲",
    3: "陰天",
    45: "有霧",
    48: "霧淞",
    51: "毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    80: "陣雨",
    95: "雷雨",
  };

  async function resolveLocation(place) {
    const raw = String(place || "").trim();
    if (!raw) {
      throw new Error("未指定地點");
    }
    // Gemini／上游若直接給 lat,lng，勿走地名 geocode
    const parsed = parseLatLngPlace(raw);
    if (parsed) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'D',location:'voice_studio.js:resolveLocation:coords',message:'using parsed lat,lng',data:{raw,lat:parsed.latitude,lon:parsed.longitude},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return {
        name: "GPS",
        displayName: "目前位置",
        admin1: "",
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        fromGps: true,
      };
    }
    // 從殘留字串對應已知城市（新竹／台北…）
    let matchedCity = "";
    for (const city of Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length)) {
      if (raw === city || raw.includes(city)) {
        matchedCity = city;
        break;
      }
    }
    const lookup = matchedCity || raw;
    const alias =
      CITY_ALIASES[lookup] || CITY_ALIASES[lookup.replace(/市$/, "")] || "";
    // 不再把 Taipei 無條件塞進候選（避免「新竹如何」失敗就變台北）
    const candidates = [...new Set([lookup, alias].filter(Boolean))];
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'C',location:'voice_studio.js:resolveLocation',message:'resolveLocation candidates',data:{place,raw,matchedCity,lookup,alias,candidates},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    for (const name of candidates) {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          name
        )}&count=1&language=en&format=json`
      );
      const geo = await geoRes.json();
      const loc = geo?.results?.[0];
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'C',location:'voice_studio.js:resolveLocation:attempt',message:'geocode attempt',data:{raw,tryName:name,found:Boolean(loc),lat:loc?.latitude,lon:loc?.longitude,resolvedName:loc?.name},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (loc) {
        // #region agent log
        fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'D',location:'voice_studio.js:resolveLocation:chosen',message:'location chosen',data:{raw,matchedCity,chosenTry:name,displayName:loc.name,lat:loc.latitude,lon:loc.longitude,fellBackToTaipei:false},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return {
          name: lookup,
          displayName: loc.name || lookup,
          admin1: loc.admin1 || "",
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
      }
    }

    // 僅在有對應城市座標時用硬編碼備援（不再默認台北）
    const fallbackKey = alias || CITY_ALIASES[matchedCity] || "";
    const fb = fallbackKey ? CITY_COORDS[fallbackKey] : null;
    if (fb) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'D',location:'voice_studio.js:resolveLocationFallback',message:'using hardcoded coords',data:{raw,fallbackKey,lat:fb.latitude,lon:fb.longitude},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return {
        name: lookup,
        displayName: fb.name,
        admin1: "Taiwan",
        latitude: fb.latitude,
        longitude: fb.longitude,
      };
    }
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'wx-gps-fail',hypothesisId:'D',location:'voice_studio.js:resolveLocation:throw',message:'geocode failed not found',data:{raw,matchedCity,candidates,looksLikeCoords:/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(raw)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error(`找不到地點：${raw}`);
  }

  /** GPS → 經緯度，並用免費 Nominatim 反查地名 */
  async function resolveLocationFromGps() {
    const pos = await getDevicePosition();
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    let displayName = "目前位置";
    let admin1 = "";
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=zh-TW`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      const addr = data?.address || {};
      displayName =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.suburb ||
        addr.municipality ||
        data?.name ||
        displayName;
      admin1 = addr.state || addr.county || "";
    } catch (_) {
      /* 反查失敗仍可用座標查天氣 */
    }
    return {
      name: "GPS",
      displayName,
      admin1,
      latitude,
      longitude,
      fromGps: true,
    };
  }

  async function fetchWeatherByLocation(loc, { dayOffset = 0 } = {}) {
    const wantsDaily = dayOffset > 0;
    const apiUrl = wantsDaily
      ? `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=${Math.min(dayOffset + 1, 7)}&timezone=auto`
      : `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'C',location:'voice_studio.js:fetchWeatherByLocation',message:'weather api request',data:{dayOffset,mode:wantsDaily?'daily':'current',hasDailyParam:wantsDaily,displayName:loc.displayName||'',spokenPrefix:wantsDaily?(dayOffset===1?'明天':'後天'):'目前'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const wxRes = await fetch(apiUrl);
    const wx = await wxRes.json();
    const admin = loc.admin1 ? `（${loc.admin1}）` : "";
    const gpsNote = loc.fromGps
      ? `\nGPS：${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`
      : "";
    if (wantsDaily) {
      const daily = wx?.daily || {};
      const idx = Math.min(dayOffset, Math.max(0, (daily.time || []).length - 1));
      const code = daily.weather_code?.[idx];
      const desc = WEATHER_CODE_ZH[code] || `天氣代碼 ${code}`;
      const tmax = daily.temperature_2m_max?.[idx] ?? "—";
      const tmin = daily.temperature_2m_min?.[idx] ?? "—";
      const pop = daily.precipitation_probability_max?.[idx] ?? "—";
      const date = daily.time?.[idx] || "";
      const dayLabel = dayOffset === 1 ? "明天" : dayOffset === 2 ? "後天" : `${dayOffset}天後`;
      const display = [
        `${loc.displayName}${admin}｜${dayLabel}`,
        `日期：${date}`,
        `狀況：${desc}`,
        `最高溫：${tmax}°C`,
        `最低溫：${tmin}°C`,
        `降雨機率：${pop}%`,
      ].join("\n") + gpsNote;
      const spoken = `${loc.displayName}${dayLabel}${desc}，最高溫攝氏${tmax}度，最低溫攝氏${tmin}度，降雨機率百分之${pop}。`;
      return { display, spoken, loc, dayOffset };
    }
    const cur = wx?.current || {};
    const desc = WEATHER_CODE_ZH[cur.weather_code] || `天氣代碼 ${cur.weather_code}`;
    const temp = cur.temperature_2m ?? "—";
    const humidity = cur.relative_humidity_2m ?? "—";
    const wind = cur.wind_speed_10m ?? "—";
    const display = [
      `${loc.displayName}${admin}`,
      `狀況：${desc}`,
      `氣溫：${temp}°C`,
      `濕度：${humidity}%`,
      `風速：${wind} km/h`,
      `更新：${cur.time || ""}`,
    ].join("\n") + gpsNote;
    const spoken = `${loc.displayName}目前${desc}，氣溫攝氏${temp}度，濕度百分之${humidity}，風速每小時${wind}公里。`;
    return { display, spoken, loc, dayOffset: 0 };
  }

  async function fetchWeatherText(place, { useGps = false, dayOffset = 0 } = {}) {
    const placeLooksLikeCoords = Boolean(parseLatLngPlace(place));
    const branch = useGps || !place ? "gps" : "geocode";
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'C',location:'voice_studio.js:fetchWeatherText',message:'weather fetch branch',data:{place,useGps,placeLooksLikeCoords,branch,dayOffset},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const loc = useGps || !place
      ? await resolveLocationFromGps()
      : await resolveLocation(place);
    return fetchWeatherByLocation(loc, { dayOffset });
  }

  function hideSearchFrame() {
    if (els.searchFrame) {
      els.searchFrame.src = "about:blank";
      els.searchFrame.classList.add("hidden");
    }
  }

  function openUrlInNewTab(url) {
    return window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * 方案 A：零 API。精準擷取關鍵字後開 Google 搜尋新分頁。
   * 正確：https://www.google.com/search?q=...
   */
  /**
   * YouTube 直達：Google「I'm Feeling Lucky」+ site:youtube.com
   * 免 API Key，盡量跳過搜尋列表直達第一筆影片。
   */
  function openYoutubeLuckyPlay(keyword, options = {}) {
    const q = String(keyword || "").trim();
    const speak = options.speak !== false;
    if (!q) {
      if (speak) speakText("沒有擷取到要播放的關鍵字");
      setStatus("YouTube 關鍵字為空");
      return null;
    }
    // btnI=1 → I'm Feeling Lucky；加上 site:youtube.com 提高直達影片機率
    const luckyQuery = /site:\s*youtube\.com/i.test(q)
      ? q
      : `${q} site:youtube.com`;
    const playUrl = `https://www.google.com/search?btnI=1&q=${encodeURIComponent(
      luckyQuery
    )}`;
    const win = openUrlInNewTab(playUrl);
    showSearchPanel(`YouTube｜${q}`, {
      text: `關鍵字：${q}\n已開啟直達播放（I'm Feeling Lucky）\n${playUrl}`,
      url: "",
    });
    hideSearchFrame();
    if (speak) speakText(`好的，幫您在 YouTube 上播放${q}`);
    setStatus(`已開啟 YouTube 播放：${q}`);
    return win;
  }

  function openGoogleSearch(keyword, options = {}) {
    const q = String(keyword || "").trim();
    const speak = options.speak !== false;
    if (!q) {
      if (speak) speakText("沒有擷取到搜尋關鍵字");
      setStatus("搜尋關鍵字為空");
      return null;
    }
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    const win = openUrlInNewTab(searchUrl);
    showSearchPanel(`Google｜${q}`, {
      text: `關鍵字：${q}\n已開啟 Google 搜尋新分頁\n${searchUrl}`,
      url: "",
    });
    hideSearchFrame();
    if (!win) {
      if (speak) speakText(`已準備搜尋${q}，請允許彈出視窗`);
      setStatus(`瀏覽器擋住彈窗，請允許後再開：${q}`);
    } else if (speak) {
      speakText(`好的，正在 Google 搜尋${q}`);
      setStatus(`已開啟 Google 搜尋：${q}`);
    } else {
      setStatus(`已開啟 Google 搜尋：${q}`);
    }
    return searchUrl;
  }

  /** 免費 Geolocation：取目前經緯度（需使用者允許位置權限） */
  function getDevicePosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("此瀏覽器不支援定位"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });
    });
  }

  /**
   * 以 GPS 為中心開 Google 地圖搜尋附近目標。
   * 正確：https://www.google.com/maps/search/目標/@緯度,經度,15z
   */
  function openGoogleMapSearch(target, lat, lng, options = {}) {
    const q = String(target || "").trim() || "美食";
    const speak = options.speak !== false;
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${lat},${lng},15z`;
    const win = openUrlInNewTab(mapsUrl);
    showSearchPanel(`附近｜${q}`, {
      text: [
        `目標：${q}`,
        `GPS：${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        `已開啟 Google 地圖（以目前位置為中心）`,
        mapsUrl,
      ].join("\n"),
      url: "",
    });
    hideSearchFrame();
    if (!win) {
      if (speak) speakText(`已定位完成，請允許彈出視窗後查看附近的${q}`);
      setStatus(`定位成功但彈窗被擋：${q}`);
    } else {
      if (speak) speakText(`好的，正在幫您尋找附近的${q}`);
      setStatus(`已開啟附近搜尋：${q} @ ${lat.toFixed(4)},${lng.toFixed(4)}`);
    }
    return mapsUrl;
  }

  const TRAVEL_MODE_ZH = {
    driving: "開車",
    walking: "走路",
    bicycling: "騎車",
    transit: "大眾運輸",
  };

  function clearNavCountdown() {
    if (navConfirm.tickTimer) {
      clearInterval(navConfirm.tickTimer);
      navConfirm.tickTimer = null;
    }
  }

  function hideNavConfirmPanel() {
    clearNavCountdown();
    navConfirm.active = false;
    navConfirm.paused = false;
    navConfirm.destination = "";
    if (els.navConfirmPanel) els.navConfirmPanel.classList.add("hidden");
    if (els.navConfirmProgress) {
      els.navConfirmProgress.style.transform = "scaleX(1)";
    }
  }

  function updateNavCountdownUi() {
    if (els.navConfirmCountdown) {
      els.navConfirmCountdown.textContent = String(
        Math.max(0, navConfirm.secondsLeft)
      );
    }
    if (els.navConfirmProgress) {
      const ratio = Math.max(0, navConfirm.secondsLeft) / 3;
      els.navConfirmProgress.style.transform = `scaleX(${ratio})`;
    }
  }

  function pauseNavCountdown() {
    if (!navConfirm.active) return;
    navConfirm.paused = true;
    clearNavCountdown();
    if (els.navConfirmHint) {
      els.navConfirmHint.textContent =
        "已暫停倒數：請改字後按「確認導航」，或說「對／確定」";
    }
    setStatus("倒數已暫停，可編輯目的地後再確認");
  }

  function startNavCountdown() {
    clearNavCountdown();
    if (!navConfirm.active || navConfirm.paused) return;
    navConfirm.secondsLeft = 3;
    updateNavCountdownUi();
    setStatus(
      `導航確認「${navConfirm.destination}」：3 秒內說「不對」取消，說「對」立刻出發`
    );
    navConfirm.tickTimer = setInterval(() => {
      if (!navConfirm.active || navConfirm.paused) return;
      navConfirm.secondsLeft -= 1;
      updateNavCountdownUi();
      setStatus(
        `導航確認「${navConfirm.destination}」：${navConfirm.secondsLeft} 秒後自動出發（說「不對」可取消）`
      );
      if (navConfirm.secondsLeft <= 0) {
        clearNavCountdown();
        confirmNavigateNow();
      }
    }, 1000);
  }

  /** 語音確認語意：先判否定，再判肯定 */
  function classifyConfirmReply(transcript) {
    const t = String(transcript || "").replace(/\s+/g, "");
    if (!t) return null;
    if (/不對|不是|取消|錯了|不要|ううん|算了|重說|重新/.test(t)) {
      return "no";
    }
    if (
      /沒錯|確定|可以|出發|好的|是的|對啊|對呀|對啦|沒問題|開導航|開始導航/.test(
        t
      ) ||
      /^(對|好|是|行)([啊呀啦喔哦的]?)$/.test(t)
    ) {
      return "yes";
    }
    return null;
  }

  function handleNavConfirmSpeech(transcript, isFinal) {
    if (!navConfirm.active) return false;
    const reply = classifyConfirmReply(transcript);
    if (reply === "no") {
      cancelNavigateConfirm();
      return true;
    }
    if (reply === "yes" && isFinal) {
      confirmNavigateNow();
      return true;
    }
    // 確認中再說一次地名 → 更新輸入框並暫停倒數
    if (isFinal) {
      const maybePlace = String(transcript || "")
        .replace(/導航到|導航去|導航|到/g, " ")
        .trim();
      if (
        maybePlace &&
        maybePlace.length >= 2 &&
        !classifyConfirmReply(maybePlace)
      ) {
        navConfirm.destination = maybePlace;
        if (els.navConfirmInput) els.navConfirmInput.value = maybePlace;
        pauseNavCountdown();
        speakText(`已改為${maybePlace}，確認請說對`);
        return true;
      }
    }
    return Boolean(reply);
  }

  function showNavConfirmUi(destination) {
    // 確認面板改為隱藏：僅用語音＋狀態列提示，不佔畫面
    if (els.navConfirmPanel) els.navConfirmPanel.classList.add("hidden");
    if (els.navConfirmInput) {
      els.navConfirmInput.value = destination;
    }
    navConfirm.secondsLeft = 3;
    updateNavCountdownUi();
  }

  /**
   * 階段一：語音＋UI 二次確認（不立刻跳轉）
   * 說「對」／按確認／3 秒無「不對」→ 出發
   */
  function beginNavigateConfirm(destination, travelMode = "driving") {
    const dest = String(destination || "").trim() || "目的地";
    clearNavCountdown();
    navConfirm.active = true;
    navConfirm.paused = false;
    navConfirm.destination = dest;
    navConfirm.travelMode = travelMode || "driving";
    showNavConfirmUi(dest);
    if (els.corePreview) els.corePreview.textContent = `待確認目的地：${dest}`;
    setWakeUi("done", `導航確認｜${dest}`);
    setStatus(`請確認目的地：${dest}（說「對」出發／「不對」取消）`);
    speakText(`收到，請問是幫您導航到${dest}嗎？`, () => {
      if (navConfirm.active && !navConfirm.paused) startNavCountdown();
    });
  }

  function cancelNavigateConfirm() {
    if (!navConfirm.active && els.navConfirmPanel?.classList.contains("hidden")) {
      return;
    }
    hideNavConfirmPanel();
    speakText("好的，已取消導航");
    setStatus("已取消導航，請再說「小一小一」後重新下指令");
    setWakeUi("listening");
  }

  async function confirmNavigateNow() {
    if (!navConfirm.active) return;
    const dest = String(
      els.navConfirmInput?.value || navConfirm.destination || ""
    ).trim();
    const mode = navConfirm.travelMode || "driving";
    if (!dest) {
      speakText("請先輸入或說出目的地");
      pauseNavCountdown();
      return;
    }
    hideNavConfirmPanel();
    await runNavigate(dest, mode);
  }

  /** 導航後朗讀目的地店名／地名，例：目的地是129飯麵館 */
  function speakNavigationDestination(dest) {
    const name = String(dest || "").trim();
    if (!name) return;
    if (els.corePreview) els.corePreview.textContent = `目的地：${name}`;
    setTimeout(() => {
      speakText(`目的地是${name}`);
    }, 350);
  }

  /**
   * 模糊搜尋網址（免 API）：Google 會糾錯／列出相近地點
   * 正確：https://www.google.com/maps/search/地名/@緯,經,15z
   */
  function openGoogleMapsFuzzySearch(destination, lat, lng) {
    const dest = String(destination || "").trim() || "目的地";
    const mapsUrl =
      lat != null && lng != null
        ? `https://www.google.com/maps/search/${encodeURIComponent(dest)}/@${lat},${lng},15z`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
    const win = openUrlInNewTab(mapsUrl);
    showSearchPanel(`導航｜${dest}`, {
      text: [
        `目的地：${dest}`,
        lat != null ? `參考定位：${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "未取得 GPS",
        `已開啟 Google 地圖模糊搜尋（可點正確地點再導航）`,
        mapsUrl,
      ].join("\n"),
      url: "",
    });
    hideSearchFrame();
    if (!win) {
      setStatus(`地圖已準備但彈窗被擋：${dest}`);
    } else {
      setStatus(`已開啟地圖搜尋，目的地：${dest}`);
    }
    return mapsUrl;
  }

  /** 確認後：GPS + Maps 模糊搜尋 + 朗讀目的地 */
  async function runNavigate(destination, travelMode = "driving") {
    const dest = String(destination || "").trim() || "目的地";
    const modeZh = TRAVEL_MODE_ZH[travelMode] || "開車";
    setStatus(`正在定位並搜尋目的地：${dest}…`);
    showSearchPanel(`導航｜${dest}`, { text: "正在取得目前 GPS…", url: "" });
    hideSearchFrame();
    try {
      const pos = await getDevicePosition();
      openGoogleMapsFuzzySearch(
        dest,
        pos.coords.latitude,
        pos.coords.longitude
      );
      speakNavigationDestination(dest);
    } catch (err) {
      const reason = err?.message || String(err);
      openGoogleMapsFuzzySearch(dest, null, null);
      speakNavigationDestination(dest);
      setStatus(`GPS 失敗，仍已開啟地圖搜尋：${dest}（${reason}）`);
    }
  }

  /** 「小一小一，搜尋附近的美食」→ GPS → Google 地圖；失敗則一般搜尋備援 */
  async function runNearbySearch(target) {
    const q = String(target || "").trim() || "美食";
    setStatus(`正在取得 GPS 定位以搜尋附近的${q}…`);
    speakText(`好的，正在定位並尋找附近的${q}`);
    showSearchPanel(`附近｜${q}`, { text: "正在取得裝置 GPS 定位…", url: "" });
    hideSearchFrame();
    try {
      const pos = await getDevicePosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // 開頭已朗讀過，成功時不再重複念
      openGoogleMapSearch(q, lat, lng, { speak: false });
    } catch (err) {
      const reason = err?.message || String(err);
      showSearchPanel(`附近｜${q}`, {
        text: `定位失敗：${reason}\n改以一般 Google 搜尋「附近${q}」`,
        url: "",
      });
      speakText(`無法取得定位，改為一般搜尋附近的${q}`);
      openGoogleSearch(`附近${q}`, { speak: false });
      setStatus(`GPS 失敗，已備援搜尋：附近${q}（${reason}）`);
    }
  }

  function detectWeatherDayOffset(text) {
    const t = String(text || "");
    if (/後天/.test(t)) return 2;
    if (/明天|明日/.test(t)) return 1;
    if (/今天|今日|現在|目前/.test(t)) return 0;
    return 0;
  }

  async function runWeatherQuery(query) {
    const q = String(query || "").trim() || "天氣";
    const place = extractWeatherPlace(q);
    const placeLooksLikeCoords = Boolean(parseLatLngPlace(place));
    const useGps = wantsGpsWeather(q, place);
    const dayOffset = detectWeatherDayOffset(q);
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'B',location:'voice_studio.js:runWeatherQuery',message:'weather query start',data:{query:q,place,placeLooksLikeCoords,useGps,dayOffset,hasTomorrowInQuery:/明天|明日/.test(q)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const dayLabel =
      dayOffset === 1 ? "明天" : dayOffset === 2 ? "後天" : "";
    const label = useGps
      ? dayLabel
        ? `${dayLabel}｜目前位置（GPS）`
        : "目前位置（GPS）"
      : dayLabel
        ? `${dayLabel}｜${place}`
        : place;
    setStatus(
      useGps
        ? `正在以 GPS 定位並查詢${dayLabel || ""}天氣…`
        : `查詢天氣中：${place}`
    );
    showSearchPanel(`天氣｜${label}`, {
      text: useGps ? "正在取得 GPS 定位…" : "正在查詢天氣…",
    });
    if (useGps) {
      speakText(
        dayLabel
          ? `好的，正在用定位查詢${dayLabel}天氣`
          : "好的，正在用定位查詢天氣"
      );
    }
    try {
      const weather = await fetchWeatherText(place, { useGps, dayOffset });
      const title = weather.loc?.displayName || label;
      const panelTitle = dayLabel ? `天氣｜${dayLabel}｜${title}` : `天氣｜${title}`;
      showSearchPanel(panelTitle, { text: weather.display, url: "" });
      hideSearchFrame();
      speakText(weather.spoken);
      setStatus(`已朗讀天氣：${title}`);
    } catch (err) {
      const reason = err?.message || String(err);
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'D',location:'voice_studio.js:runWeatherQuery:catch',message:'weather query failed',data:{query:q,place,placeLooksLikeCoords,useGps,dayOffset,reason:String(reason).slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // GPS 失敗且有指定地名以外的備援：改查地名；純 GPS 失敗則提示
      if (useGps && place) {
        try {
          const weather = await fetchWeatherText(place, {
            useGps: false,
            dayOffset,
          });
          showSearchPanel(`天氣｜${place}`, { text: weather.display, url: "" });
          hideSearchFrame();
          speakText(weather.spoken);
          setStatus(`GPS 失敗，已改查${place}`);
          return;
        } catch (_) {}
      }
      showSearchPanel(`天氣｜${label}`, {
        text: `查詢失敗：${reason}`,
        url: "",
      });
      speakText(
        useGps ? "無法取得定位，天氣查詢失敗" : "天氣查詢失敗"
      );
      setStatus(`天氣查詢失敗：${reason}`);
    }
  }

  /** 國字數字 → 阿拉伯數字（語音常辨成「二十三」） */
  function chineseNumeralsToDigits(text) {
    const DIGIT = {
      零: 0,
      〇: 0,
      一: 1,
      二: 2,
      兩: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    const UNIT = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };

    return String(text || "").replace(
      /[零〇一二兩三四五六七八九十百千萬點]+/g,
      (chunk) => {
        if (/點/.test(chunk)) {
          const [a, b = ""] = chunk.split("點");
          const intPart = chineseNumeralsToDigits(a || "零");
          const frac = [...b].map((ch) => DIGIT[ch] ?? "").join("");
          return frac ? `${intPart}.${frac}` : intPart;
        }
        let total = 0;
        let current = 0;
        let hasDigit = false;
        for (const ch of chunk) {
          if (ch in DIGIT) {
            current = DIGIT[ch];
            hasDigit = true;
          } else if (ch in UNIT) {
            const u = UNIT[ch];
            if (u === 10000) {
              total = (total + (hasDigit ? current : 1)) * u;
              current = 0;
              hasDigit = false;
            } else {
              total += (hasDigit ? current : 1) * u;
              current = 0;
              hasDigit = false;
            }
          }
        }
        total += current;
        return String(total);
      }
    );
  }

  /** 語音算式 → 安全公式（僅允許數字與 + - * / ( ) .） */
  function parseSpokenMath(command) {
    let raw = chineseNumeralsToDigits(String(command || ""));
    const spoken = raw
      .replace(/算一下|幫我算|計算一下|計算|算一算|算|是多少|等於多少|等於|多少|請問|幫我/g, " ")
      .replace(/加上|加/g, "+")
      .replace(/減去|減掉|減/g, "-")
      .replace(/乘以|乘上|乘|×|x|X/g, "*")
      .replace(/除以|除去|除|÷/g, "/")
      .replace(/點/g, ".")
      .replace(/（/g, "(")
      .replace(/）/g, ")");
    const formula = spoken.replace(/[^0-9+\-*/().]/g, "");
    const display = spoken
      .replace(/\*/g, "乘")
      .replace(/\//g, "除")
      .replace(/\+/g, "加")
      .replace(/-/g, "減")
      .replace(/[^0-9加减乘除().\s]/g, "")
      .replace(/\s+/g, "")
      .trim();
    return { formula, display: display || formula };
  }

  function safeEvaluateMath(formula) {
    const f = String(formula || "").trim();
    if (!f || !/^[0-9+\-*/().]+$/.test(f)) {
      throw new Error("無效算式");
    }
    if (!/\d/.test(f)) throw new Error("缺少數字");
    // 禁止連續運算子等明顯異常以外，用 Function 隔離作用域（非任意程式碼）
    const result = Function(`"use strict"; return (${f});`)();
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error("無法計算");
    }
    return result;
  }

  function formatMathResult(n) {
    if (Number.isInteger(n)) return String(n);
    const s = String(Math.round(n * 1e8) / 1e8);
    return s;
  }

  function runMathCommand(command) {
    try {
      const { formula, display } = parseSpokenMath(command);
      if (!formula) {
        speakText("沒有聽清楚算式，請再說一次，例如算二十三乘四十五");
        setStatus("計算失敗：算式為空");
        return;
      }
      const result = safeEvaluateMath(formula);
      const shown = formatMathResult(result);
      const reply = `計算結果：${display || formula}等於${shown}`;
      showSearchPanel(`計算｜${display || formula}`, {
        text: `${reply}\n公式：${formula}`,
        url: "",
      });
      hideSearchFrame();
      speakText(reply);
      setStatus(reply);
      if (els.corePreview) els.corePreview.textContent = reply;
    } catch (err) {
      speakText("算式解析失敗，請換個說法再試一次");
      setStatus(`計算失敗：${err?.message || err}`);
    }
  }

  async function resolveLocationTextForGemini() {
    try {
      const pos = await getDevicePosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (_) {
      return "未知";
    }
  }

  /** Gemini 小一大腦：糾錯＋ACTION＋語音回覆；失敗時拋錯改走本機 */
  async function executeViaGemini(command) {
    setStatus("小一思考中（Gemini）…");
    const locText = await resolveLocationTextForGemini();
    const result = await window.GeminiTagger.assist(command, locText);
    const actions = result.actions || [];
    const speak = result.speak || "";

    writeTagged(
      AutoTag.withTimeline(
        `[🧠 Gemini｜${actions.map((a) => a.type).join(",") || "對話"}] ${command}`,
        {
          sessionStartAt: tagState.sessionStartAt,
          lineIndex: tagState.lineIndex++,
        }
      )
    );

    let handled = false;
    for (const action of actions) {
      const value = String(action.value || "").trim();
      if (!value) continue;
      if (action.type === "NAV") {
        handled = true;
        // Gemini 已糾錯地名 → 直接導航（免二次確認拖延）
        await runNavigate(value, "driving");
      } else if (action.type === "SEARCH") {
        handled = true;
        if (/附近|周邊|在地/.test(command) || /附近|周邊/.test(value)) {
          const target = value
            .replace(/附近|周邊|在地/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          await runNearbySearch(target || value);
        } else {
          openGoogleSearch(value, { speak: false });
        }
      } else if (action.type === "MATH") {
        handled = true;
        showSearchPanel(`計算｜Gemini`, {
          text: `${value}\n${speak}`,
          url: "",
        });
        hideSearchFrame();
      } else if (action.type === "WEATHER") {
        handled = true;
        const looksLikeCoords = Boolean(parseLatLngPlace(value));
        const dayHint = /後天/.test(String(command || ""))
          ? "後天"
          : /明天|明日/.test(String(command || ""))
            ? "明天"
            : "";
        const route =
          looksLikeCoords ||
          /^gps$/i.test(value) ||
          /目前|這裡|定位/.test(value)
            ? "gps"
            : "place";
        const weatherQuery =
          route === "gps"
            ? dayHint
              ? `${dayHint}天氣`
              : "查天氣"
            : `${value}${dayHint}天氣`;
        // #region agent log
        fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'A',location:'voice_studio.js:executeViaGemini:WEATHER',message:'gemini weather action',data:{value,looksLikeCoords,route,dayHint,cmdHasTomorrow:Boolean(dayHint),weatherQuery,command:String(command||'').slice(0,60)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        await runWeatherQuery(weatherQuery);
      } else if (action.type === "YOUTUBE") {
        handled = true;
        openYoutubeLuckyPlay(value, { speak: false });
      }
    }

    if (speak) {
      // 導航／天氣／附近搜尋本身會朗讀 → 避免重複；搜尋／計算／閒聊／YouTube 用 Gemini 回覆
      const skipSpeak = actions.some(
        (a) =>
          a.type === "NAV" ||
          a.type === "WEATHER" ||
          (a.type === "SEARCH" &&
            (/附近|周邊|在地/.test(command) || /附近|周邊/.test(a.value || "")))
      );
      if (!skipSpeak) speakText(speak);
    } else if (!handled) {
      speakText("好的");
    }
    setStatus(
      actions.length
        ? `Gemini 已處理：${actions.map((a) => a.type).join("、")}`
        : "Gemini 已回话"
    );
  }

  function selfIntroReply() {
    return (
      "我叫小一，是你的好朋友。我可以幫你查天氣、導航到想去的地方、算數學，" +
      "也可以播放音樂和影片，還能用語音或打字跟你聊天喔！"
    );
  }

  async function executeCommandLocal(command) {
    const intent = WakeWord.classifyCommand(command);

    if (intent.type === "self_intro") {
      const reply = selfIntroReply();
      speakText(reply);
      setStatus("已自我介紹");
      return;
    }

    // ②「小一小一，你好」或喚醒後再說「你好」→ 也回「你好」
    if (intent.type === "greeting") {
      const raw = WakeWord.stripWakePrefix
        ? WakeWord.stripWakePrefix(intent.detail || command)
        : String(intent.detail || command || "").replace(/\s+/g, "");
      const name = currentUserLabel();
      const withName = (plain) =>
        name && name !== "你好" ? `${name}，${plain}` : plain;
      let reply = withName("在！有何吩咐？");
      if (/早安/i.test(raw)) reply = withName("早安");
      else if (/午安/i.test(raw)) reply = withName("午安");
      else if (/晚安/i.test(raw)) reply = withName("晚安");
      else if (/您好/.test(raw)) reply = withName("您好");
      else if (/哈囉/i.test(raw)) reply = withName("哈囉");
      else if (/嗨|hello|hi/i.test(raw)) reply = withName("嗨");
      else if (/你好/.test(raw)) reply = withName("你好");
      speakText(reply);
      setStatus(`已回覆：${reply}`);
      return;
    }

    if (intent.type === "math") {
      runMathCommand(intent.detail || command);
      return;
    }

    if (intent.type === "navigate") {
      beginNavigateConfirm(intent.detail, intent.travelMode || "driving");
      return;
    }

    if (intent.type === "nearby_search") {
      await runNearbySearch(intent.detail);
      return;
    }

    if (intent.type === "youtube") {
      openYoutubeLuckyPlay(intent.detail);
      return;
    }

    if (intent.type === "google_search") {
      openGoogleSearch(intent.detail);
      return;
    }

    if (intent.type === "search") {
      if (isWeatherQuery(intent.detail)) {
        await runWeatherQuery(intent.detail);
      } else {
        openGoogleSearch(intent.detail);
      }
      return;
    }

    if (intent.type === "message") {
      speakText("好的，請在畫面確認要傳送的訊息內容");
      return;
    }

    if (intent.type === "clear") {
      clearChat();
      speakText("已清空");
      return;
    }

    if (intent.type === "speak") {
      const body = AutoTag.stripTagsForSpeech(els.text.value);
      speakText(body || "目前沒有可朗讀的內容");
      return;
    }

    speakText(`收到，${command}`);
  }

  async function executeCommand(command, options = {}) {
    const prevSilent = silentChat;
    if (options.silent) silentChat = true;
    try {
      const intent = WakeWord.classifyCommand(command);
      const line = `[🎯 指令｜${intent.label}] ${command}`;
      const tagged = AutoTag.withTimeline(line, {
        sessionStartAt: tagState.sessionStartAt,
        lineIndex: tagState.lineIndex++,
      });
      writeTagged(tagged);
      appendChatBubble("user", command);
      setWakeUi("done", command);
      setStatus(
        options.silent
          ? `文字對話：『${command}』`
          : `已擷取核心命令：『${command}』`
      );

      // 自我介紹／招呼／清空／朗讀：本機秒回
      if (
        intent.type === "self_intro" ||
        intent.type === "greeting" ||
        intent.type === "clear" ||
        intent.type === "speak"
      ) {
        if (intent.type === "speak" && options.silent) {
          appendChatBubble("assistant", "文字模式中，請用語音喚醒後再說「朗讀」。");
          setStatus("文字模式不朗讀");
          return;
        }
        await executeCommandLocal(command);
        return;
      }

      // 其餘指令：優先 Gemini 大腦（糾錯＋ACTION）；失敗再本機備援
      if (window.GeminiTagger?.apiKeyPresent?.()) {
        try {
          await executeViaGemini(command);
          return;
        } catch (err) {
          setStatus(`Gemini 失敗，改用本機：${err?.message || err}`);
        }
      }

      await executeCommandLocal(command);
    } finally {
      silentChat = prevSilent;
    }
  }

  function onWakeTimeout() {
    setWakeUi("listening");
    setBadge("listening", "喚醒監聽");
    setStatus("等待逾時，已回到待命。請再說「小一小一」。");
    els.interim.textContent = "";
  }

  /** 舊路徑相容：片段已改由 onSpeechPuzzleResult 拼圖後再處理 */
  function handleWakeResult(result) {
    if (!result?.[0]?.transcript) return;
    if (!result.isFinal) {
      els.interim.textContent = `聽取中：${result[0].transcript}`;
      return;
    }
    processAssembledWakeSpeech(result[0].transcript);
  }

  function waitVoices() {
    const list = synth.getVoices();
    if (list.length) return Promise.resolve(list);
    return new Promise((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1200);
    });
  }

  const VOICE_PREF_KEY = "voice_studio_preferred_voice_uri";

  /** 優先：Google 國語（台灣）zh-TW */
  function isGoogleTaiwanMandarin(voice) {
    const name = voice?.name || "";
    const lang = (voice?.lang || "").toLowerCase();
    const isZhTw = lang === "zh-tw" || lang === "zh_tw";
    const isGoogle = /Google/i.test(name);
    const isGuoyuTw =
      /國語/.test(name) && /台灣|臺灣|Taiwan/i.test(name);
    const isGoogleZhTwName = isGoogle && (/國語/.test(name) || isZhTw);
    return (isGoogle && isGuoyuTw) || (isGoogleZhTwName && isZhTw);
  }

  function findDefaultTaiwanVoice(voices) {
    return (
      voices.find((v) => isGoogleTaiwanMandarin(v)) ||
      voices.find(
        (v) =>
          /Google/i.test(v.name || "") &&
          /zh-TW|zh_TW/i.test(v.lang || "")
      ) ||
      voices.find((v) => /zh-TW|zh_TW/i.test(v.lang || "")) ||
      null
    );
  }

  function scoreVoiceForLang(v, lang) {
    let score = 0;
    const name = v.name || "";
    const vLang = v.lang || "";
    if (isGoogleTaiwanMandarin(v) && (lang === "zh-TW" || !lang)) score += 120;
    if (vLang === lang) score += 40;
    else if (vLang.toLowerCase().startsWith(String(lang || "").split("-")[0]))
      score += 20;
    if (/Google/i.test(name)) score += 25;
    if (/國語/.test(name) && /台灣|臺灣|Taiwan/i.test(name)) score += 40;
    if (/Microsoft|Natural|Neural/i.test(name)) score += 10;
    if (/Hanhan|Mei-Jia|HsiaoChen|YunJhe|HsiaoYu/i.test(name)) score += 12;
    return score;
  }

  async function loadVoices() {
    const voices = await waitVoices();
    const saved = localStorage.getItem(VOICE_PREF_KEY) || "";
    const current = els.voice.value || saved;
    els.voice.innerHTML = '<option value="">自動挑選（偏好 Google 國語台灣）</option>';
    voices
      .slice()
      .sort((a, b) => {
        const da = isGoogleTaiwanMandarin(a) ? 0 : 1;
        const db = isGoogleTaiwanMandarin(b) ? 0 : 1;
        if (da !== db) return da - db;
        return a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
      })
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.voiceURI;
        const mark = isGoogleTaiwanMandarin(v) ? " ★預設" : "";
        opt.textContent = `${v.name} (${v.lang})${mark}`;
        els.voice.appendChild(opt);
      });

    const preferred = findDefaultTaiwanVoice(voices);
    if (current && [...els.voice.options].some((o) => o.value === current)) {
      els.voice.value = current;
    } else if (preferred) {
      els.voice.value = preferred.voiceURI;
      localStorage.setItem(VOICE_PREF_KEY, preferred.voiceURI);
    }
  }

  function pickVoice(lang) {
    const voices = synth.getVoices();
    if (els.voice.value) {
      const exact = voices.find((v) => v.voiceURI === els.voice.value);
      if (exact) return exact;
    }
    const preferred = findDefaultTaiwanVoice(voices);
    if (preferred && (lang === "zh-TW" || !lang)) return preferred;
    const scored = voices
      .map((v) => ({ v, score: scoreVoiceForLang(v, lang) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.v || null;
  }

  function updateListenButtons() {
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'wake-ui',hypothesisId:'B',location:'voice_studio.js:updateListenButtons',message:'updateListenButtons',data:{wantListen,listening,listenMode,wakeStatus:els.wakeStatus?.textContent||'',beforeBtn:els.btnWake?.textContent||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const wakeOn = listenMode === "wake" && (wantListen || listening);
    const dictOn = listenMode === "dictation" && (wantListen || listening);
    if (els.btnWake) {
      els.btnWake.classList.toggle("active", wakeOn);
      els.btnWake.title = wakeOn ? "停止喚醒監聽" : "啟動喚醒監聽";
    }
    if (els.btnListen) {
      els.btnListen.textContent = dictOn ? "停止聽寫" : "一般聽寫";
      els.btnListen.classList.toggle("active", dictOn);
    }
  }

  function createRecognition(generation) {
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.lang = els.lang.value || "zh-TW";
    rec.continuous = true;
    rec.interimResults = true;
    rec._generation = generation;

    rec.onstart = () => {
      if (generation !== listenGeneration) return;
      listening = true;
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F1',location:'voice_studio.js:onstart',message:'recognition started',data:{listenMode,wantListen,isAwake:wakeSession.isAwake,generation},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (listenMode === "wake") {
        setBadge("listening", "喚醒監聽");
        setWakeUi(wakeSession.isAwake ? "awake" : "listening");
        setStatus("喚醒模式已啟動：請說「小一小一」再下指令");
      } else {
        setBadge("listening", "聽寫中");
        setStatus("一般聽寫中；停頓約 1 秒後自動加標籤");
      }
      updateListenButtons();
    };

    rec.onresult = (event) => {
      if (generation !== listenGeneration) return;
      // #region agent log
      const _last = event.results[event.results.length - 1];
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F4',location:'voice_studio.js:onresult',message:'speech puzzle piece',data:{listenMode,isFinal:_last?.isFinal,transcript:(_last?.[0]?.transcript||'').slice(0,60),cache:String(finalTranscriptCache||'').slice(0,80),resultIndex:event.resultIndex,len:event.results.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // 手機 isFinal 過敏感：一律走拼圖快取，靜音後再執行
      onSpeechPuzzleResult(event);
    };

    rec.onerror = (event) => {
      if (generation !== listenGeneration) return;
      const err = event.error || "unknown";
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F2',location:'voice_studio.js:onerror',message:'recognition error',data:{err,wantListen,listening,listenMode,ignoreEndOnce,ttsPausedListen,generation,synthSpeaking:synth.speaking},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (err === "not-allowed") {
        setStatus(
          isMobileOrTwa()
            ? "無法使用麥克風：請到系統設定開啟此 App 的麥克風權限，並允許網站使用麥克風"
            : "無法使用麥克風，請允許權限後重試"
        );
        wantListen = false;
      } else if (err === "audio-capture") {
        setStatus("找不到可用麥克風，或麥克風正被其他 App 占用");
        wantListen = false;
      } else if (err === "network") {
        setStatus("語音辨識需要網路連線（使用 Google 語音服務），請確認已連上網");
      } else if (err === "no-speech") {
        setStatus(
          listenMode === "wake"
            ? "尚未聽到語音，持續等待「小一小一」…"
            : "沒有偵測到語音，繼續聆聽中…"
        );
      } else if (err !== "aborted") {
        setStatus(`語音辨識錯誤：${err}`);
      }
    };

    rec.onend = () => {
      if (generation !== listenGeneration) {
        // #region agent log
        fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F5',location:'voice_studio.js:onend-stale',message:'ignore stale onend',data:{generation,listenGeneration},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return;
      }
      listening = false;
      const skipRestart = ignoreEndOnce || ttsPausedListen;
      if (ignoreEndOnce) ignoreEndOnce = false;
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F5',location:'voice_studio.js:onend',message:'recognition ended',data:{wantListen,listenMode,skipRestart,willRestart:wantListen&&!skipRestart,synthSpeaking:synth.speaking,isAwake:wakeSession.isAwake,generation},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      updateListenButtons();
      if (listenMode === "dictation" && !finalTranscriptCache) {
        AutoTag.flushBuffer(tagState, onFlushRaw);
      }
      // 辨識重啟時若拼圖尚有內容，保留給靜音計時器送出；勿立刻清空
      if (!finalTranscriptCache) {
        els.interim.textContent = "";
      }
      if (wantListen && !skipRestart) {
        const restartDelay = isMobileOrTwa() ? 120 : 350;
        setTimeout(() => {
          if (wantListen && generation === listenGeneration) {
            startListen(listenMode, true);
          }
        }, restartDelay);
      } else if (!wantListen) {
        refreshAiStatus();
        setBadge("", "就緒");
        setWakeUi("idle");
        setStatus(listenMode === "wake" ? "喚醒監聽已結束" : "聽寫已結束");
      }
    };

    return rec;
  }

  function stopVolumeMeter() {
    if (micMeterRaf) {
      cancelAnimationFrame(micMeterRaf);
      micMeterRaf = null;
    }
    if (els.micLevelFill) els.micLevelFill.style.transform = "scaleX(0)";
    if (els.micMeterHint) els.micMeterHint.textContent = "安靜";
  }

  function startVolumeMeter(stream) {
    stopVolumeMeter();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!micAudioCtx || micAudioCtx.state === "closed") {
        micAudioCtx = new Ctx();
      }
      if (micAudioCtx.state === "suspended") micAudioCtx.resume().catch(() => {});
      const source = micAudioCtx.createMediaStreamSource(stream);
      micAnalyser = micAudioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      source.connect(micAnalyser);
      const data = new Uint8Array(micAnalyser.frequencyBinCount);
      const tick = () => {
        if (!micAnalyser || !wantListen) {
          stopVolumeMeter();
          return;
        }
        micAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const level = Math.min(1, (sum / data.length / 255) * 2.4);
        if (els.micLevelFill) {
          els.micLevelFill.style.transform = `scaleX(${level})`;
        }
        if (els.micMeterHint) {
          els.micMeterHint.textContent =
            level < 0.08 ? "安靜" : level < 0.35 ? "有聲音" : "夠大聲";
        }
        micMeterRaf = requestAnimationFrame(tick);
      };
      micMeterRaf = requestAnimationFrame(tick);
    } catch (_) {
      /* 音量條失敗不影響辨識 */
    }
  }

  /** Android／TWA／手機：不可長時間佔用 getUserMedia，否則會搶走 Web Speech 麥克風 */
  function isMobileOrTwa() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (_) {}
    return Boolean(navigator.standalone);
  }

  /**
   * 桌面：可保持 getUserMedia 做降噪音量條。
   * Android App／手機：只短暫請求權限後立刻釋放，留給 SpeechRecognition。
   */
  async function ensureOptimizedMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("瀏覽器不支援麥克風，請用 Chrome 開啟");
    }

    if (isMobileOrTwa()) {
      releaseOptimizedMic();
      const probe = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      probe.getTracks().forEach((t) => t.stop());
      if (els.micMeterHint) {
        els.micMeterHint.textContent = "麥克風已授權（語音辨識專用）";
      }
      if (els.micLevelFill) {
        els.micLevelFill.style.transform = "scaleX(0)";
      }
      setStatus("麥克風已就緒，可開始說話");
      return null;
    }

    if (micStream && micStream.active) {
      startVolumeMeter(micStream);
      return micStream;
    }
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    startVolumeMeter(micStream);
    setStatus("降噪麥克風已就緒");
    return micStream;
  }

  function releaseOptimizedMic() {
    stopVolumeMeter();
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (micAudioCtx && micAudioCtx.state !== "closed") {
      micAudioCtx.close().catch(() => {});
      micAudioCtx = null;
    }
    micAnalyser = null;
  }

  /** 指令太短／像雜音 → 請使用者重講 */
  function isUnclearCommand(command) {
    const c = String(command || "").trim();
    if (!c) return true;
    if (c.length < 2) return true;
    if (/^[啊嗯呃喔哦欸誒呵]+$/.test(c)) return true;
    return false;
  }

  function askPleaseRepeat() {
    const name = currentUserLabel();
    const prefix = name && name !== "你好" ? `${name}，` : "";
    speakText(`${prefix}在！請問您說什麼？我剛剛沒有聽清楚。`);
    setStatus("沒聽清楚，請再說一次指令");
  }

  async function startListen(mode = "dictation", isRestart = false) {
    if (
      document.body.classList.contains("auth-locked") &&
      window.XiaoYiAuth?.requireLogin?.()
    ) {
      setStatus("請先登入以啟用語音助理");
      return;
    }
    if (!SpeechRecognition) {
      setStatus("此瀏覽器不支援 SpeechRecognition，請用 Chrome 或 Edge");
      return;
    }
    listenMode = mode;
    wantListen = true;
    if (!isRestart) AutoTag.resetSession(tagState);

    try {
      await ensureOptimizedMic();
    } catch (err) {
      wantListen = false;
      setStatus(`無法優化／開啟麥克風：${err?.message || err}`);
      updateListenButtons();
      return;
    }

    // 結束舊實例時標記忽略 onend，避免 aborted 重啟風暴
    if (recognition) {
      ignoreEndOnce = true;
      listenGeneration += 1;
      try {
        recognition.stop();
      } catch (_) {}
      recognition = null;
    }

    const generation = ++listenGeneration;
    recognition = createRecognition(generation);
    try {
      recognition.start();
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F1',location:'voice_studio.js:startListen',message:'recognition.start() called',data:{mode,isRestart,wantListen,generation},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!isRestart) {
        setStatus(
          mode === "wake"
            ? "降噪監聽中：請說「小一小一」或「你好」"
            : "降噪聽寫中…"
        );
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'post-fix',hypothesisId:'F1',location:'voice_studio.js:startListenCatch',message:'recognition.start() threw',data:{mode,isRestart,error:String(err&&err.message||err)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setStatus(`無法啟動：${err.message || err}`);
      wantListen = false;
      updateListenButtons();
    }
  }

  function stopListen() {
    wantListen = false;
    ttsPausedListen = false;
    clearSpeechPuzzle();
    clearPendingWokeWait();
    WakeWord.sleep(wakeSession);
    if (recognition) {
      ignoreEndOnce = true;
      listenGeneration += 1;
      try {
        recognition.stop();
      } catch (_) {}
      recognition = null;
    }
    if (listenMode === "dictation") {
      AutoTag.flushBuffer(tagState, onFlushRaw);
    }
    releaseOptimizedMic();
    updateListenButtons();
    setWakeUi("idle");
  }

  /** 打字對話時停止喚醒監聽，避免搶麥／誤觸 */
  function pauseWakeForTyping(reason = "打字對話中，已暫停喚醒監聽") {
    if (wantListen || listening || recognition) {
      stopListen();
      setStatus(reason);
    } else {
      setWakeUi("idle");
    }
  }

  function speak() {
    const raw = els.text.value.trim();
    if (!raw) {
      setStatus("請先聽寫或貼上文字再朗讀");
      return;
    }
    const text = AutoTag.stripTagsForSpeech(raw);
    if (!text) {
      setStatus("沒有可朗讀的正文");
      return;
    }
    stopListen();
    setBadge("speaking", "朗讀中");
    speakText(text, () => {
      setBadge("", "就緒");
      setStatus("朗讀完成");
    });
  }

  function stopAll() {
    wantListen = false;
    stopListen();
    stopSpeaking("已全部停止");
  }

  els.rate.addEventListener("input", () => {
    els.rateValue.textContent = formatRate(els.rate.value);
  });

  els.lang.addEventListener("change", () => {
    if (els.lang.value === "zh-TW") {
      const preferred = findDefaultTaiwanVoice(synth.getVoices());
      if (preferred) {
        els.voice.value = preferred.voiceURI;
        localStorage.setItem(VOICE_PREF_KEY, preferred.voiceURI);
      }
    }
    if (listening) {
      const mode = listenMode;
      stopListen();
      startListen(mode, true);
    }
  });

  els.voice.addEventListener("change", () => {
    if (els.voice.value) {
      localStorage.setItem(VOICE_PREF_KEY, els.voice.value);
    } else {
      localStorage.removeItem(VOICE_PREF_KEY);
    }
  });

  els.btnWake.addEventListener("click", () => {
    if (wantListen && listenMode === "wake") stopListen();
    else startListen("wake");
  });

  els.btnListen.addEventListener("click", () => {
    if (wantListen && listenMode === "dictation") stopListen();
    else startListen("dictation");
  });

  els.btnSpeak.addEventListener("click", speak);
  els.btnStop.addEventListener("click", stopAll);
  els.btnStopSpeak?.addEventListener("click", () => {
    stopSpeaking("已手動停止朗讀");
  });
  function clearChat() {
    AutoTag.resetSession(tagState);
    els.text.value = "";
    if (els.chatThread) els.chatThread.innerHTML = "";
    els.interim.textContent = "";
    if (els.promptInput) els.promptInput.value = "";
    closeSearchPanel();
    setWakeUi(wantListen && listenMode === "wake" ? "listening" : "idle");
    refreshHeroVisibility();
    setStatus("已開啟新對話");
  }

  els.btnClear?.addEventListener("click", clearChat);
  els.btnNewChat?.addEventListener("click", clearChat);
  els.btnClearRecent?.addEventListener("click", () => {
    if (!loadRecent().length) {
      setStatus("沒有可清除的近期對話");
      return;
    }
    if (window.confirm("確定清除全部近期對話？")) {
      clearAllRecent();
    }
  });
  els.btnCopy?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.text.value);
      setStatus("已複製到剪貼簿");
    } catch {
      setStatus("複製失敗，請手動選取複製");
    }
  });
  els.btnLoadAi?.addEventListener("click", loadWebllm);
  els.btnTestGemini?.addEventListener("click", testGemini);
  els.btnCloseSearch?.addEventListener("click", closeSearchPanel);

  const MOBILE_MQ = window.matchMedia("(max-width: 860px)");
  const isMobileLayout = () => MOBILE_MQ.matches;

  function syncSidebarBackdrop() {
    const open =
      isMobileLayout() && els.sidebar && !els.sidebar.classList.contains("collapsed");
    document.body.classList.toggle("sidebar-open", Boolean(open));
    if (els.sidebarBackdrop) {
      els.sidebarBackdrop.hidden = !open;
      els.sidebarBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  function openSidebar() {
    els.sidebar?.classList.remove("collapsed");
    syncSidebarBackdrop();
  }

  function closeSidebar() {
    els.sidebar?.classList.add("collapsed");
    syncSidebarBackdrop();
  }

  function toggleSidebar() {
    if (!els.sidebar) return;
    if (els.sidebar.classList.contains("collapsed")) openSidebar();
    else closeSidebar();
  }

  function applyLayoutMode() {
    if (isMobileLayout()) {
      // 手機預設收合側欄，避免佔滿畫面
      closeSidebar();
    } else {
      els.sidebar?.classList.remove("collapsed");
      document.body.classList.remove("sidebar-open");
      if (els.sidebarBackdrop) {
        els.sidebarBackdrop.hidden = true;
        els.sidebarBackdrop.setAttribute("aria-hidden", "true");
      }
    }
  }

  applyLayoutMode();
  if (MOBILE_MQ.addEventListener) {
    MOBILE_MQ.addEventListener("change", applyLayoutMode);
  } else if (MOBILE_MQ.addListener) {
    MOBILE_MQ.addListener(applyLayoutMode);
  }

  els.btnToggleSidebar?.addEventListener("click", () => {
    if (isMobileLayout()) closeSidebar();
    else toggleSidebar();
  });
  els.btnOpenSidebar?.addEventListener("click", openSidebar);
  els.sidebarBackdrop?.addEventListener("click", closeSidebar);
  els.sidebar?.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isMobileLayout()) closeSidebar();
    });
  });

  els.btnFocusPrompt?.addEventListener("click", () => {
    els.promptInput?.focus();
  });
  const openDrawer = (el) => el?.classList.remove("hidden");
  const closeDrawer = (el) => el?.classList.add("hidden");
  els.btnToggleTools?.addEventListener("click", () => openDrawer(els.toolsDrawer));
  els.btnCloseTools?.addEventListener("click", () => closeDrawer(els.toolsDrawer));
  els.btnOpenSettings?.addEventListener("click", () =>
    openDrawer(els.settingsDrawer)
  );
  els.btnOpenSettingsMobile?.addEventListener("click", () =>
    openDrawer(els.settingsDrawer)
  );
  els.btnCloseSettings?.addEventListener("click", () =>
    closeDrawer(els.settingsDrawer)
  );
  els.toolsDrawer?.addEventListener("click", (e) => {
    if (e.target === els.toolsDrawer) closeDrawer(els.toolsDrawer);
  });
  els.settingsDrawer?.addEventListener("click", (e) => {
    if (e.target === els.settingsDrawer) closeDrawer(els.settingsDrawer);
  });
  els.modelChip?.addEventListener("click", () => openDrawer(els.toolsDrawer));

  els.promptInput?.addEventListener("focus", () => {
    if (wantListen || listening) {
      pauseWakeForTyping("輸入框已聚焦，已停止喚醒監聽");
    }
  });
  els.promptInput?.addEventListener("input", () => {
    if (
      String(els.promptInput.value || "").trim() &&
      (wantListen || listening)
    ) {
      pauseWakeForTyping("打字中，已停止喚醒監聽");
    }
  });

  els.promptForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = String(els.promptInput?.value || "").trim();
    if (!q) {
      setStatus("請輸入內容後按傳送，或按麥克風用語音");
      return;
    }
    pauseWakeForTyping("文字對話中，已停止喚醒監聽");
    if (els.btnSend) els.btnSend.disabled = true;
    els.promptInput.value = "";
    try {
      // 打字傳送：只顯示回覆，不念出
      await executeCommand(q, { silent: true });
    } finally {
      if (els.btnSend) els.btnSend.disabled = false;
      els.promptInput?.focus();
    }
  });

  els.btnNavConfirm?.addEventListener("click", () => {
    confirmNavigateNow();
  });
  els.btnNavCancel?.addEventListener("click", () => {
    cancelNavigateConfirm();
  });
  els.navConfirmInput?.addEventListener("focus", () => {
    pauseNavCountdown();
  });
  els.navConfirmInput?.addEventListener("input", () => {
    pauseNavCountdown();
    navConfirm.destination = els.navConfirmInput.value.trim();
  });
  els.navConfirmInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmNavigateNow();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelNavigateConfirm();
    }
  });

  els.authToggleLink?.addEventListener("click", () => {
    if (authMode === "login") {
      authMode = "register";
      syncAuthUiMode();
    } else {
      setAuthLoginMode();
    }
  });

  els.forgotPasswordLink?.addEventListener("click", async () => {
    const account = String(els.authAccount?.value || "").trim();
    setAuthError("");
    setAuthOk("");
    if (!account) {
      setAuthError("請先在帳號欄輸入 Gmail，才能查詢安全問題");
      els.authAccount?.focus();
      return;
    }
    if (!window.XiaoYiAuth?.isGmail?.(account)) {
      setAuthError("請輸入有效的 Gmail");
      return;
    }
    els.forgotPasswordLink.disabled = true;
    try {
      const res = await window.XiaoYiAuth.getSecurityQuestion(account);
      authMode = "forgot";
      syncAuthUiMode();
      if (els.securityQuestionLabel) {
        els.securityQuestionLabel.textContent = `安全問題：${res.question || ""}`;
      }
      setAuthOk("請回答安全問題並設定新密碼");
      els.securityAnswer?.focus();
    } catch (err) {
      setAuthError(err?.message || String(err));
    } finally {
      els.forgotPasswordLink.disabled = false;
    }
  });

  els.authTogglePassword?.addEventListener("click", () => {
    const input = els.authPassword;
    const btn = els.authTogglePassword;
    if (!input || !btn) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "隱藏" : "顯示";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "隱藏密碼" : "顯示密碼");
    btn.title = show ? "隱藏密碼" : "顯示密碼";
  });

  els.authSendCodeBtn?.addEventListener("click", async () => {
    const account = String(els.authAccount?.value || "").trim();
    const password = String(els.authPassword?.value || "");
    const displayName = String(els.authDisplayName?.value || "").trim();
    const question = String(els.regQuestion?.value || "").trim();
    const answer = String(els.regAnswer?.value || "").trim();
    setAuthError("");
    setAuthOk("");
    if (!window.XiaoYiAuth?.isGmail?.(account)) {
      setAuthError("請輸入有效的 Gmail（例：name@gmail.com）");
      return;
    }
    if (password.length < (window.XiaoYiAuth?.MIN_PASSWORD_LEN || 8)) {
      setAuthError("密碼至少 8 個字");
      return;
    }
    if (!answer) {
      setAuthError("請填寫安全問題答案（忘記密碼時要用）");
      els.regAnswer?.focus();
      return;
    }
    els.authSendCodeBtn.disabled = true;
    try {
      const res = await window.XiaoYiAuth.sendRegisterCode(
        account,
        password,
        displayName,
        question,
        answer
      );
      if (res?.demoCode) {
        setAuthOk(
          `${res.message || "已產生驗證碼"}：${res.demoCode}（本機測試用，部署 Apps Script 後會寄到 Gmail）`
        );
      } else {
        setAuthOk(res?.message || "驗證碼已寄到你的 Gmail，請至收件匣查看");
      }
      startSendCodeCooldown(60);
      els.authCode?.focus();
    } catch (err) {
      setAuthError(err?.message || String(err));
      els.authSendCodeBtn.disabled = false;
      els.authSendCodeBtn.textContent = "發送驗證碼";
    }
  });

  els.authSubmitBtn?.addEventListener("click", async () => {
    const account = String(els.authAccount?.value || "").trim();
    const password = String(els.authPassword?.value || "");
    const displayName = String(els.authDisplayName?.value || "").trim();
    const code = String(els.authCode?.value || "").trim();
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'auth-bypass',hypothesisId:'D',location:'voice_studio.js:authSubmit',message:'login/register/forgot click',data:{mode:authMode,hasAccount:Boolean(account),passwordLen:password.length,hasCode:Boolean(code)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!account) {
      setAuthError("請輸入帳號（Gmail）");
      return;
    }

    // ─── 忘記密碼／重設 ───
    if (authMode === "forgot") {
      const ans = String(els.securityAnswer?.value || "").trim();
      const newPass = String(els.newPassword?.value || "");
      if (!ans || !newPass) {
        setAuthError("請輸入安全問題答案與新密碼");
        return;
      }
      if (newPass.length < (window.XiaoYiAuth?.MIN_PASSWORD_LEN || 8)) {
        setAuthError("新密碼至少 8 個字");
        return;
      }
      els.authSubmitBtn.disabled = true;
      setAuthError("");
      setAuthOk("");
      try {
        const res = await window.XiaoYiAuth.resetPassword(
          account,
          ans,
          newPass
        );
        setAuthOk(res?.message || "密碼重設成功！請使用新密碼登入。");
        if (els.securityAnswer) els.securityAnswer.value = "";
        if (els.newPassword) els.newPassword.value = "";
        setAuthLoginMode();
        setAuthOk("密碼已更新，請用新密碼登入");
      } catch (err) {
        setAuthError(err?.message || String(err));
      } finally {
        els.authSubmitBtn.disabled = false;
      }
      return;
    }

    if (!password) {
      setAuthError("請完整輸入帳號與密碼");
      return;
    }
    if (password.length < (window.XiaoYiAuth?.MIN_PASSWORD_LEN || 8)) {
      setAuthError("密碼至少 8 個字");
      return;
    }
    if (authMode === "register") {
      if (!window.XiaoYiAuth?.isGmail?.(account)) {
        setAuthError("註冊帳號必須是 Gmail");
        return;
      }
      if (!String(els.regAnswer?.value || "").trim()) {
        setAuthError("請填寫安全問題答案");
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setAuthError("請先發送並輸入 6 位數郵件驗證碼");
        return;
      }
    }
    els.authSubmitBtn.disabled = true;
    setAuthError("");
    setAuthOk("");
    try {
      if (authMode === "register") {
        await window.XiaoYiAuth.register(account, password, displayName, code);
      } else {
        await window.XiaoYiAuth.login(account, password);
      }
      els.authPassword.value = "";
      if (els.authCode) els.authCode.value = "";
      await unlockAppAfterLogin();
      setStatus(
        SpeechRecognition
          ? "已登入。需要語音時再按麥克風啟動監聽"
          : "已登入（此瀏覽器不支援語音辨識）"
      );
    } catch (err) {
      setAuthError(err?.message || String(err));
    } finally {
      els.authSubmitBtn.disabled = false;
    }
  });

  els.authPassword?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (authMode === "register") els.authSendCodeBtn?.click();
      else els.authSubmitBtn?.click();
    }
  });
  els.authCode?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.authSubmitBtn?.click();
  });
  els.securityAnswer?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.newPassword?.focus();
  });
  els.newPassword?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.authSubmitBtn?.click();
  });

  els.btnLogout?.addEventListener("click", async () => {
    try {
      stopAll();
    } catch (_) {}
    await window.XiaoYiAuth?.logout?.();
    applyUserChrome();
    setAuthLocked(true);
    setAuthLoginMode();
    setStatus("已登出，請重新登入");
  });

  /** Android 前台服務喚醒：?nativeWake=1&nativeCmd=... */
  let pendingNativeCmd = "";
  function readNativeWakeFromUrl() {
    try {
      const q = new URLSearchParams(location.search || "");
      if (q.get("nativeWake") !== "1") return "";
      const raw = q.get("nativeCmd") || "";
      let cmd = raw;
      try {
        cmd = decodeURIComponent(raw);
      } catch (_) {}
      // 清掉 query，避免重新整理重複執行
      if (history.replaceState) {
        const u = new URL(location.href);
        u.searchParams.delete("nativeWake");
        u.searchParams.delete("nativeCmd");
        history.replaceState({}, "", u.pathname + u.search + u.hash);
      }
      return String(cmd || "").trim();
    } catch (_) {
      return "";
    }
  }

  async function runNativeWakeCommand(cmd) {
    const text = String(cmd || "").trim();
    if (!text) return;
    setStatus(`原生喚醒：${text}`);
    // 確保喚醒監聽開啟，方便後續續說
    if (!wantListen) {
      try {
        await startListen("wake", false);
      } catch (_) {}
    }
    // 交給既有指令管線（含喚醒詞裁切）
    const stripped =
      typeof WakeWord?.stripWakePrefix === "function"
        ? WakeWord.stripWakePrefix(text)
        : text;
    const core = String(stripped || text).trim();
    if (!core || isUnclearCommand(core)) {
      // 只有喚醒詞 → 打招呼／請下指令
      const out = WakeWord.processResult(
        wakeSession,
        text,
        true,
        onWakeTimeout
      );
      if (out.kind === "woke" || out.kind === "woke_wait") {
        const name = currentUserLabel();
        const prefix = name && name !== "你好" ? `${name}，` : "";
        speakText(`${prefix}在！請說指令。`);
      } else if (out.kind === "command_partial" || out.kind === "command_final") {
        await executeCommand(out.coreCommand || core);
      } else {
        speakText("在！請說指令。");
      }
      return;
    }
    await executeCommand(core);
  }

  if (window.WebLLMTagger) bindAi();
  else window.addEventListener("webllm-tagger-ready", bindAi, { once: true });
  bindAi();
  initChromeUi();
  setWakeUi("idle");
  loadVoices();
  syncAuthUiMode();
  pendingNativeCmd = readNativeWakeFromUrl();

  (async () => {
    await initAuthGate();
    const locked = document.body.classList.contains("auth-locked");
    if (locked) {
      setStatus(
        pendingNativeCmd
          ? "原生已喚醒，請先登入後執行指令"
          : "請先登入以啟用小一語音助理"
      );
      return;
    }
    setWakeUi("idle");
    if (pendingNativeCmd) {
      const cmd = pendingNativeCmd;
      pendingNativeCmd = "";
      await runNativeWakeCommand(cmd);
      return;
    }
    setStatus(
      SpeechRecognition
        ? "就緒：可打字傳送，或按麥克風啟動喚醒監聽"
        : "此瀏覽器不支援語音辨識，請用打字傳送"
    );
  })();
})();
