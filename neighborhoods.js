/* ===========================================================
   Linkify.ma - live address autocomplete (all cities)
   -----------------------------------------------------------
   Uses the free Photon geocoder (OpenStreetMap data, no API key).
   When a city is selected, typing in the address field returns
   live suggestions biased to that city -> covers EVERY city and
   neighborhood automatically, with no manual list to maintain.
   Free typing is still allowed as a fallback.

   Data (c) OpenStreetMap contributors (ODbL). Geocoding via Photon.
   Note: the public Photon endpoint is for reasonable use; if volume
   grows, self-host Photon or switch to Google Places.
   =========================================================== */

/* City center coordinates [lat, lon] used to bias suggestions.
   Keys MUST match the option values in the #city <select>. */
window.LINKIFY_CITY_COORDS = {
  "القنيطرة": [34.26, -6.58], "سلا": [34.05, -6.80], "الرباط": [34.02, -6.83],
  "تمارة": [33.93, -6.91], "الصخيرات": [33.85, -7.03], "بوزنيقة": [33.79, -7.16],
  "المحمدية": [33.69, -7.38], "الدار البيضاء": [33.57, -7.59], "طنجة": [35.77, -5.80],
  "تطوان": [35.57, -5.37], "العرائش": [35.19, -6.15], "القصر الكبير": [35.00, -5.90],
  "سيدي سليمان": [34.26, -5.92], "سيدي قاسم": [34.22, -5.70], "وزان": [34.80, -5.58],
  "مكناس": [33.89, -5.55], "فاس": [34.03, -5.00], "صفرو": [33.83, -4.83],
  "تازة": [34.21, -4.01], "وجدة": [34.68, -1.91], "بركان": [34.92, -2.32],
  "الناضور": [35.17, -2.93], "خريبكة": [32.88, -6.91], "بني ملال": [32.34, -6.36],
  "الفقيه بن صالح": [32.50, -6.69], "سطات": [33.00, -7.62], "برشيد": [33.27, -7.59],
  "الجديدة": [33.23, -8.51], "سيدي بنور": [32.65, -8.44], "آسفي": [32.30, -9.24],
  "الصويرة": [31.51, -9.77], "مراكش": [31.63, -8.01], "قلعة السراغنة": [32.06, -7.41],
  "أكادير": [30.42, -9.60], "إنزكان": [30.36, -9.54], "آيت ملول": [30.33, -9.49],
  "تارودانت": [30.47, -8.88], "تيزنيت": [29.70, -9.73]
};

(function () {
  var COORDS = window.LINKIFY_CITY_COORDS || {};
  var PHOTON = "https://photon.komoot.io/api/";

  document.addEventListener("DOMContentLoaded", function () {
    var citySel = document.getElementById("city");
    var input = document.getElementById("neighborhood");
    var list = document.getElementById("neighborhood-suggest");
    if (!citySel || !input || !list) return;

    var activeIdx = -1, timer = null, controller = null;

    function coords() { return COORDS[citySel.value] || null; }

    function render(items) {
      list.textContent = "";
      activeIdx = -1;
      if (!items.length) { list.hidden = true; return; }
      items.forEach(function (label) {
        var li = document.createElement("li");
        li.className = "ac-item";
        li.setAttribute("role", "option");
        li.textContent = label;                       // textContent = no HTML injection
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(label); });
        list.appendChild(li);
      });
      list.hidden = false;
    }

    function choose(v) { input.value = v; list.hidden = true; }

    function buildLabel(p) {
      var primary = p.name || p.street || "";
      var sub = p.district || p.suburb || p.locality || p.city || "";
      if (!primary) { primary = sub; sub = ""; }
      if (sub && sub !== primary) return primary + " \u2014 " + sub;
      return primary;
    }

    function search(q) {
      var c = coords();
      var url = PHOTON + "?q=" + encodeURIComponent(q) + "&limit=10";
      if (c) { url += "&lat=" + c[0] + "&lon=" + c[1]; }
      if (controller) { try { controller.abort(); } catch (e) {} }
      controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
      fetch(url, controller ? { signal: controller.signal } : undefined)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var feats = (data && data.features) || [];
          var seen = {}, out = [];
          feats.forEach(function (f) {
            var p = f.properties || {};
            if (p.countrycode && p.countrycode !== "MA") return;    // Morocco only
            if (c && f.geometry && f.geometry.coordinates) {         // soft distance filter
              var lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
              if (Math.abs(lat - c[0]) > 0.6 || Math.abs(lon - c[1]) > 0.6) return;
            }
            var label = buildLabel(p);
            if (!label) return;
            var key = label.toLowerCase();
            if (seen[key]) return;
            seen[key] = 1;
            out.push(label);
          });
          render(out.slice(0, 8));
        })
        .catch(function () { /* offline / aborted -> just allow free typing */ });
    }

    function onInput() {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(function () { search(q); }, 300);       // debounce
    }

    function paint(items) {
      for (var i = 0; i < items.length; i++) items[i].classList.toggle("is-active", i === activeIdx);
      if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("input", onInput);
    input.addEventListener("blur", function () { setTimeout(function () { list.hidden = true; }, 150); });
    input.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      var items = list.querySelectorAll(".ac-item");
      if (!items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); paint(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); paint(items); }
      else if (e.key === "Enter") { if (activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); choose(items[activeIdx].textContent); } }
      else if (e.key === "Escape") { list.hidden = true; }
    });

    // address is city-specific: reset when city changes
    citySel.addEventListener("change", function () { input.value = ""; list.hidden = true; });
  });
})();
