/**
 * 喚醒詞「小一小一」或「你好」：支援連著說或分開說
 * - 連著：小一小一幫我搜尋天氣／你好算二十三乘四十五
 * - 分開：先說小一小一（或你好）→ 停頓 → 再說指令
 */
(function (global) {
  const WAKE_WORDS = [
    "小一小一",
    "小一，小一",
    "小一 小一",
    "小醫小醫",
    "小依小依",
    "小伊小伊",
    "宵一小一",
    "曉一小一",
    // 「你好」也可喚醒並開啟後續功能
    "你好",
    "您好",
  ];

  /** 喚醒後等待指令的時間（毫秒） */
  const AWAKE_TIMEOUT_MS = 20000;

  /** 合併 Android 常切成多段的辨識結果 */
  function mergeSpeechFragments(prev, next) {
    const ca = cleanText(prev);
    const cb = cleanText(next);
    if (!ca) return cb || String(next || "").trim();
    if (!cb) return ca;
    if (cb.includes(ca)) return cb;
    if (ca.includes(cb)) return ca;
    for (let n = Math.min(ca.length, cb.length); n >= 2; n--) {
      if (ca.endsWith(cb.slice(0, n))) return ca + cb.slice(n);
    }
    return ca + cb;
  }

  function cleanText(text) {
    return String(text || "").replace(/[\s，,。．？?、！!：:；;]/g, "");
  }

  function findWake(transcript) {
    const cleanTranscript = cleanText(transcript);
    if (!cleanTranscript) return null;

    // 同位置優先較長喚醒詞（避免「小一小一」被較短詞搶走）
    let matched = null;
    let wakeIndex = -1;
    for (const word of WAKE_WORDS) {
      const cleanWake = cleanText(word);
      if (!cleanWake) continue;
      const idx = cleanTranscript.indexOf(cleanWake);
      if (idx === -1) continue;
      if (
        wakeIndex === -1 ||
        idx < wakeIndex ||
        (idx === wakeIndex && cleanWake.length > matched.length)
      ) {
        matched = cleanWake;
        wakeIndex = idx;
      }
    }
    if (!matched || wakeIndex < 0) return null;

    return {
      wakeWord: matched,
      coreCommand: cleanTranscript.substring(wakeIndex + matched.length),
      cleanTranscript,
    };
  }

  function createSession(options = {}) {
    const timeoutMs = options.timeoutMs ?? AWAKE_TIMEOUT_MS;
    return {
      isAwake: false,
      wakeWord: "",
      commandBuffer: "",
      timeoutMs,
      timer: null,
      awakeAt: 0,
    };
  }

  function clearTimer(session) {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
  }

  function sleep(session) {
    clearTimer(session);
    session.isAwake = false;
    session.wakeWord = "";
    session.commandBuffer = "";
    session.awakeAt = 0;
  }

  function armTimeout(session, onTimeout) {
    clearTimer(session);
    session.timer = setTimeout(() => {
      sleep(session);
      if (typeof onTimeout === "function") onTimeout();
    }, session.timeoutMs);
  }

  function wake(session, wakeWord, onTimeout) {
    session.isAwake = true;
    session.wakeWord = wakeWord || "小一小一";
    session.commandBuffer = "";
    session.awakeAt = Date.now();
    armTimeout(session, onTimeout);
  }

  /** 說完話後短暫續聽：不必再喊喚醒詞即可下指令 */
  function openFollowUp(session, ms, onTimeout, wakeWord) {
    clearTimer(session);
    session.isAwake = true;
    session.wakeWord = wakeWord || session.wakeWord || "小一小一";
    session.commandBuffer = "";
    session.awakeAt = Date.now();
    session.timer = setTimeout(() => {
      sleep(session);
      if (typeof onTimeout === "function") onTimeout();
    }, Math.max(500, Number(ms) || 5000));
  }

  /**
   * 處理單次辨識結果（interim 或 final）
   * @returns {{
   *   kind: 'ignore' | 'listening' | 'woke' | 'command_partial' | 'command_final' | 'woke_wait',
   *   coreCommand?: string,
   *   wakeWord?: string,
   *   transcript?: string,
   * }}
   */
  function processResult(session, transcript, isFinal, onTimeout) {
    const text = String(transcript || "").trim();
    const found = findWake(text);

    // 尚未喚醒：必須聽到喚醒詞
    if (!session.isAwake) {
      if (!found) {
        return { kind: isFinal ? "ignore" : "listening", transcript: text };
      }

      // 同一句就有命令：先累積，交由前端延遲確認（Android 常切段）
      if (found.coreCommand) {
        wake(session, found.wakeWord, onTimeout);
        session.commandBuffer = mergeSpeechFragments(
          session.commandBuffer,
          found.coreCommand
        );
        return {
          kind: "command_partial",
          coreCommand: session.commandBuffer,
          wakeWord: found.wakeWord,
          readyToCommit: Boolean(isFinal),
        };
      }

      // 只有喚醒詞 → 進入等待下一句（final 也不立刻追問，避免切段時搶答）
      wake(session, found.wakeWord, onTimeout);
      return {
        kind: isFinal ? "woke_wait" : "woke",
        wakeWord: found.wakeWord,
        coreCommand: "",
        readyToCommit: false,
      };
    }

    // 已喚醒：這段話整段當命令（可再含喚醒詞則裁切）
    armTimeout(session, onTimeout);
    let command = found ? found.coreCommand : cleanText(text);

    // 若又喊了一次喚醒詞且後面沒命令，維持等待
    if (found && !found.coreCommand) {
      return { kind: "woke_wait", wakeWord: found.wakeWord, coreCommand: "" };
    }

    if (!command) {
      return { kind: "woke_wait", wakeWord: session.wakeWord, coreCommand: "" };
    }

    session.commandBuffer = mergeSpeechFragments(session.commandBuffer, command);

    // 不再於 isFinal 立刻結束：等前端 debounce 湊齊片段
    return {
      kind: "command_partial",
      coreCommand: session.commandBuffer,
      wakeWord: session.wakeWord || found?.wakeWord || "小一小一",
      readyToCommit: Boolean(isFinal),
    };
  }

  /** 從口語指令精準擷取搜尋關鍵字（去掉動作詞） */
  function extractSearchKeyword(command) {
    let q = String(command || "").trim();
    // 取「搜尋／尋找／查一下／幫我查」之後的內容
    const m = q.match(/(?:搜尋|搜索|尋找|查一下|幫我查)\s*(.+)$/);
    if (m) q = m[1];
    q = q
      .replace(/^(幫我|請|請問|麻煩|一下)+/g, "")
      .replace(/[，,。.!！？?\s]+$/g, "")
      .trim();
    return q;
  }

  function isNavigateIntent(command) {
    return /導航|怎麼走|帶我去|帶我到|開車去|走路去/.test(String(command || ""));
  }

  function isNearbyIntent(command) {
    return /附近|在地|周邊|旁邊/.test(String(command || ""));
  }

  /** 「導航到129飯麵館」→「129飯麵館」（保留數字店名） */
  function extractNavigateDestination(command) {
    let q = String(command || "").trim();
    const m = q.match(
      /(?:導航(?:到|去|至)?|帶我(?:去|到)|開車去|走路去|騎車去|怎麼走(?:到)?|怎麼去)\s*(.+)$/
    );
    if (m) q = m[1];
    else {
      q = q
        .replace(/^(幫我|請|請問|麻煩)+/, "")
        .replace(/導航(?:到|去|至)?|帶我(?:去|到)|怎麼走(?:到)?|怎麼去/g, " ");
    }
    // 只去掉模式詞，勿動店名中的數字（如 129飯麵館）
    q = q
      .replace(/(?:^|\s)(?:用)?(?:開車|走路|步行|騎車|腳踏車|單車|大眾運輸|捷運|公車|自駕)(?:模式)?(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[，,。.!！？?\s]+$/g, "")
      .trim();
    return q || "目的地";
  }

  function extractTravelMode(command) {
    const c = String(command || "");
    if (/走路|步行|走走/.test(c)) return "walking";
    if (/騎車|腳踏車|單車|自行車/.test(c)) return "bicycling";
    if (/大眾運輸|捷運|公車|火車|高鐵|坐車/.test(c)) return "transit";
    if (/開車|開車去|開車到|自駕/.test(c)) return "driving";
    return "driving";
  }

  /** 「搜尋附近的美食」→「美食」 */
  function extractNearbyTarget(command) {
    let q = extractSearchKeyword(command) || String(command || "");
    q = q
      .replace(/附近|在地|周邊|旁邊|找一下|幫我找|幫我|請|請問|麻煩/g, " ")
      .replace(/的/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[，,。.!！？?\s]+$/g, "")
      .trim();
    return q || "美食";
  }

  function isMathIntent(command) {
    const c = String(command || "");
    // 避免與搜尋／導航／天氣搶意圖
    if (/搜尋|搜索|尋找|導航|天氣|附近|在地|播放|YouTube|油管/.test(c))
      return false;
    const hasNum = /[0-9零〇一二兩三四五六七八九十百千萬點.]/.test(c);
    if (!hasNum) return false;
    if (/算|計算|等於多少|是多少|幫我算/.test(c)) return true;
    // 「23 乘 45」「一百加五十」這類口語算式
    return /[0-9零〇一二兩三四五六七八九十百千萬]+.*(?:加|減|乘|除|加上|減去|乘以|除以|\+|－|×|÷|\*|\/).*[0-9零〇一二兩三四五六七八九十百千萬]/.test(
      c
    );
  }

  /** 去掉殘留喚醒詞後再判斷（支援「小一小一，你好」連著說） */
  function stripWakePrefix(command) {
    let c = cleanText(command);
    const wakes = WAKE_WORDS.map(cleanText).sort((a, b) => b.length - a.length);
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of wakes) {
        if (w && c.startsWith(w)) {
          c = c.slice(w.length);
          changed = true;
          break;
        }
      }
    }
    return c;
  }

  function isGreetingIntent(command) {
    const c = stripWakePrefix(command);
    if (!c) return false;
    // 單純打招呼；避免誤判長指令
    if (/搜尋|導航|計算|天氣|算|附近|介紹/.test(c)) return false;
    return /^(你好|您好|哈囉|嗨|hello|hi|早安|午安|晚安)+(啊|呀|喔|哦|嗎)?$/i.test(
      c
    );
  }

  /** 「請介紹自己」「你是誰」「你會什麼」→ 自我介紹 */
  function isSelfIntroIntent(command) {
    const c = stripWakePrefix(command);
    if (!c) return false;
    if (
      /介紹一下你自己|介紹你自己|介紹自己|自我介紹|你是誰|妳是誰|你叫什麼|妳叫什麼|你是什麼|妳是什麼|你會什麼|妳會什麼|有什麼功能|能做什麼|可以做什麼|你能做什麼|妳能做什麼|about you|who are you|what can you do/i.test(
        c
      )
    ) {
      return true;
    }
    // 「請介紹自己」「幫我介紹一下你」
    if (/介紹/.test(c) && /自己|你|妳|小一/.test(c)) return true;
    return false;
  }

  function classifyCommand(command) {
    const c = String(command || "");
    if (/傳訊息|傳簡訊|寄訊息|發訊息/.test(c)) {
      return { type: "message", label: "傳訊息", detail: c };
    }
    // 「請介紹自己」→ 功能說明（優先於打招呼）
    if (isSelfIntroIntent(c)) {
      return {
        type: "self_intro",
        label: "自我介紹",
        detail: stripWakePrefix(c) || c,
      };
    }
    // 「你好」／「小一小一，你好」→ 回「你好」
    if (isGreetingIntent(c)) {
      return {
        type: "greeting",
        label: "打招呼",
        detail: stripWakePrefix(c) || c,
      };
    }
    // 「算二十三乘四十五」→ 本機安全計算（免 API）
    if (isMathIntent(c)) {
      return { type: "math", label: "計算", detail: c };
    }
    // 「導航到台北車站」→ GPS 起點 + Maps Directions URL
    if (isNavigateIntent(c)) {
      return {
        type: "navigate",
        label: "導航",
        detail: extractNavigateDestination(c),
        travelMode: extractTravelMode(c),
      };
    }
    // 「附近／在地」→ GPS + Google 地圖搜尋
    if (isNearbyIntent(c)) {
      return {
        type: "nearby_search",
        label: "附近搜尋",
        detail: extractNearbyTarget(c),
      };
    }
    // YouTube 播放（本機備援；優先仍走 Gemini ACTION_YOUTUBE）
    if (
      /youtube|油管|我想聽|我想看|播一下|播放|播個|播首|播一集/i.test(c) ||
      (/播/.test(c) && /影片|歌|音樂|頻道|最新/.test(c))
    ) {
      const detail = c
        .replace(
          /youtube|油管|我想聽|我想看|幫我|請|在|上面|播放|播一下|播個|播首|播一集|播|的影片|影片|的歌|歌曲|音樂|頻道|最新那一集|那一集/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();
      return {
        type: "youtube",
        label: "YouTube 播放",
        detail: detail || c,
      };
    }
    // 明確「搜尋／尋找」→ Google；純天氣用語另走頁內氣象
    if (/搜尋|搜索|尋找|查一下|幫我查/.test(c)) {
      const keyword = extractSearchKeyword(c);
      return {
        type: "google_search",
        label: "Google 搜尋",
        detail: keyword || c,
      };
    }
    if (/天氣|氣溫|氣象|預報|weather/.test(c)) {
      return { type: "search", label: "天氣", detail: c };
    }
    if (/朗讀|念出來|讀給我聽/.test(c)) {
      return { type: "speak", label: "朗讀", detail: c };
    }
    if (/清空|清除|刪掉文字/.test(c)) {
      return { type: "clear", label: "清空", detail: c };
    }
    return { type: "custom", label: "自訂指令", detail: c };
  }

  global.WakeWord = {
    WAKE_WORDS,
    AWAKE_TIMEOUT_MS,
    cleanText,
    mergeSpeechFragments,
    findWake,
    extractFromTranscript: (t) => {
      const f = findWake(t);
      return f
        ? { awake: true, wakeWord: f.wakeWord, coreCommand: f.coreCommand }
        : null;
    },
    createSession,
    sleep,
    wake,
    armTimeout,
    openFollowUp,
    processResult,
    isSelfIntroIntent,
    extractSearchKeyword,
    isNavigateIntent,
    isNearbyIntent,
    extractNavigateDestination,
    extractTravelMode,
    extractNearbyTarget,
    isMathIntent,
    stripWakePrefix,
    isGreetingIntent,
    classifyCommand,
  };
})(typeof self !== "undefined" ? self : window);
