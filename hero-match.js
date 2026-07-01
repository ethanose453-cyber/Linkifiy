/* ===========================================================
   Linkify.ma — Hero "AI matchmaking" animation
   Vanilla JS + SVG. Links institution cards (left) to teacher
   avatars (right) through a central AI core, in a loop.
   =========================================================== */
(function () {
  var stage = document.getElementById("matchStage");
  var beams = document.getElementById("matchBeams");
  if (!stage || !beams) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVGNS = "http://www.w3.org/2000/svg";

  // node positions as % of the stage (x, y)
  var LEFT = [{ x: 20, y: 17 }, { x: 13, y: 40 }, { x: 25, y: 62 }, { x: 16, y: 85 }];
  var RIGHT = [
    { x: 85, y: 10 }, { x: 91, y: 24 }, { x: 79, y: 33 }, { x: 89, y: 46 },
    { x: 82, y: 61 }, { x: 90, y: 75 }, { x: 84, y: 90 }
  ];

  var FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
  var USER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  var leftNodes = [], rightNodes = [];

  function makeNode(cls, icon, pos) {
    var d = document.createElement("div");
    d.className = "match-node " + cls;
    d.style.left = pos.x + "%";
    d.style.top = pos.y + "%";
    d.style.setProperty("--dur", (4 + Math.random() * 2.5).toFixed(2) + "s");
    d.style.setProperty("--delay", (Math.random() * -4).toFixed(2) + "s");
    d.innerHTML = '<div class="node-box">' + icon + '</div>';
    stage.appendChild(d);
    return d;
  }

  LEFT.forEach(function (p) { leftNodes.push(makeNode("match-card", FILE_ICON, p)); });
  RIGHT.forEach(function (p) { rightNodes.push(makeNode("match-avatar", USER_ICON, p)); });

  // floating background particles
  for (var i = 0; i < 16; i++) {
    var pt = document.createElement("span");
    pt.className = "match-particle";
    var s = (3 + Math.random() * 3).toFixed(1);
    pt.style.width = s + "px";
    pt.style.height = s + "px";
    pt.style.left = (Math.random() * 100).toFixed(1) + "%";
    pt.style.top = (Math.random() * 100).toFixed(1) + "%";
    pt.style.setProperty("--dur", (5 + Math.random() * 5).toFixed(2) + "s");
    pt.style.setProperty("--delay", (Math.random() * -6).toFixed(2) + "s");
    stage.appendChild(pt);
  }

  // visual center of a node (it's centered via translate(-50%,-50%) => offset = center)
  function center(el) { return { x: el.offsetLeft, y: el.offsetTop }; }
  function coreXY() { return { x: stage.clientWidth * 0.5, y: stage.clientHeight * 0.5 }; }

  function sizeSvg() {
    var w = stage.clientWidth, h = stage.clientHeight;
    beams.setAttribute("width", w);
    beams.setAttribute("height", h);
    beams.setAttribute("viewBox", "0 0 " + w + " " + h);
  }
  sizeSvg();

  function pulse(el) {
    el.classList.add("matched");
    setTimeout(function () { el.classList.remove("matched"); }, 1400);
  }

  var lastL = -1, lastR = -1;
  function pick(n, not) {
    var i;
    do { i = Math.floor(Math.random() * n); } while (n > 1 && i === not);
    return i;
  }

  function spawn() {
    if (!stage.clientWidth) return;
    var li = pick(leftNodes.length, lastL), ri = pick(rightNodes.length, lastR);
    lastL = li; lastR = ri;

    var a = center(leftNodes[li]), b = center(rightNodes[ri]), c = coreXY();
    var cx = c.x + (Math.random() * 30 - 15), cy = c.y + (Math.random() * 30 - 15);

    var path = document.createElementNS(SVGNS, "path");
    path.setAttribute("class", "beam");
    path.setAttribute("d", "M " + a.x + " " + a.y + " Q " + cx + " " + cy + " " + b.x + " " + b.y);
    beams.appendChild(path);

    var len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.getBoundingClientRect(); // force reflow
    path.style.transition = "stroke-dashoffset .7s cubic-bezier(.4,0,.2,1)";
    path.style.strokeDashoffset = "0";

    pulse(leftNodes[li]);
    setTimeout(function () { pulse(rightNodes[ri]); }, 380);

    setTimeout(function () { path.style.transition = "opacity .6s ease"; path.style.opacity = "0"; }, 1700);
    setTimeout(function () { if (path.parentNode) path.parentNode.removeChild(path); }, 2400);
  }

  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT);
    rT = setTimeout(function () {
      sizeSvg();
      beams.querySelectorAll(".beam").forEach(function (p) { p.remove(); });
    }, 200);
  });

  if (reduce) {
    // static single beam, no loop
    var a = center(leftNodes[1]), b = center(rightNodes[2]), c = coreXY();
    var p = document.createElementNS(SVGNS, "path");
    p.setAttribute("class", "beam");
    p.setAttribute("d", "M " + a.x + " " + a.y + " Q " + c.x + " " + c.y + " " + b.x + " " + b.y);
    p.style.opacity = ".6";
    beams.appendChild(p);
    return;
  }

  setTimeout(spawn, 600);
  setInterval(spawn, 2000);
})();
