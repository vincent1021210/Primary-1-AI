/**
 * 簡易語言偵測：中文 / 英文 / 其他（預設 zh-TW）
 */
(function (global) {
  function detectLang(text) {
    const sample = String(text || "").slice(0, 400);
    if (!sample.trim()) return "zh-TW";

    const cjk = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (sample.match(/[A-Za-z]/g) || []).length;
    const total = Math.max(cjk + latin, 1);

    if (cjk / total >= 0.25 || cjk >= 4) return "zh-TW";
    if (latin / total >= 0.5) return "en-US";
    return "zh-TW";
  }

  global.TTSLanguage = { detectLang };
})(typeof self !== "undefined" ? self : window);
