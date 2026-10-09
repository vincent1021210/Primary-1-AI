/**
 * Web Speech API 封裝（供 content script / popup 共用）
 * Service Worker 無法使用 speechSynthesis，請勿在 background 引用。
 */
(function (global) {
  const DEFAULTS = {
    rate: 1,
    pitch: 1,
    voiceURI: "",
    lang: "auto",
  };

  function getSynth() {
    return global.speechSynthesis;
  }

  function waitForVoices(timeoutMs = 1500) {
    const synth = getSynth();
    const existing = synth.getVoices();
    if (existing.length) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let done = false;
      const finish = (voices) => {
        if (done) return;
        done = true;
        synth.removeEventListener("voiceschanged", onChange);
        resolve(voices);
      };
      const onChange = () => finish(synth.getVoices());
      synth.addEventListener("voiceschanged", onChange);
      setTimeout(() => finish(synth.getVoices()), timeoutMs);
    });
  }

  function isGoogleTaiwanMandarin(voice) {
    const name = voice?.name || "";
    const vLang = (voice?.lang || "").toLowerCase();
    const isZhTw = vLang === "zh-tw" || vLang === "zh_tw";
    const isGoogle = /Google/i.test(name);
    const isGuoyuTw = /國語/.test(name) && /台灣|臺灣|Taiwan/i.test(name);
    return (isGoogle && isGuoyuTw) || (isGoogle && isZhTw && /國語|Taiwan|台灣|臺灣/i.test(name + vLang));
  }

  function scoreVoice(voice, lang) {
    let score = 0;
    const name = voice.name || "";
    const vLang = voice.lang || "";

    // 預設偏好：Google 國語（台灣）zh-TW
    if (isGoogleTaiwanMandarin(voice) && (lang === "zh-TW" || !lang)) score += 120;

    if (vLang === lang) score += 50;
    else if (vLang.startsWith(lang.split("-")[0])) score += 30;

    if (/Google/i.test(name)) score += 25;
    if (/國語/.test(name) && /台灣|臺灣|Taiwan/i.test(name)) score += 40;
    if (/Microsoft/i.test(name)) score += 18;
    if (/Natural|Neural|Online/i.test(name)) score += 12;
    if (/Hanhan|Mei-Jia|HsiaoChen|YunJhe|HsiaoYu/i.test(name)) score += 15;
    if (voice.localService === false) score += 5;

    return score;
  }

  async function pickVoice(lang, preferredURI) {
    const voices = await waitForVoices();
    if (!voices.length) return null;

    if (preferredURI) {
      const exact = voices.find((v) => v.voiceURI === preferredURI);
      if (exact) return exact;
    }

    const ranked = [...voices].sort(
      (a, b) => scoreVoice(b, lang) - scoreVoice(a, lang)
    );
    return ranked[0] || null;
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      if (!global.chrome?.storage?.sync) {
        resolve({ ...DEFAULTS });
        return;
      }
      chrome.storage.sync.get(DEFAULTS, (items) => {
        resolve({ ...DEFAULTS, ...items });
      });
    });
  }

  async function speak(text, overrides = {}) {
    const synth = getSynth();
    const raw = String(text || "").trim();
    if (!raw) return { ok: false, error: "沒有可朗讀的文字" };

    const settings = await loadSettings();
    const rate = Number(overrides.rate ?? settings.rate) || 1;
    const pitch = Number(overrides.pitch ?? settings.pitch) || 1;
    const voiceURI = overrides.voiceURI ?? settings.voiceURI;
    const langSetting = overrides.lang ?? settings.lang;

    const lang =
      langSetting === "auto"
        ? global.TTSLanguage?.detectLang(raw) || "zh-TW"
        : langSetting;

    synth.cancel();

    const utter = new SpeechSynthesisUtterance(raw);
    utter.lang = lang;
    utter.rate = Math.min(2, Math.max(0.5, rate));
    utter.pitch = Math.min(2, Math.max(0, pitch));

    const voice = await pickVoice(lang, voiceURI);
    if (voice) {
      utter.voice = voice;
      if (voice.lang) utter.lang = voice.lang;
    }

    return new Promise((resolve) => {
      utter.onend = () => resolve({ ok: true, lang, voice: voice?.name || "" });
      utter.onerror = (e) =>
        resolve({ ok: false, error: e.error || "播放失敗" });
      synth.speak(utter);
    });
  }

  function pause() {
    getSynth().pause();
  }

  function resume() {
    getSynth().resume();
  }

  function stop() {
    getSynth().cancel();
  }

  function getStatus() {
    const synth = getSynth();
    return {
      speaking: synth.speaking,
      paused: synth.paused,
      pending: synth.pending,
    };
  }

  async function listVoices() {
    const voices = await waitForVoices();
    return voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      localService: v.localService,
    }));
  }

  global.TTSEngine = {
    DEFAULTS,
    speak,
    pause,
    resume,
    stop,
    getStatus,
    listVoices,
    loadSettings,
    waitForVoices,
    pickVoice,
  };
})(typeof self !== "undefined" ? self : window);
