/**
 * 小一 AI 語音助理 — Apps Script 帳號資料庫
 * 註冊：Gmail + 郵件驗證碼；密碼至少 8 碼
 *
 * 部署步驟見同資料夾 README.md
 */

var SPREADSHEET_NAME = "小一助理帳號庫";
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
var CODE_TTL_MS = 10 * 60 * 1000; // 驗證碼 10 分鐘
var CODE_COOLDOWN_MS = 60 * 1000; // 重寄間隔 60 秒
var MIN_PASSWORD_LEN = 8;

function doGet(e) {
  return jsonOut_({
    ok: true,
    service: "xiao-yi-auth",
    hint:
      "POST：sendRegisterCode|register|login|getSecurityQuestion|resetPassword|logout|me|appendHistory|listHistory|geminiAssist",
  });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    var body = JSON.parse(raw);
    var action = String(body.action || "").toLowerCase();

    if (action === "sendregistercode" || action === "send_register_code") {
      return jsonOut_(sendRegisterCode_(body));
    }
    if (action === "register") return jsonOut_(register_(body));
    if (action === "login") return jsonOut_(login_(body));
    if (
      action === "getsecurityquestion" ||
      action === "get_security_question"
    ) {
      return jsonOut_(getSecurityQuestion_(body));
    }
    if (action === "resetpassword" || action === "reset_password") {
      return jsonOut_(resetPassword_(body));
    }
    if (action === "logout") return jsonOut_(logout_(body));
    if (action === "me") return jsonOut_(me_(body));
    if (action === "appendhistory" || action === "append_history") {
      return jsonOut_(appendHistory_(body));
    }
    if (action === "listhistory" || action === "list_history") {
      return jsonOut_(listHistory_(body));
    }
    if (action === "geminiassist" || action === "gemini_assist") {
      return jsonOut_(geminiAssist_(body));
    }

    return jsonOut_({ ok: false, error: "未知 action" });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SPREADSHEET_ID");
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      /* 重建 */
    }
  }
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty("SPREADSHEET_ID", ss.getId());
  ensureSheets_(ss);
  return ss;
}

function ensureSheets_(ss) {
  var keep = { Users: 1, Sessions: 1, History: 1, Pending: 1 };
  var users = ss.getSheetByName("Users") || ss.insertSheet("Users");
  if (users.getLastRow() === 0) {
    users.appendRow([
      "account",
      "displayName",
      "salt",
      "passwordHash",
      "createdAt",
      "securityQuestion",
      "answerHash",
    ]);
  } else {
    // 舊表升級：補安全問題欄
    var uh = users.getRange(1, 1, 1, Math.max(7, users.getLastColumn())).getValues()[0];
    if (String(uh[5] || "") !== "securityQuestion") {
      users.getRange(1, 6).setValue("securityQuestion");
    }
    if (String(uh[6] || "") !== "answerHash") {
      users.getRange(1, 7).setValue("answerHash");
    }
  }
  var sessions = ss.getSheetByName("Sessions") || ss.insertSheet("Sessions");
  if (sessions.getLastRow() === 0) {
    sessions.appendRow(["token", "account", "expiresAt", "createdAt"]);
  }
  var history = ss.getSheetByName("History") || ss.insertSheet("History");
  if (history.getLastRow() === 0) {
    history.appendRow(["account", "line", "createdAt"]);
  }
  var pending = ss.getSheetByName("Pending") || ss.insertSheet("Pending");
  if (pending.getLastRow() === 0) {
    pending.appendRow([
      "account",
      "displayName",
      "salt",
      "passwordHash",
      "codeHash",
      "expiresAt",
      "sentAt",
      "securityQuestion",
      "answerHash",
    ]);
  } else {
    var ph = pending.getRange(1, 1, 1, Math.max(9, pending.getLastColumn())).getValues()[0];
    if (String(ph[7] || "") !== "securityQuestion") {
      pending.getRange(1, 8).setValue("securityQuestion");
    }
    if (String(ph[8] || "") !== "answerHash") {
      pending.getRange(1, 9).setValue("answerHash");
    }
  }
  var sheets = ss.getSheets();
  for (var i = sheets.length - 1; i >= 0; i--) {
    var n = sheets[i].getName();
    if (!keep[n]) ss.deleteSheet(sheets[i]);
  }
}

function usersSheet_() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  return ss.getSheetByName("Users");
}

function sessionsSheet_() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  return ss.getSheetByName("Sessions");
}

function historySheet_() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  return ss.getSheetByName("History");
}

function pendingSheet_() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  return ss.getSheetByName("Pending");
}

function normalizeAccount_(account) {
  return String(account || "")
    .trim()
    .toLowerCase();
}

function isGmail_(account) {
  return /^[a-z0-9._%+-]+@gmail\.com$/i.test(String(account || "").trim());
}

function hashPassword_(password, salt) {
  var raw = String(password || "") + "::" + String(salt || "");
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

function normalizeAnswer_(answer) {
  return String(answer || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function bytesToHex_(bytes) {
  return bytes
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

function randomToken_() {
  return (
    Utilities.getUuid() +
    "-" +
    Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        String(Date.now()) + Math.random()
      )
    ).slice(0, 16)
  );
}

function randomCode6_() {
  var n = Math.floor(Math.random() * 1000000);
  return ("000000" + n).slice(-6);
}

function findUserRow_(account) {
  var sheet = usersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === account) {
      return {
        row: i + 1,
        account: data[i][0],
        displayName: data[i][1],
        salt: data[i][2],
        passwordHash: data[i][3],
        createdAt: data[i][4],
        securityQuestion: data[i][5] || "",
        answerHash: data[i][6] || "",
      };
    }
  }
  return null;
}

function findPendingRow_(account) {
  var sheet = pendingSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === account) {
      return {
        row: i + 1,
        account: data[i][0],
        displayName: data[i][1],
        salt: data[i][2],
        passwordHash: data[i][3],
        codeHash: data[i][4],
        expiresAt: data[i][5],
        sentAt: data[i][6],
        securityQuestion: data[i][7] || "",
        answerHash: data[i][8] || "",
      };
    }
  }
  return null;
}

function deletePending_(account) {
  var sheet = pendingSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).toLowerCase() === account) {
      sheet.deleteRow(i + 1);
    }
  }
}

function createSession_(account) {
  var token = randomToken_();
  var now = new Date();
  var expires = new Date(now.getTime() + TOKEN_TTL_MS);
  sessionsSheet_().appendRow([
    token,
    account,
    expires.toISOString(),
    now.toISOString(),
  ]);
  return { token: token, expiresAt: expires.toISOString() };
}

function resolveSession_(token) {
  token = String(token || "").trim();
  if (!token) return null;
  var sheet = sessionsSheet_();
  var data = sheet.getDataRange().getValues();
  var now = Date.now();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === token) {
      var exp = new Date(data[i][2]).getTime();
      if (!exp || exp < now) {
        sheet.deleteRow(i + 1);
        return null;
      }
      return { token: token, account: String(data[i][1]).toLowerCase() };
    }
  }
  return null;
}

/** 寄出 Gmail 驗證碼，並暫存待註冊資料 */
function sendRegisterCode_(body) {
  var account = normalizeAccount_(body.account);
  var password = String(body.password || "");
  var displayName = String(body.displayName || "").trim();
  var securityQuestion = String(body.securityQuestion || "").trim();
  var securityAnswer = normalizeAnswer_(body.securityAnswer);

  if (!isGmail_(account)) {
    return { ok: false, error: "註冊帳號必須是 Gmail（例：name@gmail.com）" };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: "密碼至少 " + MIN_PASSWORD_LEN + " 個字" };
  }
  if (!securityQuestion || !securityAnswer) {
    return { ok: false, error: "請設定安全問題與答案（忘記密碼用）" };
  }
  if (findUserRow_(account)) {
    return { ok: false, error: "此 Gmail 已被註冊，請直接登入" };
  }

  var existing = findPendingRow_(account);
  if (existing && existing.sentAt) {
    var last = new Date(existing.sentAt).getTime();
    if (Date.now() - last < CODE_COOLDOWN_MS) {
      return {
        ok: false,
        error: "請稍候再寄驗證碼（約 60 秒）",
      };
    }
  }

  var code = randomCode6_();
  var salt = Utilities.getUuid();
  var passwordHash = hashPassword_(password, salt);
  var codeHash = hashPassword_(code, salt);
  var answerHash = hashPassword_(securityAnswer, salt);
  var now = new Date();
  var expires = new Date(now.getTime() + CODE_TTL_MS);

  deletePending_(account);
  pendingSheet_().appendRow([
    account,
    displayName || account.split("@")[0],
    salt,
    passwordHash,
    codeHash,
    expires.toISOString(),
    now.toISOString(),
    securityQuestion,
    answerHash,
  ]);

  try {
    MailApp.sendEmail({
      to: account,
      subject: "【小一語音助理】註冊驗證碼",
      body:
        "您好，\n\n您的註冊驗證碼是：" +
        code +
        "\n\n驗證碼 10 分鐘內有效。若非本人操作，請忽略此信。\n\n— 小一 AI 語音助理",
    });
  } catch (mailErr) {
    deletePending_(account);
    return {
      ok: false,
      error:
        "無法寄送驗證信：" +
        String(mailErr && mailErr.message ? mailErr.message : mailErr),
    };
  }

  return {
    ok: true,
    account: account,
    message: "驗證碼已寄到 " + account + "，請於 10 分鐘內輸入",
  };
}

/** 以驗證碼完成註冊 */
function register_(body) {
  var account = normalizeAccount_(body.account);
  var code = String(body.code || "").trim();

  if (!isGmail_(account)) {
    return { ok: false, error: "註冊帳號必須是 Gmail" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "請輸入 6 位數驗證碼" };
  }
  if (findUserRow_(account)) {
    return { ok: false, error: "此 Gmail 已被註冊，請直接登入" };
  }

  var pending = findPendingRow_(account);
  if (!pending) {
    return { ok: false, error: "請先取得驗證碼" };
  }
  var exp = new Date(pending.expiresAt).getTime();
  if (!exp || exp < Date.now()) {
    deletePending_(account);
    return { ok: false, error: "驗證碼已過期，請重新寄送" };
  }
  var expect = hashPassword_(code, pending.salt);
  if (expect !== String(pending.codeHash)) {
    return { ok: false, error: "驗證碼錯誤" };
  }

  usersSheet_().appendRow([
    account,
    pending.displayName || account,
    pending.salt,
    pending.passwordHash,
    new Date().toISOString(),
    pending.securityQuestion || "",
    pending.answerHash || "",
  ]);
  deletePending_(account);

  var session = createSession_(account);
  return {
    ok: true,
    account: account,
    displayName: pending.displayName || account,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

function getSecurityQuestion_(body) {
  var account = normalizeAccount_(body.account);
  if (!account) {
    return { ok: false, error: "請先輸入帳號（Gmail）" };
  }
  var user = findUserRow_(account);
  if (!user) {
    return { ok: false, error: "找不到此帳號，請確認是否輸入正確" };
  }
  if (!user.securityQuestion || !user.answerHash) {
    return {
      ok: false,
      error:
        "此帳號尚未設定安全問題（舊帳號）。請用原密碼登入，或重新註冊新帳號。",
    };
  }
  return {
    ok: true,
    account: account,
    question: String(user.securityQuestion),
  };
}

function resetPassword_(body) {
  var account = normalizeAccount_(body.account);
  var answer = normalizeAnswer_(body.securityAnswer);
  var newPassword = String(body.newPassword || "");
  if (!account) return { ok: false, error: "請輸入帳號" };
  if (!answer) return { ok: false, error: "請輸入安全問題答案" };
  if (newPassword.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: "新密碼至少 " + MIN_PASSWORD_LEN + " 個字" };
  }
  var user = findUserRow_(account);
  if (!user) return { ok: false, error: "找不到此帳號" };
  if (!user.answerHash || !user.salt) {
    return { ok: false, error: "此帳號未設定安全問題，無法重設" };
  }
  var expect = hashPassword_(answer, user.salt);
  if (expect !== String(user.answerHash)) {
    return { ok: false, error: "安全問題答案不正確" };
  }
  var newHash = hashPassword_(newPassword, user.salt);
  usersSheet_().getRange(user.row, 4).setValue(newHash);
  // 清除該帳號既有工作階段，強制用新密碼重登
  var sheet = sessionsSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).toLowerCase() === account) {
      sheet.deleteRow(i + 1);
    }
  }
  return {
    ok: true,
    account: account,
    message: "密碼重設成功，請用新密碼登入",
  };
}

function login_(body) {
  var account = normalizeAccount_(body.account);
  var password = String(body.password || "");
  if (!account) {
    return { ok: false, error: "請輸入帳號（Gmail）" };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: "密碼至少 " + MIN_PASSWORD_LEN + " 個字" };
  }
  var user = findUserRow_(account);
  if (!user) {
    return { ok: false, error: "帳號或密碼錯誤" };
  }
  var hash = hashPassword_(password, user.salt);
  if (hash !== String(user.passwordHash)) {
    return { ok: false, error: "帳號或密碼錯誤" };
  }
  var session = createSession_(account);
  return {
    ok: true,
    account: account,
    displayName: user.displayName || account,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

function logout_(body) {
  var token = String(body.token || "").trim();
  if (!token) return { ok: true };
  var sheet = sessionsSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === token) {
      sheet.deleteRow(i + 1);
    }
  }
  return { ok: true };
}

function me_(body) {
  var session = resolveSession_(body.token);
  if (!session) return { ok: false, error: "未登入或工作階段已過期" };
  var user = findUserRow_(session.account);
  if (!user) return { ok: false, error: "帳號不存在" };
  return {
    ok: true,
    account: session.account,
    displayName: user.displayName || session.account,
  };
}

function appendHistory_(body) {
  var session = resolveSession_(body.token);
  if (!session) return { ok: false, error: "未登入或工作階段已過期" };
  var line = String(body.line || "").trim();
  if (!line) return { ok: false, error: "缺少紀錄內容" };
  historySheet_().appendRow([
    session.account,
    line.slice(0, 2000),
    new Date().toISOString(),
  ]);
  return { ok: true };
}

function listHistory_(body) {
  var session = resolveSession_(body.token);
  if (!session) return { ok: false, error: "未登入或工作階段已過期" };
  var limit = Math.min(50, Math.max(1, Number(body.limit) || 20));
  var sheet = historySheet_();
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = data.length - 1; i >= 1 && rows.length < limit; i--) {
    if (String(data[i][0]).toLowerCase() === session.account) {
      rows.push({ line: data[i][1], createdAt: data[i][2] });
    }
  }
  return { ok: true, items: rows };
}

/**
 * 語音／文字／圖片 → 後端持金鑰呼叫 Gemini 3.1 Flash-Lite
 * 金鑰請放「專案設定 → 指令碼屬性」：GEMINI_API_KEY（必要）、GEMINI_MODEL（可選）
 *
 * body: {
 *   token, userText?, systemInstruction?, temperature?, maxOutputTokens?,
 *   audio?: { mimeType, data }, image?: { mimeType, data }, model?
 * }
 */
function geminiAssist_(body) {
  var session = resolveSession_(body.token);
  if (!session) return { ok: false, error: "未登入或工作階段已過期" };

  var props = PropertiesService.getScriptProperties();
  var key = String(props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!key) {
    return {
      ok: false,
      error:
        "後端尚未設定 GEMINI_API_KEY。請在 Apps Script「專案設定 → 指令碼屬性」新增後重新部署。",
    };
  }

  var model = String(
    props.getProperty("GEMINI_MODEL") ||
      body.model ||
      "gemini-3.1-flash-lite"
  ).trim();
  if (!model) model = "gemini-3.1-flash-lite";

  var userText = String(body.userText || "").trim();
  var audio = body.audio && typeof body.audio === "object" ? body.audio : null;
  var image = body.image && typeof body.image === "object" ? body.image : null;
  var audioData = audio && audio.data ? String(audio.data) : "";
  var imageData = image && image.data ? String(image.data) : "";

  if (!userText && !audioData && !imageData) {
    return { ok: false, error: "缺少文字、語音或圖片" };
  }
  // Apps Script 請求體有限：過長 base64 會失敗
  if (audioData.length > 2500000) {
    return { ok: false, error: "錄音太長，請縮短到約 20 秒內再試" };
  }
  if (imageData.length > 2500000) {
    return { ok: false, error: "圖片太大，請換較小的照片再試" };
  }

  var parts = [];
  if (audioData) {
    parts.push({
      inlineData: {
        mimeType: String(audio.mimeType || "audio/wav"),
        data: audioData,
      },
    });
  }
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: String(image.mimeType || "image/jpeg"),
        data: imageData,
      },
    });
  }
  if (userText) parts.push({ text: userText });

  var temperature = Number(body.temperature);
  if (isNaN(temperature)) temperature = 0.3;
  var maxOutputTokens = Number(body.maxOutputTokens);
  if (isNaN(maxOutputTokens) || maxOutputTokens < 16) maxOutputTokens = 400;

  var payload = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxOutputTokens,
    },
  };
  var sys = String(body.systemInstruction || "").trim();
  if (sys) {
    payload.systemInstruction = { parts: [{ text: sys }] };
  }

  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  var raw = res.getContentText() || "{}";
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: "Gemini 回應不是 JSON（HTTP " + code + "）" };
  }

  if (code < 200 || code >= 300) {
    var msg =
      (data.error && data.error.message) || "Gemini HTTP " + code;
    if (
      code === 401 ||
      /OAuth|ACCESS_TOKEN|UNAUTHENTICATED|API_KEY/i.test(String(msg))
    ) {
      msg =
        "後端 Gemini 金鑰無效或已撤銷。請在 Apps Script 指令碼屬性更新 GEMINI_API_KEY。";
    }
    return { ok: false, error: msg, status: code };
  }

  var outParts =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts
      ? data.candidates[0].content.parts
      : [];
  var text = "";
  for (var i = 0; i < outParts.length; i++) {
    if (outParts[i] && outParts[i].text) text += outParts[i].text;
  }
  text = String(text || "").trim();

  return {
    ok: true,
    text: text,
    model: model,
    account: session.account,
  };
}

/**
 * 在編輯器執行一次：設定後端 Gemini 金鑰（不會出現在前端）。
 * 用法：選取函式 setupGeminiKey → 執行，或 clasp run（勿把金鑰提交 git）
 */
function setupGeminiKey() {
  var uiKey = ""; // 若用編輯器執行，請先把金鑰貼在下一行再執行，跑完請清空
  // 例：uiKey = "AQ.xxxx";
  var props = PropertiesService.getScriptProperties();
  if (!uiKey) {
    var existing = props.getProperty("GEMINI_API_KEY");
    return existing
      ? "已有 GEMINI_API_KEY（長度 " + String(existing).length + "），模型=" +
          (props.getProperty("GEMINI_MODEL") || "gemini-3.1-flash-lite")
      : "尚未設定：請在函式內填 uiKey 後再執行，或到「專案設定 → 指令碼屬性」新增 GEMINI_API_KEY";
  }
  props.setProperty("GEMINI_API_KEY", String(uiKey).trim());
  props.setProperty("GEMINI_MODEL", "gemini-3.1-flash-lite");
  return "已寫入 GEMINI_API_KEY / GEMINI_MODEL";
}

/**
 * 在 Apps Script 編輯器手動執行此函式，可清空雲端全部帳號／工作階段／歷史／待驗證。
 * 不會刪除試算表檔案本身，只清空資料列（保留表頭）。
 */
function clearAllAccountData() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  ["Users", "Sessions", "History", "Pending"].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
  });
  return "已清空 Users / Sessions / History / Pending";
}
