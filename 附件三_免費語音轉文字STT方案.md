# 附件三：免費零成本 STT 方案（Web Speech API · SpeechRecognition）

> 定位：完全免費、不限字數與時間、無需後端與 API Key 的語音轉文字（STT）方案。

---

## 1. 核心技術：Web Speech API（SpeechRecognition）

| 項目 | 說明 |
|------|------|
| 推薦理由 | Chrome／Edge 內建語音辨識；背後使用 Google／微軟雲端引擎，繁中辨識率高且免費 |
| 成本 | **無需** OpenAI Whisper 等付費 API；無後端伺服器 |
| 限制 | 需在 **HTTPS**、**localhost**，或 Chrome 擴充功能 Popup／Side Panel 中運作；辨識時分頁會出現麥克風圖示 |
| 不支援 | 純 `file://` 開啟、無麥克風權限、部分非 Chromium 瀏覽器 |

---

## 2. 核心實作程式碼（極簡前端範例）

可放入 Chrome 插件 Popup、Side Panel，或本機 `localhost` 網頁：

```javascript
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.log("抱歉，您的瀏覽器不支援免費語音辨識。");
} else {
  const recognition = new SpeechRecognition();

  recognition.lang = "zh-TW";
  recognition.continuous = true;     // 長時間聽寫，不因一句話結束就停
  recognition.interimResults = true; // 即時顯示暫定結果

  recognition.start();
  console.log("麥克風已啟動，請開始說話...");

  recognition.onresult = (event) => {
    let resultText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      resultText += event.results[i][0].transcript;
    }
    console.log("辨識結果: ", resultText);
  };

  recognition.onerror = (event) => {
    console.error("語音辨識發生錯誤: ", event.error);
  };

  // recognition.stop();
}
```

### 實作注意事項

- 必須先取得麥克風權限；首次使用瀏覽器會跳出授權提示。
- `continuous` 模式在長時間閒置後可能自動結束，需在 `onend` 依需求重啟。
- 預設結果**通常不含標點**，需自行補「，」「。」等斷句邏輯。

---

## 3. 免費 STT 插件亮點 UX

### 3.1 語音輸入法助理

在網頁 `<input>`／`<textarea>` 旁加麥克風圖示，點擊後說話，自動填入繁中文字。

### 3.2 即時會議聽寫／字幕（Side Panel）

一邊看 YouTube／Coursera 或開 Meet，一邊在側邊欄產生中文字幕與逐字稿。

### 3.3 智慧標點與斷句

偵測停頓超過約 **1.5 秒** 自動補「，」或「。」，提升逐字稿可讀性。

---

## 4. 場景選擇

| 場景 | 建議 |
|------|------|
| 網頁語音代替鍵盤（搜尋、回覆） | Web Speech API + 注入輸入框 |
| 會議／影片即時逐字稿 | Side Panel + continuous 聽寫 |
| 上傳 MP3 轉文字 | **不適用**本方案；需 Whisper 等離線／開源模型 |

**本附件結論：** 即時麥克風聽寫首選 **SpeechRecognition**；檔案轉寫另開技術線。
