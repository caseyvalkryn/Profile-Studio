(function (PS) {
  "use strict";
  // Cheat sheet (brief 4.7, 5.10): the key table for the current mode from PS.keys.sheet,
  // plus a legend of the handle marks and the track frames. Shows while ui.panels.help is true.

  var CSS = [
    ".hp-pop{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);z-index:48;display:flex;flex-direction:column;",
    "background:var(--raised);color:var(--t1);border-left:1px solid var(--rule-strong);box-shadow:var(--elev)}",
    ".hp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-bottom:1px solid var(--rule)}",
    ".hp-head h2{margin:0}",
    ".hp-body{overflow-y:auto;padding:8px 16px 24px;min-height:0;flex:1 1 auto}",
    ".hp-body h3{margin:16px 0 6px}",
    ".hp-tbl{width:100%;border-collapse:collapse;table-layout:auto}",
    ".hp-tbl td{padding:4px 8px 4px 0;border-bottom:1px solid var(--rule);vertical-align:top}",
    ".hp-tbl td.hp-k{white-space:nowrap;width:1%;padding-right:16px;color:var(--t1)}",
    ".hp-tbl td.hp-l{color:var(--t2)}",
    ".hp-leg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 12px}",
    ".hp-it{display:flex;align-items:center;gap:8px}",
    ".hp-it svg{flex:0 0 auto;background:var(--board);border:1px solid var(--rule);border-radius:3px}",
    "@media (max-width:600px){.hp-pop{width:100vw;border-left:0}}"
  ].join("");

  var MODE_NAME = { build: "Build", brief: "Brief", collect: "Library" };
  var HANDLES = [
    ["wp", "Waypoint. Drag to move. Double-click to delete."],
    ["insert", "Segment midpoint. Drag to add a waypoint."],
    ["hold", "Hold ring. Drag out to add hold time."],
    ["vertex", "Volume vertex. Drag to move."],
    ["edge", "Edge midpoint. Drag to add a vertex."],
    ["bead", "Event bead. Drag along the path to set time."],
    ["range", "Range handle. Drag to set range."],
    ["arcEnd", "Sector end. Drag to set the field of view."],
    ["arcMid", "Sector midpoint. Drag to set bearing."],
    ["elRay", "Elevation limit. Drag in Elevation."],
    ["top", "Volume top. Drag in Elevation."],
    ["line", "Height plane. Drag in Elevation."]
  ];
  var FRAMES = [
    ["hostile", "normal", "Hostile track"],
    ["suspect", "normal", "Suspect track"],
    ["unknown", "normal", "Unknown track"],
    ["pending", "normal", "Pending track"],
    ["neutral", "normal", "Neutral track"],
    ["friend", "normal", "Friend track"],
    ["hostile", "coasting", "Coasting track"],
    ["hostile", "lost", "Lost track"]
  ];

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }
  function esc(s) { return PS.util.esc(s); }
  function svg(inner, w, h) {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="board" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' + inner + "</svg>";
  }
  function mark(fn) {
    try { return fn() || ""; } catch (e) { return ""; }
  }

  function legend() {
    var Sy = PS.symbols;
    if (!Sy) return "";
    var h = HANDLES.map(function (x) {
      var g = mark(function () { return Sy.handle(x[0], 14, 14, {}); });
      return g ? '<div class="hp-it t-sub">' + svg(g, 28, 28) + "<span>" + esc(x[1]) + "</span></div>" : "";
    }).join("");
    var f = FRAMES.map(function (x) {
      var g = mark(function () { return Sy.airFrame(x[0], x[1], 16, 16, 9); });
      return g ? '<div class="hp-it t-sub">' + svg(g, 32, 32) + "<span>" + esc(x[2]) + "</span></div>" : "";
    }).join("");
    var t = mark(function () { return Sy.tspiCross(14, 14); });
    if (t) f += '<div class="hp-it t-sub">' + svg(t, 28, 28) + "<span>Target TSPI</span></div>";
    return (h ? '<h3 id="hp-h-handles" class="t-label">Handle marks</h3><div class="hp-leg">' + h + "</div>" : "") +
      (f ? '<h3 id="hp-h-frames" class="t-label">Track frames</h3><div class="hp-leg">' + f + "</div>" : "");
  }

  PS.panels.register("help", {
    channels: ["mode", "panels"],
    mount: function (el, store) {
      var doc = el.ownerDocument;
      addStyle(doc, "help", CSS);
      el.innerHTML = '<div class="hp-pop hidden" id="hp" role="dialog" aria-modal="false" aria-labelledby="hp-title">' +
        '<div class="hp-head"><h2 id="hp-title" class="t-title">Keys</h2><button type="button" class="btn quiet" id="hp-close">Close</button></div>' +
        '<div class="hp-body" id="hp-body"></div></div>';
      var pop = el.querySelector("#hp"), body = el.querySelector("#hp-body"), title = el.querySelector("#hp-title");
      var shown = false, shownMode = null;

      function close() { store.ui("panels.help", false); }

      function build(mode) {
        var rows = PS.keys && typeof PS.keys.sheet === "function" ? PS.keys.sheet(mode) : [];
        title.textContent = "Keys in " + (MODE_NAME[mode] || mode);
        body.innerHTML = '<table class="hp-tbl" id="hp-keys"><tbody>' +
          rows.map(function (r) { return '<tr><td class="hp-k t-data">' + esc(r.keys) + '</td><td class="hp-l t-body">' + esc(r.label) + "</td></tr>"; }).join("") +
          "</tbody></table>" + (mode === "collect" ? "" : legend()) +
          '<p class="hint">Press ? or Escape to close this sheet.</p>';
      }

      function sync() {
        var u = store.get().ui, want = !!(u.panels && u.panels.help);
        if (want && (!shown || shownMode !== u.mode)) { build(u.mode); shownMode = u.mode; }
        if (want !== shown) {
          shown = want;
          pop.classList.toggle("hidden", !want);
          if (want) { var b = el.querySelector("#hp-close"); if (b && b.focus) b.focus(); }
        }
      }

      function onClick(ev) { if (ev.target.closest("#hp-close")) close(); }
      function onKey(ev) {
        if (!shown || ev.key !== "Escape" || ev.defaultPrevented) return;
        ev.preventDefault();
        close();
      }
      pop.addEventListener("click", onClick);
      doc.addEventListener("keydown", onKey, true);
      sync();

      return {
        update: function () { sync(); },
        unmount: function () {
          doc.removeEventListener("keydown", onKey, true);
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
