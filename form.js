/* ===========================================================
   Linkify.ma — registration form logic
   Multi-step + conditional logic + file upload to Google Apps Script
   =========================================================== */

/* 🔴🔴🔴 لصق هنا رابط الـ Web App ديال Google Apps Script (شوف SETUP.md) 🔴🔴🔴 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const MAX_FILE_MB = 5;
const SHARE_URL = "https://linkify.ma"; // official domain

/* ---------- stable submission id + resume token ----------
   Priority: ?resume=TOKEN in URL  →  saved id in localStorage  →  brand new id.
   Reusing the same id means every partial save updates the SAME row (upsert),
   and a WhatsApp resume link (?resume=...) reconnects the visitor to their record. */
const SID_KEY = "linkify-sid";
// Cryptographically strong, unguessable token (the resume link's only guard on PII).
function makeSid() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  try {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {}
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function getResumeToken() { try { return new URLSearchParams(location.search).get("resume"); } catch (e) { return null; } }
const RESUME_TOKEN = getResumeToken();
let SUBMISSION_ID = (function () {
  if (RESUME_TOKEN) { try { localStorage.setItem(SID_KEY, RESUME_TOKEN); } catch (e) {} return RESUME_TOKEN; }
  try { const s = localStorage.getItem(SID_KEY); if (s) return s; } catch (e) {}
  const n = makeSid();
  try { localStorage.setItem(SID_KEY, n); } catch (e) {}
  return n;
})();

function buildResumeUrl() {
  const base = (location.protocol.indexOf("http") === 0) ? (location.origin + location.pathname) : SHARE_URL;
  return base + "?resume=" + encodeURIComponent(SUBMISSION_ID);
}

// translation helper (i18n.js defines window.t; fall back to key)
function T(k) { return (typeof window.t === "function") ? window.t(k) : k; }

/* ---------- analytics (Meta Pixel / GA / GTM) — safe no-op if none loaded ---------- */
var FB_STD = { PageView: 1, ViewContent: 1, Lead: 1, CompleteRegistration: 1, Contact: 1, SubmitApplication: 1, Schedule: 1, Search: 1, InitiateCheckout: 1 };
function track(name, params) {
  try {
    if (typeof window.fbq === "function") window.fbq(FB_STD[name] ? "track" : "trackCustom", name, params || {});
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    if (window.dataLayer && typeof window.dataLayer.push === "function") window.dataLayer.push(Object.assign({ event: name }, params || {}));
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => {
  const form        = document.getElementById("registerForm");
  if (!form) return;

  const steps       = Array.from(form.querySelectorAll(".form-step"));
  const total       = steps.length;
  const prevBtn     = document.getElementById("prevBtn");
  const nextBtn     = document.getElementById("nextBtn");
  const submitBtn   = document.getElementById("submitBtn");
  const progressFill= document.getElementById("progressFill");
  const stepNow     = document.getElementById("stepNow");
  const stepPct     = document.getElementById("stepPct");
  const stepDots    = document.getElementById("stepDots");
  const stepHint    = document.getElementById("stepHint");
  const statusBox   = document.getElementById("formStatus");
  const successScreen = document.getElementById("successScreen");

  let current = 0;
  const FORM_LOADED_AT = Date.now();
  document.getElementById("stepTotal").textContent = total;
  if (stepDots) { stepDots.innerHTML = ""; for (var _d = 0; _d < total; _d++) { var _li = document.createElement("li"); _li.textContent = _d + 1; stepDots.appendChild(_li); } }

  /* ---------- analytics state + page/start events ---------- */
  let _trkStarted = false, _trkMaxStep = 0, _trkSubmitted = false, _trkAbandonFired = false;
  track("ViewContent", { content_name: "teacher_lp", content_category: "teacher" });
  track("TeacherLPView");
  if (RESUME_TOKEN) track("ResumeLinkOpened", { form_type: "teacher" });
  form.addEventListener("focusin", function () { if (!_trkStarted) { _trkStarted = true; track("FormStart", { form_type: "teacher" }); } });

  /* ---------- step display ---------- */
  function showStep(i, scroll) {
    steps.forEach((s, idx) => {
      const on = idx === i;
      s.hidden = !on;
      s.classList.toggle("is-active", on);
    });
    progressFill.style.width = ((i + 1) / total) * 100 + "%";
    stepNow.textContent = i + 1;
    if (stepPct) stepPct.textContent = Math.round(((i + 1) / total) * 100) + "%";
    if (stepDots) { var _k = stepDots.children; for (var _j = 0; _j < _k.length; _j++) { _k[_j].classList.toggle("done", _j < i); _k[_j].classList.toggle("active", _j === i); } }
    if (stepHint) stepHint.textContent = (i === total - 1) ? T("form.almostThere") : "";
    prevBtn.hidden   = i === 0;
    nextBtn.hidden   = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    if (i > _trkMaxStep) _trkMaxStep = i;
    track("FormStepView", { step: i + 1, form_type: "teacher" });
    filterSubjects();
    applyTrackUI();
    clearStatus();
    if (scroll !== false) scrollToForm();
  }

  function scrollToForm() {
    const target = document.querySelector(".progress") || document.getElementById("register") || form;
    if (!target) return;
    const HEADER = 80; // sticky header height + small gap
    function go() {
      if (window.lenis && typeof window.lenis.scrollTo === "function") {
        // force:true so it scrolls even if lenis thinks the target is already visible
        window.lenis.scrollTo(target, { offset: -HEADER, force: true, duration: 0.6 });
      } else {
        const y = target.getBoundingClientRect().top + window.pageYOffset - HEADER;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    }
    // wait for the new (shorter/longer) step to render before measuring & scrolling
    requestAnimationFrame(function () { requestAnimationFrame(go); });
  }

  /* ---------- conditional logic (same as old form) ---------- */
  const cityOther    = document.getElementById("city-other-wrap");
  const diplomaOther = document.getElementById("diploma-other-wrap");
  const expBlock     = document.getElementById("experience-block");
  const skillOther   = document.getElementById("skill-other-wrap");

  function toggle(el, show) {
    if (!el) return;
    el.hidden = !show;
    // required only while visible
    el.querySelectorAll("input, select, textarea").forEach(inp => {
      if (show && inp.dataset.req === "1") inp.required = true;
      if (!show) { inp.required = false; }
    });
  }

  // city -> "مدينة أخرى"
  document.getElementById("city").addEventListener("change", e => {
    const show = e.target.value === "مدينة أخرى";
    const inp = document.getElementById("city_other");
    inp.dataset.req = "1";
    toggle(cityOther, show);
  });

  // diploma -> "غير ذلك"
  document.getElementById("diploma").addEventListener("change", e => {
    const show = e.target.value === "غير ذلك";
    document.getElementById("diploma_other").dataset.req = "1";
    toggle(diplomaOther, show);
  });

  // experience -> "نعم" shows the block, "لا (حديث التخرج)" hides
  form.querySelectorAll('input[name="has_experience"]').forEach(r => {
    r.addEventListener("change", e => toggle(expBlock, e.target.value === "نعم"));
  });

  // custom skill checkbox
  document.getElementById("skill_other").addEventListener("change", e => {
    toggle(skillOther, e.target.checked);
  });

  // salary -> "مبلغ آخر" reveals the custom amount field
  const salaryCustomWrap = document.getElementById("salary-custom-wrap");
  const salarySel = document.getElementById("salary_expectation");
  if (salarySel) salarySel.addEventListener("change", e => toggle(salaryCustomWrap, e.target.value === "مبلغ آخر"));

  // contract "لا يهم" -> selecting it clears + disables the specific contract types
  (function () {
    const anyCt = form.querySelector('input[name="contract_types"][data-ct-any]');
    if (!anyCt) return;
    const others = [...form.querySelectorAll('input[name="contract_types"]:not([data-ct-any])')];
    const sync = () => others.forEach(c => { c.disabled = anyCt.checked; if (anyCt.checked) c.checked = false; });
    anyCt.addEventListener("change", sync);
    sync();
  })();

  // filter subjects by selected track (علمي / أدبي / أولي)
  const TRACK_GROUP = {
    "علمي / تقني": "علمي",
    "أدبي / إنساني": "أدبي",
    "التعليم الأولي والمربيات": "أولي",
  };
  function filterSubjects() {
    const checked = form.querySelector('input[name="track"]:checked');
    const group = checked ? TRACK_GROUP[checked.value] : null;
    form.querySelectorAll(".check[data-group]").forEach(lbl => {
      const match = !group || lbl.dataset.group === group;
      lbl.hidden = !match;
      if (!match) { const cb = lbl.querySelector("input"); if (cb) cb.checked = false; }
    });
  }
  // Early-education (preschool) conditional UI. When the "التعليم الأولي والمربيات"
  // track is chosen we swap the age-levels + institution lists to their preschool
  // set (data-track="early") and reveal the early-ed-only fields (role + accompanist).
  // Everything marked data-track="general" is shown for the other tracks instead.
  const EARLY_TRACK = "التعليم الأولي والمربيات";
  function applyTrackUI() {
    const checked = form.querySelector('input[name="track"]:checked');
    const isEarly = !!checked && checked.value === EARLY_TRACK;
    form.querySelectorAll("[data-track]").forEach(function (lbl) {
      const show = lbl.dataset.track === (isEarly ? "early" : "general");
      lbl.hidden = !show;
      if (!show) { const cb = lbl.querySelector("input"); if (cb) cb.checked = false; }
    });
    form.querySelectorAll("[data-early-field]").forEach(function (fld) {
      fld.hidden = !isEarly;
      if (!isEarly) fld.querySelectorAll("input").forEach(function (i) {
        if (i.type === "radio" || i.type === "checkbox") i.checked = false;
      });
    });
  }
  form.querySelectorAll('input[name="track"]').forEach(r =>
    r.addEventListener("change", function () { filterSubjects(); applyTrackUI(); })
  );

  /* ---------- validation for current step ---------- */
  function validateStep(i) {
    let ok = true;
    const stepEl = steps[i];
    // clear old errors
    stepEl.querySelectorAll(".has-error").forEach(f => f.classList.remove("has-error"));
    stepEl.querySelectorAll(".field-error").forEach(e => e.remove());

    // required inputs/selects/textarea (skip hidden conditionals)
    stepEl.querySelectorAll("input, select, textarea").forEach(inp => {
      if (inp.type === "radio" || inp.type === "checkbox") return;
      if (inp.closest("[hidden]")) return;
      if (inp.required && !inp.value.trim()) ok = fail(inp, T("v.required")) && false;
      else if (inp.type === "email" && inp.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value))
        ok = fail(inp, T("v.email")) && false;
      else if ((inp.id === "whatsapp" || inp.id === "prev_employer_phone") && inp.value && !isValidMaPhone(inp.value))
        ok = fail(inp, T("v.phone")) && false;
    });

    // required radio groups
    const radioGroups = new Set();
    stepEl.querySelectorAll('input[type="radio"][required]').forEach(r => radioGroups.add(r.name));
    radioGroups.forEach(name => {
      const grp = stepEl.querySelectorAll(`input[name="${name}"]`);
      if (![...grp].some(r => r.checked)) {
        ok = false;
        const holder = grp[0].closest(".field");
        markError(holder, T("v.choose"));
      }
    });

    // required checkbox GROUP: at least one contract type must be chosen
    const ctFirst = stepEl.querySelector('input[name="contract_types"]');
    if (ctFirst && ![...stepEl.querySelectorAll('input[name="contract_types"]')].some(c => c.checked)) {
      ok = false;
      markError(ctFirst.closest(".field"), T("v.choose"));
    }

    // required files
    stepEl.querySelectorAll('input[type="file"][required]').forEach(f => {
      if (f.closest("[hidden]")) return;
      if (!f.files.length) ok = markError(f.closest(".field"), T("v.file")) && false;
      else if (f.files[0].size > MAX_FILE_MB * 1024 * 1024)
        ok = markError(f.closest(".field"), T("v.fileSize")) && false;
    });

    // consent (last step) — both the data-sharing consent AND the truthfulness pledge are required
    const consent = stepEl.querySelector("#consent");
    if (consent && !consent.checked) {
      ok = false;
      markError(consent.closest(".field"), T("v.consent"));
    }
    const truthConsent = stepEl.querySelector("#truth_consent");
    if (truthConsent && !truthConsent.checked) {
      ok = false;
      markError(truthConsent.closest(".field"), T("v.consent"));
    }
    return ok;
  }

  // Moroccan phone: 06/07/05 + 8 digits, or +212/212 + (5-7) + 8 digits
  function isValidMaPhone(v) {
    var s = v.replace(/[\s\-().]/g, "");
    return /^(?:\+212|212|0)[567]\d{8}$/.test(s);
  }

  function fail(inp, msg) { markError(inp.closest(".field"), msg); return true; }  function markError(holder, msg) {
    if (!holder) return true;
    holder.classList.add("has-error");
    if (!holder.querySelector(".field-error")) {
      const e = document.createElement("div");
      e.className = "field-error"; e.textContent = msg;
      holder.appendChild(e);
    }
    return true;
  }

  /* ---------- navigation ---------- */
  nextBtn.addEventListener("click", () => {
    if (!validateStep(current)) { track("FormValidationError", { step: current + 1, form_type: "teacher" }); return; }
    if (current < total - 1) {
      track("FormStepComplete", { step: current + 1, form_type: "teacher" });
      current++;
      savePartial(current);   // save progress the moment they advance (upsert, non-blocking)
      showStep(current);
    }
  });
  prevBtn.addEventListener("click", () => { if (current > 0) { track("FormStepBack", { step: current + 1, form_type: "teacher" }); showStep(--current); } });

  /* ---------- helpers ---------- */
  function clearStatus() { statusBox.hidden = true; statusBox.className = "form-status"; statusBox.textContent = ""; }
  function setStatus(type, msg) { statusBox.hidden = false; statusBox.className = "form-status " + type; statusBox.textContent = msg; }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, type: file.type, data: r.result.split(",")[1] });
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function collectData() {
    const data = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) continue;            // files handled separately
      if (data[k]) data[k] = [].concat(data[k], v).join(", ");  // multi-checkbox -> joined
      else data[k] = v;
    }
    return data;
  }

  function showSuccess() {
    try { localStorage.removeItem(SID_KEY); } catch (e) {}   // completed -> reset id
    var shareUrl = location.protocol.indexOf("http") === 0 ? location.origin + location.pathname : SHARE_URL;
    var waMsg = T("wa.msg") + " " + shareUrl;
    var wa = document.getElementById("waShare");
    if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(waMsg);
    form.hidden = true;
    var pg = document.querySelector(".progress");
    if (pg) pg.hidden = true;
    successScreen.hidden = false;
    if (window.linkifyConfetti) window.linkifyConfetti();
    if (window.lenis) window.lenis.scrollTo(successScreen, { offset: -120 });
    else successScreen.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- progressive file upload (reliability engine) ----------
     Every file is uploaded the moment the teacher advances past its step,
     so the FINAL submit carries little-to-no file data -> small, fast, and
     reliable even on weak mobile connections (the intermittent submit error).

     _sentFiles maps a fieldId -> signature of what we last uploaded for it.
     If the attachment later changes (re-picked / more files), the signature
     changes and it is re-uploaded. Marks are optimistic and are rolled back
     if the upload turns out to have failed, so no file is ever silently lost. */
  const FILE_FIELDS = { cv: "single", certs: "multi", work_cert: "multi", photo: "single" };
  const _sentFiles = {};

  function fileSig(files) {
    if (!files || !files.length) return "";
    const parts = [];
    for (let i = 0; i < files.length; i++) parts.push(files[i].name + "|" + files[i].size + "|" + files[i].lastModified);
    return parts.join("::");
  }

  // Base64-encode only the file fields whose current attachment differs from
  // what we last uploaded. Marks them as sent optimistically and returns both
  // the payload piece and the list of ids so the caller can roll back on error.
  async function collectPendingFiles() {
    const out = {};
    const ids = [];
    for (const id in FILE_FIELDS) {
      const el = document.getElementById(id);
      if (!el || !el.files || !el.files.length) continue;
      const sig = fileSig(el.files);
      if (_sentFiles[id] === sig) continue;              // unchanged -> already uploaded
      if (FILE_FIELDS[id] === "single") {
        if (el.files[0].size > MAX_FILE_MB * 1024 * 1024) continue;
        try { out[id] = await fileToBase64(el.files[0]); } catch (e) { continue; }
      } else {
        const arr = [];
        for (let i = 0; i < el.files.length && i < 5; i++) {
          if (el.files[i].size <= MAX_FILE_MB * 1024 * 1024) {
            try { arr.push(await fileToBase64(el.files[i])); } catch (e) {}
          }
        }
        if (!arr.length) continue;
        out[id] = arr;
      }
      _sentFiles[id] = sig;                              // optimistic mark
      ids.push(id);
    }
    return { files: out, ids: ids };
  }

  function rollbackFiles(ids) { (ids || []).forEach(function (id) { delete _sentFiles[id]; }); }

  // Treat an Apps Script response as a success unless it explicitly reports a problem.
  function isSaveOk(result) {
    return !result || !result.status ||
      result.status === "success" || result.status === "duplicate" || result.status === "ignored";
  }

  /* ---------- progressive partial save (retargeting + reliability) ----------
     Fires on every "next". Saves text fields (fast) and uploads any newly
     attached files so they're captured even if the teacher never finishes.
     Non-blocking + silent; runs in the background (not awaited by the click). */
  async function savePartial(reachedIndex) {
    let sentIds = [];
    try {
      const hp = document.getElementById("website");
      if (hp && hp.value.trim()) return;                 // bot -> ignore
      if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) return; // backend not wired yet

      const payload = collectData();
      payload.submissionId = SUBMISSION_ID;
      payload.currentStep = reachedIndex;                 // 0-based step to resume at
      payload.partial = true;
      payload.status = "partial";
      payload.updatedAt = new Date().toISOString();
      payload.resumeUrl = buildResumeUrl();

      // Upload every file that's been attached so far (and not yet uploaded).
      const pending = await collectPendingFiles();
      sentIds = pending.ids;
      if (sentIds.length) payload.files = pending.files;

      // keepalive has a ~64KB body cap, so only use it for the light text-only
      // saves; when files ride along, send a normal fetch (no size cap).
      const hasFiles = sentIds.length > 0;
      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        keepalive: !hasFiles
      }).then(function (res) {
        if (!hasFiles) return;                            // text-only: fire-and-forget
        return res.text().then(function (txt) {
          let j = null; try { j = JSON.parse(txt); } catch (e) {}
          if (!isSaveOk(j)) throw new Error("logical");   // server rejected -> roll back files
        });
      }).catch(function () {
        rollbackFiles(sentIds);   // upload failed -> final submit will re-send these files
      });
    } catch (e) { rollbackFiles(sentIds); /* silent */ }
  }

  /* ---------- resume where you stopped ----------
     Opened from a WhatsApp/email link like ...?resume=TOKEN
     Fetches saved fields, prefills them, and jumps to the saved step. */
  async function loadResume(token) {
    // defense in depth: only accept safe token characters
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(token))) return;
    try {
      setStatus("loading", "جاري استرجاع بياناتك المحفوظة…");
      const res = await fetch(GOOGLE_SCRIPT_URL + "?resume=" + encodeURIComponent(token), { method: "GET" });
      const data = await res.json();
      clearStatus();
      if (!data || data.status !== "found" || !data.record) return;
      prefill(data.record);
      const idx = parseInt(data.record.currentStep, 10);
      if (!isNaN(idx) && idx >= 0 && idx < total) { current = idx; showStep(current); }
    } catch (e) { clearStatus(); /* fall back to a fresh form */ }
  }

  function prefill(rec) {
    Object.keys(rec).forEach(function (key) {
      const val = rec[key];
      if (val === "" || val === null || val === undefined) return;
      let els;
      try { els = form.querySelectorAll('[name="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); }
      catch (e) { return; }
      if (!els || !els.length) return;
      const first = els[0];
      if (first.type === "radio") {
        els.forEach(function (r) { if (r.value === String(val)) r.checked = true; });
      } else if (first.type === "checkbox") {
        const vals = String(val).split(",").map(function (s) { return s.trim(); });
        els.forEach(function (c) { if (vals.indexOf(c.value) !== -1) c.checked = true; });
      } else if (first.type === "file") {
        /* files can't be prefilled for security reasons — user re-attaches */
      } else {
        first.value = val;
      }
    });
    // re-run conditional logic so restored values reveal the right fields
    ["city", "diploma"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.dispatchEvent(new Event("change"));
    });
    form.querySelectorAll('input[name="has_experience"]').forEach(function (r) { if (r.checked) r.dispatchEvent(new Event("change")); });
    form.querySelectorAll('input[name="track"]').forEach(function (r) { if (r.checked) r.dispatchEvent(new Event("change")); });
    const so = document.getElementById("skill_other");
    if (so && so.checked) so.dispatchEvent(new Event("change"));
    filterSubjects();
    applyTrackUI();
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateStep(current)) return;

    // anti-spam: honeypot filled OR submitted unrealistically fast => silently drop (bot)
    var hp = document.getElementById("website");
    if ((hp && hp.value.trim()) || (Date.now() - FORM_LOADED_AT) < 2500) {
      showSuccess();
      return;
    }

    if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
      setStatus("error", "النموذج غير متصل بعد بـ Google. (راجع SETUP.md والصق رابط الـ Web App في form.js)");
      return;
    }

    submitBtn.disabled = true; prevBtn.disabled = true;
    const submitLabel = submitBtn.textContent;
    submitBtn.textContent = T("st.sending");
    setStatus("loading", T("st.uploading"));
    track("FormSubmitAttempt", { form_type: "teacher" });

    let _submitFileIds = [];
    try {
      const payload = collectData();
      // Only carry files that weren't already uploaded during the partial saves.
      // In the common path that's just the photo (last step) or nothing at all,
      // making the final request tiny and reliable on weak mobile networks.
      const pending = await collectPendingFiles();
      _submitFileIds = pending.ids;
      payload.files = pending.files;
      payload.submittedAt = new Date().toISOString();
      payload.submissionId = SUBMISSION_ID;
      payload.status = "complete";
      payload.partial = false;
      payload.currentStep = total - 1;
      payload.resumeUrl = buildResumeUrl();

      // text/plain = "simple request" => no CORS preflight; Apps Script returns a
      // readable JSON response with Access-Control-Allow-Origin: *
      // Retry up to 3 times to ride out transient network / Apps Script hiccups
      // (the intermittent error some users hit). Data errors are NOT retried.
      const _body = JSON.stringify(payload);
      let result = null, lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: _body,
          });
          result = null;
          try { result = await res.json(); } catch (e) { /* unreadable -> assume it went through */ }

          if (!result || !result.status ||
              result.status === "success" || result.status === "duplicate" || result.status === "ignored") {
            lastErr = null; break;                              // saved OK
          }
          if (result.status === "invalid") throw new Error("invalid"); // data problem: don't retry
          lastErr = new Error(result.status);                   // transient (error/rate_limited): retry
        } catch (e) {
          if (e && e.message === "invalid") throw e;            // don't retry data errors
          lastErr = e;                                          // network error: retry
        }
        if (attempt < 3) await new Promise(function (r) { setTimeout(r, attempt * 1500); }); // backoff
      }
      if (lastErr) throw lastErr;

      var _m = collectData();
      _trkSubmitted = true;
      track("CompleteRegistration", { content_name: "teacher" });
      track("Lead", { content_category: "teacher" });
      track("TeacherRegistered", { city: _m.city || "", track_field: _m.track || "", diploma: _m.diploma || "", has_experience: _m.has_experience || "" });
      showSuccess();
    } catch (err) {
      rollbackFiles(_submitFileIds);   // this submit failed -> re-include its files on next click
      track("FormSubmitError", { form_type: "teacher" });
      setStatus("error", T("st.error"));
      submitBtn.disabled = false; prevBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });

  /* ---------- analytics event wiring (files, CTAs, scroll, time, abandon) ---------- */
  ["cv", "certs", "photo", "work_cert"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", function () {
      if (el.files && el.files.length) track("FileAttached", { field: id, count: el.files.length, form_type: "teacher" });
    });
  });
  document.querySelectorAll('[data-i18n="hero.cta"], [data-i18n="nav.cta"], [data-i18n="nav.register"]').forEach(function (a) {
    a.addEventListener("click", function () { track("HeroCTAClick", { form_type: "teacher" }); });
  });
  document.querySelectorAll('[data-i18n="nav.schools"], [data-i18n="sc.cta"]').forEach(function (a) {
    a.addEventListener("click", function () { track("CrossNav", { to: "schools" }); });
  });
  (function () {
    var fired = {};
    function onScroll(e) {
      var pct;
      if (e && typeof e.progress === "number") pct = Math.round(e.progress * 100);           // Lenis instance
      else if (e && typeof e.scroll === "number" && e.limit) pct = Math.round(e.scroll / e.limit * 100);
      else {
        var h = document.documentElement;
        var top = h.scrollTop || document.body.scrollTop || (window.pageYOffset || 0);
        var height = (h.scrollHeight - h.clientHeight) || 1;
        pct = Math.round(top / height * 100);
      }
      [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !fired[m]) { fired[m] = 1; track("ScrollDepth", { percent: m, form_type: "teacher" }); } });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    if (window.lenis && typeof window.lenis.on === "function") { try { window.lenis.on("scroll", onScroll); } catch (e) {} }
  })();
  [30, 60, 120, 300].forEach(function (sec) { setTimeout(function () { track("TimeOnPage", { seconds: sec, form_type: "teacher" }); }, sec * 1000); });
  function _trkAbandon() {
    if (_trkStarted && !_trkSubmitted && !_trkAbandonFired) {
      _trkAbandonFired = true;
      track("FormAbandoned", { last_step: _trkMaxStep + 1, form_type: "teacher" });
    }
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") _trkAbandon(); });
  window.addEventListener("pagehide", _trkAbandon);

  /* init */
  showStep(0, false);
  if (RESUME_TOKEN) loadResume(RESUME_TOKEN);
});
