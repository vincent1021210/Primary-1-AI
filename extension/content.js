/**
 * 在網頁環境執行 Web Speech API（MV3 service worker 無法使用 speechSynthesis）
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "SPEAK") {
    TTSEngine.speak(message.text)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "STOP") {
    TTSEngine.stop();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "PAUSE") {
    TTSEngine.pause();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "RESUME") {
    TTSEngine.resume();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "STATUS") {
    sendResponse(TTSEngine.getStatus());
    return false;
  }
});
