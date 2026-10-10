/**
 * Gemini：智慧標籤 +「小一」語音助理大腦（ACTION 標籤）
 * 預設：錄音／文字 → Apps Script 後端 → 後端持金鑰呼叫 Gemini 3.1 Flash-Lite
 * （金鑰放 Script Properties，勿放前端）
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

  /** 針對 gemini-3.1-flash-lite：語音／圖片／GPS 多模態＋口語 TTS */
  const ASSIST_SYSTEM_PROMPT = `# 角色設定
你是一位高 EQ、語氣溫柔且極具智慧的個人語音助理，名字叫「小一」。
你使用 Gemini 3.1 Flash-Lite 大腦，可同時理解語音音訊、照片與 GPS 脈絡。

# 當前環境脈絡 (重要)
- 使用者目前所在的即時 GPS 座標：[CONTEXT_LOCATION]（格式：緯度, 經度）
- 你的回答會被轉成語音朗讀，務必精簡、口語、像真人對話；禁止 Markdown 標題、粗體、清單符號。
- 可適度使用 <short pause>、<laugh>、<sigh>。
- 請自動忽略環境雜音、糾正聽錯的錯字（例：糕點站→高鐵站、油土伯→老高）。

# 核心任務與功能分流
若觸發動作，請在回答最前方強制加上一行標籤；一般知識問答則直接口語回答（不要硬加 ACTION）。

1. Google 搜尋／附近找店（查資料、附近有什麼、最近的…）：
   - 標籤：[ACTION_SEARCH:真正的關鍵字]
   - 「附近／最近」請結合 GPS 脈絡組關鍵字。
2. 地圖導航（導航到、去…、怎麼走、去最近的這家店）：
   - 結合 GPS 與（若有）圖片辨識地點，糾錯地名。
   - 標籤：[ACTION_NAV:修正後的精準目的地]
3. 數學算術：算出答案。
   - 標籤：[ACTION_MATH:公式=答案]
4. 天氣查詢：
   - 標籤：[ACTION_WEATHER:地名或GPS]
5. YouTube（播放、我想聽、看評測／網紅影片）：
   - 標籤：[ACTION_YOUTUBE:修正後的極準播放關鍵字]
6. 自我介紹：不要 ACTION，口語介紹小一功能。
7. 看圖（有附圖片時）：結合影像＋語音／文字。
   - 一般看圖問答：不要 ACTION，直接口語回答。
   - 依圖導航： [ACTION_NAV:辨識出的精準地點]
   - 依圖找評測／影片： [ACTION_YOUTUBE:型號或關鍵字＋評測]

# 回覆鐵律（極重要）
- 絕對不准輸出「收到，…」或把使用者的問題整句覆讀一遍。
- 必須直接給出答案或執行動作結果。例如「寫 15 字小說」→ 直接寫出約 15 字的小說內容，不要客套。
- 不要問「請問你可以…」這類反問；你就是小一，直接做。
- 文字輸入不需要先說「小一小一」或「你好」；使用者打什麼就直接回答，不要要求喚醒詞。

# 輸出範例
使用者語音：「導航去逢甲葉式」
[ACTION_NAV:逢甲夜市]
好的，<short pause> 已經為您設定好前往逢甲夜市的路線，現在就出發吧！

使用者語音＋咖啡廳招牌照片：「去最近的這家店」
[ACTION_NAV:星巴克]
好的，幫您導航到附近的星巴克。

使用者語音＋手機照片：「我想看這個手機的油土伯評測」
[ACTION_YOUTUBE:iPhone 開箱評測]
好的，幫您在 YouTube 找相關評測，馬上播放！

使用者：「為什麼天空是藍色的，順便算 1234 乘 56」
[ACTION_MATH:1234×56=69104]
天空看起來藍，是因為陽光被大氣散射，藍光比較容易往四面八方散開；1234 乘 56 等於 69104。

使用者：「請問你可以幫我寫15字的小說文嗎」
夜雨敲窗，他把舊信折好，塞回抽屜最深處。`;

  let status = "idle"; // idle | ready | error | missing
  let lastError = "";
  const listeners = new Set();

  function cfg() {
    return global.APP_CONFIG || {};
  }

  function normalizeApiKey(raw) {
    return String(raw || "")
      .trim()
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\s+/g, "");
  }

  /** 有 Apps Script 網址且未關閉 geminiViaBackend 時走後端 */
  function useBackend() {
    const url = String(cfg().appsScriptAuthUrl || "").trim();
    if (!url) return false;
    return cfg().geminiViaBackend !== false;
  }

  /** 僅在關閉後端代理時使用（App 正式流程不讀前端金鑰） */
  function apiKey() {
    if (useBackend()) return "";
    return normalizeApiKey(cfg().geminiApiKey || "");
  }

  function looksLikeGeminiKey(key) {
    return /^(AQ\.|AIza)/.test(String(key || ""));
  }

  function modelId() {
    return String(cfg().geminiModel || "gemini-3.1-flash-lite").trim();
  }

  function canCallGemini() {
    if (useBackend()) return Boolean(cfg().appsScriptAuthUrl);
    return Boolean(apiKey());
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
    const ready = canCallGemini() && status !== "error" && status !== "missing";
    return {
      status: !canCallGemini()
        ? "missing"
        : status === "idle"
          ? "ready"
          : status,
      ready,
      lastError,
      modelId: modelId(),
      provider: useBackend() ? "gemini-backend" : "gemini",
      viaBackend: useBackend(),
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

  async function callGeminiViaBackend({
    userText,
    systemInstruction,
    temperature = 0.3,
    maxOutputTokens = 256,
    image = null,
    audio = null,
  }) {
    const auth = global.XiaoYiAuth;
    if (!auth?.api || !auth?.loadSession) {
      throw new Error("帳號模組未載入，無法連後端");
    }
    if (!auth.authUrl?.()) {
      throw new Error("尚未設定 appsScriptAuthUrl");
    }
    const session = auth.loadSession();
    const authUrlStr = String(auth.authUrl?.() || "");
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'pre-fix',hypothesisId:'A',location:'gemini_tagger.js:callGeminiViaBackend:session',message:'backend call session check',data:{hasToken:Boolean(session?.token),tokenLen:String(session?.token||'').length,tokenPrefix:String(session?.token||'').slice(0,6),accountHint:String(session?.account||'').slice(0,3),backend:String(session?.backend||''),urlTail:authUrlStr.slice(-28),hasAudio:Boolean(audio?.data),hasImage:Boolean(image?.data),textLen:String(userText||'').length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!session?.token) {
      throw new Error("請先登入後再使用語音助理");
    }
    let data;
    try {
      data = await auth.api("geminiAssist", {
        token: session.token,
        userText: userText || "",
        systemInstruction: systemInstruction || "",
        temperature,
        maxOutputTokens,
        model: modelId(),
        audio: audio?.data
          ? { mimeType: audio.mimeType || "audio/wav", data: audio.data }
          : null,
        image: image?.data
          ? { mimeType: image.mimeType || "image/jpeg", data: image.data }
          : null,
      });
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'pre-fix',hypothesisId:'B',location:'gemini_tagger.js:callGeminiViaBackend:error',message:'geminiAssist threw',data:{err:String(err&&err.message||err).slice(0,160),tokenLen:String(session?.token||'').length,urlTail:authUrlStr.slice(-28)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw err;
    }
    // #region agent log
    fetch('http://127.0.0.1:7629/ingest/06c95251-9e08-4695-966d-b104e29c0862',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c607e2'},body:JSON.stringify({sessionId:'c607e2',runId:'pre-fix',hypothesisId:'C',location:'gemini_tagger.js:callGeminiViaBackend:ok',message:'geminiAssist ok',data:{textLen:String(data?.text||'').length,model:String(data?.model||'')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return String(data.text || "").trim();
  }

  /**
   * 本機直連（僅備援；預設不走這條）
   */
  async function callGeminiDirect({
    userText,
    systemInstruction,
    temperature = 0.3,
    maxOutputTokens = 256,
    image = null,
    audio = null,
  }) {
    const key = apiKey();
    if (!key) {
      throw new Error("尚未設定 Gemini API Key（請到設定貼上）");
    }
    if (!looksLikeGeminiKey(key)) {
      throw new Error(
        "金鑰格式不正確：請到 Google AI Studio 建立金鑰（應為 AQ. 或 AIza 開頭）"
      );
    }
    const model = modelId();
    const useQueryKey = key.startsWith("AIza");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent${useQueryKey ? `?key=${encodeURIComponent(key)}` : ""}`;

    const parts = [];
    if (audio?.data && audio?.mimeType) {
      parts.push({
        inlineData: {
          mimeType: String(audio.mimeType),
          data: String(audio.data),
        },
      });
    }
    if (image?.data && image?.mimeType) {
      parts.push({
        inlineData: {
          mimeType: String(image.mimeType),
          data: String(image.data),
        },
      });
    }
    if (userText) parts.push({ text: userText });

    const body = {
      contents: [{ role: "user", parts }],
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
      let msg = data?.error?.message || `Gemini HTTP ${res.status}`;
      if (
        res.status === 401 ||
        /OAuth|ACCESS_TOKEN|UNAUTHENTICATED|API_KEY/i.test(msg)
      ) {
        msg =
          "Gemini 金鑰無效。後端模式請更新 Apps Script 的 GEMINI_API_KEY。";
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const outParts = data?.candidates?.[0]?.content?.parts || [];
    return outParts.map((p) => p.text || "").join("").trim();
  }

  /**
   * @param {{ userText: string, systemInstruction?: string, temperature?: number, maxOutputTokens?: number, image?: { mimeType: string, data: string } | null, audio?: { mimeType: string, data: string } | null }} opts
   */
  async function callGeminiStudio(opts) {
    if (useBackend()) return callGeminiViaBackend(opts);
    return callGeminiDirect(opts);
  }

  async function tag(text) {
    const original = String(text || "").trim();
    if (!original) return "";
    if (!canCallGemini()) {
      status = "missing";
      lastError = "AI 後端未就緒";
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
   * 小一大腦：糾錯＋ACTION 標籤＋口語回覆（可附圖片／語音多模態）
   */
  async function assist(userText, locationText, options = {}) {
    const original = String(userText || "").trim();
    const image = options?.image || null;
    const audio = options?.audio || null;
    if (!original && !image?.data && !audio?.data) {
      return { actions: [], speak: "", raw: "" };
    }
    if (!canCallGemini()) {
      status = "missing";
      lastError = "AI 後端未就緒，請先登入";
      emit();
      throw new Error(lastError);
    }

    const loc = String(locationText || "未知").trim() || "未知";
    const systemInstruction = ASSIST_SYSTEM_PROMPT.replace(
      /\[CONTEXT_LOCATION\]/g,
      loc
    );
    let promptText = original;
    if (!promptText && audio?.data) {
      promptText =
        "請仔細聆聽這段語音。自動忽略雜音、糾正錯字，依系統指令輸出 ACTION 標籤與口語繁體中文回覆。";
    }
    if (!promptText && image?.data) {
      promptText = "請仔細看這張圖片，用口語繁體中文告訴我重點內容。";
    }

    try {
      const answer = await callGeminiStudio({
        userText: promptText,
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: audio?.data || image?.data ? 640 : 400,
        image,
        audio,
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

  if (canCallGemini()) status = "ready";
  else status = "missing";

  global.GeminiTagger = {
    tag,
    assist,
    parseAssistResponse,
    getState,
    onChange,
    apiKeyPresent: () => canCallGemini(),
    useBackend,
    ASSIST_SYSTEM_PROMPT,
  };
})(typeof window !== "undefined" ? window : globalThis);
