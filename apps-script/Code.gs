/* ===========================================================
   Linkify.ma - Google Apps Script backend (ASCII-safe, paste-proof)
   -----------------------------------------------------------
   1) doPost  -> save/upsert a registration (partial OR complete),
                 upload files to Drive, email you on completion.
   2) doGet   -> ?resume=TOKEN returns saved fields to prefill the form.
   3) processAbandoners -> hourly trigger that queues warm WhatsApp
                 nudges at 1h/24h/72h into a "To Contact" tab.

   SECURITY:
     - Secrets read from Script Properties (env-var equivalent).
     - Rate limiting per submissionId + global.
     - All input validated + sanitized (formula-injection guard).
     - No SQL is used (Sheets API), so no SQL-injection surface.

   NOTE: user-facing Arabic strings are stored as Base64 (pure ASCII) and
   decoded at runtime, so the whole file pastes cleanly into any editor.
   =========================================================== */


/* ============ NON-SECRET CONFIG ============ */
var CONFIG = {
  SHEET_NAME: "",                        // "" = use the FIRST sheet (your existing data sheet)
  SITE_URL_DEFAULT: "https://linkify.ma",
  NUDGE_HOURS: [1, 24, 72],              // retargeting schedule (hours)
  MAX_FIELD_LEN: 5000,
  MAX_FILE_BYTES: 6 * 1024 * 1024,
  RL_PER_SID: 30,
  RL_GLOBAL: 600,
  RL_WINDOW_SEC: 60
};

var HEADERS = [
  "submittedAt", "first_name", "last_name", "age", "gender", "city", "city_other",
  "neighborhood", "whatsapp", "email", "transport", "license", "relocate", "track", "diploma",
  "diploma_other", "specialty", "university", "lang_ar", "lang_fr", "lang_en", "lang_es", "lang_de",
  "subjects", "levels", "institution_types", "schedule", "substitute", "has_experience", "exp_years", "last_inst",
  "last_role", "schools", "skills", "skill_other_text", "consent", "CV_URL", "CERTS_URL", "PHOTO_URL",
  "submissionId", "status", "currentStep", "createdAt", "updatedAt", "resume_url", "nudge1_at", "nudge2_at", "nudge3_at"
];

var FILE_FIELDS = { cv: "CV_URL", certs: "CERTS_URL", photo: "PHOTO_URL" };
var ALLOWED_EXT = { cv: ["pdf", "doc", "docx"], certs: ["pdf", "jpg", "jpeg", "png"], photo: ["jpg", "jpeg", "png"] };

/* Columns for the separate "Schools" tab (B2B leads). */
var SCHOOL_SHEET = "Schools";
var SCHOOL_HEADERS = [
  "submissionId", "status", "currentStep", "createdAt", "updatedAt",
  "school_name", "institution_type", "city", "area", "contact_name", "role", "phone", "email",
  "subject", "level", "need_type", "work_type", "when_needed", "min_experience", "prefer_local", "notes",
  "shortlist_interest", "pricing_pref", "resume_url", "source"
];
var SCHOOL_REQUIRED = ["school_name", "institution_type", "city", "contact_name", "role", "phone", "subject", "level", "need_type", "work_type", "shortlist_interest"];

/* Arabic WhatsApp message parts, Base64 (UTF-8). Decoded lazily in msg_(). */
var MSG_B64 = {
  GREET_PRE: "2LPZhNin2YUg",
  GREET_WAVE: "IPCfkYs=",
  GREET_ANON: "2KfZhNiz2YTYp9mFINi52YTZitmD2YUg8J+Riw==",
  P1A: "CgrZhNin2K3YuNmG2Kcg2KPZhtmDINio2K/Zitiq2Yog2KfZhNiq2LPYrNmK2YQg2YHZgCBMaW5raWZ5INmI2YXYpyDZg9mF2ZHZhNiq2YrZh9i0LiDYqtmC2K/YsSDYqtmD2YXZkdmEINmF2YYg2YbZgdizINin2YTYqNmE2KfYtdipINin2YTZhNmKINmI2YLZgdiq2Yog2YHZitmH2Kcg2YXZhiDZh9mG2Kc6Cg==",
  P1B: "CgrYp9mE2KrYs9is2YrZhCDZhdis2KfZhtmKINiq2YXYp9mF2KfZiyDinIUg2YjZg9mK2KfYrtivINi62YrYsSDYr9mC2KfYptmCLg==",
  P2A: "CgrZhdmE2YHZgyDZgdmAIExpbmtpZnkg2YXYp9iy2KfZhCDZhdinINmD2YXZkdmE2LQuINin2YTZhdik2LPYs9in2Kog2KfZhNiq2LnZhNmK2YXZitipINin2YTZgtix2YrYqNipINmF2YbZgyDZg9iq2YLZhNioINi52YTZiSDYo9iz2KfYqtiw2Kkg2KjYrdin2YTZgyDwn46vCtmD2YXZkdmEINiq2LPYrNmK2YTZgyAo2KjYp9mC2Yog2LrZitixINiu2LfZiNin2Kog2YLZhNin2YQpOgo=",
  P3A: "CgrYotiu2LEg2KrYsNmD2YrYsSDwn5mPINmD2YXZkdmEINmF2YTZgdmDINmB2YAgTGlua2lmeSDYqNin2LQg2KfZhNmF2K/Yp9ix2LMg2KfZhNmC2LHZitio2Kkg2YXZhtmDINmK2YLYr9ix2Ygg2YrZiNi12YTZiCDZhNmK2YMuINmF2KzYp9mG2KfZiyDZiNmF2YYg2YbZgdizINin2YTYqNmE2KfYtdipOgo="
};
var _MSG = null;
function msg_(k) {
  if (!_MSG) {
    _MSG = {};
    Object.keys(MSG_B64).forEach(function (x) {
      _MSG[x] = Utilities.newBlob(Utilities.base64Decode(MSG_B64[x])).getDataAsString("UTF-8");
    });
  }
  return _MSG[k];
}


/* ============ SECRETS (env-var equivalent) ============ */
function prop(key) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    return (v === null || v === undefined) ? "" : String(v);
  } catch (e) { return ""; }
}
function siteUrl() { return prop("SITE_URL") || CONFIG.SITE_URL_DEFAULT; }

function setupSecrets() {
  var secrets = {
    SHEET_ID: "",
    DRIVE_FOLDER_ID: "",
    NOTIFY_EMAIL: "",
    SITE_URL: "https://linkify.ma",
    GREENAPI_ID: "",
    GREENAPI_TOKEN: "",
    ADMIN_PHONE: ""
  };
  var store = PropertiesService.getScriptProperties();
  Object.keys(secrets).forEach(function (k) { if (secrets[k] !== "") store.setProperty(k, secrets[k]); });
}


/* ============ WEB APP ENTRY POINTS ============ */
function doPost(e) {
  try {
    if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }
    var data = JSON.parse(e.postData.contents);
    if (data.website && String(data.website).trim() !== "") {
      return json({ status: "ignored" });
    }
    if (data.formType === "school") { return handleSchoolPost(data); }
    var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
    if (rateLimited("sid_" + sid, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }
    var isPartial = (data.partial === true) || (data.status === "partial");
    var errors = validatePayload(data, isPartial);
    if (errors.length) return json({ status: "invalid", fields: errors });

    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); } catch (err) {}
    try {
      var sheet = getSheet();
      var map = ensureHeaders(sheet);
      var rowIndex = findRow(sheet, map, sid);
      var now = new Date();

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
        updateRow(sheet, map, rowIndex, record);
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
    return json({ status: "error" });
  }
}

function doGet(e) {
  if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }
  var raw = (e && e.parameter) ? e.parameter.resume : null;
  if (!raw) return json({ status: "ok", message: "Linkify backend is running." });
  var token = sanitizeToken(raw);
  if (!token) return json({ status: "notfound" });
  if (rateLimited("get_" + token, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }
  if (e.parameter.t === "s") return schoolResume(token);   // schools resume
  try {
    var sheet = getSheet();
    var map = ensureHeaders(sheet);
    var rowIndex = findRow(sheet, map, token);
    if (rowIndex < 1) return json({ status: "notfound" });
    var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var record = {};
    Object.keys(map).forEach(function (h) {
      if (h === "CV_URL" || h === "CERTS_URL" || h === "PHOTO_URL") return;
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
        adminAlert("Linkify - nudge " + stage + " ready:\n" + name + " (" + phone + ")\n" + waLink);
        break;
      }
    }
  }
}

function buildNudgeMessage(stage, name, resumeUrl) {
  var hi = name ? (msg_("GREET_PRE") + name + msg_("GREET_WAVE")) : msg_("GREET_ANON");
  if (stage === 1) return hi + msg_("P1A") + resumeUrl + msg_("P1B");
  if (stage === 2) return hi + msg_("P2A") + resumeUrl;
  return hi + msg_("P3A") + resumeUrl;
}


/* ============ VALIDATION + SANITIZATION ============ */
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
    var bytes = Math.floor(String(f.data).length * 3 / 4);
    if (bytes > CONFIG.MAX_FILE_BYTES) return { ok: false, reason: "size" };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "error" }; }
}

function sanitizeCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  if (v instanceof Date) return v;
  var s = String(v);
  if (s.length > CONFIG.MAX_FIELD_LEN) s = s.substring(0, CONFIG.MAX_FIELD_LEN);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

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


/* ============ SHEET HELPERS ============ */
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
  var subject = "New Linkify registration: " + (name || record.submissionId);
  var lines = [];
  HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}

function normalizePhone(v) {
  if (!v) return "";
  var s = String(v).replace(/[\s\-().]/g, "");
  if (s.indexOf("+") === 0) s = s.substring(1);
  if (s.indexOf("00") === 0) s = s.substring(2);
  if (s.charAt(0) === "0") s = "212" + s.substring(1);
  else if (s.indexOf("212") !== 0 && s.length === 9) s = "212" + s;
  return s.replace(/\D/g, "");
}

function adminAlert(text) {
  var id = prop("GREENAPI_ID");
  var token = prop("GREENAPI_TOKEN");
  var to = normalizePhone(prop("ADMIN_PHONE"));
  if (!id || !token || !to) return;
  var apiUrl = prop("GREENAPI_URL") || "https://api.green-api.com";
  try {
    var url = apiUrl + "/waInstance" + id + "/sendMessage/" + token;
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chatId: to + "@c.us", message: text }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

// Run this from the editor to test that Green API alerts reach your WhatsApp.
function testAlert() {
  adminAlert("Linkify test alert - if you received this on WhatsApp, Green API works. Sample: https://wa.me/212600000000?text=hello");
}


/* ============ RESPONSE + ONE-TIME SETUP ============ */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processAbandoners") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processAbandoners").timeBased().everyHours(1).create();
}


/* ============ SCHOOLS (B2B leads) ============ */
/* Same progressive-save engine as teachers: partial saves upsert by
   submissionId; a resume link (?resume=SID&t=s) reconnects the visitor. */
function handleSchoolPost(data) {
  var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  if (rateLimited("school_" + sid, 30, CONFIG.RL_WINDOW_SEC)) return json({ status: "rate_limited" });

  var isPartial = (data.partial === true) || (data.status === "partial");
  if (!isPartial) {
    var errors = validateSchool(data);
    if (errors.length) return json({ status: "invalid", fields: errors });
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {}
  try {
    var sheet = getSchoolSheet();
    var subCol = SCHOOL_HEADERS.indexOf("submissionId") + 1;
    var rowIndex = findSchoolRow(sheet, subCol, sid);
    var now = new Date();

    // start from the existing row (upsert) so partial saves never wipe data
    var record = {};
    if (rowIndex > 0) {
      var cur = sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).getValues()[0];
      SCHOOL_HEADERS.forEach(function (h, i) { record[h] = cur[i]; });
    }
    SCHOOL_HEADERS.forEach(function (h) {
      if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = sanitizeCell(data[h]);
    });
    record.submissionId = sid;
    record.status = isPartial ? "partial" : "complete";
    if (data.currentStep !== undefined && data.currentStep !== null && data.currentStep !== "") {
      record.currentStep = clampInt(data.currentStep, 0, 10, 0);
    }
    record.updatedAt = now.toISOString();
    if (rowIndex < 1) record.createdAt = now.toISOString();
    record.resume_url = siteUrl() + "?resume=" + encodeURIComponent(sid) + "&t=s";
    record.source = record.source || "schools_lp";

    var row = SCHOOL_HEADERS.map(function (h) { return (record[h] === undefined || record[h] === null) ? "" : record[h]; });
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).setValues([row]);
    else sheet.appendRow(row);

    if (!isPartial) { try { notifySchool(record); } catch (mailErr) {} }
    return json({ status: isPartial ? "partial" : "success" });
  } catch (err) {
    return json({ status: "error" });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function validateSchool(data) {
  var errors = [];
  var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var phoneRe = /^(?:\+212|212|0)[567]\d{8}$/;
  SCHOOL_REQUIRED.forEach(function (f) {
    if (!data[f] || String(data[f]).trim() === "") errors.push("missing:" + f);
  });
  if (data.phone && !phoneRe.test(String(data.phone).replace(/[\s\-().]/g, ""))) errors.push("phone");
  if (data.email && !emailRe.test(String(data.email))) errors.push("email");
  return errors;
}

function findSchoolRow(sheet, subCol, sid) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, subCol, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(sid)) return i + 2; }
  return -1;
}

function getSchoolSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(SCHOOL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SCHOOL_SHEET);
    sh.getRange(1, 1, 1, SCHOOL_HEADERS.length).setValues([SCHOOL_HEADERS]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, SCHOOL_HEADERS.length).setValues([SCHOOL_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function schoolResume(token) {
  try {
    var sheet = getSchoolSheet();
    var subCol = SCHOOL_HEADERS.indexOf("submissionId") + 1;
    var rowIndex = findSchoolRow(sheet, subCol, token);
    if (rowIndex < 1) return json({ status: "notfound" });
    var vals = sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).getValues()[0];
    var rec = {};
    SCHOOL_HEADERS.forEach(function (h, i) {
      if (h === "resume_url" || h === "source") return;
      if (vals[i] !== "" && vals[i] !== null && vals[i] !== undefined) rec[h] = vals[i];
    });
    return json({ status: "found", record: rec });
  } catch (err) { return json({ status: "error" }); }
}

function notifySchool(record) {
  var to = prop("NOTIFY_EMAIL");
  if (!to) return;
  var subject = "New Linkify SCHOOL lead: " + (record.school_name || "") + " - " + (record.subject || "");
  if (record.need_type === "\u0641\u0648\u0631\u064a\u0629") subject = "[URGENT] " + subject; // need_type == "immediate"
  var lines = [];
  SCHOOL_HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}
