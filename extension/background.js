const MENU_ID = "ai-read-aloud";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "AI 朗讀「%s」",
      contexts: ["selection"],
    });
  });

  chrome.storage.sync.get(null, (items) => {
    const defaults = {
      rate: 1,
      pitch: 1,
      voiceURI: "",
      lang: "auto",
    };
    const patch = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (items[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) chrome.storage.sync.set(patch);
  });
});

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "STATUS" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["lib/language.js", "lib/tts.js", "content.js"],
      });
      return true;
    } catch (err) {
      console.warn("無法注入 content script:", err);
      return false;
    }
  }
}

async function speakOnTab(tabId, text) {
  const ok = await ensureContentScript(tabId);
  if (!ok) {
    return {
      ok: false,
      error: "此頁面無法朗讀（例如 chrome:// 或擴充功能商店頁）",
    };
  }

  try {
    return await chrome.tabs.sendMessage(tabId, { type: "SPEAK", text });
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText || !tab?.id) return;
  const result = await speakOnTab(tab.id, info.selectionText);
  if (!result?.ok) {
    console.warn("朗讀失敗:", result?.error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SPEAK_SELECTION" && sender.tab?.id) {
    speakOnTab(sender.tab.id, message.text).then(sendResponse);
    return true;
  }
});
