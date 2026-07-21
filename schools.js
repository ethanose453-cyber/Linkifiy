/* ===========================================================
   Linkify.ma - schools (B2B) lead form
   Multi-step wizard + progressive save (same engine as teachers):
   - each "Next" saves progress (upsert by submissionId, formType:school)
   - resume link (?resume=SID&t=s) restores fields + step
   - final submit marks the lead complete
   Values sent as text/plain; backend validates + sanitizes.
   =========================================================== */

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const SID_KEY = "linkify-school-sid";
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
  const base = (location.protocol.indexOf("http") === 0) ? (location.origin + location.pathname) : "https://linkify.ma/schools.html";
  return base + "?resume=" + encodeURIComponent(SUBMISSION_ID) + "&t=s";
}

var FB_STD = { PageView: 1, ViewContent: 1, Lead: 1, CompleteRegistration: 1, Contact: 1, SubmitApplication: 1, Schedule: 1, Search: 1, InitiateCheckout: 1 };
// Estimated monetary value (in MAD) attached to key events so Meta can compute
// ROAS and run value-based optimization (fixes the "missing currency" warning).
// These are ESTIMATES of a lead's worth — tweak to your real economics.
// If your ad account bills in USD, change FB_CURRENCY to "USD".
var FB_CURRENCY = "MAD";
var FB_VALUE = { SchoolLead: 50, Lead: 50, CompleteRegistration: 50, UrgentTeacherRequest: 60, FormStepComplete: 8 };
function track(name, params) {
  params = params || {};
  if (FB_VALUE[name] != null && params.value == null) { params.value = FB_VALUE[name]; params.currency = FB_CURRENCY; }
  try {
    if (typeof window.fbq === "function") window.fbq(FB_STD[name] ? "track" : "trackCustom", name, params);
    if (typeof window.gtag === "function") window.gtag("event", name, params);
    if (window.dataLayer && typeof window.dataLayer.push === "function") window.dataLayer.push(Object.assign({ event: name }, params));
  } catch (e) {}
}
function isValidMaPhone(v) { return /^(?:\+212|212|0)[567]\d{8}$/.test(String(v || "").replace(/[\s\-().]/g, "")); }

document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("schoolForm");
  if (!form) return;

  var steps = Array.from(form.querySelectorAll(".form-step"));
  var total = steps.length;
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var submitBtn = document.getElementById("schoolSubmit");
  var progressFill = document.getElementById("progressFill");
  var stepNow = document.getElementById("stepNow");
  var stepTotal = document.getElementById("stepTotal");
  var statusBox = document.getElementById("schoolStatus");
  var successBox = document.getElementById("schoolSuccess");
  var current = 0;
  var startedFired = false;
  var _trkMaxStep = 0, _trkSubmitted = false, _trkAbandonFired = false;
  var FORM_LOADED_AT = Date.now();
  if (stepTotal) stepTotal.textContent = total;

  track("ViewContent", { content_name: "school_lp", content_category: "school" });
  track("SchoolLPView");
  if (RESUME_TOKEN) track("ResumeLinkOpened", { form_type: "school" });
  form.addEventListener("focusin", function () { if (!startedFired) { startedFired = true; track("SchoolFormStart"); track("FormStart", { form_type: "school" }); } });

  // subject = "other" -> reveal a free-text field
  var subjectSel = document.getElementById("subject");
  var subjectOtherWrap = document.getElementById("subject-other-wrap");
  var subjectOther = document.getElementById("subject_other");
  // administrative-staff options: when chosen, the teaching "level" is irrelevant
  var ADMIN_POS = [
    "مدير(ة) عام / مدير(ة) تربوي (بيداغوجي)", "نائب(ة) المدير / ناظر(ة) المؤسسة", "حارس(ة) عام",
    "مفتش(ة) / مشرف(ة) تربوي(ة)", "مسؤول(ة) الموارد البشرية أو التسجيل",
    "سكرتير(ة) / موظف(ة) إداري / مسؤول(ة) استقبال", "مستشار(ة) في التوجيه / أخصائي(ة) نفسي(ة) أو اجتماعي(ة)",
    "تقني معلوميات / صيانة", "إطار إداري آخر"
  ];
  if (subjectSel && subjectOtherWrap) {
    subjectSel.addEventListener("change", function () {
      var v = subjectSel.value;
      var isAdmin = ADMIN_POS.indexOf(v) !== -1;
      // free-text field for "other subject" OR "other administrative role"
      var show = (v === "مادة أخرى" || v === "إطار إداري آخر");
      subjectOtherWrap.hidden = !show;
      if (subjectOther) { subjectOther.required = show; if (!show) subjectOther.value = ""; }
      // hide + un-require the teaching level when an administrative profile is requested
      var levelSel = document.getElementById("level");
      if (levelSel) {
        var lf = levelSel.closest(".field");
        if (lf) lf.hidden = isAdmin;
        levelSel.required = !isAdmin;
        if (isAdmin) levelSel.value = "";
      }
    });
  }

  // budget = "other" -> reveal custom amount field
  var budgetSel = document.getElementById("budget");
  var budgetCustomWrap = document.getElementById("budget-custom-wrap");
  if (budgetSel && budgetCustomWrap) {
    budgetSel.addEventListener("change", function () {
      budgetCustomWrap.hidden = budgetSel.value !== "مبلغ آخر";
    });
  }

  // contract "لا يهم" -> selecting it clears + disables the specific contract types
  var anyCt = document.querySelector('input[name="contract_types"][data-ct-any]');
  if (anyCt) {
    var otherCt = [].slice.call(document.querySelectorAll('input[name="contract_types"]:not([data-ct-any])'));
    var syncCt = function () { otherCt.forEach(function (c) { c.disabled = anyCt.checked; if (anyCt.checked) c.checked = false; }); };
    anyCt.addEventListener("change", syncCt);
    syncCt();
  }

  function clearStatus() { statusBox.hidden = true; statusBox.className = "form-status"; statusBox.textContent = ""; }
  function setStatus(type, msg) { statusBox.hidden = false; statusBox.className = "form-status " + type; statusBox.textContent = msg; }

  function showStep(i, scroll) {
    steps.forEach(function (s, idx) { var on = idx === i; s.hidden = !on; s.classList.toggle("is-active", on); });
    if (progressFill) progressFill.style.width = ((i + 1) / total) * 100 + "%";
    if (stepNow) stepNow.textContent = i + 1;
    prevBtn.hidden = i === 0;
    nextBtn.hidden = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    if (i > _trkMaxStep) _trkMaxStep = i;
    track("FormStepView", { step: i + 1, form_type: "school" });
    clearStatus();
    if (scroll !== false) scrollToForm();
  }

  function scrollToForm() {
    var target = document.querySelector(".progress") || document.getElementById("request") || form;
    if (!target) return;
    var HEADER = 80;
    function go() {
      var y = target.getBoundingClientRect().top + window.pageYOffset - HEADER;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    requestAnimationFrame(function () { requestAnimationFrame(go); });
  }

  /* ---------- validation ---------- */
  function markError(holder, msg) {
    if (!holder) return;
    holder.classList.add("has-error");
    if (!holder.querySelector(".field-error")) {
      var e = document.createElement("div"); e.className = "field-error"; e.textContent = msg; holder.appendChild(e);
    }
  }
  function validateStep(i) {
    var stepEl = steps[i];
    var ok = true, firstBad = null;
    stepEl.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    stepEl.querySelectorAll(".field-error").forEach(function (e) { e.remove(); });

    stepEl.querySelectorAll("input, select, textarea").forEach(function (inp) {
      if (inp.type === "radio" || inp.type === "checkbox") return;
      if (inp.closest("[hidden]")) return;              // skip hidden conditionals
      if (inp.required && !inp.value.trim()) { ok = false; markError(inp.closest(".field"), "هذا الحقل مطلوب"); if (!firstBad) firstBad = inp; }
      else if (inp.type === "email" && inp.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value)) { ok = false; markError(inp.closest(".field"), "بريد إلكتروني غير صحيح"); if (!firstBad) firstBad = inp; }
      else if (inp.id === "phone" && inp.value && !isValidMaPhone(inp.value)) { ok = false; markError(inp.closest(".field"), "رقم هاتف مغربي غير صحيح"); if (!firstBad) firstBad = inp; }
    });
    var radioGroups = new Set();
    stepEl.querySelectorAll('input[type="radio"][required]').forEach(function (r) { radioGroups.add(r.name); });
    radioGroups.forEach(function (name) {
      var grp = stepEl.querySelectorAll('input[name="' + name + '"]');
      if (![].some.call(grp, function (r) { return r.checked; })) { ok = false; markError(grp[0].closest(".field"), "يرجى الاختيار"); if (!firstBad) firstBad = grp[0]; }
    });
    // required checkbox GROUP: at least one contract type must be chosen
    var ctFirst = stepEl.querySelector('input[name="contract_types"]');
    if (ctFirst && !stepEl.querySelector('input[name="contract_types"]:checked')) {
      ok = false; markError(ctFirst.closest(".field"), "يرجى اختيار نوع عقد واحد على الأقل"); if (!firstBad) firstBad = ctFirst;
    }
    // required consent checkbox
    var usageConsent = stepEl.querySelector("#usage_consent");
    if (usageConsent && !usageConsent.checked) {
      ok = false; markError(usageConsent.closest(".field"), "يجب الموافقة لإتمام الطلب"); if (!firstBad) firstBad = usageConsent;
    }
    if (!ok && firstBad) { var y = firstBad.getBoundingClientRect().top + window.pageYOffset - 100; window.scrollTo({ top: y, behavior: "smooth" }); }
    return ok;
  }

  function collectData() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (v instanceof File) return;
      if (data[k]) data[k] = [].concat(data[k], v).join(", ");
      else data[k] = v;
    });
    return data;
  }

  /* ---------- progressive save ---------- */
  function savePartial(reachedIndex) {
    try {
      var hp = document.getElementById("website");
      if (hp && hp.value.trim()) return;
      var payload = collectData();
      payload.formType = "school";
      payload.submissionId = SUBMISSION_ID;
      payload.currentStep = reachedIndex;
      payload.partial = true;
      payload.status = "partial";
      payload.source = "schools_lp";
      payload.resumeUrl = buildResumeUrl();
      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- resume ---------- */
  async function loadResume(token) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(token))) return;
    try {
      setStatus("loading", "جاري استرجاع بياناتكم…");
      var res = await fetch(GOOGLE_SCRIPT_URL + "?resume=" + encodeURIComponent(token) + "&t=s", { method: "GET" });
      var data = await res.json();
      clearStatus();
      if (!data || data.status !== "found" || !data.record) return;
      prefill(data.record);
      var idx = parseInt(data.record.currentStep, 10);
      if (!isNaN(idx) && idx >= 0 && idx < total) { current = idx; showStep(current); }
    } catch (e) { clearStatus(); }
  }
  function prefill(rec) {
    Object.keys(rec).forEach(function (key) {
      var val = rec[key];
      if (val === "" || val === null || val === undefined) return;
      var els;
      try { els = form.querySelectorAll('[name="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); } catch (e) { return; }
      if (!els || !els.length) return;
      var first = els[0];
      if (first.type === "radio") { els.forEach(function (r) { if (r.value === String(val)) r.checked = true; }); }
      else if (first.type === "checkbox") { var vals = String(val).split(",").map(function (s) { return s.trim(); }); els.forEach(function (c) { if (vals.indexOf(c.value) !== -1) c.checked = true; }); }
      else { first.value = val; }
    });
  }

  /* ---------- navigation ---------- */
  nextBtn.addEventListener("click", function () {
    if (!validateStep(current)) { track("FormValidationError", { step: current + 1, form_type: "school" }); return; }
    if (current < total - 1) { track("FormStepComplete", { step: current + 1, form_type: "school" }); current++; savePartial(current); showStep(current); }
  });
  prevBtn.addEventListener("click", function () { if (current > 0) { track("FormStepBack", { step: current + 1, form_type: "school" }); showStep(--current); } });

  /* ---------- submit ---------- */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validateStep(current)) return;

    var hp = document.getElementById("website");
    if ((hp && hp.value.trim()) || (Date.now() - FORM_LOADED_AT) < 2000) { showSuccess(); return; }

    var payload = collectData();
    payload.formType = "school";
    payload.submissionId = SUBMISSION_ID;
    payload.status = "complete";
    payload.partial = false;
    payload.currentStep = total - 1;
    payload.source = "schools_lp";
    payload.resumeUrl = buildResumeUrl();

    submitBtn.disabled = true; prevBtn.disabled = true;
    var lbl = submitBtn.querySelector("span") ? submitBtn.querySelector("span").textContent : "";
    if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = "جارٍ الإرسال…";
    setStatus("loading", "جارٍ إرسال طلبكم…");

    try {
      var res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      var result = null;
      try { result = await res.json(); } catch (e2) {}
      if (result && result.status && result.status !== "success") throw new Error(result.status);

      _trkSubmitted = true;
      track("SchoolLead", { subject: payload.subject, city: payload.city, need_type: payload.need_type });
      track("Lead", { content_category: "school" });
      if (payload.need_type === "فورية") track("UrgentTeacherRequest", { subject: payload.subject });

      showSuccess();
    } catch (err) {
      setStatus("error", "وقع خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى أو التواصل عبر البريد: contact@linkify.ma");
      submitBtn.disabled = false; prevBtn.disabled = false;
      if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = lbl;
    }
  });

  function showSuccess() {
    try { localStorage.removeItem(SID_KEY); } catch (e) {}
    clearStatus();
    form.hidden = true;
    var pg = document.querySelector(".progress"); if (pg) pg.hidden = true;
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- analytics event wiring (CTAs, scroll, time, abandon) ---------- */
  document.querySelectorAll('[data-i18n="s.hero.cta1"], [data-i18n="s.nav.cta"]').forEach(function (a) {
    a.addEventListener("click", function () { track("HeroCTAClick", { form_type: "school" }); });
  });
  document.querySelectorAll('[data-i18n="s.nav.teachers"], [data-i18n="s.foot.teachers"]').forEach(function (a) {
    a.addEventListener("click", function () { track("CrossNav", { to: "teachers" }); });
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
      [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !fired[m]) { fired[m] = 1; track("ScrollDepth", { percent: m, form_type: "school" }); } });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    if (window.lenis && typeof window.lenis.on === "function") { try { window.lenis.on("scroll", onScroll); } catch (e) {} }
  })();
  [30, 60, 120, 300].forEach(function (sec) { setTimeout(function () { track("TimeOnPage", { seconds: sec, form_type: "school" }); }, sec * 1000); });
  function _trkAbandon() {
    if (startedFired && !_trkSubmitted && !_trkAbandonFired) {
      _trkAbandonFired = true;
      track("FormAbandoned", { last_step: _trkMaxStep + 1, form_type: "school" });
    }
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") _trkAbandon(); });
  window.addEventListener("pagehide", _trkAbandon);

  /* init */
  showStep(0, false);
  if (RESUME_TOKEN) loadResume(RESUME_TOKEN);
});


/* ---------- FAQ accordion: smooth, single-open ---------- */
document.addEventListener("DOMContentLoaded", function () {
  var items = Array.prototype.slice.call(document.querySelectorAll(".faq-item"));
  items.forEach(function (item) {
    var btn = item.querySelector(".faq-q");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var willOpen = !item.classList.contains("open");
      items.forEach(function (o) {
        o.classList.remove("open");
        var b = o.querySelector(".faq-q");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      if (willOpen) {
        item.classList.add("open"); btn.setAttribute("aria-expanded", "true");
        try {
          var qk = btn.querySelector("[data-i18n]");
          if (typeof track === "function") track("FAQOpen", { q: qk ? qk.getAttribute("data-i18n") : (btn.textContent || "").trim().slice(0, 40) });
        } catch (e) {}
      }
    });
  });
});
