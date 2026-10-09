/**
 * 方案 B：瀏覽器本地 WebLLM 智慧標籤（WebGPU，免伺服器／免 API Key）
 */
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

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

const SYSTEM_PROMPT = `你是繁體中文逐字稿分類器。
只回傳「一個標籤」，不要回傳其他任何文字。

可選標籤（只能選一個，原樣複製）：
${ALLOWED_TAGS.join("\n")}

禁止：
- 不要寫「原文」或「原文：」
- 不要重複使用者的句子
- 不要解釋、不要標點、不要多行
- 不要輸出時間戳

正確範例回覆：
[📌 待辦事項]`;

let engine = null;
let loading = null;
let status = "idle"; // idle | loading | ready | error | unsupported
let lastError = "";
let progressText = "";
const listeners = new Set();

function emit() {
  const snapshot = getState();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_) {}
  });
}

function getState() {
  return {
    status,
    progressText,
    lastError,
    modelId: MODEL_ID,
    ready: status === "ready",
  };
}

function supportsWebGPU() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

function cleanBody(text) {
  return String(text || "")
    .trim()
    .replace(/^原文\s*[：:]\s*/u, "")
    .replace(/^原句\s*[：:]\s*/u, "")
    .replace(/^句子\s*[：:]\s*/u, "")
    .replace(/^內容\s*[：:]\s*/u, "")
    .replace(/^['「『"\[]+|['」』"\]]+$/g, "")
    .replace(/\[[^\]]*\]/g, "") // 去掉誤混進來的標籤
    .replace(/\s+/g, " ")
    .trim();
}

function pickAllowedTag(rawAnswer) {
  const text = String(rawAnswer || "");
  for (const tag of ALLOWED_TAGS) {
    if (text.includes(tag)) return tag;
  }
  // 寬鬆：模型少打 emoji 時
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
  return "";
}

function punctuate(tag, body) {
  let out = cleanBody(body);
  if (!out) return "";
  if (/[。！？!?．]$/.test(out)) return out;
  if (/問題|疑問/.test(tag) || /[嗎呢]$/.test(out)) return `${out}？`;
  if (/驚訝/.test(tag)) return `${out}！`;
  return `${out}。`;
}

/**
 * 模型只負責選標籤；正文一律用使用者語音原文（避免出現「原文：」）
 */
function normalizeTagLine(rawAnswer, originalText) {
  const tag = pickAllowedTag(rawAnswer) || "[💬 一般陳述]";
  const body = punctuate(tag, originalText);
  if (!body) return "";
  return `${tag} ${body}`;
}

async function ensureEngine(onProgress) {
  if (engine && status === "ready") return engine;
  if (loading) return loading;

  if (!supportsWebGPU()) {
    status = "unsupported";
    lastError = "此瀏覽器不支援 WebGPU，已改用規則標籤";
    emit();
    throw new Error(lastError);
  }

  status = "loading";
  progressText = "準備下載本地模型…";
  emit();

  loading = (async () => {
    try {
      engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          progressText = report?.text || "載入中…";
          if (typeof onProgress === "function") onProgress(progressText, report);
          emit();
        },
      });
      status = "ready";
      progressText = "本地 AI 已就緒";
      lastError = "";
      emit();
      return engine;
    } catch (err) {
      status = "error";
      lastError = err?.message || String(err);
      progressText = "載入失敗";
      engine = null;
      emit();
      throw err;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

async function tag(text) {
  const original = String(text || "").trim();
  if (!original) return "";

  const eng = await ensureEngine();
  const reply = await eng.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `這句話該用哪個標籤？\n${original}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 24,
  });

  const content = reply?.choices?.[0]?.message?.content || "";
  return normalizeTagLine(content, original);
}

function onChange(fn) {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
}

window.WebLLMTagger = {
  MODEL_ID,
  supportsWebGPU,
  ensureEngine,
  tag,
  getState,
  onChange,
};

window.dispatchEvent(new Event("webllm-tagger-ready"));
console.info("[WebLLMTagger] module ready", MODEL_ID);
