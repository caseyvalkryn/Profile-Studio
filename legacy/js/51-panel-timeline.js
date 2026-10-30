(function (PS) {
  "use strict";
  // Timeline strip and play bar (contract 16, brief 3.5 and 6.4).

  var CHANNELS = ["profile", "derived", "mode", "time", "sel", "hover", "units", "panels", "resize"];
  var GUT_L = 44, GUT_R = 12;
  var TICK_CH = 6.4, TICK_GAP = 8;   // tick label: px per mono character at 10.5 px, and the clear gap
  var MINOR = { 1: 0.2, 2: 0.5, 5: 1, 10: 2, 30: 5, 60: 10, 120: 30, 300: 60, 600: 120, 1200: 300, 3600: 600 };
  var MAJORS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1200, 3600];
  var MIN_SPAN = 10;

  var CSS = [
    "#slot-timeline{background:var(--panel);color:var(--t1);user-select:none}",
    "#slot-timeline[hidden]{display:none}",
    ".tl{display:flex;flex-direction:column;min-height:var(--strip)}",
    ".tl-overview{position:relative;height:4px;margin:2px " + GUT_R + "px 0 " + GUT_L + "px;background:var(--rule);border-radius:2px;cursor:grab}",
    ".tl-ov-span{position:absolute;top:0;bottom:0;background:var(--t3);border-radius:2px}",
    ".tl-overview.tl-ov-full .tl-ov-span{background:var(--rule-strong)}",
    ".tl-plot{position:relative;flex:1 1 auto;display:flex;flex-direction:column;min-height:0}",
    ".tl-axis{display:block;flex:0 0 auto;cursor:ew-resize}",
    ".tl-lanes{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;min-height:calc(var(--strip) - 60px);max-height:42vh}",
    ".tl-lanes svg{display:block}",
    ".tl-empty{margin:8px 0 8px " + GUT_L + "px}",
    ".tl-cursor{position:absolute;top:0;bottom:0;left:0;width:0;pointer-events:none;will-change:transform}",
    ".tl-cursor[hidden]{display:none}",
    ".tl-cursor-l{position:absolute;top:0;bottom:0;left:-0.5px;width:1px;background:var(--accent)}",
    ".tl-grip{position:absolute;top:0;left:-6px;width:12px;height:9px;pointer-events:auto;cursor:ew-resize}",
    ".tl-grip polygon{fill:var(--accent)}",
    ".tl-tick{stroke:var(--rule-strong);stroke-width:1}.tl-tick-maj{stroke:var(--t3)}",
    ".tl-tlab{fill:var(--t2);font:var(--fw) var(--fs-1) var(--mono);font-variant-numeric:var(--tnum)}",
    ".tl-axbase{stroke:var(--rule-strong)}",
    ".tl-range{fill:color-mix(in srgb,var(--accent) 14%,transparent)}",
    ".tl-rangeedge{stroke:var(--accent);stroke-width:1}",
    ".tl-lane{fill:transparent}",
    ".tl-lane-sep{stroke:var(--rule);stroke-width:1}",
    ".tl-lane-sel{fill:color-mix(in srgb,var(--select) 7%,transparent)}",
    ".tl-lane-hov{fill:color-mix(in srgb,var(--select) 4%,transparent)}",
    ".tl-lab{font:var(--fw-med) var(--fs-2) var(--mono);font-variant-numeric:var(--tnum)}",
    ".tl-vlab{font:var(--fw) var(--fs-1) var(--mono);font-variant-numeric:var(--tnum);fill:var(--t3)}",
    ".tl-ink-hostile{fill:var(--hostile);stroke:var(--hostile)}",
    ".tl-ink-friend{fill:var(--friend);stroke:var(--friend)}",
    ".tl-ink-unknown{fill:var(--unknown);stroke:var(--unknown)}",
    ".tl-lab.tl-ink-hostile,.tl-lab.tl-ink-friend,.tl-lab.tl-ink-unknown{stroke:none}",
    ".tl-vbar{opacity:.4;stroke:none}",
    ".tl-bar{stroke:none}.tl-bar-s{fill:var(--friend)}.tl-bar-e{fill:var(--ew)}",
    ".tl-bar-hit{fill:transparent;cursor:pointer}",
    ".tl-hatchov{fill:url(#tl-hatch);stroke:none;pointer-events:none}",
    ".tl-hatch-l{stroke:var(--panel);stroke-width:1.2}",
    ".tl-hatch2-l{stroke:var(--t3);stroke-width:1}",
    ".tl-ring{stroke-width:1;stroke-dasharray:1 2;fill:none}.tl-ring-s{stroke:var(--friend)}.tl-ring-e{stroke:var(--ew)}",
    ".tl-hold{fill:url(#tl-hatch2);stroke:none;opacity:.9}",
    ".tl-win{fill:var(--tint-window);stroke:none}",
    ".tl-bead circle{fill:var(--board);stroke:var(--t1);stroke-width:1}",
    ".tl-bead text{fill:var(--t1);font:500 7px var(--mono)/* mark, not text */;text-anchor:middle;dominant-baseline:central;pointer-events:none}",
    ".tl-bead{cursor:grab}.tl-bead.tl-sel circle{stroke:var(--select);stroke-width:2}",
    ".tl-bead.tl-warn circle{stroke:var(--warn)}.tl-bead.tl-warn text{fill:var(--warn)}",
    ".tl-dbead circle{fill:none;stroke:var(--t3);stroke-width:1}.tl-dbead text{fill:var(--t3);font:500 6.5px var(--mono)/* mark, not text */;text-anchor:middle;dominant-baseline:central}",
    ".tl-split{stroke:var(--t2);stroke-width:1;stroke-dasharray:3 3}",
    ".tl-splab{fill:var(--t2);font:var(--fw-med) var(--fs-1) var(--mono);font-variant-numeric:var(--tnum)}",
    ".tl-bar-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:2px 8px 3px " + (GUT_L - 36) + "px;min-height:24px;border-top:1px solid var(--rule)}",
    ".tl-bar-row .mini,.tl-bar-row select,.tl-bar-row input{height:var(--ctl-mini);min-height:var(--ctl-mini)}",
    ".tl-tp{min-width:26px}",
    ".tl-clock{width:7.5ch;font:var(--fw) var(--fs-2) var(--mono);font-variant-numeric:var(--tnum);text-align:right;background:var(--sunken);color:var(--t1);",
    "border:1px solid var(--rule-strong);border-radius:3px;padding:0 4px}",
    ".tl-sel{background:var(--sunken);color:var(--t1);border:1px solid var(--rule-strong);border-radius:3px;font:var(--fw) var(--fs-2) var(--ui)}",
    ".tl-clock:focus-visible,.tl-sel:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    ".tl-sp{flex:1 1 auto}",
    ".tl-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".tl-phone .tl-bar-row .mini{min-width:44px;height:44px}",
    ".tl-phone .tl-bar-row{position:sticky;bottom:0;background:var(--panel)}"
  ].join("");

  function addStyle(doc, name, css) {
    if (!doc || !doc.head || doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }
  function prof(state) {
    if (!state) return null;
    if (PS.sel && PS.sel.profile) return PS.sel.profile(state);
    var l = state.lib || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === state.activeId) return l[i];
    return l[0] || null;
  }
  function der(state) {
    var r = prof(state);
    if (!r || !PS.derive || typeof PS.derive.all !== "function") return null;
    try { return PS.derive.all(r); } catch (e) { if (typeof console !== "undefined") console.error(e); return null; }
  }
  function cardOf(state) {
    if (PS.sel && PS.sel.card) return PS.sel.card(state);
    var r = prof(state), ui = state.ui || {};
    return r && r.cards ? r.cards[ui.cardIx || 0] || null : null;
  }
  function find(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function esc(s) { return PS.util.esc(s); }
  function mmss(s) {
    var a = Math.round(Math.abs(s));
    return Math.floor(a / 60) + ":" + (a % 60 < 10 ? "0" : "") + (a % 60);
  }
  function inkOf(identity) {
    if (identity === "friend") return "tl-ink-friend";
    if (identity === "hostile" || identity === "suspect") return "tl-ink-hostile";
    return "tl-ink-unknown";
  }
  function isEff(kind) { return !!(PS.catalog && PS.catalog.EFFECTOR_KINDS.indexOf(kind) >= 0); }
  function tmaxOf(state, d) {
    if (d && d.tmax) return d.tmax;
    if (PS.sel && PS.sel.tmax) { try { return PS.sel.tmax(state) || 60; } catch (e) { return 60; } }
    return 60;
  }
  // ring-only intervals: in a ring window and not in any cover window
  function subtract(ring, cover) {
    var out = [];
    (ring || []).forEach(function (w) {
      var segs = [[w.tIn, w.tOut]];
      (cover || []).forEach(function (c) {
        var next = [];
        segs.forEach(function (s) {
          if (c.tOut <= s[0] || c.tIn >= s[1]) { next.push(s); return; }
          if (c.tIn > s[0]) next.push([s[0], c.tIn]);
          if (c.tOut < s[1]) next.push([c.tOut, s[1]]);
        });
        segs = next;
      });
      segs.forEach(function (s) { if (s[1] - s[0] >= 0.2) out.push(s); });
    });
    return out;
  }

  // strip visibility (contract 16, mode to slots)
  function shown(state) {
    var ui = state.ui || {};
    if (ui.mode === "build") return !!ui.phone || !ui.stripTab || ui.stripTab === "timeline";
    if (ui.mode === "brief") { var c = cardOf(state); return !!(c && c.displays && c.displays.timeline); }
    return false;
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "timeline", CSS);
    el.innerHTML =
      '<div class="tl">' +
      '<div class="tl-overview" id="tl-overview" role="slider" tabindex="0" aria-label="Time zoom span" aria-valuemin="0"><div class="tl-ov-span"></div></div>' +
      '<div class="tl-plot">' +
      '<svg class="tl-axis" aria-hidden="true"></svg>' +
      '<div class="tl-lanes" role="group" aria-label="Timeline lanes"></div>' +
      '<div class="tl-cursor" hidden><div class="tl-cursor-l"></div>' +
      '<svg class="tl-grip" viewBox="0 0 12 9" aria-hidden="true"><polygon points="0,0 12,0 6,9"></polygon></svg></div>' +
      "</div>" +
      '<div class="tl-bar-row" role="toolbar" aria-label="Play bar">' +
      '<button type="button" class="mini tl-tp" id="tl-first" aria-label="Time to start" title="Time to start">|&lt;</button>' +
      '<button type="button" class="mini tl-tp" id="tl-prev" aria-label="Previous stop" title="Previous stop">&lt;</button>' +
      '<button type="button" class="mini tl-tp" id="tl-play" aria-label="Play" title="Play">▶</button>' +
      '<button type="button" class="mini tl-tp" id="tl-next" aria-label="Next stop" title="Next stop">&gt;</button>' +
      '<button type="button" class="mini tl-tp" id="tl-last" aria-label="Time to end" title="Time to end">&gt;|</button>' +
      '<label class="tl-vh" for="tl-rate">Play rate</label><select class="tl-sel" id="tl-rate"></select>' +
      '<label class="tl-vh" for="tl-loop">Loop</label><select class="tl-sel" id="tl-loop">' +
      '<option value="off">Loop off</option><option value="all">Loop all</option><option value="range">Loop range</option></select>' +
      '<span class="tl-sp"></span>' +
      '<label class="tl-vh" for="tl-clock">Time</label><input class="tl-clock" id="tl-clock" type="text" inputmode="numeric" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="mini" id="tl-onoff" aria-pressed="false">Time on</button>' +
      "</div></div>";

    var root = el.firstChild;
    var ov = root.querySelector(".tl-overview"), ovSpan = ov.firstChild;
    var plot = root.querySelector(".tl-plot");
    var axis = root.querySelector(".tl-axis");
    var lanes = root.querySelector(".tl-lanes");
    var cursor = root.querySelector(".tl-cursor");
    var q = function (id) { return root.querySelector("#" + id); };
    var rateSel = q("tl-rate"), loopSel = q("tl-loop"), clock = q("tl-clock"), playBtn = q("tl-play"), onoff = q("tl-onoff");

    var geo = { W: 800, tv0: 0, tv1: 60, tmax: 60 };
    var last = {};
    var drag = null, hoverRaf = null, hoverPending = null, hoverKey = null, rangeTmp = null;

    (PS.catalog && PS.catalog.RATES || [0.25, 0.5, 1, 2, 4, 8, 16, 32]).forEach(function (r) {
      var o = doc.createElement("option");
      o.value = String(r);
      o.textContent = "x" + r;
      rateSel.appendChild(o);
    });

    // ------------------------------------------------------------ time helpers
    function tset(t) {
      if (PS.time && PS.time.set) PS.time.set(t);
      else store.dispatch({ type: "time.set", t: t });
    }
    function xOf(t) { return GUT_L + (t - geo.tv0) / (geo.tv1 - geo.tv0 || 1) * (geo.W - GUT_L - GUT_R); }
    function tAtClient(cx) {
      var rect = plot.getBoundingClientRect();
      var f = (cx - rect.left - GUT_L) / ((geo.W - GUT_L - GUT_R) || 1);
      return PS.util.clamp(geo.tv0 + f * (geo.tv1 - geo.tv0), 0, geo.tmax);
    }
    function round1(t) { return Math.round(t * 10) / 10; }

    // ------------------------------------------------------------ rendering
    function axisSvg(W, AX, ui) {
      var span = geo.tv1 - geo.tv0, major = MAJORS[MAJORS.length - 1];
      // a major step must leave room for its label ("t+0:00" at 10.5 px mono) plus a gap
      var pxs = (W - GUT_L - GUT_R) / (span || 1), labMin = 6 * TICK_CH + TICK_GAP;
      for (var i = 0; i < MAJORS.length; i++) if (span / MAJORS[i] <= 8 && MAJORS[i] * pxs >= labMin) { major = MAJORS[i]; break; }
      var minor = MINOR[major] || major / 5;
      var h = "";
      if (ui.range && ui.range.t1 > ui.range.t0) {
        var x0 = Math.max(GUT_L, xOf(ui.range.t0)), x1 = Math.min(W - GUT_R, xOf(ui.range.t1));
        if (x1 > x0) h += '<rect class="tl-range" x="' + x0 + '" y="0" width="' + (x1 - x0) + '" height="' + AX + '"></rect>';
      }
      h += '<line class="tl-axbase" x1="' + GUT_L + '" x2="' + (W - GUT_R) + '" y1="' + (AX - 0.5) + '" y2="' + (AX - 0.5) + '"></line>';
      var start = Math.ceil(geo.tv0 / minor) * minor, labEnd = -Infinity;
      for (var t = start; t <= geo.tv1 + 1e-6; t += minor) {
        var tt = Math.round(t * 1000) / 1000, x = xOf(tt), isMaj = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
        h += '<line class="tl-tick' + (isMaj ? " tl-tick-maj" : "") + '" x1="' + x + '" x2="' + x + '" y1="' + (isMaj ? AX - 7 : AX - 4) + '" y2="' + AX + '"></line>';
        if (isMaj) {
          var lab = major < 1 || tt % 1 ? "t+" + tt.toFixed(1) : PS.units.t(tt);
          var atStart = x < GUT_L + 12, lw = lab.length * TICK_CH, lx0 = atStart ? x : x - lw / 2;
          // drop a label that would touch the one before it
          if (lx0 >= labEnd + TICK_GAP) {
            h += '<text class="tl-tlab" x="' + x + '" y="' + (AX - 9) + '" text-anchor="' + (atStart ? "start" : "middle") + '">' + esc(lab) + "</text>";
            labEnd = lx0 + lw;
          }
        }
      }
      h += '<text class="tl-tlab" x="4" y="' + (AX - 9) + '">t</text>';
      return h;
    }

    function render() {
      var state = store.get(), ui = state.ui || {};
      var show = shown(state);
      el.hidden = !show;
      last = { tview: ui.tview, range: ui.range, loop: ui.loop, rate: ui.rate, playing: ui.playing, t: ui.t };
      if (!show) return;
      var phone = !!ui.phone;
      root.classList.toggle("tl-phone", phone);
      var r = prof(state), d = der(state);
      var tmax = tmaxOf(state, d);
      var tv = ui.tview && ui.tview.t1 > ui.tview.t0 ? ui.tview : { t0: 0, t1: tmax };
      geo.tmax = tmax;
      geo.tv0 = PS.util.clamp(tv.t0, 0, tmax);
      geo.tv1 = PS.util.clamp(tv.t1, geo.tv0 + 1, Math.max(tmax, geo.tv0 + 1));
      var W = Math.max(240, lanes.clientWidth || plot.clientWidth || el.clientWidth || 800);
      geo.W = W;
      var AX = phone ? 16 : 28;

      // overview
      var full = !ui.tview;
      ov.classList.toggle("tl-ov-full", full);
      ovSpan.style.left = (geo.tv0 / tmax * 100) + "%";
      ovSpan.style.width = ((geo.tv1 - geo.tv0) / tmax * 100) + "%";
      ov.setAttribute("aria-valuemax", String(Math.round(tmax)));
      ov.setAttribute("aria-valuenow", String(Math.round(geo.tv0)));
      ov.setAttribute("aria-valuetext", full ? "Whole run" : PS.units.t(geo.tv0) + " to " + PS.units.t(geo.tv1));

      axis.setAttribute("width", W);
      axis.setAttribute("height", AX);
      axis.setAttribute("viewBox", "0 0 " + W + " " + AX);
      axis.innerHTML = axisSvg(W, AX, ui);

      var sc = (r && r.scene) || {};
      var paths = sc.paths || [];
      if (!r || !paths.length) {
        lanes.innerHTML = '<p class="tl-empty t-sub">Add an aircraft to see time.</p>';
        updateBar(state);
        moveCursor(state);
        return;
      }
      var sel = ui.sel || {}, selPath = null;
      if (sel.kind === "path") selPath = sel.id;
      else if (sel.kind === "event") { var se = find(r.events, sel.id); selPath = se ? se.path : null; }
      var lanePaths = phone && selPath ? paths.filter(function (p) { return p.id === selPath; }) : paths;
      var BAR = phone ? 2 : 3, BGAP = phone ? 0 : 1, BEAD = phone ? 7 : 11, LANE = phone ? 10 : 14, VROW = phone ? 5 : 6;
      var W0 = GUT_L, W1 = W - GUT_R;
      function cx(t) { return Math.max(W0, Math.min(W1, xOf(t))); }
      function inView(a, b) { return b >= geo.tv0 && a <= geo.tv1; }
      var h = '<defs><pattern id="tl-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<line class="tl-hatch-l" x1="0" y1="0" x2="0" y2="4"></line></pattern>' +
        '<pattern id="tl-hatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">' +
        '<line class="tl-hatch2-l" x1="0" y1="0" x2="0" y2="4"></line></pattern></defs>';
      var y = 2;

      // volume rows
      (sc.volumes || []).forEach(function (v) {
        if (v.kind === "ref") return;
        var en = d && d.vols ? d.vols[v.id] : null;
        h += '<text class="tl-vlab" x="4" y="' + (y + VROW - 0.5) + '">' + esc(v.id) + "</text>";
        lanePaths.forEach(function (p) {
          ((en && en[p.id]) || []).forEach(function (e) {
            if (!inView(e.tIn, e.tOut)) return;
            var x0 = cx(e.tIn), x1 = cx(e.tOut);
            h += '<rect class="tl-vbar ' + inkOf(p.identity) + '" data-k="volume" data-id="' + esc(v.id) + '" data-path="' + esc(p.id) +
              '" data-tin="' + e.tIn + '" data-tout="' + e.tOut + '" x="' + x0 + '" y="' + y + '" width="' + Math.max(1, x1 - x0) + '" height="' + VROW + '"></rect>';
          });
        });
        y += VROW + 2;
      });
      if (y > 2) { h += '<line class="tl-lane-sep" x1="0" x2="' + W + '" y1="' + (y - 0.5) + '" y2="' + (y - 0.5) + '"></line>'; y += 1; }

      var laneTop = y;
      lanePaths.forEach(function (p) {
        var systems = (sc.systems || []).filter(function (s) {
          var w = d && d.windows && d.windows[s.id] ? d.windows[s.id][p.id] : null;
          var wr = d && d.windowsRing && d.windowsRing[s.id] ? d.windowsRing[s.id][p.id] : null;
          return (w && w.length) || (wr && wr.length);
        });
        var LH = Math.max(LANE, 2 + systems.length * (BAR + BGAP) + BEAD);
        var top = y, ink = inkOf(p.identity);
        var evs = ((r.events) || []).filter(function (e) { return e.path === p.id; });
        var hasType = {};
        evs.forEach(function (e) { hasType[e.type] = Math.min(hasType[e.type] == null ? Infinity : hasType[e.type], e.t); });
        h += '<g class="tl-lane-g" data-lane="' + esc(p.id) + '">';
        h += '<rect class="tl-lane' + (selPath === p.id ? " tl-lane-sel" : "") + '" data-k="path" data-id="' + esc(p.id) + '" x="0" y="' + top + '" width="' + W + '" height="' + LH + '"></rect>';

        // planned decision window
        var win = d && d.window ? d.window[p.id] : null;
        if (win && win.detectT != null && win.engageT != null && win.engageT > win.detectT && inView(win.detectT, win.engageT)) {
          h += '<rect class="tl-win" x="' + cx(win.detectT) + '" y="' + top + '" width="' + Math.max(0, cx(win.engageT) - cx(win.detectT)) + '" height="' + LH + '"></rect>';
        }
        h += '<text class="tl-lab ' + ink + '" x="4" y="' + (top + Math.min(LH - 3, 11)) + '">' + esc(p.id) + "</text>";

        // coverage bars per system
        systems.forEach(function (s, k) {
          var by = top + 2 + k * (BAR + BGAP), eff = isEff(s.kind);
          var w = (d.windows[s.id] && d.windows[s.id][p.id]) || [];
          var wr = (d.windowsRing && d.windowsRing[s.id] && d.windowsRing[s.id][p.id]) || [];
          var firstAct = eff ? hasType.engage : hasType.detect;
          w.forEach(function (x) {
            if (!inView(x.tIn, x.tOut)) return;
            var x0 = cx(x.tIn), x1 = cx(x.tOut);
            h += '<rect class="tl-bar ' + (eff ? "tl-bar-e" : "tl-bar-s") + '" x="' + x0 + '" y="' + by + '" width="' + Math.max(1, x1 - x0) + '" height="' + BAR + '"></rect>';
            // hatched where there is cover and no event of the matching type yet
            var hEnd = firstAct == null ? x.tOut : Math.min(x.tOut, firstAct);
            if (hEnd > x.tIn + 0.2) {
              h += '<rect class="tl-hatchov" x="' + x0 + '" y="' + by + '" width="' + Math.max(0, cx(hEnd) - x0) + '" height="' + BAR + '"></rect>';
            }
            h += '<rect class="tl-bar-hit" data-k="system" data-id="' + esc(s.id) + '" data-path="' + esc(p.id) + '" data-tin="' + x.tIn + '" data-tout="' + x.tOut +
              '" x="' + x0 + '" y="' + (by - 1) + '" width="' + Math.max(3, x1 - x0) + '" height="' + (BAR + 2) + '"></rect>';
          });
          subtract(wr, w).forEach(function (sg) {
            if (!inView(sg[0], sg[1])) return;
            var yy = by + BAR / 2;
            h += '<line class="tl-ring ' + (eff ? "tl-ring-e" : "tl-ring-s") + '" x1="' + cx(sg[0]) + '" x2="' + cx(sg[1]) + '" y1="' + yy + '" y2="' + yy + '"></line>';
            h += '<rect class="tl-bar-hit" data-k="system" data-ring="1" data-id="' + esc(s.id) + '" data-path="' + esc(p.id) + '" data-tin="' + sg[0] + '" data-tout="' + sg[1] +
              '" x="' + cx(sg[0]) + '" y="' + (by - 1) + '" width="' + Math.max(3, cx(sg[1]) - cx(sg[0])) + '" height="' + (BAR + 2) + '"></rect>';
          });
        });

        // holds along the lane bottom
        var tm = d && d.timed ? d.timed[p.id] : null;
        (tm || []).forEach(function (pt) {
          if (pt.t1 > pt.t0 && inView(pt.t0, pt.t1)) {
            h += '<rect class="tl-hold ' + ink + '" x="' + cx(pt.t0) + '" y="' + (top + LH - 4) + '" width="' + Math.max(1, cx(pt.t1) - cx(pt.t0)) + '" height="3"></rect>';
          }
        });

        // derived rung beads (hollow)
        var by2 = top + LH - BEAD / 2 - 1;
        var lad = d && d.ladder ? d.ladder[p.id] : null;
        var LET = { detect: "D", track: "T", id: "I", engage: "E", effect: "C" };
        if (lad) {
          Object.keys(LET).forEach(function (k) {
            var g = lad[k];
            if (!g) return;
            var tg = g.source === "geometry" ? g.t : (g.source === "event" && g.warn ? g.tGeo : null);
            if (tg == null || tg < geo.tv0 || tg > geo.tv1) return;
            h += '<g class="tl-dbead"><circle cx="' + xOf(tg) + '" cy="' + by2 + '" r="' + (phone ? 3 : 4) + '"></circle>' +
              (phone ? "" : '<text x="' + xOf(tg) + '" y="' + by2 + '">' + LET[k] + "</text>") + "</g>";
          });
        }
        // event beads
        var warned = {};
        ((d && d.warnings) || []).forEach(function (w) { if (w.eventId) warned[w.eventId] = true; });
        evs.forEach(function (e) {
          if (e.t < geo.tv0 || e.t > geo.tv1) return;
          var letter = (PS.catalog && PS.catalog.EV_TYPES[e.type]) || "?";
          var cls = "tl-bead" + (sel.kind === "event" && sel.id === e.id ? " tl-sel" : "") + (warned[e.id] ? " tl-warn" : "");
          h += '<g class="' + cls + '" data-k="event" data-id="' + esc(e.id) + '" data-path="' + esc(p.id) + '">' +
            '<circle cx="' + xOf(e.t) + '" cy="' + by2 + '" r="' + (phone ? 3.5 : 5) + '"></circle>' +
            (phone ? "" : '<text x="' + xOf(e.t) + '" y="' + by2 + '">' + esc(letter) + "</text>") + "</g>";
        });
        h += "</g>";
        y += LH;
        h += '<line class="tl-lane-sep" x1="0" x2="' + W + '" y1="' + (y + 0.5) + '" y2="' + (y + 0.5) + '"></line>';
        y += 1;
      });

      // split and merge marks across all lanes
      ((d && d.splits) || []).forEach(function (s) {
        if (s.t < geo.tv0 || s.t > geo.tv1) return;
        var x = xOf(s.t), lab = (s.to > s.from ? "S " : "M ") + s.to;
        h += '<line class="tl-split" x1="' + x + '" x2="' + x + '" y1="' + Math.max(0, laneTop - 1) + '" y2="' + y + '"></line>';
        h += '<text class="tl-splab" x="' + (x + 3) + '" y="' + (laneTop + 9) + '">' + esc(lab) + "</text>";
      });

      var H = Math.max(y + 2, 20);
      var keep = lanes.scrollTop;
      lanes.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Coverage and events by path">' + h + "</svg>";
      lanes.scrollTop = keep;
      hoverMarks(state);
      updateBar(state);
      moveCursor(state);
    }

    function hoverMarks(state) {
      var hov = (state.ui && state.ui.hover) || {};
      var gs = lanes.querySelectorAll(".tl-lane-g");
      for (var i = 0; i < gs.length; i++) {
        var lane = gs[i].firstChild;
        if (lane && lane.classList) lane.classList.toggle("tl-lane-hov", hov.kind === "path" && hov.id === gs[i].getAttribute("data-lane"));
      }
    }

    function moveCursor(state) {
      var ui = state.ui || {};
      if (ui.t == null || ui.t < geo.tv0 - 1e-6 || ui.t > geo.tv1 + 1e-6) { cursor.hidden = true; }
      else {
        cursor.hidden = false;
        cursor.style.transform = "translateX(" + xOf(ui.t).toFixed(1) + "px)";
      }
      if (doc.activeElement !== clock) clock.value = ui.t == null ? "" : PS.units.t(ui.t);
      clock.placeholder = "t+0:00";
      onoff.textContent = ui.t == null ? "Time on" : "Time off";
      onoff.setAttribute("aria-pressed", ui.t == null ? "false" : "true");
    }

    function updateBar(state) {
      var ui = state.ui || {};
      playBtn.textContent = ui.playing ? "❚❚" : "▶";
      playBtn.setAttribute("aria-label", ui.playing ? "Pause" : "Play");
      playBtn.title = ui.playing ? "Pause" : "Play";
      if (ui.rate != null) rateSel.value = String(ui.rate);
      loopSel.value = ui.loop || "off";
    }

    // ------------------------------------------------------------ pointer
    function hoverFor(e) {
      var t = tAtClient(e.clientX);
      var tg = e.target && e.target.closest ? e.target.closest("[data-k]") : null;
      var h = { type: "hover.set", kind: null, id: null, i: null, cx: e.clientX, cy: e.clientY, text: null, t: round1(t) };
      if (tg && lanes.contains(tg)) {
        var k = tg.getAttribute("data-k"), id = tg.getAttribute("data-id"), pid = tg.getAttribute("data-path");
        var u = PS.units;
        h.kind = k;
        h.id = id;
        if (k === "system") {
          var tin = Number(tg.getAttribute("data-tin")), tout = Number(tg.getAttribute("data-tout"));
          if (tg.getAttribute("data-ring")) h.text = [pid + " is in the " + id + " ring but not in cover.", u.t(tin) + " to " + u.t(tout)];
          else h.text = [id + " sees " + pid + " from " + u.t(tin) + " to " + u.t(tout) + ".", "held " + mmss(tout - tin)];
        } else if (k === "volume") {
          var a = Number(tg.getAttribute("data-tin")), b = Number(tg.getAttribute("data-tout"));
          h.text = [pid + " is in " + id + " from " + u.t(a) + " to " + u.t(b) + ".", "for " + mmss(b - a)];
        }
      }
      return h;
    }
    function flushHover() {
      hoverRaf = null;
      if (!hoverPending) return;
      var h = hoverPending;
      hoverPending = null;
      var key = [h.kind, h.id, h.t, h.text ? h.text[0] : ""].join("|");
      if (key === hoverKey) return;
      hoverKey = key;
      store.dispatch(h);
    }
    function queueHover(h) {
      hoverPending = h;
      var w = doc.defaultView;
      if (hoverRaf == null) {
        if (w && w.requestAnimationFrame) hoverRaf = w.requestAnimationFrame(flushHover);
        else flushHover();
      }
    }

    function eventIndex(id) {
      var r = prof(store.get()), evs = (r && r.events) || [];
      for (var i = 0; i < evs.length; i++) if (evs[i].id === id) return i;
      return -1;
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      var t = e.target;
      var bead = t.closest ? t.closest(".tl-bead") : null;
      var onAxis = axis.contains(t) || (t.closest && t.closest(".tl-grip"));
      if (bead && lanes.contains(bead)) {
        drag = { kind: "bead", id: bead.getAttribute("data-id"), path: bead.getAttribute("data-path"), x0: e.clientX, moved: false };
      } else if (onAxis && e.shiftKey) {
        drag = { kind: "range", t0: tAtClient(e.clientX), x0: e.clientX };
      } else if (onAxis) {
        drag = { kind: "scrub" };
        tset(round1(tAtClient(e.clientX)));
      } else {
        drag = { kind: "lane", x0: e.clientX, target: t };
        return;
      }
      if (plot.setPointerCapture && e.pointerId != null) { try { plot.setPointerCapture(e.pointerId); } catch (x) { /* capture is optional */ } }
      e.preventDefault();
    }

    function onMove(e) {
      if (!drag || drag.kind === "lane") { queueHover(hoverFor(e)); return; }
      var t = tAtClient(e.clientX);
      if (drag.kind === "scrub") { tset(round1(t)); queueHover({ type: "hover.set", kind: null, id: null, i: null, cx: e.clientX, cy: e.clientY, text: null, t: round1(t) }); return; }
      if (drag.kind === "range") {
        rangeTmp = { t0: Math.min(drag.t0, t), t1: Math.max(drag.t0, t) };
        var ui = store.get().ui || {};
        axis.innerHTML = axisSvg(geo.W, ui.phone ? 16 : 28, { range: rangeTmp });
        return;
      }
      if (drag.kind === "bead") {
        if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return;
        var ix = eventIndex(drag.id);
        if (ix < 0) return;
        if (!drag.moved) { drag.moved = true; store.begin("Move " + drag.id); }
        var tt = t;
        if (PS.tools && typeof PS.tools.snapBead === "function" && !e.altKey) {
          var sn = PS.tools.snapBead(drag.path, t, der(store.get()));
          if (sn && sn.t != null) tt = sn.t;
        }
        store.set("events." + ix + ".t", round1(tt));
      }
    }

    function onUp(e) {
      var dr = drag;
      drag = null;
      if (plot.releasePointerCapture && e.pointerId != null) { try { plot.releasePointerCapture(e.pointerId); } catch (x) { /* capture is optional */ } }
      if (!dr) return;
      if (dr.kind === "bead") {
        if (dr.moved) store.commit();
        else store.dispatch({ type: "sel.set", kind: "event", id: dr.id, i: null });
      } else if (dr.kind === "range") {
        if (rangeTmp && rangeTmp.t1 - rangeTmp.t0 >= 0.5) {
          var rg = { t0: round1(rangeTmp.t0), t1: round1(rangeTmp.t1) };
          if (PS.time && PS.time.loop) PS.time.loop("range", rg);
          else store.dispatch({ type: "time.loop", loop: "range", range: rg });
        }
        rangeTmp = null;
        render();
      } else if (dr.kind === "lane" && Math.abs(e.clientX - dr.x0) < 3) {
        var tg = dr.target && dr.target.closest ? dr.target.closest("[data-path],[data-k='path']") : null;
        if (tg && lanes.contains(tg)) {
          var pid = tg.getAttribute("data-k") === "path" ? tg.getAttribute("data-id") : tg.getAttribute("data-path");
          if (pid) store.dispatch({ type: "sel.set", kind: "path", id: pid, i: null });
        }
      }
    }

    function onCancel() {
      if (drag && drag.kind === "bead" && drag.moved) store.cancel();
      drag = null;
      rangeTmp = null;
    }

    function onLeave() {
      if (drag) return;
      hoverPending = null;
      hoverKey = null;
      store.dispatch({ type: "hover.clear" });
    }

    function onDbl(e) {
      var t = e.target;
      if (axis.contains(t)) {
        store.dispatch({ type: "time.loop", loop: "off", range: null });
        return;
      }
      var bar = t.closest ? t.closest(".tl-bar-hit") : null;
      if (bar && !bar.getAttribute("data-ring")) {
        var tin = Number(bar.getAttribute("data-tin"));
        if (Math.abs(e.clientX - (plot.getBoundingClientRect().left + xOf(tin))) > 8) return;
        var sid = bar.getAttribute("data-id"), pid = bar.getAttribute("data-path");
        var r = prof(store.get()), s = find(r && r.scene && r.scene.systems, sid);
        var type = s && isEff(s.kind) ? "engage" : "detect";
        if (PS.tools && PS.tools.addEventAt) PS.tools.addEventAt(store, pid, tin, type, sid);
      }
    }

    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var state = store.get(), d = der(state), tmax = tmaxOf(state, d);
      var tp = tAtClient(e.clientX);
      var span = geo.tv1 - geo.tv0;
      var ns = PS.util.clamp(span * Math.exp(e.deltaY * 0.0025), MIN_SPAN, tmax);
      if (ns >= tmax - 1e-6) { store.dispatch({ type: "time.view", tview: null }); return; }
      var f = (tp - geo.tv0) / (span || 1);
      var t0 = PS.util.clamp(tp - f * ns, 0, tmax - ns);
      store.dispatch({ type: "time.view", tview: { t0: round1(t0), t1: round1(t0 + ns) } });
    }

    // overview pan
    var ovDrag = null;
    function ovDown(e) {
      var ui = store.get().ui || {};
      if (!ui.tview) return;
      ovDrag = { x0: e.clientX, t0: ui.tview.t0, span: ui.tview.t1 - ui.tview.t0 };
      if (ov.setPointerCapture && e.pointerId != null) { try { ov.setPointerCapture(e.pointerId); } catch (x) { /* optional */ } }
      e.preventDefault();
    }
    function ovMove(e) {
      if (!ovDrag) return;
      var w = ov.getBoundingClientRect().width || 1;
      var t0 = PS.util.clamp(ovDrag.t0 + (e.clientX - ovDrag.x0) / w * geo.tmax, 0, geo.tmax - ovDrag.span);
      store.dispatch({ type: "time.view", tview: { t0: round1(t0), t1: round1(t0 + ovDrag.span) } });
    }
    function ovUp() { ovDrag = null; }
    function ovDbl() { store.dispatch({ type: "time.view", tview: null }); }

    // ------------------------------------------------------------ play bar
    function onBar(e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      var state = store.get(), ui = state.ui || {}, tm = tmaxOf(state, der(state));
      var T = PS.time || {};
      switch (b.id) {
        case "tl-first": tset(0); break;
        case "tl-last": tset(tm); break;
        case "tl-prev": if (T.prevEvent) T.prevEvent(); break;
        case "tl-next": if (T.nextEvent) T.nextEvent(); break;
        case "tl-play":
          if (T.toggle) T.toggle();
          else store.dispatch({ type: ui.playing ? "time.pause" : "time.play" });
          break;
        case "tl-onoff":
          if (ui.t == null) { if (T.on) T.on(); else tset(0); }
          else if (T.off) T.off();
          else store.dispatch({ type: "time.set", t: null });
          break;
      }
    }
    function onRate() {
      var r = Number(rateSel.value);
      if (PS.time && PS.time.rate) PS.time.rate(r);
      else store.dispatch({ type: "time.rate", rate: r });
    }
    function onLoop() {
      var v = loopSel.value, ui = store.get().ui || {};
      var range = ui.range;
      if (v === "range" && !range) range = ui.tview ? { t0: ui.tview.t0, t1: ui.tview.t1 } : { t0: 0, t1: geo.tmax };
      if (PS.time && PS.time.loop) PS.time.loop(v, v === "range" ? range : ui.range);
      else store.dispatch({ type: "time.loop", loop: v, range: v === "range" ? range : ui.range });
    }
    function restoreClock() {
      var ui = store.get().ui || {};
      clock.value = ui.t == null ? "" : PS.units.t(ui.t);
    }
    function onClockKey(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var ui = store.get().ui || {};
        var v = PS.units.parseT(clock.value, ui.t == null ? 0 : ui.t);
        if (v == null) {
          restoreClock();
          if (PS.bus && PS.bus.emit) PS.bus.emit("readout", { text: "Type a time as 2:55 or 175.", level: "warn" });
          return;
        }
        tset(v);
        clock.blur();
        restoreClock();
      } else if (e.key === "Escape") {
        restoreClock();
        clock.blur();
      }
    }

    plot.addEventListener("pointerdown", onDown);
    plot.addEventListener("pointermove", onMove);
    plot.addEventListener("pointerup", onUp);
    plot.addEventListener("pointercancel", onCancel);
    plot.addEventListener("pointerleave", onLeave);
    plot.addEventListener("dblclick", onDbl);
    plot.addEventListener("wheel", onWheel, { passive: false });
    ov.addEventListener("pointerdown", ovDown);
    ov.addEventListener("pointermove", ovMove);
    ov.addEventListener("pointerup", ovUp);
    ov.addEventListener("dblclick", ovDbl);
    var barRow = root.querySelector(".tl-bar-row");
    barRow.addEventListener("click", onBar);
    rateSel.addEventListener("change", onRate);
    loopSel.addEventListener("change", onLoop);
    clock.addEventListener("keydown", onClockKey);
    clock.addEventListener("blur", restoreClock);

    render();

    return {
      update: function (state, channel) {
        state = store.get();
        var ui = state.ui || {};
        if (channel === "time") {
          if (el.hidden) { last.t = ui.t; return; }
          if (ui.tview !== last.tview || ui.range !== last.range) { render(); return; }
          if (ui.loop !== last.loop || ui.rate !== last.rate || ui.playing !== last.playing) updateBar(state);
          last.loop = ui.loop; last.rate = ui.rate; last.playing = ui.playing; last.t = ui.t;
          moveCursor(state);
          return;
        }
        if (channel === "hover") { if (!el.hidden) hoverMarks(state); return; }
        if (drag && drag.kind === "bead" && (channel === "profile" || channel === "derived")) {
          // keep the dragged bead element; rebuild once the drag ends
          render();
          return;
        }
        render();
      },
      unmount: function () {
        plot.removeEventListener("pointerdown", onDown);
        plot.removeEventListener("pointermove", onMove);
        plot.removeEventListener("pointerup", onUp);
        plot.removeEventListener("pointercancel", onCancel);
        plot.removeEventListener("pointerleave", onLeave);
        plot.removeEventListener("dblclick", onDbl);
        plot.removeEventListener("wheel", onWheel);
        ov.removeEventListener("pointerdown", ovDown);
        ov.removeEventListener("pointermove", ovMove);
        ov.removeEventListener("pointerup", ovUp);
        ov.removeEventListener("dblclick", ovDbl);
        barRow.removeEventListener("click", onBar);
        rateSel.removeEventListener("change", onRate);
        loopSel.removeEventListener("change", onLoop);
        clock.removeEventListener("keydown", onClockKey);
        clock.removeEventListener("blur", restoreClock);
        var w = doc.defaultView;
        if (hoverRaf != null && w && w.cancelAnimationFrame) w.cancelAnimationFrame(hoverRaf);
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("timeline", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
