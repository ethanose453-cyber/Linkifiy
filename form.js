/* ===========================================================
   Linkify.ma — registration form logic
   Multi-step + conditional logic + file upload to Google Apps Script
   =========================================================== */

/* 🔴🔴🔴 لصق هنا رابط الـ Web App ديال Google Apps Script (شوف SETUP.md) 🔴🔴🔴 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const MAX_FILE_MB = 5;
const SHARE_URL = "https://linkify.ma"; // بدّل بالرابط النهائي ديال الموقع ملي يكون جاهز

/* ---------- stable submission id + resume token ----------
   Priority: ?resume=TOKEN in URL  →  saved id in localStorage  →  brand new id.
   Reusing the same id means every partial save updates the SAME row (upsert),
   and a WhatsApp resume link (?resume=...) reconnects the visitor to their record. */
const SID_KEY = "linkify-sid";
function makeSid() { return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
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
  const statusBox   = document.getElementById("formStatus");
  const successScreen = document.getElementById("successScreen");

  let current = 0;
  const FORM_LOADED_AT = Date.now();
  document.getElementById("stepTotal").textContent = total;

  /* ---------- step display ---------- */
  function showStep(i, scroll) {
    steps.forEach((s, idx) => {
      const on = idx === i;
      s.hidden = !on;
      s.classList.toggle("is-active", on);
    });
    progressFill.style.width = ((i + 1) / total) * 100 + "%";
    stepNow.textContent = i + 1;
    prevBtn.hidden   = i === 0;
    nextBtn.hidden   = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    filterSubjects();
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
  form.querySelectorAll('input[name="track"]').forEach(r =>
    r.addEventListener("change", filterSubjects)
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
    if (!validateStep(current)) return;
    if (current < total - 1) {
      current++;
      savePartial(current);   // save progress the moment they advance (upsert, non-blocking)
      showStep(current);
    }
  });
  prevBtn.addEventListener("click", () => { if (current > 0) showStep(--current); });

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

  /* ---------- progressive partial save (retargeting engine) ----------
     Fires on every "next". Sends TEXT fields only (fast, no files) so we
     capture the lead even if they never finish. Non-blocking + silent. */
  function savePartial(reachedIndex) {
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

      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        keepalive: true                                   // survives page unload
      }).catch(function () { /* silent: never block the user */ });
    } catch (e) { /* silent */ }
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

    try {
      const payload = collectData();
      const files = {};
      // single-file fields
      for (const id of ["cv", "photo"]) {
        const el = document.getElementById(id);
        if (el && el.files.length) files[id] = await fileToBase64(el.files[0]);
      }
      // multi-file fields: extra certificates + experience proofs (cap at 5 each)
      for (const id of ["certs", "work_cert"]) {
        const el = document.getElementById(id);
        if (el && el.files.length) {
          const arr = [];
          for (let i = 0; i < el.files.length && i < 5; i++) {
            if (el.files[i].size <= MAX_FILE_MB * 1024 * 1024) arr.push(await fileToBase64(el.files[i]));
          }
          if (arr.length) files[id] = arr;
        }
      }
      payload.files = files;
      payload.submittedAt = new Date().toISOString();
      payload.submissionId = SUBMISSION_ID;
      payload.status = "complete";
      payload.partial = false;
      payload.currentStep = total - 1;
      payload.resumeUrl = buildResumeUrl();

      // text/plain = "simple request" => no CORS preflight; Apps Script returns a
      // readable JSON response with Access-Control-Allow-Origin: *
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      let result = null;
      try { result = await res.json(); } catch (e) { /* unreadable -> assume saved */ }

      // explicit server error => surface it (data NOT saved)
      if (result && result.status &&
          result.status !== "success" && result.status !== "duplicate" && result.status !== "ignored") {
        throw new Error(result.message || "server error");
      }

      showSuccess();
    } catch (err) {
      setStatus("error", T("st.error"));
      submitBtn.disabled = false; prevBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });

  /* init */
  showStep(0, false);
  if (RESUME_TOKEN) loadResume(RESUME_TOKEN);
});
