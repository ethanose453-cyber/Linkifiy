/* ===========================================================
   Linkify.ma - neighborhood autocomplete (per city)
   -----------------------------------------------------------
   - City is a <select>. When a visitor types in the address field,
     suggestions from the SELECTED city appear (type-ahead).
   - Data is a curated per-city list (free, offline, clean data).
   - Free typing still allowed (fallback) if a neighborhood is missing.
   - To add a city: add "<city value from #city>": [ ... ] below.
     The key MUST match the option value in the city <select>.
   =========================================================== */

window.LINKIFY_NEIGHBORHOODS = {
  "سلا": [
    "المدينة القديمة", "باب المريسة", "تبريكت", "بطانة", "حي السلام",
    "حي الرحمة", "حي الكريمة", "العيايدة", "سيدي موسى", "سلا الجديدة",
    "سيدي بوقنادل", "حي حصين", "سعيد حجي", "المرجة", "القارية",
    "حي النهضة", "حي الأمل", "حي الفتح", "حي مولاي إسماعيل", "حي الرمل",
    "حي الوفاق", "حي القدس", "حي المنزه", "حي الانبعاث", "حي الصفاء",
    "حي التقدم", "حي الخير", "لعرايس", "ديور الجامع"
  ],
  "القنيطرة": [
    "المعمورة", "وسط المدينة", "بئر الرامي", "أولاد أوجيه", "السكنية",
    "الميموزا", "فال فلوري", "خبازات", "باب فاس", "حي المغرب العربي",
    "حي الإسماعيلية", "حي أنس", "حي الوفاق", "حي القدس", "المهدية",
    "سيدي الطيبي", "حي بام", "الحدادة", "حي الشرف", "حي الرياض",
    "حي الأمل", "حي السلام", "الساكنية", "حي النصر", "حي الفتح"
  ]
};

(function () {
  var DATA = window.LINKIFY_NEIGHBORHOODS || {};

  // normalize Arabic for matching (strip tashkeel, unify letter variants)
  function norm(s) {
    return String(s || "")
      .replace(/[\u064B-\u0652\u0670]/g, "")
      .replace(/[\u0623\u0625\u0622]/g, "\u0627") // aleph variants -> ا
      .replace(/\u0649/g, "\u064A")               // ى -> ي
      .replace(/\u0624/g, "\u0648")               // ؤ -> و
      .replace(/\u0626/g, "\u064A")               // ئ -> ي
      .replace(/\u0629/g, "\u0647")               // ة -> ه
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var citySel = document.getElementById("city");
    var input = document.getElementById("neighborhood");
    var list = document.getElementById("neighborhood-suggest");
    if (!citySel || !input || !list) return;

    var activeIdx = -1;

    function cityList() {
      return DATA[citySel.value] || null;
    }

    function render(items) {
      list.textContent = "";
      activeIdx = -1;
      if (!items || !items.length) { list.hidden = true; return; }
      items.forEach(function (name) {
        var li = document.createElement("li");
        li.className = "ac-item";
        li.setAttribute("role", "option");
        li.textContent = name;                       // textContent = no HTML injection
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();                        // keep focus / beat blur
          choose(name);
        });
        list.appendChild(li);
      });
      list.hidden = false;
    }

    function choose(name) {
      input.value = name;
      list.hidden = true;
    }

    function filter() {
      var all = cityList();
      if (!all) { render([]); return; }              // city not covered -> free typing
      var q = norm(input.value);
      var res = q
        ? all.filter(function (n) { return norm(n).indexOf(q) !== -1; })
        : all.slice(0);
      render(res.slice(0, 8));
    }

    function paint(items) {
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle("is-active", i === activeIdx);
      }
      if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("input", filter);
    input.addEventListener("focus", filter);
    input.addEventListener("blur", function () {
      setTimeout(function () { list.hidden = true; }, 150);
    });

    input.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      var items = list.querySelectorAll(".ac-item");
      if (!items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); paint(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); paint(items); }
      else if (e.key === "Enter") { if (activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); choose(items[activeIdx].textContent); } }
      else if (e.key === "Escape") { list.hidden = true; }
    });

    // neighborhoods are city-specific: reset the field when the city changes
    citySel.addEventListener("change", function () {
      input.value = "";
      list.hidden = true;
    });
  });
})();
