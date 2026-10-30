(function (PS) {
  "use strict";
  // Tip panel (contract 16.4, brief 6.8): a tooltip from ui.hover after 400 ms of a stable hover.

  var DELAY = 400;
  var CHANNELS = ["hover", "sel", "time", "units"];
  var CSS = [
    "#slot-tip{position:fixed;left:0;top:0;width:0;height:0;z-index:70;pointer-events:none}",
    ".tip-box{position:fixed;left:0;top:0;max-width:300px;padding:6px 8px;border-radius:4px;",
    "background:var(--raised);color:var(--t1);border:1px solid var(--rule);box-shadow:var(--elev);",
    "pointer-events:none}",
    ".tip-box[hidden]{display:none}",
    ".tip-h{font-weight:var(--fw-med);color:var(--t1)}",
    ".tip-l{color:var(--t2);white-space:nowrap}",
    ".tip-l.tip-warn{color:var(--warn);white-space:normal}"
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
  function find(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function kindName(k) {
    var l = (PS.catalog && PS.catalog.SYS_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }
  function volName(k) {
    var l = (PS.catalog && PS.catalog.VOL_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }
  function evName(type) {
    return (PS.catalog && PS.catalog.EV_NAMES && PS.catalog.EV_NAMES[type]) || type;
  }
  function mmss(s) {
    var a = Math.round(Math.abs(s));
    return Math.floor(a / 60) + ":" + (a % 60 < 10 ? "0" : "") + (a % 60);
  }
  function areaText(m2) {
    var u = PS.units, f = u.mode === "si" ? 1e6 : u.NM * u.NM;
    return PS.fmt.n(m2 / f, 2) + (u.mode === "si" ? " km²" : " nm²");
  }
  function polyArea(pts) {
    if (PS.geo && PS.geo.polygonArea) return PS.geo.polygonArea(pts);
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }
  function vDisp(r, z) {
    var site = (r && r.site) || {};
    var msl = site.datum === "MSL";
    return PS.units.v(z + (msl ? site.elev || 0 : 0), msl ? "MSL" : "AGL");
  }

  // the path nearest the system at t (t null reads 0)
  function nearestPath(r, d, sys, t) {
    var best = null, bd = Infinity;
    ((r.scene && r.scene.paths) || []).forEach(function (p) {
      if (!d || typeof d.at !== "function") return;
      var a = d.at(p.id, t == null ? 0 : t, sys.id);
      if (a && isFinite(a.r) && a.r < bd) { bd = a.r; best = p.id; }
    });
    if (!best && r.scene && r.scene.paths && r.scene.paths.length) best = r.scene.paths[0].id;
    return best;
  }

  function content(state, h) {
    if (h.text != null) {
      var rows = Array.isArray(h.text) ? h.text : String(h.text).split("\n");
      // h.text lines are data (the chart readout): mono, one fact pair per line
      return { head: null, rows: rows.map(function (x) { return { text: x, data: true }; }) };
    }
    var r = prof(state), d = der(state);
    if (!r) return null;
    var sc = r.scene || {}, u = PS.units, t = state.ui ? state.ui.t : null, ref = refOf(state);
    var out = { head: null, rows: [] };
    // parts alternate a key word (ui) and a value (mono); a string is one line of prose
    function row(x, warn) { out.rows.push({ parts: Array.isArray(x) ? x : null, text: Array.isArray(x) ? null : x, warn: !!warn }); }
    var kind = h.kind;
    if (kind === "path" && h.i != null) kind = "wp";
    if (kind === "system") {
      var s = find(sc.systems, h.id);
      if (!s) return null;
      out.head = { id: s.id, name: kindName(s.kind) };
      row(s.range > 0 ? ["Range", u.h(s.range)] : "No reach");
      var pid = nearestPath(r, d, s, t);
      if (pid) {
        var f = d && d.first && d.first[pid] ? d.first[pid][s.id] : null;
        row(f ? ["First see", pid, "at", u.t(f.t)] : ["No first see on", pid]);
      }
    } else if (kind === "path") {
      var p = find(sc.paths, h.id);
      if (!p) return null;
      var ac = find(sc.aircraft, p.aircraft);
      var arch = ac && PS.catalog ? PS.catalog.arch(ac.arch) : null;
      out.head = { id: p.id, name: arch ? arch.name : "Path" };
      var spd = d && d.speeds ? d.speeds[p.id] : null;
      if (spd != null) row(["Speed", u.spd(spd)]);
      var tm = d && d.timed ? d.timed[p.id] : null;
      if (tm && tm.length) row(["Run", u.t(tm[tm.length - 1].t1)]);
      if (t != null && d && typeof d.at === "function") {
        var a = d.at(p.id, t, ref);
        if (a) row(["Range", u.h(a.r), "at", u.t(t)]);
      }
    } else if (kind === "wp") {
      var pp = find(sc.paths, h.id);
      if (!pp || !pp.pts || !pp.pts[h.i]) return null;
      var pt = pp.pts[h.i];
      out.head = { id: pp.id, name: "waypoint " + (h.i + 1) };
      row(["x", u.h(pt.x), "y", u.h(pt.y), "z", vDisp(r, pt.z || 0)]);
      var tw = d && d.timed && d.timed[pp.id] ? d.timed[pp.id][h.i] : null;
      if (tw) row(["Arrive", u.t(tw.t0)].concat(tw.t1 > tw.t0 ? ["hold", Math.round(tw.t1 - tw.t0) + " s"] : []));
    } else if (kind === "event") {
      var ev = find(r.events, h.id);
      if (!ev) return null;
      out.head = { id: ev.id, name: evName(ev.type) };
      row(["Time", u.t(ev.t)].concat(ev.path ? ["on", ev.path] : []));
      if (d && typeof d.at === "function" && ev.path) {
        var ae = d.at(ev.path, ev.t, ref);
        if (ae) row(["Range", u.h(ae.r)]);
      }
      (d && d.warnings || []).forEach(function (w) { if (w.eventId === ev.id) row(w.text, true); });
    } else if (kind === "volume") {
      var vo = find(sc.volumes, h.id);
      if (!vo) return null;
      out.head = { id: vo.id, name: volName(vo.kind) };
      row(["Area", areaText(polyArea(vo.pts || []))]);
      row(["Height", u.v(vo.zmin || 0)].concat(vo.zmax ? ["to", u.v(vo.zmax)] : ["and up"]));
    } else if (kind === "plane") {
      var pl = find(sc.planes, h.id);
      if (!pl) return null;
      out.head = { id: pl.id, name: pl.label || "Height plane" };
      row(["Height", vDisp(r, pl.z || 0)]);
    } else if (kind === "group" || kind === "envelope") {
      var members = (sc.paths || []).filter(function (x) { return x.group && x.group === h.id; });
      out.head = { id: h.id, name: kind === "group" ? "Group" : "Envelope", pre: true };
      row(members.length + (members.length === 1 ? " member" : " members"));
      if (d && typeof d.at === "function" && members.length > 1) {
        var tt = t == null ? 0 : t, pts = [];
        members.forEach(function (m) { var a = d.at(m.id, tt, ref); if (a) pts.push([a.x, a.y]); });
        if (pts.length > 1 && PS.geo && PS.geo.spread) row(["Spread", u.h(PS.geo.spread(pts)), "at", u.t(tt)]);
      }
    } else if (kind === "card") {
      var c = find(r.cards, h.id);
      if (!c) return null;
      out.head = { id: null, name: c.name || c.id };
      row(["Time", u.t(c.t)]);
    } else {
      return null;
    }
    return out;
  }

  function hoverKey(h) {
    return [h.kind, h.id, h.i, Array.isArray(h.text) ? h.text.join("\n") : h.text].join("|");
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "tip", CSS);
    el.innerHTML = '<div class="tip-box t-sub" role="tooltip" id="tip-box" hidden></div>';
    var box = el.firstChild;
    var timer = null, key = null, shown = false;

    function win() { return doc.defaultView || { innerWidth: 1280, innerHeight: 800 }; }

    function place(h) {
      var w = win(), bw = box.offsetWidth || 200, bh = box.offsetHeight || 40;
      var x = (h.cx || 0) + 12, y = (h.cy || 0) + 12;
      if (x + bw > w.innerWidth - 4) x = Math.max(4, (h.cx || 0) - 12 - bw);
      if (y + bh > w.innerHeight - 4) y = Math.max(4, (h.cy || 0) - 12 - bh);
      box.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    }

    function paint(state) {
      var h = state && state.ui ? state.ui.hover : null;
      var c = h ? content(state, h) : null;
      if (!c || (!c.head && !c.rows.length)) { hide(); return; }
      var html = "";
      var E = PS.util.esc;
      if (c.head) {
        var id = c.head.id != null ? '<span class="t-mono-id">' + E(c.head.id) + "</span>" : "";
        var nm = E(c.head.name || "");
        html += '<div class="tip-h">' + (c.head.pre ? nm + " " + id : id + (id && nm ? " " : "") + nm) + "</div>";
      }
      c.rows.forEach(function (r) {
        var inner = r.parts
          ? r.parts.map(function (p, i) { return '<span class="' + (i % 2 ? "t-data" : "t-sub") + '">' + E(p) + "</span>"; }).join(" ")
          : r.data ? '<span class="t-data">' + E(r.text) + "</span>" : E(r.text);
        html += '<div class="tip-l' + (r.warn ? " t-sub t-warn tip-warn" : "") + '">' + inner + "</div>";
      });
      box.innerHTML = html;
      box.hidden = false;
      shown = true;
      place(h);
    }

    function hide() {
      box.hidden = true;
      shown = false;
    }

    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

    function onHover(state) {
      var h = state && state.ui ? state.ui.hover : null;
      if (!h || h.kind == null) { clearTimer(); key = null; hide(); return; }
      var k = hoverKey(h);
      if (k !== key) {
        key = k;
        clearTimer();
        hide();
        timer = setTimeout(function () { timer = null; paint(store.get()); }, DELAY);
      } else if (shown) {
        place(h);
      }
    }

    return {
      update: function (state, channel) {
        state = store.get();
        if (channel === "hover") onHover(state);
        else if (shown) paint(state);
      },
      unmount: function () {
        clearTimer();
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("tip", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
