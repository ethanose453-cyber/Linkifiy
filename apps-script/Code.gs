/* ===========================================================
   Linkify.ma — Google Apps Script backend
   -----------------------------------------------------------
   Handles:
     1) doPost  → save/upsert a registration (partial OR complete)
                  keyed by submissionId, uploads files to Drive,
                  emails you on each completed registration.
     2) doGet   → ?resume=TOKEN returns saved fields so the form
                  can prefill and drop the visitor where they left.
     3) processAbandoners → hourly trigger that finds people who
                  started but didn't finish, and queues a warm,
                  personalized WhatsApp message (wa.me link) in a
                  "To Contact" tab at 1h / 24h / 72h. Optionally
                  pings YOU on WhatsApp via CallMeBot.

   HOW TO INSTALL: see SETUP.md. In short:
     - Open your Google Sheet → Extensions → Apps Script
     - Paste this whole file, fill CONFIG below
     - Deploy → New deployment → Web app → Anyone
     - Run createTrigger() once (authorize) to enable retargeting
   =========================================================== */


/* ============ CONFIG — edit these ============ */
var CONFIG = {
  // Your Google Sheet ID (from its URL: /spreadsheets/d/THIS_PART/edit).
  // Leave empty ("") ONLY if this script is bound to the Sheet
  // (opened via the Sheet → Extensions → Apps Script).
  SHEET_ID: "PASTE_SHEET_ID",

  // Tab that stores registrations. Auto-created if it doesn't exist.
  SHEET_NAME: "Registrations",

  // Google Drive folder ID for uploaded files (CV / certs / photo).
  // Leave as-is to auto-use a folder named "Linkify Uploads" in My Drive.
  DRIVE_FOLDER_ID: "PASTE_DRIVE_FOLDER_ID",

  // Where the "new registration" notification email is sent.
  NOTIFY_EMAIL: "contact@linkify.ma",

  // Public site URL, used to build resume links (fallback only —
  // the form sends its own resumeUrl which is preferred).
  SITE_URL: "https://linkify.ma",

  // Retargeting nudge schedule, in HOURS after the last activity.
  NUDGE_HOURS: [1, 24, 72],

  // --- Optional: CallMeBot admin alert (pings YOU, not the teacher) ---
  // Leave both empty to disable. To enable: add CallMeBot's number to
  // your WhatsApp contacts, send "I allow callmebot to send me messages",
  // then paste your number (intl, e.g. 2126xxxxxxxx) + the API key it returns.
  CALLMEBOT_PHONE: "",
  CALLMEBOT_APIKEY: ""
};


/* Canonical column order (only used when creating a fresh sheet).
   Existing sheets are matched by header NAME, and any missing columns
   are appended — so your already-collected data is never disturbed. */
var HEADERS = [
  "submissionId", "status", "currentStep", "createdAt", "updatedAt", "submittedAt",
  "first_name", "last_name", "age", "gender", "city", "city_other", "neighborhood", "whatsapp", "email",
  "transport", "license", "relocate", "track", "diploma", "diploma_other", "specialty", "university",
  "lang_ar", "lang_fr", "lang_en", "lang_es", "lang_de",
  "subjects", "levels", "institution_types", "schedule", "substitute",
  "has_experience", "exp_years", "last_inst", "last_role", "schools",
  "skills", "skill_other_text",
  "cv_url", "certs_url", "photo_url",
  "resume_url", "nudge1_at", "nudge2_at", "nudge3_at"
];

// form file input id  →  sheet column that stores its Drive link
var FILE_FIELDS = { cv: "cv_url", certs: "certs_url", photo: "photo_url" };


/* ============ WEB APP ENTRY POINTS ============ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { /* proceed best-effort */ }
  try {
    var data = JSON.parse(e.postData.contents);

    // anti-spam honeypot: bots fill the hidden "website" field
    if (data.website && String(data.website).trim() !== "") {
      return json({ status: "ignored" });
    }

    var isPartial = (data.partial === true) || (data.status === "partial");
    var sheet = getSheet();
    var map = ensureHeaders(sheet);

    var sid = data.submissionId || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
    var rowIndex = findRow(sheet, map, sid);
    var now = new Date();

    // collect known text fields present in this payload
    var record = {};
    HEADERS.forEach(function (h) {
      if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = data[h];
    });
    record.submissionId = sid;
    record.status = isPartial ? "partial" : "complete";
    if (data.currentStep !== undefined && data.currentStep !== null) record.currentStep = data.currentStep;
    record.updatedAt = now.toISOString();
    if (!isPartial) record.submittedAt = data.submittedAt || now.toISOString();
    record.resume_url = data.resumeUrl || (CONFIG.SITE_URL + "?resume=" + encodeURIComponent(sid));

    // uploads (usually only on final submit, but handled whenever present)
    if (data.files) {
      var folder = getFolder();
      Object.keys(FILE_FIELDS).forEach(function (field) {
        var f = data.files[field];
        if (f && f.data) {
          try { record[FILE_FIELDS[field]] = saveFile(folder, f, sid + "_" + field); }
          catch (upErr) { /* keep going even if one file fails */ }
        }
      });
    }

    if (rowIndex > 0) {
      updateRow(sheet, map, rowIndex, record);   // upsert: never wipes untouched fields
    } else {
      record.createdAt = now.toISOString();
      appendRow(sheet, map, record);
    }

    // email you only when a registration is completed
    if (!isPartial) {
      try { notifyEmail(record); } catch (mailErr) {}
    }

    return json({ status: isPartial ? "partial" : "success" });
  } catch (err) {
    return json({ status: "error", message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet(e) {
  var token = (e && e.parameter) ? e.parameter.resume : null;
  if (!token) {
    return json({ status: "ok", message: "Linkify backend is running." });
  }
  try {
    var sheet = getSheet();
    var map = ensureHeaders(sheet);
    var rowIndex = findRow(sheet, map, token);
    if (rowIndex < 1) return json({ status: "notfound" });

    var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var record = {};
    Object.keys(map).forEach(function (h) {
      // don't expose stored file URLs in the public resume payload
      if (h === "cv_url" || h === "certs_url" || h === "photo_url") return;
      var v = values[map[h] - 1];
      if (v !== "" && v !== null && v !== undefined) record[h] = v;
    });
    return json({ status: "found", record: record });
  } catch (err) {
    return json({ status: "error", message: String(err) });
  }
}


/* ============ RETARGETING ENGINE ============ */
/* Run createTrigger() ONCE to schedule this every hour. */
function processAbandoners() {
  var sheet = getSheet();
  var map = ensureHeaders(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return;

  var width = sheet.getLastColumn();
  var rows = sheet.getRange(2, 1, last - 1, width).getValues();
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
    var resumeUrl = cell(row, map, "resume_url") || (CONFIG.SITE_URL + "?resume=" + encodeURIComponent(sid));

    for (var n = 0; n < CONFIG.NUDGE_HOURS.length; n++) {
      var stage = n + 1;
      var col = map["nudge" + stage + "_at"];
      var alreadySent = row[col - 1];

      if (!alreadySent && hours >= CONFIG.NUDGE_HOURS[n]) {
        var msg = buildNudgeMessage(stage, name, resumeUrl);
        var waLink = phone ? ("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)) : "";

        // queue it for the team to click (semi-automatic, free, ban-safe)
        contact.appendRow([now, name, phone, "Nudge " + stage, resumeUrl, waLink, msg]);

        // mark this nudge so it's never queued twice
        sheet.getRange(rowNum, col).setValue(now);

        // optional: ping you on WhatsApp that a lead is waiting
        adminAlert("Linkify — تذكير " + stage + " جاهز:\n" + name + " (" + phone + ")\n" + waLink);

        break; // at most one nudge per person per run
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


/* ============ SHEET HELPERS (header-name based, non-destructive) ============ */

// Opens by SHEET_ID if provided, otherwise falls back to the bound spreadsheet.
function getSpreadsheet() {
  if (CONFIG.SHEET_ID && CONFIG.SHEET_ID.indexOf("PASTE") === -1 && CONFIG.SHEET_ID !== "") {
    return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Set CONFIG.SHEET_ID, or bind this script to your Sheet (Sheet → Extensions → Apps Script).");
  return ss;
}

function getSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// returns { headerName: 1-based column index }, appending any missing canonical headers
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
  Object.keys(record).forEach(function (k) {
    if (map[k]) row[map[k] - 1] = record[k];
  });
  sheet.appendRow(row);
}

function updateRow(sheet, map, rowIndex, record) {
  Object.keys(record).forEach(function (k) {
    if (map[k] && record[k] !== undefined) {
      sheet.getRange(rowIndex, map[k]).setValue(record[k]);
    }
  });
}

function cell(row, map, headerName) {
  var col = map[headerName];
  return col ? row[col - 1] : "";
}

function getContactSheet() {
  var ss = getSpreadsheet();
  var name = "To Contact";
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 7).setValues([["queuedAt", "name", "phone", "stage", "resumeUrl", "whatsappLink", "message"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}


/* ============ FILES / EMAIL / WHATSAPP HELPERS ============ */

function getFolder() {
  if (CONFIG.DRIVE_FOLDER_ID && CONFIG.DRIVE_FOLDER_ID.indexOf("PASTE") === -1) {
    return DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  }
  var it = DriveApp.getFoldersByName("Linkify Uploads");
  return it.hasNext() ? it.next() : DriveApp.createFolder("Linkify Uploads");
}

function saveFile(folder, fileObj, baseName) {
  var bytes = Utilities.base64Decode(fileObj.data);
  var safeName = baseName + "_" + (fileObj.name || "file");
  var blob = Utilities.newBlob(bytes, fileObj.type || "application/octet-stream", safeName);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return file.getUrl();
}

function notifyEmail(record) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  var name = ((record.first_name || "") + " " + (record.last_name || "")).trim();
  var subject = "Linkify — تسجيل جديد: " + (name || record.submissionId);
  var lines = [];
  HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, lines.join("\n"));
}

// Moroccan phone → international digits (no +), e.g. 0612... → 212612...
function normalizePhone(v) {
  if (!v) return "";
  var s = String(v).replace(/[\s\-().]/g, "");
  if (s.indexOf("+") === 0) s = s.substring(1);
  if (s.indexOf("00") === 0) s = s.substring(2);
  if (s.charAt(0) === "0") s = "212" + s.substring(1);
  else if (s.indexOf("212") !== 0 && s.length === 9) s = "212" + s;
  return s;
}

// pings YOU (admin) on WhatsApp via CallMeBot — disabled unless configured
function adminAlert(text) {
  if (!CONFIG.CALLMEBOT_PHONE || !CONFIG.CALLMEBOT_APIKEY) return;
  try {
    var url = "https://api.callmebot.com/whatsapp.php"
      + "?phone=" + encodeURIComponent(CONFIG.CALLMEBOT_PHONE)
      + "&text=" + encodeURIComponent(text)
      + "&apikey=" + encodeURIComponent(CONFIG.CALLMEBOT_APIKEY);
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) { /* ignore alert failures */ }
}


/* ============ ONE-TIME SETUP ============ */
// Run this once from the Apps Script editor to enable hourly retargeting.
function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processAbandoners") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processAbandoners").timeBased().everyHours(1).create();
}
