/**
 * Web Speech API SpeechRecognition 封裝（Popup / 頁面用）
 */
(function (global) {
  const SpeechRecognition =
    global.SpeechRecognition || global.webkitSpeechRecognition;

  function create({
    lang = "zh-TW",
    continuous = true,
    interimResults = true,
    onResult,
    onInterim,
    onError,
    onStart,
    onEnd,
  } = {}) {
    if (!SpeechRecognition) {
      return {
        supported: false,
        start() {},
        stop() {},
      };
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => onStart && onStart();
    recognition.onerror = (e) => onError && onError(e.error || "unknown");
    recognition.onend = () => onEnd && onEnd();
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r[0].transcript;
        if (r.isFinal) onResult && onResult(t);
        else interim += t;
      }
      if (interim && onInterim) onInterim(interim);
    };

    return {
      supported: true,
      start() {
        recognition.lang = lang;
        recognition.start();
      },
      stop() {
        try {
          recognition.stop();
        } catch (_) {}
      },
      setLang(next) {
        lang = next;
      },
    };
  }

  global.STTEngine = { supported: Boolean(SpeechRecognition), create };
})(typeof self !== "undefined" ? self : window);
