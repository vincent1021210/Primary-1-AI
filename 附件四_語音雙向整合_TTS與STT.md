# 附件四：語音雙向整合（TTS 朗讀 + STT 聽寫）

> 將「文字轉語音」與「語音轉文字」融合成同一套免費語音助手。

---

## 1. 產品定位

| 方向 | 技術 | 附件 |
|------|------|------|
| 文字 → 語音（朗讀） | `speechSynthesis`／系統 SAPI | 附件一、本機 `tts_app.py` |
| 語音 → 文字（聽寫） | `SpeechRecognition` | 附件三 |
| **雙向融合** | 同一 UI：聽寫進文字框 → 一鍵朗讀回放 | **本附件** |

使用者流程：

```
[說話] → STT 寫入文字框 →（可編輯／加標點）→ TTS 朗讀
[貼上文字] → TTS 朗讀
[聽寫中的暫定字] → 即時顯示 → 定稿後可再朗讀核對
```

---

## 2. 本專案交付物

| 路徑 | 說明 |
|------|------|
| `desktop/voice_studio.html` | 本機雙向語音工作室（TTS + STT） |
| `desktop/launch_studio.py` | 啟動 localhost 並開啟瀏覽器 |
| `啟動語音助手.bat` | 一鍵啟動融合版 |
| `extension/` | Chrome 插件：右鍵朗讀 + Popup 聽寫／朗讀 |
| `desktop/tts_app.py` | 純系統語音朗讀視窗（離線朗讀備援） |

---

## 3. 架構（零後端）

```
本機 Python 靜態伺服器 (localhost)
        ↓
瀏覽器頁面 voice_studio
        ├─ SpeechRecognition  → 麥克風 → 文字框
        └─ speechSynthesis    → 文字框 → 喇叭

Chrome 擴充功能
        ├─ Context Menu + content script → TTS
        └─ Popup → STT + TTS（同一文字框）
```

- **STT** 依賴 Chromium 內建辨識（需網路至 Google／微軟引擎，但**不需自備 API Key**）。
- **TTS** 可用瀏覽器語音包，或本機 SAPI（`tts_app.py`）。

---

## 4. 融合 UX 重點

1. **單一文字區**：聽寫結果與朗讀來源共用。  
2. **聽寫 → 朗讀**：方便核對辨識是否正確。  
3. **語速／語言**：TTS 與 STT 語言設定對齊（預設 `zh-TW`）。  
4. **簡易標點**：停頓逾 1.5 秒自動補標點。  
5. **狀態列**：顯示「聽寫中／朗讀中／已停止」。

---

## 5. 結論

免費路徑下，**不必**分別做兩個產品：以同一個文字框串起 STT 與 TTS，即為完整的「語音進、語音出」助手。檔案 MP3 轉寫屬另一路線，不納入本融合版範圍。
