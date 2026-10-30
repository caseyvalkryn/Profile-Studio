(function (PS) {
  "use strict";
  // Range, height and speed chart against time (contract 16, brief 3.5 and 6.5).

  var CHANNELS = ["profile", "derived", "mode", "cam", "time", "sel", "hover", "units", "panels", "resize"];
  var GUT_L = 44, GUT_R = 12, MIN_SPAN = 10;
  var MODES = [["range", "Range"], ["alt", "Alt"], ["speed", "Speed"]];

  var CSS = [
    "#slot-chart{background:var(--panel);color:var(--t1);user-select:none}",
    "#slot-chart[hidden]{display:none}",
    ".ch{display:flex;flex-direction:column;min-height:var(--strip);height:100%}",
    ".ch-head{display:flex;align-items:center;gap:8px;padding:2px 8px;min-height:24px;border-bottom:1px solid var(--rule)}",
    ".ch-read{flex:1 1 auto;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis}",
    ".ch-plot{position:relative;flex:1 1 auto;min-height:calc(var(--strip) - 26px);overflow:hidden;cursor:crosshair}",
    ".ch-host,.ch-host svg{display:block;width:100%;height:100%}",
    ".ch-empty{margin:8px 0 8px " + GUT_L + "px}",
    ".ch-cursor,.ch-hline{position:absolute;top:0;bottom:0;left:0;width:1px;pointer-events:none;will-change:transform}",
    ".ch-cursor{background:var(--accent)}",
    ".ch-hline{background:var(--t3);opacity:.7}",
    ".ch-cursor[hidden],.ch-hline[hidden]{display:none}",
    ".ch-band{position:absolute;top:0;bottom:0;left:0;pointer-events:none;background:color-mix(in srgb,var(--accent) 14%,transparent)}",
    ".ch-band[hidden]{display:none}",
    ".ch-host [data-k=rangeline],.ch-host [data-k=system][data-role=range]{cursor:ns-resize}",
    ".ch-host [data-k=firstsee],.ch-host [data-k=see]{cursor:pointer}",
    ".ch-seg .mini[aria-pressed=true]{background:var(--sunken);color:var(--t1);border-color:var(--rule-strong)}"
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
  function refOf(state) {
    if (PS.sel && PS.sel.originId) return PS.sel.originId(state);
    return (state.ui && state.ui.cam && state.ui.cam.ref) || "asset";
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
  function isEff(kind) { return !!(PS.catalog && PS.catalog.EFFECTOR_KINDS.indexOf(kind) >= 0); }
  function tmaxOf(state, d) {
    if (d && d.tmax) return d.tmax;
    if (PS.sel && PS.sel.tmax) { try { return PS.sel.tmax(state) || 60; } catch (e) { return 60; } }
    return 60;
  }
  function round1(t) { return Math.round(t * 10) / 10; }

  function shown(state) {
    var ui = state.ui || {};
    if (ui.mode === "build") {
      if (ui.phone) return ui.sheet === "chart";
      return ui.stripTab === "chart";
    }
    if (ui.mode === "brief") { var c = cardOf(state); return !!(c && c.displays && c.displays.chart); }
    return false;
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "chart", CSS);
    var seg = MODES.map(function (m) {
      return '<button type="button" class="mini" id="ch-mode-' + m[0] + '" data-mode="' + m[0] + '" aria-pressed="false">' + m[1] + "</button>";
    }).join("");
    el.innerHTML =
      '<div class="ch">' +
      '<div class="ch-head"><div class="seg ch-seg" id="ch-mode" role="group" aria-label="Chart value">' + seg + "</div>" +
      '<div class="ch-read t-data t-sec" id="ch-read" aria-live="off"></div></div>' +
      '<div class="ch-plot"><div class="ch-host"></div>' +
      '<div class="ch-band" hidden></div><div class="ch-hline" hidden></div><div class="ch-cursor" hidden></div></div>' +
      "</div>";
    var root = el.firstChild;
    var segEl = root.querySelector(".ch-seg"), read = root.querySelector(".ch-read");
    var plot = root.querySelector(".ch-plot"), host = root.querySelector(".ch-host");
    var cursor = root.querySelector(".ch-cursor"), hline = root.querySelector(".ch-hline"), band = root.querySelector(".ch-band");

    var mode = "range";
    var geo = { W: 600, H: 160, x0: GUT_L, x1: 588, t0: 0, t1: 60, y0: null, y1: null, v0: null, v1: null, tmax: 60 };
    var last = {};
    var drag = null, raf = null, pendingEv = null, hoverKey = null;

    function tset(t) {
      if (PS.time && PS.time.set) PS.time.set(t);
      else store.dispatch({ type: "time.set", t: t });
    }
    function xOf(t) { return geo.x0 + (t - geo.t0) / ((geo.t1 - geo.t0) || 1) * (geo.x1 - geo.x0); }
    function localX(cx) { return cx - plot.getBoundingClientRect().left; }
    function localY(cy) { return cy - plot.getBoundingClientRect().top; }
    function tAt(cx) {
      var f = (localX(cx) - geo.x0) / ((geo.x1 - geo.x0) || 1);
      return PS.util.clamp(geo.t0 + f * (geo.t1 - geo.t0), 0, geo.tmax);
    }
    function vAt(cy) {
      if (geo.y0 == null || geo.v0 == null) return null;
      var f = (localY(cy) - geo.y0) / ((geo.y1 - geo.y0) || 1);
      return geo.v0 + f * (geo.v1 - geo.v0);
    }
    function num(svg, k) {
      var v = svg ? svg.getAttribute(k) : null;
      return v == null || v === "" || !isFinite(Number(v)) ? null : Number(v);
    }

    function focusPath(state, r) {
      var sel = (state.ui && state.ui.sel) || {}, paths = (r && r.scene && r.scene.paths) || [];
      if (sel.kind === "path" && find(paths, sel.id)) return sel.id;
      if (sel.kind === "event") { var e = find(r.events, sel.id); if (e && e.path) return e.path; }
      return paths.length ? paths[0].id : null;
    }

    function render() {
      var state = store.get(), ui = state.ui || {};
      var show = shown(state);
      el.hidden = !show;
      last = { tview: ui.tview, range: ui.range, t: ui.t };
      if (!show) return;
      var b = segEl.querySelectorAll("button");
      for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", b[i].getAttribute("data-mode") === mode ? "true" : "false");
      var r = prof(state), d = der(state), sc = (r && r.scene) || {};
      var tmax = tmaxOf(state, d);
      geo.tmax = tmax;
      var W = Math.max(240, plot.clientWidth || el.clientWidth || 600), H = Math.max(60, plot.clientHeight || 160);
      geo.W = W; geo.H = H;
      var tv = ui.tview && ui.tview.t1 > ui.tview.t0 ? ui.tview : { t0: 0, t1: tmax };
      geo.t0 = tv.t0; geo.t1 = tv.t1; geo.x0 = GUT_L; geo.x1 = W - GUT_R;
      geo.y0 = geo.y1 = geo.v0 = geo.v1 = null;
      if (!r || !(sc.paths || []).length) {
        host.innerHTML = '<p class="ch-empty t-sub">Add an aircraft to see time.</p>';
        cursorPaint(state);
        return;
      }
      if (mode === "range" && !(sc.systems || []).length) {
        host.innerHTML = '<p class="ch-empty t-sub">Add a sensor to see detection.</p>';
        cursorPaint(state);
        return;
      }
      var svg = "";
      if (PS.render && typeof PS.render.chart === "function") {
        try {
          svg = PS.render.chart(r, d, { W: W, H: H }, {
            t: null, ref: refOf(state), mode: mode, tview: ui.tview || null, hoverT: null,
            sel: ui.sel || null, units: PS.units.mode, thumb: false, flown: true
          }) || "";
        } catch (e) { if (typeof console !== "undefined") console.error(e); svg = ""; }
      }
      host.innerHTML = svg;
      var s = host.querySelector("svg");
      if (s) {
        // optional plot frame stamped by render.chart (cross-lane request); gutters are the fallback
        var x0 = num(s, "data-x0"), x1 = num(s, "data-x1"), t0 = num(s, "data-t0"), t1 = num(s, "data-t1");
        if (x0 != null && x1 != null && x1 > x0) { geo.x0 = x0; geo.x1 = x1; }
        if (t0 != null && t1 != null && t1 > t0) { geo.t0 = t0; geo.t1 = t1; }
        geo.y0 = num(s, "data-y0"); geo.y1 = num(s, "data-y1"); geo.v0 = num(s, "data-v0"); geo.v1 = num(s, "data-v1");
        var vb = s.viewBox && s.viewBox.baseVal;
        if (vb && vb.width && Math.abs(vb.width - W) > 1) {
          var k = W / vb.width;
          geo.x0 *= k; geo.x1 *= k;
          if (geo.y0 != null && vb.height) { var ky = H / vb.height; geo.y0 *= ky; geo.y1 *= ky; }
        }
      }
      cursorPaint(state);
    }

    function cursorPaint(state) {
      var ui = state.ui || {};
      if (ui.t == null || ui.t < geo.t0 - 1e-6 || ui.t > geo.t1 + 1e-6 || el.hidden) cursor.hidden = true;
      else { cursor.hidden = false; cursor.style.transform = "translateX(" + xOf(ui.t).toFixed(1) + "px)"; }
      var hv = ui.hover || {};
      if (hv.t == null || hv.t < geo.t0 || hv.t > geo.t1) hline.hidden = true;
      else { hline.hidden = false; hline.style.transform = "translateX(" + xOf(hv.t).toFixed(1) + "px)"; }
      var rg = drag && drag.kind === "range" && drag.cur ? drag.cur : (ui.loop === "range" ? ui.range : null);
      if (rg && rg.t1 > rg.t0) {
        var a = Math.max(geo.x0, xOf(rg.t0)), z = Math.min(geo.x1, xOf(rg.t1));
        band.hidden = !(z > a);
        band.style.transform = "translateX(" + a.toFixed(1) + "px)";
        band.style.width = Math.max(0, z - a).toFixed(1) + "px";
      } else band.hidden = true;
    }

    function readText(state, t) {
      var r = prof(state), d = der(state);
      var pid = focusPath(state, r);
      if (!pid || !d || typeof d.at !== "function") return null;
      var a = d.at(pid, t, refOf(state));
      if (!a) return null;
      var u = PS.units, site = (r && r.site) || {}, msl = site.datum === "MSL";
      var z = u.v((a.z || 0) + (msl ? site.elev || 0 : 0), msl ? "MSL" : "AGL");
      var vals = mode === "speed" ? [u.spd(a.spd || 0), u.h(a.r)] : mode === "alt" ? [z, u.h(a.r)] : [u.h(a.r), z];
      // two facts per line, two spaces between them (type rule 8)
      return { pid: pid, time: u.t(t), lines: [pid + "  " + u.t(t), vals.join("  ")], vals: vals };
    }

    function flushHover() {
      raf = null;
      var ev = pendingEv;
      pendingEv = null;
      if (!ev) return;
      var state = store.get(), t = round1(tAt(ev.cx));
      var rt = readText(state, t);
      read.innerHTML = rt ? '<span class="t-mono-id">' + PS.util.esc(rt.pid) + "</span>  " + PS.util.esc([rt.time].concat(rt.vals).join("  ")) : "";
      var h = { type: "hover.set", kind: rt ? "path" : null, id: rt ? rt.pid : null, i: null, cx: ev.cx, cy: ev.cy, text: rt ? rt.lines : null, t: t };
      var key = [h.kind, h.id, h.t].join("|");
      if (key === hoverKey) return;
      hoverKey = key;
      store.dispatch(h);
    }
    function queueHover(e) {
      pendingEv = { cx: e.clientX, cy: e.clientY };
      var w = doc.defaultView;
      if (raf == null) {
        if (w && w.requestAnimationFrame) raf = w.requestAnimationFrame(flushHover);
        else flushHover();
      }
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      var tg = e.target && e.target.closest ? e.target.closest("[data-k]") : null;
      var k = tg ? tg.getAttribute("data-k") : null;
      if (k === "system" && tg.getAttribute("data-role") === "range") k = "rangeline";
      else if (k === "see") k = "firstsee";
      if (k === "rangeline" && mode === "range") {
        drag = { kind: "rline", id: tg.getAttribute("data-id"), began: false };
      } else if (e.shiftKey) {
        drag = { kind: "range", a: tAt(e.clientX), cur: null };
      } else if (k === "firstsee") {
        drag = { kind: "click", target: tg, x0: e.clientX };
        return;
      } else {
        drag = { kind: "scrub" };
        tset(round1(tAt(e.clientX)));
      }
      if (plot.setPointerCapture && e.pointerId != null) { try { plot.setPointerCapture(e.pointerId); } catch (x) { /* optional */ } }
      e.preventDefault();
    }
    function onMove(e) {
      if (!drag || drag.kind === "click") { queueHover(e); return; }
      if (drag.kind === "scrub") { tset(round1(tAt(e.clientX))); queueHover(e); return; }
      if (drag.kind === "range") {
        var b = tAt(e.clientX);
        drag.cur = { t0: Math.min(drag.a, b), t1: Math.max(drag.a, b) };
        cursorPaint(store.get());
        return;
      }
      if (drag.kind === "rline") {
        var v = vAt(e.clientY);
        if (v == null || !(PS.tools && PS.tools.setRange)) return;
        if (!drag.began) { drag.began = true; store.begin("Range " + drag.id); }
        PS.tools.setRange(store, drag.id, Math.max(0, Math.round(v)));
      }
    }
    function onUp(e) {
      var dr = drag;
      drag = null;
      if (plot.releasePointerCapture && e.pointerId != null) { try { plot.releasePointerCapture(e.pointerId); } catch (x) { /* optional */ } }
      if (!dr) return;
      if (dr.kind === "rline" && dr.began) store.commit();
      else if (dr.kind === "range") {
        if (dr.cur && dr.cur.t1 - dr.cur.t0 >= 0.5) {
          var rg = { t0: round1(dr.cur.t0), t1: round1(dr.cur.t1) };
          if (PS.time && PS.time.loop) PS.time.loop("range", rg);
          else store.dispatch({ type: "time.loop", loop: "range", range: rg });
        }
        cursorPaint(store.get());
      } else if (dr.kind === "click" && Math.abs(e.clientX - dr.x0) < 3) {
        var tg = dr.target, pid = tg.getAttribute("data-path"), sid = tg.getAttribute("data-sys") || tg.getAttribute("data-id");
        var t = Number(tg.getAttribute("data-t"));
        var r = prof(store.get()), s = find(r && r.scene && r.scene.systems, sid);
        if (pid && isFinite(t) && PS.tools && PS.tools.addEventAt) PS.tools.addEventAt(store, pid, t, s && isEff(s.kind) ? "engage" : "detect", sid);
        else tset(round1(tAt(e.clientX)));
      }
    }
    function onCancel() {
      if (drag && drag.kind === "rline" && drag.began) store.cancel();
      drag = null;
    }
    function onLeave() {
      if (drag) return;
      pendingEv = null;
      hoverKey = null;
      read.textContent = "";
      store.dispatch({ type: "hover.clear" });
    }
    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      var tmax = geo.tmax, tp = tAt(e.clientX), span = geo.t1 - geo.t0;
      var ns = PS.util.clamp(span * Math.exp(e.deltaY * 0.0025), MIN_SPAN, tmax);
      if (ns >= tmax - 1e-6) { store.dispatch({ type: "time.view", tview: null }); return; }
      var f = (tp - geo.t0) / (span || 1);
      var t0 = PS.util.clamp(tp - f * ns, 0, tmax - ns);
      store.dispatch({ type: "time.view", tview: { t0: round1(t0), t1: round1(t0 + ns) } });
    }
    function onSeg(e) {
      var b = e.target.closest ? e.target.closest("button[data-mode]") : null;
      if (!b) return;
      mode = b.getAttribute("data-mode");
      render();
    }

    plot.addEventListener("pointerdown", onDown);
    plot.addEventListener("pointermove", onMove);
    plot.addEventListener("pointerup", onUp);
    plot.addEventListener("pointercancel", onCancel);
    plot.addEventListener("pointerleave", onLeave);
    plot.addEventListener("wheel", onWheel, { passive: false });
    segEl.addEventListener("click", onSeg);

    render();

    return {
      update: function (state, channel) {
        state = store.get();
        var ui = state.ui || {};
        if (channel === "time") {
          if (el.hidden) return;
          if (ui.tview !== last.tview) { render(); return; }
          last.t = ui.t;
          cursorPaint(state);
          return;
        }
        if (channel === "hover") { if (!el.hidden) cursorPaint(state); return; }
        render();
      },
      unmount: function () {
        plot.removeEventListener("pointerdown", onDown);
        plot.removeEventListener("pointermove", onMove);
        plot.removeEventListener("pointerup", onUp);
        plot.removeEventListener("pointercancel", onCancel);
        plot.removeEventListener("pointerleave", onLeave);
        plot.removeEventListener("wheel", onWheel);
        segEl.removeEventListener("click", onSeg);
        var w = doc.defaultView;
        if (raf != null && w && w.cancelAnimationFrame) w.cancelAnimationFrame(raf);
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("chart", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
