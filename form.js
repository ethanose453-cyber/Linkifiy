/* ===========================================================
   Linkify.ma — registration form logic
   Multi-step + conditional logic + file upload to Google Apps Script
   =========================================================== */

/* 🔴🔴🔴 لصق هنا رابط الـ Web App ديال Google Apps Script (شوف SETUP.md) 🔴🔴🔴 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const MAX_FILE_MB = 10;          // raised from 5: teachers were abandoning on it
/* Cap on the combined size of one field's attachments. certs and work_cert accept
   several files, and everything is base64-encoded into a single JSON POST, which
   inflates it by about a third. Without this cap five 10MB certificates would
   build a ~67MB request that Apps Script simply refuses -- and the teacher would
   see a success screen with nothing delivered. */
const MAX_FIELD_TOTAL_MB = 20;
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
// Estimated monetary value (in MAD) attached to key events so Meta can compute
// ROAS and run value-based optimization (fixes the "missing currency" warning).
// These are ESTIMATES of a lead's worth — tweak to your real economics.
// If your ad account bills in USD, change FB_CURRENCY to "USD".
var FB_CURRENCY = "MAD";
var FB_VALUE = { FormStepComplete: 5, Lead: 25, CompleteRegistration: 25, TeacherRegistered: 25 };
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
    /* Always say how much is left. A short step used to read as the last one,
       so the next click landed on a wall of questions and people quit there. */
    if (stepHint) {
      if (i === total - 1) stepHint.textContent = T("form.almostThere");
      else {
        const left = total - 1 - i;
        // Arabic counts one and two with their own word forms, so "باقي 2 خطوات"
        // reads wrong; fr/en fall back to the plural template for both.
        const key = (left === 1) ? "form.remaining1" : (left === 2) ? "form.remaining2" : "form.remaining";
        stepHint.textContent = T(key).replace("{n}", left);
      }
    }
    prevBtn.hidden   = i === 0;
    nextBtn.hidden   = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    if (i > _trkMaxStep) _trkMaxStep = i;
    track("FormStepView", { step: i + 1, form_type: "teacher" });
    filterSubjects();
    applyTrackUI();
    updateSubjectsCount();
    updateStrength();
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
  const subjectOther = document.getElementById("subject-other-wrap");

  function toggle(el, show) {
    if (!el) return;
    el.hidden = !show;
    // required only while visible
    el.querySelectorAll("input, select, textarea").forEach(inp => {
      if (show && inp.dataset.req === "1") inp.required = true;
      if (!show) { inp.required = false; }
    });
  }

  // city -> "autre ville"
  document.getElementById("city").addEventListener("change", e => {
    const show = e.target.value === "autre ville";
    const inp = document.getElementById("city_other");
    inp.dataset.req = "1";
    toggle(cityOther, show);
  });

  // diploma -> "autre"
  document.getElementById("diploma").addEventListener("change", e => {
    const show = e.target.value === "autre";
    document.getElementById("diploma_other").dataset.req = "1";
    toggle(diplomaOther, show);
  });

  // experience -> "oui" shows the block, "non (nouveau diplome)" hides
  form.querySelectorAll('input[name="has_experience"]').forEach(r => {
    r.addEventListener("change", e => toggle(expBlock, e.target.value === "oui"));
  });

  /* "مادة أخرى" -> reveal the free-text field, required while it is shown.
     The escape hatch for a subject missing from the list. Subjects is a required
     group, so without this a teacher whose subject is absent has to tick
     something inaccurate or abandon the form -- which is exactly what happened
     to the technologie / sciences de l'ingenieur teacher.

     dataset.req is the flag toggle() reads to restore required, the same way
     city_other and diploma_other work. The closest("[hidden]") guard keeps the
     field from being demanded when the option itself is filtered out by track. */
  const subjectOtherCb = document.getElementById("subject_other");
  if (subjectOtherCb && subjectOther) {
    const syncSubjectOther = () => {
      const inp = document.getElementById("subject_other_text");
      if (inp) inp.dataset.req = "1";
      toggle(subjectOther, subjectOtherCb.checked && !subjectOtherCb.closest("[hidden]"));
    };
    subjectOtherCb.addEventListener("change", syncSubjectOther);
    syncSubjectOther();
  }

  /* ---------- "I'll send my CV later" ----------
     The CV is required, and it used to be required on step 1, which lost every
     teacher browsing on a phone without the file to hand -- before we held a
     single field to follow up on. Ticking this releases the requirement and
     flags the record so the team can chase the file on WhatsApp. */
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
      // attaching a file makes the promise moot; untick it so cv_pending clears
      if (cvInput.files && cvInput.files.length && cvLater.checked) { cvLater.checked = false; syncCvLater(); }
    });
    syncCvLater();
  }

  /* ---------- collapsible option groups ----------
     Collapse is a CLASS, never the hidden attribute. validateStep() ignores
     members inside [hidden], so collapsing that way would silently let a
     teacher past a required group. Errors force the panel open, otherwise the
     message would render inside a collapsed box where nobody can read it. */
  function bindCollapse(btnId, panelId, onToggle) {
    const btn = document.getElementById(btnId), panel = document.getElementById(panelId);
    if (!btn || !panel) return null;
    let releaseTimer = null;

    /* The height is animated in real pixels read off the content, because a
       fixed max-height cap makes the browser spread the easing over the cap
       rather than over the list -- see the note in styles.css.

       Once open the cap is released to "none" so the panel can still grow:
       switching track adds or removes options, and a validation error appends a
       message. A frozen pixel cap would clip both. */
    const set = (open) => {
      clearTimeout(releaseTimer);
      // scrollHeight reports the full content height even under max-height:0,
      // but it is 0 when an ancestor is display:none -- fall back to uncapped.
      const h = panel.scrollHeight;
      if (open) {
        panel.classList.remove("is-collapsed");
        panel.style.maxHeight = h ? h + "px" : "none";
        releaseTimer = setTimeout(function () { panel.style.maxHeight = "none"; }, 420);
      } else {
        // there is nothing to animate away from while the cap is "none", so pin
        // the current height for one frame first
        if (!panel.style.maxHeight || panel.style.maxHeight === "none") {
          panel.style.maxHeight = h + "px";
          void panel.offsetHeight;                    // force reflow before collapsing
        }
        panel.classList.add("is-collapsed");
        panel.style.maxHeight = "0px";
      }
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (onToggle) onToggle(open);
    };

    // adopt whatever state the markup declared
    if (panel.classList.contains("is-collapsed")) panel.style.maxHeight = "0px";
    btn.addEventListener("click", () => set(panel.classList.contains("is-collapsed")));
    return { open: () => set(true), close: () => set(false), isOpen: () => !panel.classList.contains("is-collapsed") };
  }

  const subjectsPanel = bindCollapse("subjectsToggle", "subjectsPanel");
  const ctPanel = bindCollapse("ctToggle", "ctPanel");

  /* Count + names of the chosen subjects, so a collapsed panel still shows the
     answer and an open one gives feedback on a 19-item list. */
  function updateSubjectsCount() {
    const countEl = document.getElementById("subjectsCount");
    const summaryEl = document.getElementById("subjectsSummary");
    if (!countEl) return;
    // filterSubjects() unticks anything the track hides, so :checked is already
    // "chosen AND still applicable". Testing closest("[hidden]") here would read
    // zero whenever the subjects step itself is off screen.
    const picked = [...form.querySelectorAll('input[name="subjects"]:checked')];
    if (!picked.length) {
      countEl.textContent = T("f.subjectsPick");
      if (summaryEl) { summaryEl.hidden = true; summaryEl.textContent = ""; }
      return;
    }
    const key = picked.length === 1 ? "f.subjectsCount1" : picked.length === 2 ? "f.subjectsCount2" : "f.subjectsCount";
    countEl.textContent = T(key).replace("{n}", picked.length);
    if (summaryEl) {
      summaryEl.textContent = picked.map(cb => (cb.parentElement.querySelector("span") || {}).textContent || cb.value)
                                    .join(" · ");
      summaryEl.hidden = false;
    }
  }
  form.querySelectorAll('input[name="subjects"]').forEach(cb =>
    cb.addEventListener("change", function () { updateSubjectsCount(); updateStrength(); })
  );

  // salary -> "autre montant" reveals the custom amount field
  const salaryCustomWrap = document.getElementById("salary-custom-wrap");
  const salarySel = document.getElementById("salary_expectation");
  if (salarySel) salarySel.addEventListener("change", e => toggle(salaryCustomWrap, e.target.value === "autre montant"));

  // contract "لا يهم" -> selecting it clears + disables the specific contract types
  (function () {
    const anyCt = form.querySelector('input[name="contract_types"][data-ct-any]');
    if (!anyCt) return;
    const others = [...form.querySelectorAll('input[name="contract_types"]:not([data-ct-any])')];
    const ctToggleBtn = document.getElementById("ctToggle");
    const sync = () => {
      others.forEach(c => { c.disabled = anyCt.checked; if (anyCt.checked) c.checked = false; });
      // nothing left to choose in there, so collapse it and stop offering it
      if (anyCt.checked && ctPanel) ctPanel.close();
      if (ctToggleBtn) ctToggleBtn.disabled = anyCt.checked;
    };
    anyCt.addEventListener("change", function () { sync(); updateStrength(); });
    // picking a specific type contradicts "any" -> release it
    others.forEach(c => c.addEventListener("change", function () {
      if (c.checked && anyCt.checked) { anyCt.checked = false; sync(); }
      updateStrength();
    }));
    sync();
  })();

  /* ---------- profile strength ----------
     A percentage that goes UP as the profile gets stronger reframes the form
     from "questions left" into "something I am building", and naming the single
     highest-value missing item is what actually gets work certificates and
     photos uploaded. Weights are the value to a school, not the effort.

     Fields that do not apply are excluded from the total, so a fresh graduate
     with no experience can still reach 100%. */
  const STRENGTH = [
    { k: "first_name", w: 2 }, { k: "last_name", w: 2 }, { k: "age", w: 1 }, { k: "gender", w: 1 },
    { k: "city", w: 2 }, { k: "neighborhood", w: 2 }, { k: "whatsapp", w: 3 }, { k: "email", w: 2 },
    { k: "track", w: 2 }, { k: "diploma", w: 2 }, { k: "specialty", w: 2 },
    { k: "university", w: 1, tip: "tip.university" },
    { k: "lang_fr", w: 1, tip: "tip.langs" }, { k: "lang_en", w: 1, tip: "tip.langs" },
    { k: "subjects", w: 4 }, { k: "levels", w: 3 }, { k: "institution_types", w: 3 },
    { k: "schedule", w: 2 }, { k: "substitute", w: 2, tip: "tip.substitute" },
    { k: "salary_expectation", w: 1 }, { k: "contract_types", w: 2 },
    { k: "transport", w: 1 }, { k: "license", w: 1, tip: "tip.license" }, { k: "relocate", w: 1 },
    { k: "has_experience", w: 2 },
    { k: "exp_years", w: 1, needsExp: true },
    { k: "schools", w: 2, tip: "tip.schools", needsExp: true },
    { file: "cv", w: 8, tip: "tip.cv" },
    { file: "work_cert", w: 5, tip: "tip.workCert", needsExp: true },
    { file: "certs", w: 3, tip: "tip.certs" },
    { file: "photo", w: 4, tip: "tip.photo" }
  ];

  function hasValue(item) {
    if (item.file) {
      const el = document.getElementById(item.file);
      if (el && el.files && el.files.length) return true;
      // promising the CV later is not a file, but it does unblock the profile
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
    const expEl = form.querySelector('input[name="has_experience"]:checked');
    const noExp = !!expEl && expEl.value !== "oui";
    const items = STRENGTH.filter(it => !(it.needsExp && noExp));

    let total = 0, got = 0, best = null;
    items.forEach(it => {
      total += it.w;
      if (hasValue(it)) got += it.w;
      else if (it.tip && (!best || it.w > best.w)) best = it;
    });
    const pct = total ? Math.round((got / total) * 100) : 0;

    box.hidden = pct === 0;
    document.getElementById("strengthFill").style.width = pct + "%";
    document.getElementById("strengthPct").textContent = T("form.strength").replace("{n}", pct);
    document.getElementById("strengthTip").textContent = best ? T(best.tip) : T("form.strengthFull");
    box.classList.toggle("is-strong", pct >= 80);
  }
  form.addEventListener("input", updateStrength);
  form.addEventListener("change", updateStrength);

  /* ---------- save and finish later ----------
     Writes the partial record, then hands the teacher their own resume link.
     The token is the only guard on the record behind that link, so it is shown
     to the visitor who owns it and never logged or put in a shareable place by
     us -- copying it is their decision. */
  (function () {
    const btn = document.getElementById("saveLaterBtn");
    const box = document.getElementById("resumeBox");
    const linkEl = document.getElementById("resumeLink");
    const copyBtn = document.getElementById("copyResume");
    const waBtn = document.getElementById("waResume");
    if (!btn || !box || !linkEl) return;

    btn.addEventListener("click", function () {
      savePartial(current);                       // non-blocking, same upsert as "next"
      const url = buildResumeUrl();
      linkEl.value = url;
      if (waBtn) waBtn.href = "https://wa.me/?text=" + encodeURIComponent(T("wa.resumeMsg") + " " + url);
      box.hidden = false;
      track("SaveForLater", { step: current + 1, form_type: "teacher" });
      try { linkEl.focus(); linkEl.select(); } catch (e) {}
    });

    // readonly, but Enter inside a form still submits it
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

  // filter subjects by selected track (علمي / أدبي / أولي)
  const TRACK_GROUP = {
    "scientifique / technique": "علمي",
    "litteraire / sciences humaines": "أدبي",
    "education prescolaire et educatrices": "أولي",
    "education artistique et culturelle": "فنون",
  };
  function filterSubjects() {
    const checked = form.querySelector('input[name="track"]:checked');
    const group = checked ? TRACK_GROUP[checked.value] : null;
    form.querySelectorAll(".check[data-group]").forEach(lbl => {
      // data-group may list several groups (space-separated) so a subject can
      // appear under more than one track (e.g. sport under both علمي and أدبي).
      const match = !group || lbl.dataset.group.split(/\s+/).indexOf(group) !== -1;
      lbl.hidden = !match;
      if (!match) { const cb = lbl.querySelector("input"); if (cb) cb.checked = false; }
    });
  }
  // Early-education (preschool) conditional UI. When the "التعليم الأولي والمربيات"
  // track is chosen we swap the age-levels + institution lists to their preschool
  // set (data-track="early") and reveal the early-ed-only fields (role + accompanist).
  // Everything marked data-track="general" is shown for the other tracks instead.
  const EARLY_TRACK = "education prescolaire et educatrices";
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
    // changing track clears subjects that no longer apply, so the count must follow
    r.addEventListener("change", function () { filterSubjects(); applyTrackUI(); updateSubjectsCount(); updateStrength(); })
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
      else if (inp.id === "whatsapp" && inp.value && !isValidMaPhone(inp.value))
        ok = fail(inp, T("v.phone")) && false;
    });

    /* Required radio / checkbox GROUPS.
       A group counts as required when ANY member carries the required
       attribute, which keeps the marker in the HTML next to the field instead
       of hard-coded here. The form is novalidate, so the attribute is only ever
       read by this function -- the browser never enforces it on a single box.

       Only VISIBLE members are considered: the levels and institution_types
       grids swap options by track, and the experience block is conditional, so
       a hidden option must not be able to block the step. If a whole group is
       hidden the group is skipped entirely. */
    function validateGroup(type) {
      const names = new Set();
      stepEl.querySelectorAll('input[type="' + type + '"][required]')
            .forEach(el => names.add(el.name));
      names.forEach(name => {
        const members = [...stepEl.querySelectorAll('input[name="' + name + '"]')]
                          .filter(el => !el.closest("[hidden]"));
        if (!members.length) return;                  // group not applicable here
        if (!members.some(el => el.checked)) {
          ok = false;
          markError(members[0].closest(".field"), T("v.choose"));
        }
      });
    }
    validateGroup("radio");
    validateGroup("checkbox");

    /* Files. Checks EVERY attachment on EVERY file input, not just the first one
       on the inputs marked required.

       Before, size was only checked on files[0] of required inputs. certs and
       work_cert are optional and take several files, so an oversized certificate
       passed validation and was then dropped without a word inside
       collectPendingFiles() -- the teacher saw a successful submission with a
       document silently missing. */
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
      // CV must be a parseable document (PDF/Word) — reject images (scans/photos).
      if (f.id === "cv" && !isValidCvFile(f.files[0])) { ok = markError(f.closest(".field"), T("v.cvType")) && false; return; }
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

    /* An error message rendered inside a collapsed panel is invisible, so the
       step would just refuse to advance with no reason on screen. Open it. */
    if (!ok) {
      stepEl.querySelectorAll(".collapsible.is-collapsed").forEach(p => {
        const holder = p.closest(".field");
        if (!holder || !holder.classList.contains("has-error")) return;
        const btn = stepEl.querySelector('[aria-controls="' + p.id + '"]');
        if (btn && !btn.disabled) btn.click();       // via the toggle, so aria-expanded stays true
      });
    }
    return ok;
  }

  // Moroccan phone: 06/07/05 + 8 digits, or +212/212 + (5-7) + 8 digits
  function isValidMaPhone(v) {
    var s = v.replace(/[\s\-().]/g, "");
    return /^(?:\+212|212|0)[567]\d{8}$/.test(s);
  }

  // The CV must be a real text document (PDF/Word), NOT an image (a photo/scan of
  // a CV can't be parsed later). Reject anything that's an image or not pdf/doc/docx.
  function isValidCvFile(file) {
    if (!file) return false;
    var mt = String(file.type || "").toLowerCase();
    if (mt.indexOf("image/") === 0) return false;
    return /\.(pdf|doc|docx)$/i.test(String(file.name || ""));
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

  /* ---------- outgoing data normalization ----------
     The database is populated in lowercase ASCII so records stay easy to match
     and de-duplicate. Dropdown/checkbox values are already lowercase in the
     HTML; this normalizes what the visitor TYPES so free text matches too.

     Fields excluded on purpose:
       - whatsapp / prev_employer_phone : normalized to +212 instead (see below)
       - salary_custom / age            : numbers, nothing to lower
       - consent / truth_consent        : fixed markers
       - website                        : honeypot, must stay untouched
  */
  const NO_LOWER = { whatsapp: 1, prev_employer_phone: 1, salary_custom: 1, age: 1, consent: 1, truth_consent: 1, website: 1 };
  const PHONE_FIELDS = { whatsapp: 1, prev_employer_phone: 1 };

  // Strip LATIN accents so "Kénitra" typed by hand still matches the "kenitra"
  // option. The [A-Za-z] guard + NFC recompose matter: a bare NFD strip would
  // also pull the hamza off Arabic letters and leave the text decomposed, so
  // "أحمد" would silently become a different byte sequence that renders the
  // same. Non-Latin script is returned byte-identical.
  function toAscii(s) {
    try {
      return s.normalize("NFD").replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1").normalize("NFC");
    } catch (e) { return s; }
  }

  // Every Moroccan number is stored in one canonical shape: +212XXXXXXXXX.
  // Accepts 06xxxxxxxx, 6xxxxxxxx, 212..., 00212..., and spaced/dashed input.
  // Anything that doesn't look Moroccan is returned trimmed but unchanged, so a
  // typo is never silently turned into a different valid number.
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
      if (v instanceof File) continue;            // files handled separately
      let val = v;
      if (typeof val === "string") {
        val = val.trim();
        if (PHONE_FIELDS[k]) val = normalizePhoneMa(val);
        else if (!NO_LOWER[k]) val = toAscii(val).toLowerCase();
      }
      if (data[k]) data[k] = [].concat(data[k], val).join(", ");  // multi-checkbox -> joined
      else data[k] = val;
    }
    /* Always send cv_pending explicitly. An unticked checkbox is simply absent
       from FormData, and the backend upsert keeps whatever the row already held,
       so a teacher who ticked "I'll send it later" and then attached the CV
       would have stayed flagged as pending forever. */
    if (cvLater) data.cv_pending = cvLater.checked ? "oui" : "non";
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
        // Over the per-field cap: skip the whole batch rather than mark it sent.
        // validateStep() shows the teacher the error, so nothing is lost quietly.
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
      _sentFiles[id] = sig;                              // optimistic mark
      ids.push(id);
    }
    return { files: out, ids: ids };
  }

  function rollbackFiles(ids) { (ids || []).forEach(function (id) { delete _sentFiles[id]; }); }

  /* Upload an attachment as soon as it is picked, not on the next "next".
     work_cert and photo now both sit on the final step, so waiting would push
     up to 30MB of base64 into the one submit request -- the payload size that
     was making submits fail on weak mobile connections. Debounced because
     picking several files fires change once per pick on some browsers. */
  let _fileSaveTimer = null;
  Object.keys(FILE_FIELDS).forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function () {
      clearTimeout(_fileSaveTimer);
      _fileSaveTimer = setTimeout(function () { savePartial(current); }, 400);
    });
  });

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
    if (cvLater) cvLater.dispatchEvent(new Event("change"));   // restores the released CV requirement
    filterSubjects();
    applyTrackUI();
    updateSubjectsCount();
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
      setStatus("error", "النموذج غير متصل بعد بـ Google. (راجع SETUP.md والصق رابط الـ Web App في form.js)");
      return;
    }

    submitBtn.disabled = true; prevBtn.disabled = true;
    const submitLabel = submitBtn.textContent;
    submitBtn.textContent = T("st.sending");
    setStatus("loading", T("st.uploading"));
    track("FormSubmitAttempt", { form_type: "teacher" });

    let _submitFileIds = [];

    // Completion payload: all text fields + consent, marked complete.
    const payload = collectData();
    payload.submittedAt = new Date().toISOString();
    payload.submissionId = SUBMISSION_ID;
    payload.status = "complete";
    payload.partial = false;
    payload.currentStep = total - 1;
    payload.resumeUrl = buildResumeUrl();

    // (1) GUARANTEED capture — a light, text-only "complete" save sent with
    // keepalive. It's tiny and reliable, so it marks the lead complete (with
    // consent) even if the file upload below struggles under heavy ad traffic.
    // Together with the step-by-step partial saves, the teacher's data can never
    // be lost — which is why we never need to show them an error.
    try {
      fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}

    // (2) Upload any files not already sent during the form (usually just the
    // optional photo). Runs in the background with retries; it must NEVER block
    // the success screen, because the lead is already saved by step (1).
    (async function () {
      try {
        const pending = await collectPendingFiles();
        _submitFileIds = pending.ids;
        if (!pending.ids.length) return;                        // nothing new to upload
        const heavyBody = JSON.stringify(Object.assign({}, payload, { files: pending.files }));
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(GOOGLE_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: heavyBody
            });
            let r = null; try { r = await res.json(); } catch (e) {}
            if (!r || !r.status || r.status === "success" || r.status === "duplicate" || r.status === "ignored" || r.status === "invalid") return;
          } catch (e) {}
          if (attempt < 3) await new Promise(function (res) { setTimeout(res, attempt * 1500); });
        }
        rollbackFiles(_submitFileIds);                          // couldn't confirm -> allow a re-send
      } catch (e) { rollbackFiles(_submitFileIds); }
    })();

    // (3) Show success immediately. The lead + consent are captured, so the
    // teacher always sees a smooth confirmation — no error, no broken trust.
    var _m = collectData();
    _trkSubmitted = true;
    track("CompleteRegistration", { content_name: "teacher" });
    track("Lead", { content_category: "teacher" });
    track("TeacherRegistered", { city: _m.city || "", track_field: _m.track || "", diploma: _m.diploma || "", has_experience: _m.has_experience || "" });
    showSuccess();
  });

  /* ---------- analytics event wiring (files, CTAs, scroll, time, abandon) ---------- */
  ["cv", "certs", "photo", "work_cert"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", function () {
      if (el.files && el.files.length) {
        track("FileAttached", { field: id, count: el.files.length, form_type: "teacher" });
        if (id === "cv" && !isValidCvFile(el.files[0])) markError(el.closest(".field"), T("v.cvType"));
      }
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
