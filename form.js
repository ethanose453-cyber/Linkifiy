/* ===========================================================
   Linkify.ma — registration form logic
   Multi-step + conditional logic + file upload to Google Apps Script
   =========================================================== */

/* 🔴🔴🔴 لصق هنا رابط الـ Web App ديال Google Apps Script (شوف SETUP.md) 🔴🔴🔴 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

const MAX_FILE_MB = 5;
const SHARE_URL = "https://linkify.ma"; // بدّل بالرابط النهائي ديال الموقع ملي يكون جاهز
const SUBMISSION_ID = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

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
    const el = document.querySelector(".progress") || form;
    if (window.lenis) { window.lenis.scrollTo(el, { offset: -100 }); return; }
    const y = el.getBoundingClientRect().top + window.pageYOffset - 100;
    window.scrollTo({ top: y, behavior: "smooth" });
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
      else if (inp.id === "whatsapp" && inp.value && !isValidMaPhone(inp.value))
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

    // required files
    stepEl.querySelectorAll('input[type="file"][required]').forEach(f => {
      if (f.closest("[hidden]")) return;
      if (!f.files.length) ok = markError(f.closest(".field"), T("v.file")) && false;
      else if (f.files[0].size > MAX_FILE_MB * 1024 * 1024)
        ok = markError(f.closest(".field"), T("v.fileSize")) && false;
    });

    // consent (last step)
    const consent = stepEl.querySelector("#consent");
    if (consent && !consent.checked) {
      ok = false;
      markError(consent.closest(".field"), T("v.consent"));
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
    if (current < total - 1) showStep(++current);
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
      for (const id of ["cv", "certs", "photo"]) {
        const el = document.getElementById(id);
        if (el && el.files.length) files[id] = await fileToBase64(el.files[0]);
      }
      payload.files = files;
      payload.submittedAt = new Date().toISOString();
      payload.submissionId = SUBMISSION_ID;

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
});
