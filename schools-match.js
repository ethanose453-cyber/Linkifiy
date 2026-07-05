/* ===========================================================
   Linkify.ma - schools hero matching animation driver
   The magnifier searches at RANDOM (unpredictable). On arrival:
     - quality teacher  -> lights up, gets a check, connects to hub
     - lower-quality    -> shows a red X (inspected), then fades out
   After a full pass it holds, resets, and searches again (new order).
   Disabled under prefers-reduced-motion (CSS shows a static match).
   =========================================================== */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    var svg = document.querySelector(".match-svg");
    if (!svg) return;
    var mag = svg.querySelector(".sv-mag");
    if (!mag || reduce) return;

    var quality = [
      { sel: ".n1", link: ".l1", x: 62, y: 64 },
      { sel: ".n2", link: ".l2", x: 356, y: 64 },
      { sel: ".n3", link: ".l3", x: 48, y: 190 },
      { sel: ".n4", link: ".l4", x: 372, y: 196 },
      { sel: ".n5", link: ".l5", x: 200, y: 44 }
    ];
    var dims = [
      { sel: ".d1", x: 110, y: 300, dim: true },
      { sel: ".d2", x: 312, y: 300, dim: true },
      { sel: ".d3", x: 140, y: 116, dim: true },
      { sel: ".d4", x: 284, y: 114, dim: true },
      { sel: ".d5", x: 70, y: 252, dim: true },
      { sel: ".d6", x: 350, y: 252, dim: true }
    ];

    function rand(a, b) { return a + Math.random() * (b - a); }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    function moveTo(x, y, dur) {
      mag.style.transitionDuration = dur + "ms";
      mag.style.transform = "translate(" + x + "px," + y + "px)";
    }
    function activate(n) {
      var node = svg.querySelector(n.sel); if (node) node.classList.add("active");
      var link = svg.querySelector(n.link); if (link) link.classList.add("active");
    }
    function reject(n) {
      var node = svg.querySelector(n.sel); if (!node) return;
      node.classList.add("rejected");                       // red X appears
      setTimeout(function () { node.classList.add("gone"); }, 950); // then fades out
    }
    function resetAll() {
      svg.querySelectorAll(".sv-node.q, .sv-link").forEach(function (e) { e.classList.remove("active"); });
      svg.querySelectorAll(".sv-node.dim").forEach(function (e) { e.classList.remove("rejected", "gone"); });
    }

    var queue = [];
    function buildCycle() {
      var order = shuffle(quality.concat(dims));            // mix good + weak, random order
      queue = [];
      order.forEach(function (n) {
        if (Math.random() < 0.5) queue.push({ x: rand(50, 372), y: rand(48, 300) }); // wander
        queue.push({ x: n.x, y: n.y, node: n });
      });
      queue.push({ reset: true });
    }

    function step() {
      if (!queue.length) buildCycle();
      var t = queue.shift();
      if (t.reset) {
        setTimeout(function () { resetAll(); setTimeout(step, rand(500, 1000)); }, rand(1700, 2700));
        return;
      }
      var dur = Math.round(rand(650, 1500));
      moveTo(t.x, t.y, dur);
      setTimeout(function () {
        if (t.node) { t.node.dim ? reject(t.node) : activate(t.node); }
        setTimeout(step, rand(300, 1000));                  // unpredictable pause
      }, dur);
    }

    moveTo(rand(60, 360), rand(60, 300), 500);              // random start
    setTimeout(step, 800);
  });
})();
