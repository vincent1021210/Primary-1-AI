/**
 * 方案 A 規則標籤（插件備援；本機版另有 WebLLM 方案 B）
 */
(function (global) {
  const QUESTION_WORDS = [
    "為什麼", "為甚麼", "怎麼", "怎樣", "是不是", "是否", "如何", "嗎", "嘛",
    "哪裡", "哪邊", "哪個", "什麼", "啥", "誰", "何時", "幾點",
    "可不可以", "能不能", "會不會", "有沒有", "對不對",
    "what", "why", "how", "where", "who", "when", "which",
  ];
  const COMMAND_WORDS = [
    "請幫我", "麻煩你", "麻煩", "請你", "幫我",
    "打開", "開啟", "搜尋", "搜索", "點擊", "暫停", "清除", "關閉",
    "開始", "停止", "刪除", "建立", "新增", "設定",
  ];
  const SURPRISE_WORDS = ["哇", "耶", "天啊", "我靠", "我的天", "真的假的", "太扯", "天哪", "嚇死"];
  const AFFIRM_WORDS = ["好哦", "好喔", "好的", "沒問題", "可以", "了解", "收到", "是的", "對啊", "沒錯", "ok"];
  const TODO_WORDS = ["記得", "待辦", "截止", "明天要", "別忘了", "要交", "todo", "deadline", "週報"];
  const KEY_WORDS = ["重點是", "重點", "結論", "總之", "因此", "所以說", "關鍵", "總結", "會議"];

  function stripEndPunct(text) {
    return String(text || "").trim().replace(/[。！？!?．，,、…]+$/g, "");
  }

  function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function detectSemantic(text) {
    const raw = stripEndPunct(text);
    if (!raw) return { kind: "plain", label: "[💬 一般陳述]", punct: "。" };
    const lower = raw.toLowerCase();
    if (
      QUESTION_WORDS.some((w) => raw.includes(w) || lower.includes(String(w).toLowerCase())) ||
      /[嗎呢]$/.test(raw)
    ) {
      return { kind: "question", label: "[❓ 問題]", punct: "？" };
    }
    if (COMMAND_WORDS.some((w) => raw.startsWith(w) || raw.includes(w))) {
      return { kind: "command", label: "[⚙️ 指令]", punct: "。" };
    }
    if (SURPRISE_WORDS.some((w) => raw.includes(w))) {
      return { kind: "surprise", label: "[😮 驚訝]", punct: "！" };
    }
    if (AFFIRM_WORDS.some((w) => raw === w || raw.endsWith(w) || raw.includes(w))) {
      return { kind: "affirm", label: "[✅ 肯定]", punct: "。" };
    }
    if (TODO_WORDS.some((w) => raw.includes(w) || lower.includes(w))) {
      return { kind: "todo", label: "[📌 待辦事項]", punct: "。" };
    }
    if (KEY_WORDS.some((w) => raw.includes(w))) {
      return { kind: "key", label: "[📋 會議重點]", punct: "。" };
    }
    return { kind: "plain", label: "[💬 一般陳述]", punct: "。" };
  }

  function tagByRules(text) {
    const cleaned = stripEndPunct(text);
    if (!cleaned) return "";
    const semantic = detectSemantic(cleaned);
    return `${semantic.label} ${cleaned}${semantic.punct}`;
  }

  function withTimeline(taggedBody, options = {}) {
    const { sessionStartAt = Date.now(), lineIndex = 0 } = options;
    const body = String(taggedBody || "").trim();
    if (!body) return "";
    const elapsed = formatElapsed(Date.now() - sessionStartAt);
    const prefix = lineIndex === 0 ? "" : "\n";
    return `${prefix}[⏱️ ${elapsed}] ${body}`;
  }

  function autoTagging(text, options = {}) {
    return withTimeline(tagByRules(text), options);
  }

  function createTaggerState() {
    return { sessionStartAt: Date.now(), lineIndex: 0, buffer: "", flushTimer: null };
  }

  function resetSession(state) {
    if (state.flushTimer) clearTimeout(state.flushTimer);
    state.flushTimer = null;
    state.sessionStartAt = Date.now();
    state.lineIndex = 0;
    state.buffer = "";
  }

  function pushChunk(state, chunk, onFlush, delayMs = 900) {
    const piece = String(chunk || "").trim();
    if (!piece) return;
    state.buffer = `${state.buffer}${piece}`.replace(/\s+/g, " ").trim();
    if (state.flushTimer) clearTimeout(state.flushTimer);
    state.flushTimer = setTimeout(() => flushBuffer(state, onFlush), delayMs);
  }

  function flushBuffer(state, onFlush) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    const text = String(state.buffer || "").trim();
    state.buffer = "";
    if (!text || typeof onFlush !== "function") return;
    const meta = { lineIndex: state.lineIndex, sessionStartAt: state.sessionStartAt };
    state.lineIndex += 1;
    Promise.resolve(onFlush(text, meta)).catch(() => {});
  }

  function stripTagsForSpeech(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("。")
      .replace(/。+/g, "。")
      .trim();
  }

  global.AutoTag = {
    autoTagging,
    tagByRules,
    withTimeline,
    detectSemantic,
    createTaggerState,
    resetSession,
    pushChunk,
    flushBuffer,
    formatElapsed,
    stripTagsForSpeech,
  };
})(typeof self !== "undefined" ? self : window);
