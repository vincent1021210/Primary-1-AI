# 手機「小一小一」喚醒檢查報告

## 結論

專案**已具備**方案 A + 方案 B，不是空白模擬。黑屏／關 App 後仍無法像系統 Google 助理，是 Android 權限限制，不是缺程式。

| 能力 | 狀態 | 位置 |
|------|------|------|
| 方案 B：螢幕常亮 Wake Lock | ✅ | `mobile/voice_studio.js` → `requestScreenWakeLock` |
| 方案 B：兩階段喚醒（喚醒詞 → 指令） | ✅ | `desktop/wake_word.js` + `processAssembledWakeSpeech` |
| 喚醒後回「在！」+ TTS 暫停麥克風 | ✅ | `speakText` / `ttsPausedListen` |
| 喚醒震動反饋 | ✅（本次補上） | `navigator.vibrate` |
| Gemini 真實 API（非模擬） | ✅ | `desktop/gemini_tagger.js` → `generativelanguage.googleapis.com` |
| 方案 A：前台服務背景聽 | ✅（需重裝含此碼的 APK） | `VoiceAssistantService.java` |

## 正確使用方式（方案 B，推薦）

1. 打開小一 App，畫面保持在前景  
2. **點麥克風**啟動「常亮守護」  
3. 喊「小一小一」→ 震動／回「在！」→ 再說指令  

關掉 App 或鎖屏後，網頁麥克風會被系統關掉——這是正常現象。

## 方案 A（背景）注意

- 需常駐通知「小一正在背景聆聽」  
- 耗電、狀態列麥克風綠點  
- 部分廠商省電策略仍可能殺服務；無法保證等同 Google 硬體熱詞引擎  

## Gemini

無需再接「模擬大腦」替換碼；已走官方 `generateContent`。金鑰放 `config.local.js` 或本機 `localStorage.xiaoYiGeminiApiKey`。
