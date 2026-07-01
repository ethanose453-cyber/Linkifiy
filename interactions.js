/* ===========================================================
   Linkify.ma — liveliness & micro-interactions
   Scroll reveal · back-to-top · success confetti. Vanilla JS.
   Respects prefers-reduced-motion.
   =========================================================== */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1) scroll reveal (staggered) ---------- */
  function setupReveal() {
    var targets = Array.prototype.slice.call(
      document.querySelectorAll(".section-title, .section-sub, .step, .feature, .legal h2, .legal p")
    );
    if (!targets.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("reveal", "in"); });
      return;
    }

    // stagger children inside grids
    document.querySelectorAll(".steps, .features").forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty("--d", (i * 0.09) + "s");
      });
    });

    targets.forEach(function (el) { el.classList.add("reveal"); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 2) back to top ---------- */
  function setupToTop() {
    var btn = document.getElementById("toTop");
    if (!btn) return;
    function onScroll() {
      if (window.pageYOffset > 600) btn.classList.add("show");
      else btn.classList.remove("show");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    btn.addEventListener("click", function () {
      if (window.lenis) window.lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- 3) success confetti (called from form.js) ---------- */
  window.linkifyConfetti = function () {
    if (reduce) return;
    var c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
    document.body.appendChild(c);
    var ctx = c.getContext("2d");
    var W, H;
    function size() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
    size();
    window.addEventListener("resize", size, { once: true });

    var colors = ["#126cb4", "#6366f1", "#f4b740", "#25D366", "#e11d48"];
    var P = [];
    for (var i = 0; i < 130; i++) {
      P.push({
        x: W / 2 + (Math.random() - 0.5) * 140,
        y: H * 0.32 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -9 - 3,
        g: 0.22 + Math.random() * 0.12,
        s: 5 + Math.random() * 7,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        col: colors[i % colors.length]
      });
    }
    var start = performance.now();
    var DUR = 2600;
    function frame(t) {
      var el = t - start;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - el / DUR);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (el < DUR) requestAnimationFrame(frame);
      else c.remove();
    }
    requestAnimationFrame(frame);
  };

  document.addEventListener("DOMContentLoaded", function () {
    setupReveal();
    setupToTop();
  });
})();
