/**
 * Gemini：智慧標籤 +「小一」語音助理大腦（ACTION 標籤）
 * 金鑰來自 config.local.js，勿提交到版本庫。
 */
(function (global) {
  const ALLOWED_TAGS = [
    "[📌 待辦事項]",
    "[📋 會議重點]",
    "[❓ 問題]",
    "[⚙️ 指令]",
    "[✅ 肯定]",
    "[😮 驚訝]",
    "[💡 重點]",
    "[💬 一般陳述]",
  ];

  const ASSIST_SYSTEM_PROMPT = `# 角色設定
你是一位高 EQ、語氣溫柔且極具智慧的個人語音助理，名字叫「小一」。你負責接收使用者透過麥克風轉換出來的破碎、含糊或帶有錯字的文字，並將其轉化為精準的動作指令與極其自然的擬真語音回覆。

# 當前環境脈絡 (重要)
- 使用者目前所在的即時 GPS 座標：[CONTEXT_LOCATION]（格式：緯度, 經度）
- 你的回答將會被轉換為文字轉語音 (TTS) 播放給使用者聽，因此回答務必精簡、口語，不要輸出長篇大論、Markdown 標題或清單。
- 可適度使用 <short pause>、<laugh>、<sigh> 標記語氣（前端會轉成可朗讀文字）。

# 核心任務與功能分流
請分析使用者的輸入。若包含特定動作需求，請在回答的最前方強制加上一行特定標籤；一般對話則正常口語回答。

1. Google 搜尋（查資料、搜尋東西、附近美食等）：
   - 標籤：[ACTION_SEARCH:真正的關鍵字]
2. 地圖導航／去某地（導航到、去…、怎麼走）：請糾錯聽錯的地名，並結合 GPS 上下文。
   - 標籤：[ACTION_NAV:修正後的精準目的地]
3. 數學算術：請算出答案。
   - 標籤：[ACTION_MATH:公式=答案]
4. 天氣查詢：
   - 標籤：[ACTION_WEATHER:地名或GPS]
5. 播放 YouTube 影片（播放…、我想聽…、在 YouTube 上播…、看某網紅／頻道最新影片）：
   - 請自動糾正聽錯的字，並在標籤內放「頻道／歌名／關鍵字」，讓搜尋第一筆盡量正確（可加「官方版」「最新影片」等）。
   - 標籤：[ACTION_YOUTUBE:修正後的極準播放關鍵字]
6. 自我介紹（請介紹自己、你是誰、你會什麼、有什麼功能）：
   - 不要輸出 ACTION 標籤。
   - 請口語介紹：名字叫小一、是使用者的好朋友；可查天氣、導航、計算，也能幫忙播放音樂與影片，並可用語音或打字對話。

# 輸出範例
使用者：「小一小一導航去逢甲葉式」
你應輸出：
[ACTION_NAV:逢甲夜市]
好的，<short pause> 已經為您設定好前往逢甲夜市的路線，現在就出發吧！

使用者：「小一小一，播油土伯老高最新那一集」
你應輸出：
[ACTION_YOUTUBE:老高與小茉 Mr & Mrs Gao 最新影片]
好的，<short pause> 幫您在 YouTube 上尋找老高與小茉的最新影片，馬上播放！

使用者：「請介紹自己」
你應輸出：
我叫小一，是你的好朋友。我可以幫你查天氣、導航、算數學，也可以播放音樂和影片，還能用語音或打字跟你聊天喔！`;

  let status = "idle"; // idle | ready | error | missing
  let lastError = "";
  const listeners = new Set();

  function cfg() {
    return global.APP_CONFIG || {};
  }

  function apiKey() {
    const fromCfg = String(cfg().geminiApiKey || "").trim();
    if (fromCfg) return fromCfg;
    try {
      return String(localStorage.getItem("xiaoYiGeminiApiKey") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function modelId() {
    return String(cfg().geminiModel || "gemini-3.1-flash-lite").trim();
  }

  function emit() {
    const snap = getState();
    listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch (_) {}
    });
  }

  function getState() {
    const key = apiKey();
    return {
      status: !key ? "missing" : status === "idle" ? "ready" : status,
      ready: Boolean(key) && status !== "error" && status !== "missing",
      lastError,
      modelId: modelId(),
      provider: "gemini",
    };
  }

  function pickAllowedTag(rawAnswer) {
    const text = String(rawAnswer || "");
    for (const tag of ALLOWED_TAGS) {
      if (text.includes(tag)) return tag;
    }
    const loose = [
      [/待辦/, "[📌 待辦事項]"],
      [/會議/, "[📋 會議重點]"],
      [/問題|疑問/, "[❓ 問題]"],
      [/指令|命令/, "[⚙️ 指令]"],
      [/肯定|同意/, "[✅ 肯定]"],
      [/驚訝/, "[😮 驚訝]"],
      [/重點/, "[💡 重點]"],
      [/一般|閒聊|陳述/, "[💬 一般陳述]"],
    ];
    for (const [re, tag] of loose) {
      if (re.test(text)) return tag;
    }
    return "[💬 一般陳述]";
  }

  function punctuate(tag, body) {
    let out = String(body || "")
      .trim()
      .replace(/^原文\s*[：:]\s*/u, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!out) return "";
    if (/[。！？!?．]$/.test(out)) return out;
    if (/問題|疑問/.test(tag) || /[嗎呢]$/.test(out)) return `${out}？`;
    if (/驚訝/.test(tag)) return `${out}！`;
    return `${out}。`;
  }

  /** 解析 [ACTION_XXX:...] 並產出可朗讀文字 */
  function parseAssistResponse(raw) {
    const text = String(raw || "").trim();
    const actions = [];
    const re =
      /\[ACTION_(SEARCH|NAV|MATH|WEATHER|YOUTUBE)\s*:\s*([^\]]+)\]/gi;
    let m;
    while ((m = re.exec(text))) {
      actions.push({
        type: m[1].toUpperCase(),
        value: String(m[2] || "").trim(),
      });
    }
    let speak = text
      .replace(
        /\[ACTION_(SEARCH|NAV|MATH|WEATHER|YOUTUBE)\s*:[^\]]+\]/gi,
        " "
      )
      .replace(/<short\s*pause>/gi, "，")
      .replace(/<laugh>/gi, "哈哈，")
      .replace(/<sigh>/gi, "唉，")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { actions, speak, raw: text };
  }

  async function callGeminiStudio({
    userText,
    systemInstruction,
    temperature = 0.3,
    maxOutputTokens = 256,
  }) {
    const key = apiKey();
    const model = modelId();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || "").join("").trim();
  }

  async function tag(text) {
    const original = String(text || "").trim();
    if (!original) return "";
    if (!apiKey()) {
      status = "missing";
      lastError = "尚未設定 Gemini API Key";
      emit();
      return "";
    }

    const prompt = `你是繁體中文逐字稿分類器。只回傳一個標籤，不要回傳原文或其他文字。

可選標籤（原樣擇一）：
${ALLOWED_TAGS.join("\n")}

句子：
${original}`;

    try {
      const answer = await callGeminiStudio({
        userText: prompt,
        temperature: 0.1,
        maxOutputTokens: 32,
      });
      const tagLabel = pickAllowedTag(answer);
      const body = punctuate(tagLabel, original);
      status = "ready";
      lastError = "";
      emit();
      return `${tagLabel} ${body}`;
    } catch (err) {
      status = "error";
      lastError = err?.message || String(err);
      emit();
      throw err;
    }
  }

  /**
   * 小一大腦：糾錯＋ACTION 標籤＋口語回覆
   * @param {string} userText
   * @param {string} [locationText] 例："24.81, 120.97（新竹）"
   */
  async function assist(userText, locationText) {
    const original = String(userText || "").trim();
    if (!original) {
      return { actions: [], speak: "", raw: "" };
    }
    if (!apiKey()) {
      status = "missing";
      lastError = "尚未設定 Gemini API Key";
      emit();
      throw new Error(lastError);
    }

    const loc = String(locationText || "未知").trim() || "未知";
    const systemInstruction = ASSIST_SYSTEM_PROMPT.replace(
      /\[CONTEXT_LOCATION\]/g,
      loc
    );

    try {
      const answer = await callGeminiStudio({
        userText: original,
        systemInstruction,
        temperature: 0.35,
        maxOutputTokens: 320,
      });
      status = "ready";
      lastError = "";
      emit();
      return parseAssistResponse(answer);
    } catch (err) {
      status = "error";
      lastError = err?.message || String(err);
      emit();
      throw err;
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    fn(getState());
    return () => listeners.delete(fn);
  }

  if (apiKey()) status = "ready";
  else status = "missing";

  global.GeminiTagger = {
    tag,
    assist,
    parseAssistResponse,
    getState,
    onChange,
    apiKeyPresent: () => Boolean(apiKey()),
    ASSIST_SYSTEM_PROMPT,
  };
})(typeof window !== "undefined" ? window : globalThis);
