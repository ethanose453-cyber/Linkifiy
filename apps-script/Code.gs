/* ===========================================================
   Linkify.ma — Google Apps Script backend (hardened)
   -----------------------------------------------------------
   Handles:
     1) doPost  → save/upsert a registration (partial OR complete)
                  keyed by submissionId, uploads files to Drive,
                  emails you on each completed registration.
     2) doGet   → ?resume=TOKEN returns saved fields so the form
                  can prefill and drop the visitor where they left.
     3) processAbandoners → hourly trigger that queues warm,
                  personalized WhatsApp nudges at 1h/24h/72h into a
                  "To Contact" tab. Optionally pings YOU via CallMeBot.

   SECURITY (applied throughout):
     - Secrets are read from Script Properties (env-var equivalent),
       never hardcoded. See setupSecrets() / SETUP.md.
     - Every request is rate limited (per submissionId + global).
     - All user input is validated (email/phone/age/step/files) AND
       sanitized before it touches the sheet (incl. formula-injection
       neutralization for =,+,-,@ and control-char stripping).
     - No SQL is used; sheet access is via the Sheets API (no string
       query building), so there is no SQL-injection surface.
   =========================================================== */


/* ============ NON-SECRET CONFIG ============ */
/* Secrets/IDs are NOT here — set them in Script Properties (see setupSecrets).
   These are safe, non-sensitive defaults only. */
var CONFIG = {
  SHEET_NAME: "",                       // "" = use the FIRST sheet (your existing data sheet)
  SITE_URL_DEFAULT: "https://linkify.ma", // fallback if SITE_URL prop is unset
  NUDGE_HOURS: [1, 24, 72],             // retargeting schedule (hours)

  // limits
  MAX_FIELD_LEN: 5000,                  // max chars stored per text cell
  MAX_FILE_BYTES: 6 * 1024 * 1024,      // 6 MB hard cap per file
  RL_PER_SID: 30,                       // max writes per submissionId / minute
  RL_GLOBAL: 600,                       // max requests globally / minute
  RL_WINDOW_SEC: 60
};

// Keys read from Script Properties (Project Settings → Script properties).
var SECRET_KEYS = ["SHEET_ID", "DRIVE_FOLDER_ID", "NOTIFY_EMAIL", "SITE_URL", "CALLMEBOT_PHONE", "CALLMEBOT_APIKEY"];

/* Canonical columns. Order mirrors your EXISTING sheet, then appends the
   retargeting-engine columns at the end. Existing columns are matched by
   NAME and never moved; only missing ones are appended — so your
   already-collected data is preserved untouched. */
var HEADERS = [
  "submittedAt", "first_name", "last_name", "age", "gender", "city", "city_other",
  "neighborhood", "whatsapp", "email", "transport", "license", "relocate", "track", "diploma",
  "diploma_other", "specialty", "university", "lang_ar", "lang_fr", "lang_en", "lang_es", "lang_de",
  "subjects", "levels", "institution_types", "schedule", "substitute", "has_experience", "exp_years", "last_inst",
  "last_role", "schools", "skills", "skill_other_text", "consent", "CV_URL", "CERTS_URL", "PHOTO_URL",
  // --- retargeting engine columns (appended; won't disturb existing data) ---
  "submissionId", "status", "currentStep", "createdAt", "updatedAt", "resume_url", "nudge1_at", "nudge2_at", "nudge3_at"
];

// form file input  →  sheet column + allowed extensions
var FILE_FIELDS = { cv: "CV_URL", certs: "CERTS_URL", photo: "PHOTO_URL" };
var ALLOWED_EXT = { cv: ["pdf", "doc", "docx"], certs: ["pdf", "jpg", "jpeg", "png"], photo: ["jpg", "jpeg", "png"] };


/* ============ SECRETS (env-var equivalent) ============ */
function prop(key) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    return (v === null || v === undefined) ? "" : String(v);
  } catch (e) { return ""; }
}
function siteUrl() { return prop("SITE_URL") || CONFIG.SITE_URL_DEFAULT; }

/* OPTIONAL one-time helper: fill the values, Run once, THEN blank them out again.
   Prefer the UI: Project Settings → Script properties → Add. */
function setupSecrets() {
  var secrets = {
    SHEET_ID: "",          // your Google Sheet ID
    DRIVE_FOLDER_ID: "",   // your Drive folder ID
    NOTIFY_EMAIL: "",      // where new-registration emails go
    SITE_URL: "https://linkify.ma",
    CALLMEBOT_PHONE: "",   // optional admin alert
    CALLMEBOT_APIKEY: ""   // optional admin alert
  };
  var store = PropertiesService.getScriptProperties();
  Object.keys(secrets).forEach(function (k) { if (secrets[k] !== "") store.setProperty(k, secrets[k]); });
}


/* ============ WEB APP ENTRY POINTS ============ */

function doPost(e) {
  try {
    // basic global rate limit (per-IP is not available in Apps Script)
    if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }

    var data = JSON.parse(e.postData.contents);

    // anti-spam honeypot: bots fill the hidden "website" field
    if (data.website && String(data.website).trim() !== "") {
      return json({ status: "ignored" });
    }

    var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));

    // per-submission rate limit
    if (rateLimited("sid_" + sid, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }

    var isPartial = (data.partial === true) || (data.status === "partial");

    // validate BEFORE writing anything
    var errors = validatePayload(data, isPartial);
    if (errors.length) return json({ status: "invalid", fields: errors });

    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); } catch (err) {}
    try {
      var sheet = getSheet();
      var map = ensureHeaders(sheet);
      var rowIndex = findRow(sheet, map, sid);
      var now = new Date();

      // collect + sanitize known text fields present in this payload
      var record = {};
      HEADERS.forEach(function (h) {
        if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = sanitizeCell(data[h]);
      });
      record.submissionId = sid;
      record.status = isPartial ? "partial" : "complete";
      if (data.currentStep !== undefined && data.currentStep !== null) {
        record.currentStep = clampInt(data.currentStep, 0, 10, 0);
      }
      record.updatedAt = now.toISOString();
      if (!isPartial) record.submittedAt = now.toISOString();
      record.resume_url = siteUrl() + "?resume=" + encodeURIComponent(sid);

      // uploads (validated: type + size)
      if (data.files) {
        var folder = getFolder();
        Object.keys(FILE_FIELDS).forEach(function (field) {
          var f = data.files[field];
          if (f && f.data) {
            var check = validateFile(field, f);
            if (check.ok) {
              try { record[FILE_FIELDS[field]] = saveFile(folder, f, sid + "_" + field); } catch (upErr) {}
            }
          }
        });
      }

      if (rowIndex > 0) {
        updateRow(sheet, map, rowIndex, record);   // upsert: never wipes untouched fields
      } else {
        record.createdAt = now.toISOString();
        appendRow(sheet, map, record);
      }

      if (!isPartial) { try { notifyEmail(record); } catch (mailErr) {} }

      return json({ status: isPartial ? "partial" : "success" });
    } finally {
      try { lock.releaseLock(); } catch (e2) {}
    }
  } catch (err) {
    return json({ status: "error" }); // don't leak internals
  }
}

function doGet(e) {
  if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }
  var raw = (e && e.parameter) ? e.parameter.resume : null;
  if (!raw) return json({ status: "ok", message: "Linkify backend is running." });

  var token = sanitizeToken(raw);              // strict: [A-Za-z0-9_-]{1,64}
  if (!token) return json({ status: "notfound" });
  if (rateLimited("get_" + token, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }

  try {
    var sheet = getSheet();
    var map = ensureHeaders(sheet);
    var rowIndex = findRow(sheet, map, token);
    if (rowIndex < 1) return json({ status: "notfound" });

    var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var record = {};
    Object.keys(map).forEach(function (h) {
      if (h === "CV_URL" || h === "CERTS_URL" || h === "PHOTO_URL") return; // don't expose file URLs
      var v = values[map[h] - 1];
      if (v !== "" && v !== null && v !== undefined) record[h] = v;
    });
    return json({ status: "found", record: record });
  } catch (err) {
    return json({ status: "error" });
  }
}


/* ============ RETARGETING ENGINE ============ */
function processAbandoners() {
  var sheet = getSheet();
  var map = ensureHeaders(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return;

  var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var now = new Date();
  var contact = getContactSheet();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNum = i + 2;
    if (String(cell(row, map, "status")) !== "partial") continue;

    var updatedAt = cell(row, map, "updatedAt");
    var t = updatedAt ? new Date(updatedAt).getTime() : 0;
    if (!t) continue;
    var hours = (now.getTime() - t) / 3600000;

    var name = cell(row, map, "first_name") || "";
    var phone = normalizePhone(cell(row, map, "whatsapp"));
    var sid = cell(row, map, "submissionId");
    var resumeUrl = cell(row, map, "resume_url") || (siteUrl() + "?resume=" + encodeURIComponent(sid));

    for (var n = 0; n < CONFIG.NUDGE_HOURS.length; n++) {
      var stage = n + 1;
      var col = map["nudge" + stage + "_at"];
      if (!row[col - 1] && hours >= CONFIG.NUDGE_HOURS[n]) {
        var msg = buildNudgeMessage(stage, name, resumeUrl);
        var waLink = phone ? ("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)) : "";
        contact.appendRow([now, sanitizeCell(name), phone, "Nudge " + stage, resumeUrl, waLink, sanitizeCell(msg)]);
        sheet.getRange(rowNum, col).setValue(now);
        adminAlert("Linkify — تذكير " + stage + " جاهز:\n" + name + " (" + phone + ")\n" + waLink);
        break; // one nudge per person per run
      }
    }
  }
}

function buildNudgeMessage(stage, name, resumeUrl) {
  var hi = name ? ("سلام " + name + " 👋") : "السلام عليكم 👋";
  if (stage === 1) {
    return hi + "\n\nلاحظنا أنك بديتي التسجيل فـ Linkify وما كمّلتيهش. تقدر تكمّل من نفس البلاصة اللي وقفتي فيها من هنا:\n" + resumeUrl +
      "\n\nالتسجيل مجاني تماماً ✅ وكياخد غير دقائق.";
  }
  if (stage === 2) {
    return hi + "\n\nملفك فـ Linkify مازال ما كمّلش. المؤسسات التعليمية القريبة منك كتقلب على أساتذة بحالك 🎯\nكمّل تسجيلك (باقي غير خطوات قلال):\n" + resumeUrl;
  }
  return hi + "\n\nآخر تذكير 🙏 كمّل ملفك فـ Linkify باش المدارس القريبة منك يقدرو يوصلو ليك. مجاناً ومن نفس البلاصة:\n" + resumeUrl;
}


/* ============ VALIDATION + SANITIZATION ============ */

// server-side validation (mirrors the frontend checks)
function validatePayload(data, isPartial) {
  var errors = [];
  var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var phoneRe = /^(?:\+212|212|0)[567]\d{8}$/;

  if (data.email && !emailRe.test(String(data.email))) errors.push("email");
  if (data.whatsapp && !phoneRe.test(String(data.whatsapp).replace(/[\s\-().]/g, ""))) errors.push("whatsapp");
  if (data.age !== undefined && data.age !== "") {
    var a = parseInt(data.age, 10);
    if (isNaN(a) || a < 16 || a > 80) errors.push("age");
  }
  if (data.currentStep !== undefined && data.currentStep !== null && data.currentStep !== "") {
    var st = parseInt(data.currentStep, 10);
    if (isNaN(st) || st < 0 || st > 10) errors.push("currentStep");
  }
  // required fields only when finishing
  if (!isPartial) {
    ["first_name", "last_name", "whatsapp", "email"].forEach(function (f) {
      if (!data[f] || String(data[f]).trim() === "") errors.push("missing:" + f);
    });
    if (!data.consent) errors.push("missing:consent");
  }
  return errors;
}

function validateFile(field, f) {
  try {
    var name = String(f.name || "");
    var ext = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
    var allowed = ALLOWED_EXT[field] || [];
    if (allowed.indexOf(ext) === -1) return { ok: false, reason: "type" };
    // base64 → approximate byte size
    var bytes = Math.floor(String(f.data).length * 3 / 4);
    if (bytes > CONFIG.MAX_FILE_BYTES) return { ok: false, reason: "size" };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "error" }; }
}

// neutralize formula/CSV injection + strip control chars + cap length
function sanitizeCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  if (v instanceof Date) return v;
  var s = String(v);
  if (s.length > CONFIG.MAX_FIELD_LEN) s = s.substring(0, CONFIG.MAX_FIELD_LEN);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""); // control chars
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                              // formula injection guard
  return s;
}

// only allow safe id chars; returns "" if invalid
function sanitizeToken(v) {
  if (!v) return "";
  var s = String(v);
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

function clampInt(v, min, max, dflt) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// lightweight rate limiter (best-effort; CacheService, not per-IP)
function rateLimited(key, maxHits, windowSec) {
  try {
    var cache = CacheService.getScriptCache();
    var k = "rl_" + key;
    var cur = parseInt(cache.get(k) || "0", 10);
    if (cur >= maxHits) return true;
    cache.put(k, String(cur + 1), windowSec);
    return false;
  } catch (e) { return false; }
}


/* ============ SHEET HELPERS (header-name based, non-destructive) ============ */

function getSpreadsheet() {
  var id = prop("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Set SHEET_ID in Script Properties, or bind this script to your Sheet.");
  return ss;
}

function getSheet() {
  var ss = getSpreadsheet();
  var sh = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getSheets()[0];
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME || "Registrations");
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureHeaders(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  header.forEach(function (h, i) { if (h !== "" && h !== null) map[String(h)] = i + 1; });

  var missing = HEADERS.filter(function (h) { return !map[h]; });
  if (missing.length) {
    var start = sheet.getLastColumn() + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    missing.forEach(function (h, i) { map[h] = start + i; });
    sheet.setFrozenRows(1);
  }
  return map;
}

function findRow(sheet, map, sid) {
  var col = map["submissionId"];
  if (!col) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(sid)) return i + 2;
  }
  return -1;
}

function appendRow(sheet, map, record) {
  var width = sheet.getLastColumn();
  var row = [];
  for (var i = 0; i < width; i++) row.push("");
  Object.keys(record).forEach(function (k) { if (map[k]) row[map[k] - 1] = record[k]; });
  sheet.appendRow(row);
}

function updateRow(sheet, map, rowIndex, record) {
  Object.keys(record).forEach(function (k) {
    if (map[k] && record[k] !== undefined) sheet.getRange(rowIndex, map[k]).setValue(record[k]);
  });
}

function cell(row, map, headerName) {
  var col = map[headerName];
  return col ? row[col - 1] : "";
}

function getContactSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName("To Contact");
  if (!sh) {
    sh = ss.insertSheet("To Contact");
    sh.getRange(1, 1, 1, 7).setValues([["queuedAt", "name", "phone", "stage", "resumeUrl", "whatsappLink", "message"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}


/* ============ FILES / EMAIL / WHATSAPP ============ */

function getFolder() {
  var id = prop("DRIVE_FOLDER_ID");
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getFoldersByName("Linkify Uploads");
  return it.hasNext() ? it.next() : DriveApp.createFolder("Linkify Uploads");
}

function saveFile(folder, fileObj, baseName) {
  var bytes = Utilities.base64Decode(fileObj.data);
  var safeName = sanitizeToken(baseName) + "_" + String(fileObj.name || "file").replace(/[^\w.\-]/g, "_");
  var blob = Utilities.newBlob(bytes, fileObj.type || "application/octet-stream", safeName);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return file.getUrl();
}

function notifyEmail(record) {
  var to = prop("NOTIFY_EMAIL");
  if (!to) return;
  var name = ((record.first_name || "") + " " + (record.last_name || "")).trim();
  var subject = "Linkify — تسجيل جديد: " + (name || record.submissionId);
  var lines = [];
  HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}

// Moroccan phone → international digits (no +), e.g. 0612... → 212612...
function normalizePhone(v) {
  if (!v) return "";
  var s = String(v).replace(/[\s\-().]/g, "");
  if (s.indexOf("+") === 0) s = s.substring(1);
  if (s.indexOf("00") === 0) s = s.substring(2);
  if (s.charAt(0) === "0") s = "212" + s.substring(1);
  else if (s.indexOf("212") !== 0 && s.length === 9) s = "212" + s;
  return s.replace(/\D/g, ""); // digits only
}

// pings YOU (admin) via CallMeBot — disabled unless both props are set
function adminAlert(text) {
  var phone = prop("CALLMEBOT_PHONE");
  var apikey = prop("CALLMEBOT_APIKEY");
  if (!phone || !apikey) return;
  try {
    var url = "https://api.callmebot.com/whatsapp.php"
      + "?phone=" + encodeURIComponent(phone)
      + "&text=" + encodeURIComponent(text)
      + "&apikey=" + encodeURIComponent(apikey);
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {}
}


/* ============ RESPONSE + ONE-TIME SETUP ============ */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run ONCE from the editor to enable hourly retargeting.
function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processAbandoners") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processAbandoners").timeBased().everyHours(1).create();
}
