(function (PS) {
  "use strict";
  // Kill-chain ladder (contract 16, brief 6.6): one row per path, rung cells, Window, Margin, Flown.

  var CHANNELS = ["profile", "derived", "mode", "sel", "units", "panels"];
  var STEPS = ["detect", "track", "id", "engage", "effect"];
  var HEAD = { detect: "Detect", track: "Track", id: "Identify", engage: "Engage", effect: "Effect" };
  var LETTER = { detect: "D", track: "T", id: "I", engage: "E", effect: "C" };
  var FILL_TYPE = { detect: "detect", track: "track", id: "id", engage: "engage", effect: "checkpoint" };
  var SORT_KEYS = ["path", "detect", "window", "margin"];

  var CSS = [
    "#slot-ladder{background:var(--panel);color:var(--t1)}",
    "#slot-ladder[hidden]{display:none}",
    "@media (max-width:1279px){#slot-ladder:not(.ld-tab-on){display:none}}",
    ".ld{padding:4px 8px 8px;overflow-x:auto}",
    ".ld-title{margin:4px 0 6px}",
    // minimum 710 px: fits the 726 px board column at 1325 px with the rail and inspector open, so Flown stays in view
    ".ld-grid{display:grid;grid-template-columns:44px repeat(5,minmax(82px,1fr)) 80px 52px minmax(76px,1.3fr);",
    "column-gap:6px;row-gap:12px;align-items:stretch;min-width:710px}",
    ".ld-h{padding:2px 0;display:flex;align-items:end}",
    ".ld-sort{all:unset;cursor:pointer}",
    ".ld-sort:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    ".ld-sort[aria-sort=ascending]::after{content:' \\25B2'}",
    ".ld-sort[aria-sort=descending]::after{content:' \\25BC'}",
    ".ld-path{all:unset;cursor:pointer;color:var(--hostile);padding:3px 0;min-height:var(--ladder-row)}",
    ".ld-path.ld-id-friend{color:var(--friend)}.ld-path.ld-id-neutral,.ld-path.ld-id-unknown,.ld-path.ld-id-pending{color:var(--unknown)}",
    ".ld-path:focus-visible,.ld-cell:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    // the id clears the 3 px inset selection bar
    ".ld-pathc{box-sizing:border-box;min-width:0;padding-left:7px}",
    ".ld-row-sel{box-shadow:inset 3px 0 0 var(--select)}",
    ".ld-cell{all:unset;box-sizing:border-box;position:relative;cursor:pointer;min-height:var(--ladder-row);padding:2px 4px;",
    "border:1px solid var(--rule-strong);border-radius:3px;color:var(--t1);background:var(--panel)}",
    ".ld-cell.ld-solid{border-color:var(--nominal);background:color-mix(in srgb,var(--nominal) 10%,var(--panel))}",
    ".ld-cell.ld-geo{border-style:dashed;color:var(--t2)}",
    ".ld-cell.ld-none{border-style:dotted;color:var(--t3);text-align:center;display:flex;align-items:center;justify-content:center}",
    ".ld-cell.ld-warn{border-color:var(--warn);color:var(--warn);background:color-mix(in srgb,var(--warn) 10%,var(--panel))}",
    ".ld-cell.ld-sel{box-shadow:0 0 0 2px var(--select)}",
    ".ld-l1,.ld-l2{display:block;white-space:nowrap}.ld-l2{color:var(--t2)}",
    ".ld-warn .ld-l2{color:var(--warn)}",
    ".ld-tri{display:inline-block;width:10px;height:9px;margin-left:4px;vertical-align:-1px}",
    ".ld-tri polygon{fill:none;stroke:currentColor;stroke-width:1.25}",
    // the gap seconds sit in the row gap above the boundary between two cells, clear of the cell text
    ".ld-gap{position:absolute;left:-3px;top:-12px;transform:translateX(-50%);line-height:1;white-space:nowrap;",
    "background:var(--panel);padding:0 1px;pointer-events:none}",
    ".ld-val{padding:3px 0;text-align:right;white-space:nowrap}",
    ".ld-val.ld-neg{color:var(--warn)}",
    ".ld-fl{display:flex;flex-wrap:wrap;gap:3px;align-items:center}",
    ".ld-flc{border:1px solid var(--rule-strong);border-radius:2px;padding:1px 3px;white-space:nowrap}",
    ".ld-flc.ld-fl-ev{border-color:var(--nominal);color:var(--t1)}.ld-flc.ld-fl-geo{border-style:dashed}",
    ".ld-fld{color:var(--t1)}.ld-fld.ld-late{color:var(--warn)}",
    ".ld-empty{margin:8px 0;color:var(--t2)}"
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
  function signed(s) { return (s < 0 && Math.round(Math.abs(s)) > 0 ? "-" : "+") + mmss(s); }
  var TRI = '<svg class="ld-tri" viewBox="0 0 10 9" aria-hidden="true"><polygon points="5,0.8 9.4,8.4 0.6,8.4"></polygon></svg>';

  function sortRows(rows, sort) {
    var key = sort && SORT_KEYS.indexOf(sort.key) >= 0 ? sort.key : "path";
    var dir = sort && sort.dir === -1 ? -1 : 1;
    function val(r) {
      if (key === "path") return r.ix;
      if (key === "detect") return r.lad.detect && r.lad.detect.t != null ? r.lad.detect.t : null;
      if (key === "window") return r.win && r.win.geometric != null ? r.win.geometric : null;
      return r.win && r.win.margin != null ? r.win.margin : null;
    }
    return rows.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va == null && vb == null) return a.ix - b.ix;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir || a.ix - b.ix;
    });
  }

  // tooltip lines for a rung cell
  function tipLines(r, rung, step) {
    var out = [];
    if (!rung) return out;
    if (rung.warn && rung.warnText) out.push(rung.warnText);
    if (rung.planning) {
      var sys = find(r.scene && r.scene.systems, rung.system), def = sys && PS.catalog ? PS.catalog.SYS_DEFAULTS[sys.kind] : null;
      if (step === "track") out.push("planning default, confirm " + (def && def.confirm != null ? def.confirm : 3) + " s");
      else if (step === "id") out.push("planning default, dwell " + (PS.catalog ? PS.catalog.ID_DWELL : 5) + " s");
      else if (step === "effect") out.push("planning default, time to effect " + (def && def.tte != null ? def.tte : 10) + " s");
      else out.push("planning default");
    }
    return out;
  }

  function cellHtml(r, p, step, rung, prev, ev, selId) {
    var u = PS.units, cls = "ld-cell", l1 = "", l2 = "", act = "fill", tip = tipLines(r, rung, step);
    var letter = LETTER[step];
    if (step === "effect" && ev && PS.catalog && PS.catalog.EV_TYPES[ev.type]) letter = PS.catalog.EV_TYPES[ev.type];
    if (rung && rung.t != null && rung.source === "event") {
      cls += " ld-solid";
      act = "select";
    } else if (rung && rung.t != null) {
      cls += " ld-geo";
    } else {
      cls += " ld-none";
    }
    if (rung && rung.warn) cls += " ld-warn";
    if (ev && selId && ev.id === selId) cls += " ld-sel";
    var label;
    if (rung && rung.t != null) {
      l1 = letter + " " + u.t(rung.t) + (rung.warn ? TRI : "");
      l2 = rung.r != null && isFinite(rung.r) ? u.h(rung.r) : "";
      label = HEAD[step] + " " + p.id + " " + u.t(rung.t) + (act === "fill" ? ", geometry. Select to add the event." : "");
    } else {
      l1 = "+";
      label = HEAD[step] + " " + p.id + ", no time. Select to add the event at the time cursor.";
    }
    var gap = "";
    if (prev && prev.source === "event" && prev.t != null && rung && rung.source === "event" && rung.t != null) {
      gap = '<span class="ld-gap t-key">' + Math.round(rung.t - prev.t) + " s</span>";
    }
    var attrs = {
      type: "button", "class": cls, id: "ld-" + p.id + "-" + step, "data-act": act, "data-path": p.id, "data-step": step,
      "data-ev": act === "select" && ev ? ev.id : null, "aria-label": label + (tip.length ? " " + tip.join(" ") : ""),
      "data-tip": tip.length ? tip.join("\n") : null
    };
    return PS.util.S("button", attrs, '<span class="ld-l1">' + l1 + "</span>" + (l2 ? '<span class="ld-l2">' + esc(l2) + "</span>" : "") + gap);
  }

  function flownHtml(d, p, lad) {
    var f = d && d.flown && d.flown[p.id];
    if (!f || !f.ladder) return '<div class="ld-fl t-key"><span class="ld-flc">--</span></div>';
    var u = PS.units, h = '<div class="ld-fl t-key">';
    STEPS.forEach(function (s) {
      var g = f.ladder[s];
      if (!g || g.t == null) { h += '<span class="ld-flc">' + LETTER[s] + " --</span>"; return; }
      h += '<span class="ld-flc ' + (g.source === "event" ? "ld-fl-ev" : "ld-fl-geo") + '">' + LETTER[s] + " " + esc(u.t(g.t)) + "</span>";
    });
    var fe = f.ladder.engage, pe = lad && lad.engage;
    if (fe && fe.t != null && pe && pe.t != null) {
      var dt = fe.t - pe.t;
      h += '<span class="ld-fld' + (dt > 0.5 ? " ld-late" : "") + '">' + signed(dt) + "</span>";
    }
    return h + "</div>";
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "ladder", CSS);
    var hoverOn = false;

    function render() {
      var state = store.get(), ui = state.ui || {};
      var show = ui.mode === "build";
      el.hidden = !show;
      el.classList.toggle("ld-tab-on", ui.stripTab === "ladder" || (!!ui.phone && ui.sheet === "chain"));
      if (!show) { el.innerHTML = ""; return; }
      var r = prof(state), d = der(state);
      var paths = (r && r.scene && r.scene.paths) || [];
      var html = '<div class="ld"><h2 class="ld-title t-label t-strong" id="ld-title">Kill chain</h2>';
      if (!paths.length) {
        el.innerHTML = html + '<p class="ld-empty hint">Add an aircraft to see the kill chain.</p></div>';
        return;
      }
      var sort = ui.ladderSort || { key: "path", dir: 1 };
      var sel = ui.sel || {};
      var selEvent = sel.kind === "event" ? sel.id : null;
      var selPath = sel.kind === "path" ? sel.id : (selEvent ? ((find(r.events, selEvent) || {}).path || null) : null);
      function sortHead(key, label) {
        var on = sort.key === key;
        return PS.util.S("button", {
          type: "button", "class": "ld-sort", id: "ld-sort-" + key, "data-sort": key,
          "aria-sort": on ? (sort.dir === -1 ? "descending" : "ascending") : "none",
          "aria-label": "Sort by " + label
        }, esc(label));
      }
      html += '<div class="ld-grid" role="table" aria-labelledby="ld-title">';
      html += '<div class="ld-h t-label" role="columnheader">' + sortHead("path", "Path") + "</div>";
      STEPS.forEach(function (s) {
        html += '<div class="ld-h t-label" role="columnheader">' + (s === "detect" ? sortHead("detect", "Detect") : HEAD[s]) + "</div>";
      });
      html += '<div class="ld-h t-label" role="columnheader" style="justify-content:end">' + sortHead("window", "Window") + "</div>";
      html += '<div class="ld-h t-label" role="columnheader" style="justify-content:end">' + sortHead("margin", "Margin") + "</div>";
      html += '<div class="ld-h t-label" role="columnheader">Flown</div>';

      var rows = paths.map(function (p, ix) {
        return { p: p, ix: ix, lad: (d && d.ladder && d.ladder[p.id]) || {}, win: (d && d.window && d.window[p.id]) || null };
      });
      sortRows(rows, sort).forEach(function (row) {
        var p = row.p, lad = row.lad, win = row.win, rowSel = selPath === p.id;
        html += '<div class="ld-pathc t-mono-id' + (rowSel ? " ld-row-sel" : "") + '" role="rowheader">' +
          PS.util.S("button", { type: "button", "class": "ld-path ld-id-" + (p.identity || "hostile"), id: "ld-" + p.id + "-path",
            "data-act": "path", "data-path": p.id, "aria-label": "Select " + p.id }, esc(p.id)) + "</div>";
        var prev = null;
        STEPS.forEach(function (s) {
          var rung = lad[s] || null;
          var ev = rung && rung.event ? find(r.events, rung.event) : null;
          html += '<div role="cell" class="t-data">' + cellHtml(r, p, s, rung, prev, ev, selEvent) + "</div>";
          prev = rung;
        });
        var wtxt = "--";
        if (win && win.geometric != null) {
          wtxt = Math.round(win.geometric) + " s";
          if (win.planned != null) wtxt += " (" + Math.round(win.planned) + ")";
        } else if (win && win.planned != null) {
          wtxt = "(" + Math.round(win.planned) + ")";
        }
        html += '<div class="ld-val t-data" role="cell" id="ld-' + esc(p.id) + '-window">' + esc(wtxt) + "</div>";
        var m = win && win.margin != null ? win.margin : null;
        html += '<div class="ld-val t-data' + (m != null && m < 0 ? " ld-neg" : "") + '" role="cell" id="ld-' + esc(p.id) + '-margin">' +
          (m == null ? "--" : esc(signed(m))) + "</div>";
        html += '<div role="cell">' + flownHtml(d, p, lad) + "</div>";
      });
      html += "</div></div>";
      el.innerHTML = html;
    }

    function addEvent(pathId, step) {
      var state = store.get(), r = prof(state), d = der(state);
      var rung = d && d.ladder && d.ladder[pathId] ? d.ladder[pathId][step] : null;
      var t = rung && rung.t != null ? rung.t : state.ui.t;
      if (t == null) {
        PS.bus && PS.bus.emit && PS.bus.emit("readout", { text: "Set the time cursor to add the event here.", level: "warn" });
        return;
      }
      var type = FILL_TYPE[step];
      var system = rung && rung.system ? rung.system : null;
      if (!system && d) {
        var src = step === "engage" || step === "effect" ? d.firstEffector : d.firstSensor;
        if (src && src[pathId]) system = src[pathId].system;
      }
      if (PS.tools && typeof PS.tools.addEventAt === "function") {
        PS.tools.addEventAt(store, pathId, t, type, system);
        return;
      }
      var evs = (r && r.events) || [];
      store.dispatch({ type: "profile.push", path: "events", value: {
        id: PS.util.uid("e", evs), t: Math.round(t * 10) / 10, type: type,
        label: (PS.catalog && PS.catalog.EV_NAMES[type]) || type, path: pathId, system: system || null
      } });
    }

    function onClick(e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b || !el.contains(b)) return;
      var sortKey = b.getAttribute("data-sort");
      if (sortKey) {
        var cur = (store.get().ui || {}).ladderSort || { key: "path", dir: 1 };
        store.ui("ladderSort", { key: sortKey, dir: cur.key === sortKey ? -cur.dir : 1 });
        return;
      }
      var act = b.getAttribute("data-act"), pid = b.getAttribute("data-path");
      if (act === "path") store.dispatch({ type: "sel.set", kind: "path", id: pid, i: null });
      else if (act === "select") store.dispatch({ type: "sel.set", kind: "event", id: b.getAttribute("data-ev"), i: null });
      else if (act === "fill") addEvent(pid, b.getAttribute("data-step"));
    }

    function onOver(e) {
      var b = e.target.closest ? e.target.closest(".ld-cell") : null;
      if (!b) {
        if (hoverOn) { hoverOn = false; store.dispatch({ type: "hover.clear" }); }
        return;
      }
      var tip = b.getAttribute("data-tip");
      var ev = b.getAttribute("data-ev"), pid = b.getAttribute("data-path");
      if (!tip && !ev) {
        if (hoverOn) { hoverOn = false; store.dispatch({ type: "hover.clear" }); }
        return;
      }
      hoverOn = true;
      store.dispatch({
        type: "hover.set", kind: ev ? "event" : "path", id: ev || pid, i: null,
        cx: e.clientX, cy: e.clientY, text: tip ? tip.split("\n") : null, t: null
      });
    }
    function onLeave() {
      if (hoverOn) { hoverOn = false; store.dispatch({ type: "hover.clear" }); }
    }

    el.addEventListener("click", onClick);
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerleave", onLeave);
    render();

    return {
      update: function () { render(); },
      unmount: function () {
        el.removeEventListener("click", onClick);
        el.removeEventListener("pointerover", onOver);
        el.removeEventListener("pointerleave", onLeave);
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("ladder", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
