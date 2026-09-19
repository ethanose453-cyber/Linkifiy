/* ===========================================================
   Linkify.ma — facilitator registration form logic
   Multi-step + conditional logic + file upload to Google Apps Script
   Adapted from form.js (teacher engine). Posts to the SAME Web App URL
   as the teacher/admin forms, with profile_type=facilitator so the one
   backend routes it to the "Facilitators" tab.
   =========================================================== */

/* 🔴🔴🔴 نفس رابط الـ Web App ديال form.js / administration-form.js 🔴🔴🔴 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const MAX_FILE_MB = 10;
const MAX_FIELD_TOTAL_MB = 20;
const SHARE_URL = "https://linkify.ma/facilitators"; // official facilitators page

/* ---------- stable submission id + resume token ----------
   Its OWN localStorage key so it never collides with the teacher/admin
   forms on the same origin. Resume fetch uses t=f (teacher form omits it,
   admin uses t=a) so the backend returns the facilitator record. */
const SID_KEY = "linkify-fac-sid";
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
var FB_CURRENCY = "MAD";
var FB_VALUE = { FormStepComplete: 5, Lead: 25, CompleteRegistration: 25, FacilitatorRegistered: 25 };
function track(name, params) {
  params = params || {};
  if (FB_VALUE[name] != null && params.value == null) { params.value = FB_VALUE[name]; params.currency = FB_CURRENCY; }
  try {
    if (typeof window.fbq === "function") window.fbq(FB_STD[name] ? "track" : "trackCustom", name, params);
    if (typeof window.gtag === "function") window.gtag("event", name, params);
    if (window.dataLayer && typeof window.dataLayer.push === "function") window.dataLayer.push(Object.assign({ event: name }, params));
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
  track("ViewContent", { content_name: "facilitator_lp", content_category: "facilitator" });
  track("FacilitatorLPView");
  if (RESUME_TOKEN) track("ResumeLinkOpened", { form_type: "facilitator" });
  form.addEventListener("focusin", function () { if (!_trkStarted) { _trkStarted = true; track("FormStart", { form_type: "facilitator" }); } });

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
    /* Always say how much is left, so a short step never reads as the last one. */
    if (stepHint) {
      if (i === total - 1) stepHint.textContent = T("form.almostThere");
      else {
        const left = total - 1 - i;
        const key = (left === 1) ? "form.remaining1" : (left === 2) ? "form.remaining2" : "form.remaining";
        stepHint.textContent = T(key).replace("{n}", left);
      }
    }
    prevBtn.hidden   = i === 0;
    nextBtn.hidden   = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    if (i > _trkMaxStep) _trkMaxStep = i;
    track("FormStepView", { step: i + 1, form_type: "facilitator" });
    updateDomainsCount();
    updateStrength();
    clearStatus();
    if (scroll !== false) scrollToForm();
  }

  function scrollToForm() {
    const target = document.querySelector(".progress") || document.getElementById("register") || form;
    if (!target) return;
    const HEADER = 80;
    function go() {
      if (window.lenis && typeof window.lenis.scrollTo === "function") {
        window.lenis.scrollTo(target, { offset: -HEADER, force: true, duration: 0.6 });
      } else {
        const y = target.getBoundingClientRect().top + window.pageYOffset - HEADER;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    }
    requestAnimationFrame(function () { requestAnimationFrame(go); });
  }

  /* ---------- conditional logic ---------- */
  const cityOther     = document.getElementById("city-other-wrap");
  const domainOther   = document.getElementById("domain-other-wrap");
  const diplomaOther  = document.getElementById("diploma-other-wrap");
  const equipmentWrap = document.getElementById("equipment-list-wrap");

  function toggle(el, show) {
    if (!el) return;
    el.hidden = !show;
    el.querySelectorAll("input, select, textarea").forEach(inp => {
      if (show && inp.dataset.req === "1") inp.required = true;
      if (!show) { inp.required = false; }
    });
  }

  // city -> "autre ville"
  const citySel = document.getElementById("city");
  if (citySel) citySel.addEventListener("change", e => {
    const show = e.target.value === "autre ville";
    const inp = document.getElementById("city_other");
    if (inp) inp.dataset.req = "1";
    toggle(cityOther, show);
  });

  // "مجال آخر" -> reveal the free-text domain field, required while shown
  const domainOtherCb = document.getElementById("workshop_domain_other");
  if (domainOtherCb && domainOther) {
    const syncDomainOther = () => {
      const inp = document.getElementById("workshop_domain_other_text");
      if (inp) inp.dataset.req = "1";
      toggle(domainOther, domainOtherCb.checked && !domainOtherCb.closest("[hidden]"));
    };
    domainOtherCb.addEventListener("change", function () { syncDomainOther(); updateDomainsCount(); updateStrength(); });
    syncDomainOther();
  }

  // diploma -> "autre" reveals the free-text "other diploma" field (mirrors teacher form)
  const diplomaSel = document.getElementById("diploma");
  if (diplomaSel && diplomaOther) diplomaSel.addEventListener("change", e => {
    const inp = document.getElementById("diploma_other");
    if (inp) inp.dataset.req = "1";
    toggle(diplomaOther, e.target.value === "autre");
  });

  // has_equipment -> reveal the equipment list when "نعم"
  const hasEquip = document.getElementById("has_equipment");
  if (hasEquip && equipmentWrap) hasEquip.addEventListener("change", e => toggle(equipmentWrap, e.target.value === "نعم"));

  /* ---------- "I'll send my CV later" (escape hatch) ---------- */
  const cvInput = document.getElementById("cv");
  const cvLater = document.getElementById("cv_later");
  if (cvInput && cvLater) {
    const syncCvLater = () => {
      cvInput.required = !cvLater.checked;
      const holder = cvInput.closest(".field");
      if (holder && cvLater.checked) {
        holder.classList.remove("has-error");
        const e = holder.querySelector(".field-error"); if (e) e.remove();
      }
    };
    cvLater.addEventListener("change", function () { syncCvLater(); updateStrength(); });
    cvInput.addEventListener("change", function () {
      if (cvInput.files && cvInput.files.length && cvLater.checked) { cvLater.checked = false; syncCvLater(); }
    });
    syncCvLater();
  }

  /* ---------- collapsible option groups ----------
     Collapse is a CLASS (.is-collapsed), never the hidden attribute:
     validateStep() ignores members inside [hidden], so collapsing that way
     would silently let a required group be skipped. Errors force open. */
  function bindCollapse(btnId, panelId, onToggle) {
    const btn = document.getElementById(btnId), panel = document.getElementById(panelId);
    if (!btn || !panel) return null;
    const set = (open) => {
      panel.classList.toggle("is-collapsed", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (onToggle) onToggle(open);
    };
    btn.addEventListener("click", () => set(panel.classList.contains("is-collapsed")));
    return { open: () => set(true), close: () => set(false), isOpen: () => !panel.classList.contains("is-collapsed") };
  }

  // workshop_domains: the long 17-item group. Starts CLOSED (is-collapsed in HTML).
  const domainsPanel = bindCollapse("domainsToggle", "domainsPanel");

  /* Count + names of the chosen domains, so a collapsed panel still shows the
     answer and an open one gives feedback on a 17-item list. */
  function updateDomainsCount() {
    const countEl = document.getElementById("domainsCount");
    const summaryEl = document.getElementById("domainsSummary");
    if (!countEl) return;
    const picked = [...form.querySelectorAll('input[name="workshop_domains"]:checked')];
    if (!picked.length) {
      countEl.textContent = T("fac.f.domainsPick");
      if (summaryEl) { summaryEl.hidden = true; summaryEl.textContent = ""; }
      return;
    }
    const key = picked.length === 1 ? "fac.f.domainsCount1" : picked.length === 2 ? "fac.f.domainsCount2" : "fac.f.domainsCount";
    countEl.textContent = T(key).replace("{n}", picked.length);
    if (summaryEl) {
      summaryEl.textContent = picked.map(cb => (cb.parentElement.querySelector("span") || {}).textContent || cb.value).join(" · ");
      summaryEl.hidden = false;
    }
  }
  form.querySelectorAll('input[name="workshop_domains"]').forEach(cb =>
    cb.addEventListener("change", function () { updateDomainsCount(); updateStrength(); })
  );

  /* ---------- per-day availability picker ----------
     Ticking a day (input[name=available_days]) reveals a per-day period
     sub-group beneath it; unticking hides + clears it. Within each day,
     "متاح طوال اليوم" (data-fac-allday) is mutually exclusive with the three
     specific periods (mirrors the data-ct-any pattern in form.js, but scoped
     per day and independent across days). The picker collapses into ONE
     structured free-text field written to input[name=availability].

     SERIALIZATION FORMAT (single `availability` field):
       - day-blocks joined by ' | ' (space-pipe-space)
       - within a day: 'DAY: p1، p2' where periods are joined by '، '
         (Arabic comma U+060C + space)
       - a ticked day with NO period chosen is OMITTED from the string
       Example: 'الإثنين: صباحاً، بعد الظهر | الأربعاء: متاح طوال اليوم'
     This string never contains ', ' (ASCII comma-space), so it can never
     collide with the ENUM_MULTI ', '-split on the backend. */
  var rebuildAvailability = function () {};
  var applyAvailabilityString = function () {};
  (function () {
    var DAY_SEP = " | ", PERIOD_SEP = "، ";   // '، ' = U+060C + space (see comment above)
    var dayBoxes = [].slice.call(form.querySelectorAll('input[name="available_days"]'));
    if (!dayBoxes.length) return;
    var hidden = form.querySelector('input[name="availability"]');

    function subGroup(day) {
      return form.querySelector('[data-day-periods="' + (window.CSS && CSS.escape ? CSS.escape(day) : day) + '"]');
    }
    function periodInputs(day) {
      return [].slice.call(form.querySelectorAll('input[data-day="' + (window.CSS && CSS.escape ? CSS.escape(day) : day) + '"][data-period]'));
    }
    function allDayInput(day) {
      return form.querySelector('input[data-day="' + (window.CSS && CSS.escape ? CSS.escape(day) : day) + '"][data-fac-allday]');
    }

    // Reveal/clear a day's sub-group when its day box toggles.
    function syncDayVisibility(box) {
      var grp = subGroup(box.value);
      if (!grp) return;
      grp.classList.toggle("is-collapsed", !box.checked);
      if (!box.checked) {
        periodInputs(box.value).forEach(function (p) { p.checked = false; p.disabled = false; });
      }
    }

    // Per-day all-day exclusion (mirrors data-ct-any, scoped to one day).
    function syncExclusion(day) {
      var allday = allDayInput(day);
      if (!allday) return;
      var others = periodInputs(day).filter(function (p) { return !p.hasAttribute("data-fac-allday"); });
      others.forEach(function (p) {
        p.disabled = allday.checked;
        if (allday.checked) p.checked = false;
      });
    }

    // Read the DOM and write the single serialized string into the hidden input.
    rebuildAvailability = function () {
      if (!hidden) return;
      var blocks = [];
      dayBoxes.forEach(function (box) {
        if (!box.checked) return;
        var periods = periodInputs(box.value)
          .filter(function (p) { return p.checked; })
          .map(function (p) { return p.getAttribute("data-period"); });
        if (!periods.length) return;                 // ticked day with no period -> omitted
        blocks.push(box.value + ": " + periods.join(PERIOD_SEP));
      });
      hidden.value = blocks.join(DAY_SEP);
    };

    dayBoxes.forEach(function (box) {
      box.addEventListener("change", function () {
        syncDayVisibility(box);
        rebuildAvailability();
        updateStrength();
      });
      // wire every period input for this day
      periodInputs(box.value).forEach(function (p) {
        p.addEventListener("change", function () {
          if (p.hasAttribute("data-fac-allday")) {
            syncExclusion(box.value);
          } else if (p.checked) {
            // picking a specific period contradicts all-day -> release it
            var allday = allDayInput(box.value);
            if (allday && allday.checked) { allday.checked = false; syncExclusion(box.value); }
          }
          rebuildAvailability();
          updateStrength();
        });
      });
      // reflect any pre-checked state on init
      syncDayVisibility(box);
      syncExclusion(box.value);
    });

    /* Parse a serialized availability string and re-tick the matching boxes,
       revealing sub-groups and restoring the exclusion state. Unknown day or
       period tokens are skipped. Used by prefill(). */
    applyAvailabilityString = function (str) {
      if (!str) return;
      String(str).split(DAY_SEP).forEach(function (block) {
        var idx = block.indexOf(": ");
        if (idx === -1) return;
        var day = block.slice(0, idx).trim();
        var rest = block.slice(idx + 2);
        var box = dayBoxes.filter(function (b) { return b.value === day; })[0];
        if (!box) return;                            // unknown day token -> skip
        box.checked = true;
        syncDayVisibility(box);
        rest.split(PERIOD_SEP).forEach(function (per) {
          per = per.trim();
          if (!per) return;
          var input = periodInputs(day).filter(function (p) { return p.getAttribute("data-period") === per; })[0];
          if (input) input.checked = true;           // unknown period token -> skip
        });
        syncExclusion(day);
      });
      rebuildAvailability();
    };

    rebuildAvailability();                           // init the hidden field once
  })();

  /* ---------- profile strength ----------
     Weights = value to Linkify. cv, top_3_domains, ready_now_specialty and
     workshop_domains carry the most weight; photo/certificate are medium.
     No needsExp branches (every field applies to every facilitator), so 100%
     is always reachable. */
  const STRENGTH = [
    { k: "full_name", w: 2 }, { k: "whatsapp", w: 3 }, { k: "email", w: 2 },
    { k: "age", w: 1 }, { k: "city", w: 2 }, { k: "neighborhood", w: 1 },
    { k: "diploma", w: 2 },
    { k: "portfolio_url", w: 1, tip: "fac.tip.portfolio" },
    { k: "workshop_domains", w: 6, tip: "fac.tip.domains" },
    { k: "top_3_domains", w: 5, tip: "fac.tip.top3" },
    { k: "ready_now_specialty", w: 5, tip: "fac.tip.readyNow" },
    { k: "years_experience", w: 2 }, { k: "workshops_done", w: 1 },
    { k: "workshop_languages", w: 2, tip: "fac.tip.languages" },
    { k: "workshop_example", w: 2, tip: "fac.tip.example" },
    { k: "past_venues", w: 1 }, { k: "past_institutions", w: 1 },
    { k: "age_groups", w: 2, tip: "fac.tip.ageGroups" }, { k: "age_group_best", w: 1 },
    { k: "max_participants", w: 1 },
    { k: "availability", w: 2, tip: "fac.tip.availableDays" },
    { k: "available_holidays", w: 1 },
    { k: "workshops_per_week", w: 1 }, { k: "workshops_per_day", w: 1 },
    { k: "transport", w: 1 }, { k: "work_cities", w: 2, tip: "fac.tip.workCities" },
    { k: "max_commute", w: 1 }, { k: "multi_same_city", w: 1 }, { k: "notice_needed", w: 1 },
    { k: "pay_per_workshop", w: 1 }, { k: "auto_entrepreneur", w: 1 },
    { k: "has_equipment", w: 1 }, { k: "has_laptop", w: 1 },
    { k: "can_use_linkify_equipment", w: 1 }, { k: "prep_time", w: 1 },
    { k: "ready_demo", w: 2 }, { k: "accept_evaluation", w: 1 }, { k: "accept_guide", w: 1 },
    { k: "can_repeat_quality", w: 1 }, { k: "cancel_notice", w: 1 },
    { k: "proposed_workshop_name", w: 2, tip: "fac.tip.proposed" },
    { file: "cv", w: 8, tip: "fac.tip.cv" },
    { file: "photo", w: 3, tip: "fac.tip.photo" },
    { file: "certificate", w: 3, tip: "fac.tip.certificate" }
  ];

  function hasValue(item) {
    if (item.file) {
      const el = document.getElementById(item.file);
      if (el && el.files && el.files.length) return true;
      return item.file === "cv" && !!(cvLater && cvLater.checked);
    }
    const els = form.querySelectorAll('[name="' + item.k + '"]');
    if (!els.length) return false;
    if (els[0].type === "radio" || els[0].type === "checkbox")
      return [...els].some(el => el.checked && !el.closest("[hidden]"));
    return String(els[0].value || "").trim() !== "";
  }

  function updateStrength() {
    const box = document.getElementById("strengthBox");
    if (!box) return;
    let total2 = 0, got = 0, best = null;
    STRENGTH.forEach(it => {
      total2 += it.w;
      if (hasValue(it)) got += it.w;
      else if (it.tip && (!best || it.w > best.w)) best = it;
    });
    const pct = total2 ? Math.round((got / total2) * 100) : 0;

    box.hidden = pct === 0;
    document.getElementById("strengthFill").style.width = pct + "%";
    document.getElementById("strengthPct").textContent = T("form.strength").replace("{n}", pct);
    document.getElementById("strengthTip").textContent = best ? T(best.tip) : T("form.strengthFull");
    box.classList.toggle("is-strong", pct >= 80);
  }
  form.addEventListener("input", updateStrength);
  form.addEventListener("change", updateStrength);

  /* ---------- save and finish later ---------- */
  (function () {
    const btn = document.getElementById("saveLaterBtn");
    const box = document.getElementById("resumeBox");
    const linkEl = document.getElementById("resumeLink");
    const copyBtn = document.getElementById("copyResume");
    const waBtn = document.getElementById("waResume");
    if (!btn || !box || !linkEl) return;

    btn.addEventListener("click", function () {
      savePartial(current);
      const url = buildResumeUrl();
      linkEl.value = url;
      if (waBtn) waBtn.href = "https://wa.me/?text=" + encodeURIComponent(T("wa.resumeMsg") + " " + url);
      box.hidden = false;
      track("SaveForLater", { step: current + 1, form_type: "facilitator" });
      try { linkEl.focus(); linkEl.select(); } catch (e) {}
    });

    linkEl.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });

    if (copyBtn) copyBtn.addEventListener("click", function () {
      const done = () => { copyBtn.textContent = T("btn.copied"); setTimeout(function () { copyBtn.textContent = T("btn.copyLink"); }, 2000); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(linkEl.value).then(done, function () { linkEl.select(); });
        else { linkEl.select(); document.execCommand("copy"); done(); }
      } catch (e) { linkEl.select(); }
    });
  })();

  /* ---------- validation for current step ---------- */
  function validateStep(i) {
    let ok = true;
    const stepEl = steps[i];
    stepEl.querySelectorAll(".has-error").forEach(f => f.classList.remove("has-error"));
    stepEl.querySelectorAll(".field-error").forEach(e => e.remove());

    stepEl.querySelectorAll("input, select, textarea").forEach(inp => {
      if (inp.type === "radio" || inp.type === "checkbox") return;
      if (inp.closest("[hidden]")) return;
      if (inp.required && !inp.value.trim()) ok = fail(inp, T("v.required")) && false;
      else if (inp.type === "email" && inp.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value))
        ok = fail(inp, T("v.email")) && false;
      else if (inp.id === "whatsapp" && inp.value && !isValidMaPhone(inp.value))
        ok = fail(inp, T("v.phone")) && false;
    });

    function validateGroup(type) {
      const names = new Set();
      stepEl.querySelectorAll('input[type="' + type + '"][required]')
            .forEach(el => names.add(el.name));
      names.forEach(name => {
        const members = [...stepEl.querySelectorAll('input[name="' + name + '"]')]
                          .filter(el => !el.closest("[hidden]"));
        if (!members.length) return;
        if (!members.some(el => el.checked)) {
          ok = false;
          markError(members[0].closest(".field"), T("v.choose"));
        }
      });
    }
    validateGroup("radio");
    validateGroup("checkbox");

    stepEl.querySelectorAll('input[type="file"]').forEach(f => {
      if (f.closest("[hidden]")) return;
      if (f.required && !f.files.length) { ok = markError(f.closest(".field"), T("v.file")) && false; return; }
      var _total = 0, _tooBig = false;
      for (var _i = 0; _i < f.files.length; _i++) {
        _total += f.files[_i].size;
        if (f.files[_i].size > MAX_FILE_MB * 1024 * 1024) _tooBig = true;
      }
      if (_tooBig) { ok = markError(f.closest(".field"), T("v.fileSize")) && false; return; }
      if (_total > MAX_FIELD_TOTAL_MB * 1024 * 1024) { ok = markError(f.closest(".field"), T("v.filesTotal")) && false; return; }
      if (!f.files.length) return;
      if (f.id === "cv" && !isValidCvFile(f.files[0])) { ok = markError(f.closest(".field"), T("v.cvType")) && false; return; }
    });

    // required consents (each carries its own required attribute)
    ["consent_contact", "consent_data", "consent_truth", "consent_no_guarantee"].forEach(function (id) {
      const c = stepEl.querySelector("#" + id);
      if (c && c.required && !c.checked) { ok = false; markError(c.closest(".field"), T("v.consent")); }
    });

    /* Force open any collapsed panel that now holds an error, so the message
       is visible (it would otherwise render inside a collapsed box). */
    if (!ok) {
      stepEl.querySelectorAll(".collapsible.is-collapsed").forEach(p => {
        const holder = p.closest(".field");
        if (!holder || !holder.classList.contains("has-error")) return;
        const btn = stepEl.querySelector('[aria-controls="' + p.id + '"]');
        if (btn && !btn.disabled) btn.click();
      });
    }
    return ok;
  }

  function isValidMaPhone(v) {
    var s = v.replace(/[\s\-().]/g, "");
    return /^(?:\+212|212|0)[567]\d{8}$/.test(s);
  }

  function isValidCvFile(file) {
    if (!file) return false;
    var mt = String(file.type || "").toLowerCase();
    if (mt.indexOf("image/") === 0) return false;
    return /\.(pdf|doc|docx)$/i.test(String(file.name || ""));
  }

  function fail(inp, msg) { markError(inp.closest(".field"), msg); return true; }
  function markError(holder, msg) {
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
    if (!validateStep(current)) { track("FormValidationError", { step: current + 1, form_type: "facilitator" }); return; }
    if (current < total - 1) {
      track("FormStepComplete", { step: current + 1, form_type: "facilitator" });
      current++;
      savePartial(current);
      showStep(current);
    }
  });
  prevBtn.addEventListener("click", () => { if (current > 0) { track("FormStepBack", { step: current + 1, form_type: "facilitator" }); showStep(--current); } });

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

  /* ---------- outgoing data normalization ----------
     Free-typed values are stored lowercase ASCII to stay matchable. Excluded:
       - whatsapp                                : normalized to +212 instead
       - age / pay_per_workshop / pay_full_service / pay_full_day_3 : numbers
       - workshops_per_week / workshops_per_day  : free-typed numbers (required)
       - consent_* (contact/data/truth/no_guarantee), cv_pending    : fixed markers
       - profile_type                            : backend routing key
       - website                                 : honeypot, must stay untouched
     Arabic option values (days, periods, languages, venues, age groups, select
     options...) contain no Latin letters, so toAscii()+lowercase leaves them
     byte-identical — the enum allow-list matches them verbatim. */
  const NO_LOWER = {
    whatsapp: 1, age: 1, pay_per_workshop: 1, pay_full_service: 1, pay_full_day_3: 1,
    workshops_per_week: 1, workshops_per_day: 1,
    consent_contact: 1, consent_data: 1, consent_truth: 1, consent_no_guarantee: 1,
    cv_pending: 1, profile_type: 1, website: 1,
    availability: 1   // structured free-text (Arabic day/period tokens + ' | ' / '، '); keep verbatim
  };
  const PHONE_FIELDS = { whatsapp: 1 };

  function toAscii(s) {
    try {
      return s.normalize("NFD").replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1").normalize("NFC");
    } catch (e) { return s; }
  }

  function normalizePhoneMa(v) {
    var s = String(v).replace(/[\s\-().]/g, "");
    if (!s) return "";
    if (s.indexOf("00") === 0) s = s.slice(2);
    else if (s.charAt(0) === "+") s = s.slice(1);
    if (s.indexOf("212") === 0) s = s.slice(3);
    else if (s.charAt(0) === "0") s = s.slice(1);
    return /^[567]\d{8}$/.test(s) ? "+212" + s : String(v).trim();
  }

  function collectData() {
    const data = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) continue;
      let val = v;
      if (typeof val === "string") {
        val = val.trim();
        if (PHONE_FIELDS[k]) val = normalizePhoneMa(val);
        else if (!NO_LOWER[k]) val = toAscii(val).toLowerCase();
      }
      if (data[k]) data[k] = [].concat(data[k], val).join(", ");  // multi-checkbox -> joined
      else data[k] = val;
    }
    // Always send cv_pending explicitly (an unticked box is absent from FormData).
    if (cvLater) data.cv_pending = cvLater.checked ? "oui" : "non";
    // Carry the routing key even if the hidden input were ever absent.
    if (!data.profile_type) data.profile_type = "facilitator";
    return data;
  }

  function showSuccess() {
    try { localStorage.removeItem(SID_KEY); } catch (e) {}
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

  /* ---------- progressive file upload (reliability engine) ---------- */
  const FILE_FIELDS = { cv: "single", photo: "single", certificate: "multi" };
  const _sentFiles = {};

  function fileSig(files) {
    if (!files || !files.length) return "";
    const parts = [];
    for (let i = 0; i < files.length; i++) parts.push(files[i].name + "|" + files[i].size + "|" + files[i].lastModified);
    return parts.join("::");
  }

  async function collectPendingFiles() {
    const out = {};
    const ids = [];
    for (const id in FILE_FIELDS) {
      const el = document.getElementById(id);
      if (!el || !el.files || !el.files.length) continue;
      const sig = fileSig(el.files);
      if (_sentFiles[id] === sig) continue;
      if (FILE_FIELDS[id] === "single") {
        if (el.files[0].size > MAX_FILE_MB * 1024 * 1024) continue;
        try { out[id] = await fileToBase64(el.files[0]); } catch (e) { continue; }
      } else {
        const arr = [];
        let _tot = 0;
        for (let i = 0; i < el.files.length; i++) _tot += el.files[i].size;
        if (_tot > MAX_FIELD_TOTAL_MB * 1024 * 1024) continue;
        for (let i = 0; i < el.files.length && i < 5; i++) {
          if (el.files[i].size <= MAX_FILE_MB * 1024 * 1024) {
            try { arr.push(await fileToBase64(el.files[i])); } catch (e) {}
          }
        }
        if (!arr.length) continue;
        out[id] = arr;
      }
      _sentFiles[id] = sig;
      ids.push(id);
    }
    return { files: out, ids: ids };
  }

  function rollbackFiles(ids) { (ids || []).forEach(function (id) { delete _sentFiles[id]; }); }

  // Upload an attachment as soon as it is picked (debounced), not on next "next".
  let _fileSaveTimer = null;
  Object.keys(FILE_FIELDS).forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function () {
      clearTimeout(_fileSaveTimer);
      _fileSaveTimer = setTimeout(function () { savePartial(current); }, 400);
    });
  });

  function isSaveOk(result) {
    return !result || !result.status ||
      result.status === "success" || result.status === "duplicate" || result.status === "ignored";
  }

  /* ---------- progressive partial save ---------- */
  async function savePartial(reachedIndex) {
    let sentIds = [];
    try {
      const hp = document.getElementById("website");
      if (hp && hp.value.trim()) return;
      if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) return;

      const payload = collectData();
      payload.submissionId = SUBMISSION_ID;
      payload.currentStep = reachedIndex;
      payload.partial = true;
      payload.status = "partial";
      payload.updatedAt = new Date().toISOString();
      payload.resumeUrl = buildResumeUrl();

      const pending = await collectPendingFiles();
      sentIds = pending.ids;
      if (sentIds.length) payload.files = pending.files;

      const hasFiles = sentIds.length > 0;
      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        keepalive: !hasFiles
      }).then(function (res) {
        if (!hasFiles) return;
        return res.text().then(function (txt) {
          let j = null; try { j = JSON.parse(txt); } catch (e) {}
          if (!isSaveOk(j)) throw new Error("logical");
        });
      }).catch(function () {
        rollbackFiles(sentIds);
      });
    } catch (e) { rollbackFiles(sentIds); }
  }

  /* ---------- resume where you stopped ---------- */
  async function loadResume(token) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(token))) return;
    try {
      setStatus("loading", "جاري استرجاع بياناتك المحفوظة…");
      const res = await fetch(GOOGLE_SCRIPT_URL + "?resume=" + encodeURIComponent(token) + "&t=f", { method: "GET" });
      const data = await res.json();
      clearStatus();
      if (!data || data.status !== "found" || !data.record) return;
      prefill(data.record);
      const idx = parseInt(data.record.currentStep, 10);
      if (!isNaN(idx) && idx >= 0 && idx < total) { current = idx; showStep(current); }
    } catch (e) { clearStatus(); }
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
    ["city", "has_equipment", "diploma"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.dispatchEvent(new Event("change"));
    });
    const dcb = document.getElementById("workshop_domain_other");
    if (dcb) dcb.dispatchEvent(new Event("change"));
    if (cvLater) cvLater.dispatchEvent(new Event("change"));
    /* availability is a structured string, not a plain checkbox group: parse it
       so the day + per-day period boxes re-tick, sub-groups reveal, and the
       all-day exclusion state is restored. This also rewrites the hidden input. */
    if (rec.availability) applyAvailabilityString(rec.availability);
    updateDomainsCount();
    updateStrength();
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
      setStatus("error", "النموذج غير متصل بعد بـ Google. (راجع SETUP.md والصق رابط الـ Web App)");
      return;
    }

    const submitLabel = submitBtn.textContent;
    submitBtn.disabled = true; prevBtn.disabled = true;
    submitBtn.textContent = T("st.sending");
    setStatus("loading", T("st.uploading"));
    track("FormSubmitAttempt", { form_type: "facilitator" });

    let _submitFileIds = [];

    // Undo an optimistic success when the server rejected this final submit as "invalid".
    // Restores the form/progress, re-enables the nav, re-persists the SID so the entered data
    // is not lost, rolls back any files marked sent on this attempt (so a corrected resubmit
    // re-sends them), and surfaces an error instead of a false success screen.
    function revertSuccessInvalid() {
      try { localStorage.setItem(SID_KEY, SUBMISSION_ID); } catch (e) {}
      rollbackFiles(_submitFileIds);
      successScreen.hidden = true;
      form.hidden = false;
      var pg = document.querySelector(".progress");
      if (pg) pg.hidden = false;
      submitBtn.disabled = false; prevBtn.disabled = false;
      submitBtn.textContent = submitLabel;
      _trkSubmitted = false;
      track("FormSubmitError", { form_type: "facilitator" });
      setStatus("error", T("st.error"));
      if (window.lenis) window.lenis.scrollTo(form, { offset: -120 });
      else form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Completion payload: all text fields + consents, marked complete.
    const payload = collectData();
    payload.submittedAt = new Date().toISOString();
    payload.submissionId = SUBMISSION_ID;
    payload.status = "complete";
    payload.partial = false;
    payload.currentStep = total - 1;
    payload.resumeUrl = buildResumeUrl();

    // (1) GUARANTEED capture — light, text-only "complete" save.
    // We keep the optimistic, non-blocking UX (success is shown right away in step 3),
    // but we still READ the response: a server "invalid" means the row was rejected
    // (e.g. the age-range rule, or a future ENUM_STRICT refusal), so we must NOT leave the
    // user on a false success screen. On "invalid" we revert to the form and show an error,
    // mirroring administration-form.js which throws on invalid. Non-"invalid" outcomes
    // (success/duplicate/ignored/error/network) keep the always-optimistic behaviour.
    try {
      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.text();
      }).then(function (txt) {
        let j = null; try { j = JSON.parse(txt); } catch (e) {}
        if (j && j.status === "invalid") revertSuccessInvalid();
      }).catch(function () { /* network error: stay optimistic, background upload retries */ });
    } catch (e) {}

    // (2) Upload any files not already sent. Background with retries; never blocks success.
    (async function () {
      try {
        const pending = await collectPendingFiles();
        _submitFileIds = pending.ids;
        if (!pending.ids.length) return;
        const heavyBody = JSON.stringify(Object.assign({}, payload, { files: pending.files }));
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(GOOGLE_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: heavyBody
            });
            let r = null; try { r = await res.json(); } catch (e) {}
            // A server "invalid" is NOT success: the record was rejected server-side, so the
            // files were not attached to any row. Do not treat it as terminal — stop retrying
            // (retrying an identical invalid payload cannot succeed) and roll back the sent-file
            // marks so a later corrected save/submit re-sends them instead of silently dropping.
            if (r && r.status === "invalid") { rollbackFiles(_submitFileIds); return; }
            if (!r || !r.status || r.status === "success" || r.status === "duplicate" || r.status === "ignored") return;
          } catch (e) {}
          if (attempt < 3) await new Promise(function (res) { setTimeout(res, attempt * 1500); });
        }
        rollbackFiles(_submitFileIds);
      } catch (e) { rollbackFiles(_submitFileIds); }
    })();

    // (3) Show success immediately.
    var _m = collectData();
    _trkSubmitted = true;
    track("CompleteRegistration", { content_name: "facilitator" });
    track("Lead", { content_category: "facilitator" });
    track("FacilitatorRegistered", { city: _m.city || "", ready_now: _m.ready_now_specialty || "", years_experience: _m.years_experience || "" });
    showSuccess();
  });

  /* ---------- analytics event wiring (files, CTAs, scroll, time, abandon) ---------- */
  ["cv", "photo", "certificate"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", function () {
      if (el.files && el.files.length) {
        track("FileAttached", { field: id, count: el.files.length, form_type: "facilitator" });
        if (id === "cv" && !isValidCvFile(el.files[0])) markError(el.closest(".field"), T("v.cvType"));
      }
    });
  });
  document.querySelectorAll('[data-i18n="hero.cta"], [data-i18n="nav.cta"], [data-i18n="nav.register"]').forEach(function (a) {
    a.addEventListener("click", function () { track("HeroCTAClick", { form_type: "facilitator" }); });
  });
  document.querySelectorAll('[data-i18n="nav.schools"], [data-i18n="sc.cta"]').forEach(function (a) {
    a.addEventListener("click", function () { track("CrossNav", { to: "schools" }); });
  });
  (function () {
    var fired = {};
    function onScroll(e) {
      var pct;
      if (e && typeof e.progress === "number") pct = Math.round(e.progress * 100);
      else if (e && typeof e.scroll === "number" && e.limit) pct = Math.round(e.scroll / e.limit * 100);
      else {
        var h = document.documentElement;
        var top = h.scrollTop || document.body.scrollTop || (window.pageYOffset || 0);
        var height = (h.scrollHeight - h.clientHeight) || 1;
        pct = Math.round(top / height * 100);
      }
      [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !fired[m]) { fired[m] = 1; track("ScrollDepth", { percent: m, form_type: "facilitator" }); } });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    if (window.lenis && typeof window.lenis.on === "function") { try { window.lenis.on("scroll", onScroll); } catch (e) {} }
  })();
  [30, 60, 120, 300].forEach(function (sec) { setTimeout(function () { track("TimeOnPage", { seconds: sec, form_type: "facilitator" }); }, sec * 1000); });
  function _trkAbandon() {
    if (_trkStarted && !_trkSubmitted && !_trkAbandonFired) {
      _trkAbandonFired = true;
      track("FormAbandoned", { last_step: _trkMaxStep + 1, form_type: "facilitator" });
    }
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") _trkAbandon(); });
  window.addEventListener("pagehide", _trkAbandon);

  /* init */
  showStep(0, false);
  if (RESUME_TOKEN) loadResume(RESUME_TOKEN);
});
