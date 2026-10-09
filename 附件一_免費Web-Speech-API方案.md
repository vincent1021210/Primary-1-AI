# 附件一：免費零成本 TTS 方案（Web Speech API）

> 定位：完全免費、無需後端伺服器、零營運成本的文字轉語音（TTS）插件方案。

---

## 1. 核心技術：Web Speech API（SpeechSynthesis）

| 項目 | 說明 |
|------|------|
| 推薦理由 | Chrome、Edge、Safari 等現代瀏覽器皆內建，完全免費的 JavaScript API |
| 語音來源 | 直接調用使用者電腦／手機系統語音包（如 Windows Microsoft Hanhan、Mac Mei-Jia、Google 內建語音） |
| 音質表現 | Edge／Chrome 內建語音（尤其 Edge 線上自然語音）流暢且有感情，足以對標多數付費方案的日常朗讀需求 |
| 成本 | **無需** OpenAI／ElevenLabs API Key；使用者免付費；無字數限制 |

---

## 2. 核心實作程式碼（極簡前端範例）

可直接整合進 Chrome 插件、Figma 插件或網頁前端：

```javascript
// 1. 初始化語音播放物件
const synth = window.speechSynthesis;

// 2. 建立要朗讀的文字內容
const utterThis = new SpeechSynthesisUtterance(
  "你好，這是一段完全免費的 AI 語音合成測試。"
);

// 3. 設定語音參數（選填）
utterThis.lang = "zh-TW"; // 繁體中文
utterThis.rate = 1.0;     // 語速 (0.5 ~ 2)
utterThis.pitch = 1.0;    // 音高 (0 ~ 2)

// 4. 挑選特定聲音（優先 Microsoft / Google 中文）
window.speechSynthesis.onvoiceschanged = () => {
  const voices = synth.getVoices();
  const preferredVoice = voices.find(
    (voice) =>
      voice.lang.includes("zh-TW") && voice.name.includes("Google")
  );
  if (preferredVoice) {
    utterThis.voice = preferredVoice;
  }
};

// 5. 開始播放
synth.speak(utterThis);

// 可選控制
// synth.pause();   // 暫停
// synth.resume();  // 繼續
// synth.cancel();  // 停止
```

### 實作注意事項

- `getVoices()` 在部分瀏覽器需等 `voiceschanged` 事件後才有完整清單。
- 語音清單隨作業系統與瀏覽器而異，建議做「可用語音列表」讓使用者自選。
- 長文建議分段 `speak()`，避免單次 utterance 過長導致中斷。

---

## 3. 免費插件亮點 UX 設計

既然技術成本為零，重點放在體驗優化：

### 3.1 右鍵一鍵朗讀（Context Menu）

使用者反白網頁文字 → 右鍵選「AI 朗讀」→ 插件自動以語音朗讀選取內容。

### 3.2 背景播放與語速調整

在 Popup 提供滑桿，支援約 **1.25x／1.5x** 等語速，適合長文、新聞、小說收聽。

### 3.3 多國語言自動偵測

以簡單 RegEx 或輕量套件判斷中／英文，自動設定：

- 中文：`utterThis.lang = "zh-TW"`
- 英文：`utterThis.lang = "en-US"`

避免發音腔調錯亂。

---

## 4. 適用場景結論

| 適合 | 不適合 |
|------|--------|
| 瀏覽器朗讀插件、選取即讀 | 需聲音克隆、情緒細控 |
| 零預算 MVP／個人工具 | 需穩定跨裝置統一音色 |
| 無後端、純前端部署 | 需伺服器端批次合成音檔 |

**本附件結論：** 若目標是「免費 + 免維運」，首選 **Web Speech API**，把開發精力放在右鍵朗讀、語速與語言偵測等 UX。
