const els = {
  text: document.getElementById("text"),
  interim: document.getElementById("interim"),
  rate: document.getElementById("rate"),
  rateValue: document.getElementById("rateValue"),
  lang: document.getElementById("lang"),
  voice: document.getElementById("voice"),
  btnListen: document.getElementById("btnListen"),
  btnSpeak: document.getElementById("btnSpeak"),
  btnPause: document.getElementById("btnPause"),
  btnStop: document.getElementById("btnStop"),
  status: document.getElementById("status"),
};

let paused = false;
let listening = false;
let wantListen = false;
let stt = null;
const tagState = AutoTag.createTaggerState();

function setStatus(msg, isError = false) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", Boolean(isError));
}

function formatRate(v) {
  return `${Number(v).toFixed(2).replace(/\.?0+$/, "")}x`;
}

function updateRateLabel() {
  els.rateValue.textContent = formatRate(els.rate.value);
}

async function saveSettings() {
  await chrome.storage.sync.set({
    rate: Number(els.rate.value),
    lang: els.lang.value,
    voiceURI: els.voice.value,
  });
}

async function loadVoicesIntoSelect(preferredURI) {
  const voices = await TTSEngine.listVoices();
  const current = preferredURI || els.voice.value;
  els.voice.innerHTML = '<option value="">自動挑選最佳聲音</option>';
  voices
    .slice()
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      els.voice.appendChild(opt);
    });
  if (current && [...els.voice.options].some((o) => o.value === current)) {
    els.voice.value = current;
  }
}

function writeTagged(tagged) {
  if (!tagged) return;
  els.text.value += tagged;
  els.text.scrollTop = els.text.scrollHeight;
  setStatus(`已加標籤：${tagged.trim().slice(0, 40)}…`);
}

function onFlushRaw(raw, meta) {
  const tagged = AutoTag.withTimeline(AutoTag.tagByRules(raw), meta);
  writeTagged(tagged);
}

function appendFinal(text) {
  AutoTag.pushChunk(tagState, text, onFlushRaw, 900);
}

function ensureStt() {
  const lang = els.lang.value === "auto" ? "zh-TW" : els.lang.value;
  stt = STTEngine.create({
    lang,
    continuous: true,
    interimResults: true,
    onStart: () => {
      listening = true;
      els.btnListen.textContent = "停止聽寫";
      els.btnListen.classList.add("active");
      setStatus("請說話；停頓約 1 秒自動加標籤");
    },
    onResult: (t) => {
      appendFinal(t);
      els.interim.textContent = tagState.buffer ? `累積中：${tagState.buffer}…` : "";
    },
    onInterim: (t) => {
      const pending = tagState.buffer ? `${tagState.buffer} ` : "";
      els.interim.textContent = `辨識中：${pending}${t}`;
    },
    onError: (err) => {
      if (err === "not-allowed") {
        setStatus("請允許麥克風權限", true);
        wantListen = false;
      } else if (err !== "no-speech" && err !== "aborted") {
        setStatus(`辨識錯誤：${err}`, true);
      }
    },
    onEnd: () => {
      listening = false;
      els.btnListen.textContent = "開始聽寫";
      els.btnListen.classList.remove("active");
      AutoTag.flushBuffer(tagState, onFlushRaw);
      els.interim.textContent = "";
      if (wantListen) {
        setTimeout(() => {
          if (wantListen) startListen(true);
        }, 250);
      } else {
        setStatus("聽寫已結束");
      }
    },
  });
}

function startListen(isRestart = false) {
  if (!STTEngine.supported) {
    setStatus("此瀏覽器不支援語音辨識", true);
    return;
  }
  wantListen = true;
  TTSEngine.stop();
  if (!isRestart) AutoTag.resetSession(tagState);
  ensureStt();
  try {
    stt.start();
    if (!isRestart) setStatus("正在啟動麥克風…");
  } catch (err) {
    setStatus(String(err.message || err), true);
    wantListen = false;
  }
}

function stopListen() {
  wantListen = false;
  stt?.stop();
  AutoTag.flushBuffer(tagState, onFlushRaw);
}

async function init() {
  const settings = await TTSEngine.loadSettings();
  els.rate.value = settings.rate;
  els.lang.value = settings.lang === "auto" ? "auto" : settings.lang || "zh-TW";
  updateRateLabel();
  await loadVoicesIntoSelect(settings.voiceURI);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || "",
      });
      if (result?.trim()) els.text.value = result.trim();
    }
  } catch {
    // ignore
  }

  if (!STTEngine.supported) {
    setStatus("朗讀可用；聽寫需 Chrome／Edge");
  } else {
    setStatus("就緒：聽寫會自動加標籤");
  }
}

els.rate.addEventListener("input", () => {
  updateRateLabel();
  saveSettings();
});

document.querySelectorAll(".chip[data-rate]").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.rate.value = btn.dataset.rate;
    updateRateLabel();
    saveSettings();
  });
});

els.lang.addEventListener("change", saveSettings);
els.voice.addEventListener("change", saveSettings);

els.btnListen.addEventListener("click", () => {
  if (wantListen || listening) stopListen();
  else startListen();
});

els.btnSpeak.addEventListener("click", async () => {
  const raw = els.text.value.trim();
  if (!raw) {
    setStatus("請先聽寫或輸入文字", true);
    return;
  }
  const text = AutoTag.stripTagsForSpeech(raw);
  if (!text) {
    setStatus("沒有可朗讀的正文", true);
    return;
  }
  stopListen();
  await saveSettings();
  paused = false;
  els.btnPause.textContent = "暫停朗讀";
  setStatus("朗讀中（略過標籤）…");
  const result = await TTSEngine.speak(text, {
    rate: Number(els.rate.value),
    lang: els.lang.value,
    voiceURI: els.voice.value,
  });
  if (result.ok) {
    setStatus(
      result.voice
        ? `完成（${result.lang} · ${result.voice}）`
        : `完成（${result.lang}）`
    );
  } else {
    setStatus(result.error || "播放失敗", true);
  }
});

els.btnPause.addEventListener("click", () => {
  const status = TTSEngine.getStatus();
  if (!status.speaking && !status.paused) {
    setStatus("目前沒有在朗讀");
    return;
  }
  if (!paused) {
    TTSEngine.pause();
    paused = true;
    els.btnPause.textContent = "繼續朗讀";
    setStatus("朗讀已暫停");
  } else {
    TTSEngine.resume();
    paused = false;
    els.btnPause.textContent = "暫停朗讀";
    setStatus("繼續朗讀…");
  }
});

els.btnStop.addEventListener("click", () => {
  stopListen();
  TTSEngine.stop();
  paused = false;
  els.btnPause.textContent = "暫停朗讀";
  setStatus("已全部停止");
});

init().catch((err) => setStatus(String(err), true));
