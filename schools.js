/* ===========================================================
   Linkify.ma - schools (B2B) lead form logic
   - Short single-page form -> posts to the same Apps Script
     Web App with formType:"school".
   - Frontend validation mirrors the backend; values are sent as
     text/plain (simple request, no preflight). Backend sanitizes
     and validates again.
   - Lightweight analytics hooks (no-op if no pixel installed).
   =========================================================== */

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh2xUP0OzYuVNTURxdK8-G7uOABnaOmM9W5lym8oShRUUZhkQjZoMeXF9YOIFemS4u1g/exec";

/* analytics: fires to Meta Pixel / GA / dataLayer if present, else no-op */
function track(name, params) {
  try {
    if (typeof window.fbq === "function") window.fbq("trackCustom", name, params || {});
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    if (window.dataLayer && typeof window.dataLayer.push === "function") {
      window.dataLayer.push(Object.assign({ event: name }, params || {}));
    }
  } catch (e) { /* ignore */ }
}

function isValidMaPhone(v) {
  var s = String(v || "").replace(/[\s\-().]/g, "");
  return /^(?:\+212|212|0)[567]\d{8}$/.test(s);
}

document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("schoolForm");
  if (!form) return;
  var statusBox = document.getElementById("schoolStatus");
  var successBox = document.getElementById("schoolSuccess");
  var submitBtn = document.getElementById("schoolSubmit");
  var startedFired = false;
  var FORM_LOADED_AT = Date.now();

  track("SchoolLPView");

  form.addEventListener("focusin", function () {
    if (!startedFired) { startedFired = true; track("SchoolFormStart"); }
  });

  var REQUIRED_TEXT = ["school_name", "city", "institution_type", "contact_name", "role", "phone", "subject", "level", "need_type", "work_type"];
  var REQUIRED_RADIO = ["urgent", "shortlist_interest"];

  function clearStatus() { statusBox.hidden = true; statusBox.className = "form-status"; statusBox.textContent = ""; }
  function setStatus(type, msg) { statusBox.hidden = false; statusBox.className = "form-status " + type; statusBox.textContent = msg; }

  function clearErrors() {
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field-error").forEach(function (e) { e.remove(); });
  }
  function markError(holder, msg) {
    if (!holder) return;
    holder.classList.add("has-error");
    if (!holder.querySelector(".field-error")) {
      var e = document.createElement("div");
      e.className = "field-error";
      e.textContent = msg;                       // textContent = no injection
      holder.appendChild(e);
    }
  }

  function validate() {
    clearErrors();
    var ok = true;
    var firstBad = null;

    REQUIRED_TEXT.forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el) return;
      if (!el.value || !el.value.trim()) {
        ok = false; markError(el.closest(".field"), "هذا الحقل مطلوب");
        if (!firstBad) firstBad = el;
      }
    });

    var phone = form.querySelector('[name="phone"]');
    if (phone && phone.value.trim() && !isValidMaPhone(phone.value)) {
      ok = false; markError(phone.closest(".field"), "رقم هاتف مغربي غير صحيح");
      if (!firstBad) firstBad = phone;
    }
    var email = form.querySelector('[name="email"]');
    if (email && email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
      ok = false; markError(email.closest(".field"), "بريد إلكتروني غير صحيح");
      if (!firstBad) firstBad = email;
    }

    REQUIRED_RADIO.forEach(function (name) {
      var grp = form.querySelectorAll('input[name="' + name + '"]');
      if (grp.length && ![].some.call(grp, function (r) { return r.checked; })) {
        ok = false; markError(grp[0].closest(".field"), "يرجى الاختيار");
        if (!firstBad) firstBad = grp[0];
      }
    });

    if (!ok && firstBad) {
      var y = firstBad.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    return ok;
  }

  function collect() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (data[k]) data[k] = [].concat(data[k], v).join(", ");
      else data[k] = v;
    });
    return data;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validate()) return;

    // anti-spam: honeypot or submitted unrealistically fast
    var hp = document.getElementById("website");
    if ((hp && hp.value.trim()) || (Date.now() - FORM_LOADED_AT) < 2000) {
      showSuccess(); return;
    }

    var payload = collect();
    payload.formType = "school";
    payload.source = "schools_lp";
    payload.submittedAt = new Date().toISOString();

    submitBtn.disabled = true;
    var label = submitBtn.querySelector("span") ? submitBtn.querySelector("span").textContent : "";
    if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = "جارٍ الإرسال…";
    setStatus("loading", "جارٍ إرسال طلبكم…");

    try {
      var res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      var result = null;
      try { result = await res.json(); } catch (e2) { /* unreadable -> assume saved */ }

      if (result && result.status && result.status !== "success") {
        throw new Error(result.status);
      }

      // analytics
      track("SchoolLead", { subject: payload.subject, city: payload.city, need_type: payload.need_type });
      if (typeof window.fbq === "function") window.fbq("track", "Lead", { content_category: "school" });
      if (payload.urgent && payload.urgent.indexOf("عاجلة") !== -1) track("UrgentTeacherRequest", { subject: payload.subject });
      if (payload.pricing_pref) track("PricingInterest", { pref: payload.pricing_pref });

      showSuccess();
    } catch (err) {
      setStatus("error", "وقع خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى أو التواصل عبر البريد: contact@linkify.ma");
      submitBtn.disabled = false;
      if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = label;
    }
  });

  function showSuccess() {
    clearStatus();
    form.hidden = true;
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
