(function (PS) {
  "use strict";
  // Readout panel (contract 16, brief 6.7): the desktop table and the one-line phone strip, both in this element.

  var CHANNELS = ["profile", "derived", "cam", "time", "sel", "hover", "units", "baseline", "placing", "readout", "panels"];
  var MSG_MS = 4000;

  var CSS = [
    "#slot-readout{background:var(--panel);color:var(--t1)}",
    ".ro{padding:6px 10px 8px;min-height:120px;max-height:320px;overflow-y:auto}",
    ".ro-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
    ".ro-head h2{margin:0}",
    ".ro-vs{margin-left:auto}",
    ".ro-head .ro-pin{margin-left:auto}.ro-vs+.ro-pin{margin-left:0}",
    ".ro-t1{color:var(--t1);margin:0 0 2px;white-space:pre}",
    ".ro-tw>.ro-t1{display:block;overflow:hidden;text-overflow:ellipsis}.ro-tn{font-weight:var(--fw-med)}",
    ".ro-sub{margin:0 0 4px}",
    ".ro-r{display:flex;gap:8px;align-items:baseline;min-height:20px}",
    ".ro-k{flex:0 0 auto;min-width:9ch}",
    ".ro-v{flex:1 1 auto;text-align:right;white-space:pre;overflow:hidden;text-overflow:ellipsis;min-width:12ch;color:var(--t1)}",
    ".ro-r.ro-rw .ro-k{min-width:4ch}",
    ".ro-v.ro-wrap{white-space:normal;overflow:visible;text-overflow:clip}",
    ".ro-wrap>.ro-l{display:block}.ro-f{display:inline-block;white-space:nowrap}",
    ".ro-d{flex:0 0 9ch;text-align:right}",
    ".ro-d.ro-neg{color:var(--nominal)}.ro-d.ro-pos{color:var(--warn)}",
    ".ro-sec{margin:6px 0 2px}",
    ".ro-ink-friend{color:var(--friend)}.ro-ink-ew{color:var(--ew)}.ro-ink-control{color:var(--control)}",
    ".ro-ink-hostile{color:var(--hostile)}.ro-ink-unknown{color:var(--unknown)}",
    ".ro-w{white-space:normal}",
    ".ro-line{min-height:18px;margin-top:6px;padding-top:4px;border-top:1px solid var(--rule)}",
    ".ro-line.ro-lwarn{color:var(--warn)}",
    ".ro-drag{color:var(--accent)}",
    ".ro-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".ro-strip{display:flex;gap:12px;align-items:center;padding:4px 16px;min-height:24px;overflow-x:auto;white-space:nowrap;",
    "background:var(--panel);border-bottom:1px solid var(--rule);scrollbar-width:none}",
    ".ro-strip .ro-lwarn{color:var(--warn)}",
    ".ro-strip .ro-k{min-width:0}"
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
  function derOf(r) {
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
  function esc(s) { return PS.util.esc(s); }
  function mmss(s) {
    var a = Math.round(Math.abs(s));
    return Math.floor(a / 60) + ":" + (a % 60 < 10 ? "0" : "") + (a % 60);
  }
  function signed(s) { return (s < 0 && Math.round(Math.abs(s)) > 0 ? "-" : "+") + mmss(s); }
  function sysName(k) {
    var l = (PS.catalog && PS.catalog.SYS_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }
  function volName(k) {
    var l = (PS.catalog && PS.catalog.VOL_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }
  function isEff(kind) { return !!(PS.catalog && PS.catalog.EFFECTOR_KINDS.indexOf(kind) >= 0); }
  function isSensor(kind) { return !!(PS.catalog && PS.catalog.SENSOR_KINDS.indexOf(kind) >= 0); }
  function inkOfSys(s) { return s && isEff(s.kind) ? (s.kind === "ew" ? "ro-ink-ew" : "ro-ink-control") : "ro-ink-friend"; }
  function areaText(m2) {
    var u = PS.units, f = u.mode === "si" ? 1e6 : u.NM * u.NM;
    return PS.fmt.n(m2 / f, 2) + (u.mode === "si" ? " km²" : " nm²");
  }
  function polyArea(pts) {
    if (PS.geo && PS.geo.polygonArea) return PS.geo.polygonArea(pts);
    var a = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }
  function pathLen(tm) {
    if (!tm || tm.length < 2) return 0;
    if (PS.geo && PS.geo.pathLength) return PS.geo.pathLength(tm);
    var L = 0;
    for (var i = 1; i < tm.length; i++) L += Math.hypot(tm[i].x - tm[i - 1].x, tm[i].y - tm[i - 1].y, (tm[i].z || 0) - (tm[i - 1].z || 0));
    return L;
  }
  function vDisp(r, z) {
    var site = (r && r.site) || {}, msl = site.datum === "MSL";
    return PS.units.v((z || 0) + (msl ? site.elev || 0 : 0), msl ? "MSL" : "AGL");
  }
  function hhmm(d) { return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes(); }
  function delta(cur, base) {
    if (base == null || cur == null) return null;
    var dlt = cur - base;
    if (Math.abs(dlt) < 0.05) return { text: "(0:00)", cls: "" };
    var txt = Math.abs(dlt) < 60 ? (dlt < 0 ? "-" : "+") + Math.abs(dlt).toFixed(1) + " s" : signed(dlt);
    return { text: "(" + txt + ")", cls: dlt < 0 ? "ro-neg" : "ro-pos" };
  }
  function deltaInv(cur, base) {
    // for margin: a larger margin is better, so the colour flips
    var d = delta(cur, base);
    if (d && d.cls) d.cls = d.cls === "ro-neg" ? "ro-pos" : "ro-neg";
    return d;
  }

  // ---------------------------------------------------------------- line model
  function Lines() { this.l = []; this.title = null; this.sub = null; }
  Lines.prototype.row = function (k, v, opts) { this.l.push({ k: k, v: v, o: opts || {} }); };
  Lines.prototype.sec = function (t) { this.l.push({ sec: t }); };
  Lines.prototype.warn = function (t) { this.l.push({ w: t }); };

  function firstWindowAt(d, sid, pid, t) {
    var w = d && d.windows && d.windows[sid] ? d.windows[sid][pid] : null;
    if (!w || t == null) return null;
    for (var i = 0; i < w.length; i++) if (t >= w[i].tIn && t <= w[i].tOut) return w[i];
    return null;
  }

  function pathLines(L, ctx, pid, iWp) {
    var r = ctx.r, d = ctx.d, u = PS.units, t = ctx.t, sc = r.scene || {};
    var p = find(sc.paths, pid);
    if (!p) return false;
    var ac = find(sc.aircraft, p.aircraft), arch = ac && PS.catalog ? PS.catalog.arch(ac.arch) : null;
    L.title = p.id + (p.group ? "  " + p.group : "") + "  " + (arch ? arch.name : "");
    L.titleId = p.id;
    L.titleGrp = p.group || null;
    L.titleName = arch ? arch.name : "";
    var tm = d && d.timed ? d.timed[pid] : null;
    if (iWp != null && p.pts && p.pts[iWp]) {
      var pt = p.pts[iWp], tw = tm ? tm[iWp] : null;
      L.sec("waypoint " + (iWp + 1));
      L.row("X Y", u.h(pt.x) + "  " + u.h(pt.y));
      L.row("Height", vDisp(r, pt.z));
      if (tw) L.row("Arrive", u.t(tw.t0) + (pt.hold ? "  hold " + Math.round(pt.hold) + " s" : ""));
    }
    if (tm && tm.length) {
      L.row("Length", u.h(pathLen(tm)));
      if (d.speeds && d.speeds[pid] != null) L.row("Speed", u.spdDual(d.speeds[pid]));
      L.row("Run", u.t(tm[tm.length - 1].t1));
    }
    if ((p.pts || []).length < 2) L.warn(p.id + " needs two waypoints.");
    if (t != null && d && typeof d.at === "function") {
      var a = d.at(pid, t, ctx.ref);
      if (a) {
        L.sec("at " + u.t(t));
        L.row("Range", u.hDual(a.r));
        L.row("BRG", u.brg(a.brg));
        L.row("HDG", a.hdg == null ? "hold" : u.brg(a.hdg));
        L.row("Height", vDisp(r, a.z));
        L.row("Closing", u.spd(a.vc));
        L.row("To asset", a.tta == null ? "no entry" : a.tta === 0 ? "inside" : mmss(a.tta));
        var cov = a.covering || (typeof d.coveringAt === "function" ? d.coveringAt(pid, t) : []);
        L.row("Held by", cov.length ? cov.join(" ") : "none", { inkList: cov });
        cov.forEach(function (sid) {
          var w = firstWindowAt(d, sid, pid, t);
          if (w) L.row("Dwell", mmss(t - w.tIn), { id: sid, idInk: "ro-ink-friend" });
        });
      }
      var fl = d.flown && d.flown[pid];
      if (fl && fl.timed && fl.timed.length && tm && PS.geo && PS.geo.posAt) {
        var fp = PS.geo.posAt(fl.timed, t), pp = PS.geo.posAt(tm, t);
        var tAt = PS.geo.tAtPoint ? PS.geo.tAtPoint(tm, fp.x, fp.y) : t;
        var lag = t - tAt;
        // two-line form so the row does not cut off at the 320 px column; the key already says "flown"
        var flf = [mmss(lag) + (lag >= 0 ? " late," : " early,"), PS.fmt.n(Math.hypot(fp.x - pp.x, fp.y - pp.y), 0) + " m vs planned"];
        L.row("Flown", flf.join(" "), { fields: flf });
      }
    }
    var first = d && d.first ? d.first[pid] : null;
    if (first) {
      L.sec("first see");
      (sc.systems || []).forEach(function (s) {
        var f = first[s.id];
        if (f === undefined) return;
        var b = ctx.base && ctx.base.first && ctx.base.first[pid] ? ctx.base.first[pid][s.id] : undefined;
        L.row(s.id, f ? u.t(f.t) : "none", { kid: true, ink: inkOfSys(s), d: f && b ? delta(f.t, b.t) : null });
      });
    }
    var win = d && d.window ? d.window[pid] : null;
    if (win) {
      var bw = ctx.base && ctx.base.window ? ctx.base.window[pid] : null;
      L.sec("window");
      L.row("Planned", win.planned == null ? "--" : Math.round(win.planned) + " s");
      L.row("Geometry", win.geometric == null ? "--" : Math.round(win.geometric) + " s",
        { d: bw && win.geometric != null && bw.geometric != null ? deltaInv(win.geometric, bw.geometric) : null });
      L.row("Latest", win.latest == null ? "--" : u.t(win.latest));
      L.row("Margin", win.margin == null ? "--" : signed(win.margin),
        { warn: win.margin != null && win.margin < 0, d: bw && win.margin != null && bw.margin != null ? deltaInv(win.margin, bw.margin) : null });
    }
    var vols = d && d.vols ? d.vols : null;
    if (vols) {
      var any = false;
      (sc.volumes || []).forEach(function (v) {
        var en = vols[v.id] && vols[v.id][pid];
        if (!en || !en.length) return;
        if (!any) { L.sec("time in volumes"); any = true; }
        var sum = en.reduce(function (s, e) { return s + (e.tOut - e.tIn); }, 0);
        L.row(v.id, mmss(sum) + " from " + u.t(en[0].tIn), { kid: true });
      });
    }
    ((d && d.warnings) || []).forEach(function (w) {
      var ev = w.eventId ? find(r.events, w.eventId) : null;
      if ((ev && ev.path === pid) || (w.kind === "path" && w.id === pid)) L.warn(w.text);
    });
    return true;
  }

  function systemLines(L, ctx, sid) {
    var r = ctx.r, d = ctx.d, u = PS.units, t = ctx.t, sc = r.scene || {};
    var s = find(sc.systems, sid);
    if (!s) return false;
    L.title = s.id + "  " + sysName(s.kind);
    L.row("Range", s.range > 0 ? u.hDual(s.range) : "no reach");
    if (s.rmin) L.row("Min range", u.h(s.rmin));
    if ((s.elMin != null && s.elMin > -90) || (s.elMax != null && s.elMax < 90)) L.row("Elevation", s.elMin + "° to " + s.elMax + "°");
    L.row("FOV", s.fov >= 360 ? "360°" : s.fov + "° at " + u.brg(s.bearing || 0));
    L.row("Height", vDisp(r, s.z));
    L.row("Status", s.status || "active", { warn: s.status === "inactive" || s.status === "degraded" });
    if (s.range <= 0 && (isSensor(s.kind) || isEff(s.kind))) L.warn(s.id + " has no reach. Drag its ring out.");
    var paths = sc.paths || [];
    if (paths.length && d && d.first) {
      L.sec("first see");
      paths.forEach(function (p) {
        var f = d.first[p.id] ? d.first[p.id][sid] : null;
        var b = ctx.base && ctx.base.first && ctx.base.first[p.id] ? ctx.base.first[p.id][sid] : undefined;
        L.row(p.id, f ? u.t(f.t) + "  " + u.h(f.r) : "none", { kid: true, d: f && b ? delta(f.t, b.t) : null });
      });
      L.sec("last see");
      paths.forEach(function (p) {
        var ls = d.last && d.last[p.id] ? d.last[p.id][sid] : null;
        L.row(p.id, ls ? u.t(ls.t) : "none", { kid: true });
      });
    }
    if (t != null && d && typeof d.holdsAt === "function") {
      var n = d.holdsAt(sid, t).length;
      L.row("At " + u.t(t), "holds " + n + (n === 1 ? " track" : " tracks"));
    }
    return true;
  }

  function volumeLines(L, ctx, vid, iV) {
    var r = ctx.r, d = ctx.d, u = PS.units, sc = r.scene || {};
    var v = find(sc.volumes, vid);
    if (!v) return false;
    L.title = v.id + "  " + volName(v.kind) + (v.label ? "  " + v.label : "");
    if (iV != null && v.pts && v.pts[iV]) L.row("Vertex " + (iV + 1), u.h(v.pts[iV][0]) + "  " + u.h(v.pts[iV][1]));
    L.row("Area", areaText(polyArea(v.pts || [])));
    L.row("Height", u.v(v.zmin || 0) + " to " + (v.zmax ? u.v(v.zmax) : "no top"));
    var en = d && d.vols ? d.vols[vid] : null;
    if (en) {
      L.sec("entries");
      (sc.paths || []).forEach(function (p) {
        (en[p.id] || []).forEach(function (e) { L.row(p.id, u.t(e.tIn) + " for " + mmss(e.tOut - e.tIn), { kid: true }); });
      });
    }
    return true;
  }

  function groupLines(L, ctx, g) {
    var r = ctx.r, d = ctx.d, u = PS.units, t = ctx.t, sc = r.scene || {};
    var mem = (sc.paths || []).filter(function (p) { return p.group === g; });
    L.title = "Group " + g;
    L.row("Members", mem.length + "  " + mem.map(function (p) { return p.id; }).join(" "));
    if (t != null && d && typeof d.at === "function" && mem.length > 1) {
      var pts = [];
      mem.forEach(function (p) { var a = d.at(p.id, t, ctx.ref); if (a) pts.push([a.x, a.y]); });
      if (pts.length > 1 && PS.geo && PS.geo.spread) L.row("Spread", u.h(PS.geo.spread(pts)));
      if (typeof d.envelopesAt === "function") {
        var ids = mem.map(function (p) { return p.id; });
        var n = d.envelopesAt(t).filter(function (e) { return (e.members || []).some(function (m) { return ids.indexOf(m) >= 0; }); }).length;
        L.row("Clusters", String(n));
      }
    }
    (d && d.splits || []).forEach(function (s) {
      L.row(s.to > s.from ? "Split" : "Merge", (s.to > s.from ? "S " : "M ") + s.to + " at " + u.t(s.t));
    });
    if (d && d.dLink) L.row("Envelope link", d.dLink.value == null ? "--" : u.h(d.dLink.value) + (d.dLink.auto ? " auto" : ""));
    return true;
  }

  function eventLines(L, ctx, eid) {
    var r = ctx.r, d = ctx.d, u = PS.units;
    var ev = find(r.events, eid);
    if (!ev) return false;
    var name = (PS.catalog && PS.catalog.EV_NAMES[ev.type]) || ev.type;
    L.title = ev.id + "  " + name + "  " + (ev.path || "");
    L.row("Time", u.t(ev.t));
    if (ev.system) L.row("System", ev.system);
    if (d && typeof d.at === "function" && ev.path) {
      var a = d.at(ev.path, ev.t, ctx.ref);
      if (a) {
        L.row("Position", u.h(a.x) + "  " + u.h(a.y));
        L.row("Range", u.h(a.r));
        L.row("Height", vDisp(r, a.z));
      }
    }
    var cr = d && d.crossings ? d.crossings[ev.path] : null;
    if (cr && cr.length) {
      var best = null;
      cr.forEach(function (c) { if (c.kind === "in" && (!best || Math.abs(c.t - ev.t) < Math.abs(best.t - ev.t))) best = c; });
      if (best) L.row("First see", u.t(best.t), { id: best.system, idInk: inkOfSys(find((r.scene && r.scene.systems) || [], best.system)) });
    }
    ((d && d.warnings) || []).forEach(function (w) { if (w.eventId === eid) L.warn(w.text); });
    return true;
  }

  function nothingLines(L, ctx) {
    var r = ctx.r, d = ctx.d, u = PS.units, t = ctx.t, sc = r.scene || {};
    L.title = r.id + "  v" + (r.v == null ? 1 : r.v);
    L.sub = r.name || "";
    var paths = sc.paths || [];
    if (t == null) {
      L.row("Run", d ? u.t(d.tmax) : "--");
      L.row("Paths", String(paths.length));
      L.row("Events", String((r.events || []).length));
      if (d && typeof d.envelopesAt === "function" && (r.snapshots || []).length) {
        L.row("Envelopes", r.snapshots.map(function (s) { return d.envelopesAt(s).length + " at " + u.t(s); }).join("  "));
      }
      return;
    }
    L.sec("at " + u.t(t));
    paths.forEach(function (p) {
      var a = d && typeof d.at === "function" ? d.at(p.id, t, ctx.ref) : null;
      if (!a) { L.row(p.id, "--", { kid: true }); return; }
      var cov = a.covering || [];
      var f = [u.h(a.r), u.v(a.z), u.spd(a.spd), (a.vc >= 0 ? "+" : "") + u.spd(a.vc)];
      // two lines: range, height, speed and closing; then the covering sensor ids
      L.row(p.id, f.join(" "), { kid: true, inkList: cov, after: cov, fields: f });
    });
    if (d && typeof d.envelopesAt === "function") {
      var n = d.envelopesAt(t).length;
      if (n) L.row("Envelopes", n === 1 ? "1 envelope" : n + " envelopes");
    }
    var next = null;
    (r.events || []).forEach(function (e) { if (e.t > t + 0.05 && (!next || e.t < next.t)) next = e; });
    if (next) L.row("Next", "next " + ((PS.catalog && PS.catalog.EV_TYPES[next.type]) || "") + " in " + mmss(next.t - t));
  }

  function build(state, msg) {
    var ui = state.ui || {}, r = prof(state);
    var L = new Lines();
    if (!r) { L.title = "No profile"; return L; }
    var d = derOf(r);
    var dragging = !!(ui.ghost && ui.ghost.before);
    var baseRec = dragging ? ui.ghost.before : ui.baseline && ui.baseline.record;
    var ctx = { r: r, d: d, t: ui.t, ref: refOf(state), base: baseRec && baseRec !== r ? derOf(baseRec) : null };
    var sel = ui.sel || {}, hov = ui.hover || {};
    var tgt = sel.kind ? sel : hov.kind ? hov : null;
    var ok = false;
    if (tgt) {
      if (tgt.kind === "path") ok = pathLines(L, ctx, tgt.id, tgt.i);
      else if (tgt.kind === "system") ok = systemLines(L, ctx, tgt.id);
      else if (tgt.kind === "volume") ok = volumeLines(L, ctx, tgt.id, tgt.i);
      else if (tgt.kind === "group") ok = groupLines(L, ctx, tgt.id);
      else if (tgt.kind === "event") ok = eventLines(L, ctx, tgt.id);
      else if (tgt.kind === "plane") {
        var pl = find(r.scene && r.scene.planes, tgt.id);
        if (pl) { L.title = pl.id + "  " + (pl.label || "Height plane"); L.row("Height", vDisp(r, pl.z)); ok = true; }
      } else if (tgt.kind === "card") {
        var c = find(r.cards, tgt.id);
        if (c) { L.title = c.name || c.id; L.row("Time", PS.units.t(c.t)); L.row("Camera", (c.cam && c.cam.proj) || "plan"); ok = true; }
      }
    }
    if (!ok) nothingLines(L, ctx);
    if (dragging && ui.ghost.label) L.drag = ui.ghost.label;
    else if (dragging && msg && msg.text) L.drag = msg.text;
    var sc = r.scene || {};
    L.empty = !(sc.paths || []).length && !(sc.systems || []).length && !(sc.aircraft || []).length;
    return L;
  }

  // a key that is an id is mono with its ink; a key word is sans
  function keyHtml(x) {
    return '<span class="ro-k ' + (x.o.kid ? "t-mono-id" : "t-sub") + (x.o.ink ? " " + x.o.ink : "") + '">' + esc(x.k) + "</span>";
  }
  // the title: the id in mono, the name in medium sans
  function titleHtml(L) {
    if (L.titleId == null) return '<span class="ro-t1 t-data-lg">' + esc(L.title || "") + "</span>";
    return '<span class="ro-t1"><span class="t-mono-id">' + esc(L.titleId) + "</span>" +
      (L.titleGrp ? '  <span class="t-mono-id t-sec">' + esc(L.titleGrp) + "</span>" : "") +
      (L.titleName ? '  <span class="t-body ro-tn">' + esc(L.titleName) + "</span>" : "") + "</span>";
  }

  function rowHtml(x) {
    if (x.sec) return '<div class="ro-sec t-label">' + esc(x.sec) + "</div>";
    if (x.w) return '<div class="ro-r"><span class="ro-w t-sub t-warn">⚠ ' + esc(x.w) + "</span></div>";
    var v = esc(x.v);
    if (x.o.fields) {
      v = '<span class="ro-l">' + x.o.fields.map(function (f) { return '<span class="ro-f">' + esc(f) + "</span>"; }).join(" ") + "</span>" +
        (x.o.after && x.o.after.length ? '<span class="ro-l">' + x.o.after.map(function (id) { return '<span class="t-mono-id ro-ink-friend">' + esc(id) + "</span>"; }).join(" ") + "</span>" : "");
      return '<div class="ro-r ro-rw">' + keyHtml(x) + '<span class="ro-v t-data ro-wrap">' + v + "</span></div>";
    }
    if (x.o.inkList && x.o.inkList.length && !x.o.after) {
      v = x.o.inkList.map(function (id) { return '<span class="t-mono-id ro-ink-friend">' + esc(id) + "</span>"; }).join(" ");
    } else if (x.o.after && x.o.after.length) {
      v += " " + x.o.after.map(function (id) { return '<span class="t-mono-id ro-ink-friend">' + esc(id) + "</span>"; }).join(" ");
    }
    if (x.o.id) v = '<span class="t-mono-id ' + (x.o.idInk || "") + '">' + esc(x.o.id) + "</span>  " + v;
    var k = keyHtml(x);
    var dd = x.o.d ? '<span class="ro-d t-data t-sec ' + x.o.d.cls + '">' + esc(x.o.d.text) + "</span>" : "";
    return '<div class="ro-r">' + k + '<span class="ro-v t-data' + (x.o.warn ? " warn" : "") + '">' + v + "</span>" + dd + "</div>";
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "readout", CSS);
    var msg = null, msgAt = 0, live = "";
    var dragAt = 0, wasGhost = !!(store.get().ui && store.get().ui.ghost);
    (function initMsg() {
      var s = store.get();
      if (s && s.ui && s.ui.readout && s.ui.readout.text) { msg = s.ui.readout; msgAt = Date.now(); }
    })();

    // a message lives MSG_MS; during a drag it stays only when it arrived after the drag began
    function liveMsg(state) {
      if (!msg || !msg.text) return null;
      if (Date.now() - msgAt < MSG_MS) return msg;
      if (state.ui && state.ui.ghost && msgAt >= dragAt) return msg;
      return null;
    }

    function trackDrag(state) {
      var g = !!(state && state.ui && state.ui.ghost);
      if (g && !wasGhost) dragAt = Date.now();
      wasGhost = g;
    }

    function lineText(state, L) {
      var m = liveMsg(state);
      if (m) return m;
      if (L.empty) return { text: "Press A to add. Drag anything to move it.", level: "info" };
      for (var i = 0; i < L.l.length; i++) if (L.l[i].w) return { text: L.l[i].w, level: "warn" };
      return null;
    }

    function render() {
      var state = store.get(), ui = state.ui || {};
      var L = build(state, liveMsg(state));
      var line = lineText(state, L);
      var sel = ui.sel || {};
      var liveText = sel.kind ? "Selected " + (sel.kind === "path" && sel.i != null ? sel.id + " waypoint " + (sel.i + 1) : sel.id) + "." : "No selection.";
      if (ui.phone) {
        var parts = [];
        if (L.drag) parts.push('<span class="ro-drag">' + esc(L.drag) + "</span>");
        parts.push(titleHtml(L));
        var n = 0;
        L.l.forEach(function (x) {
          if (x.sec || x.w || n >= 6) return;
          n++;
          parts.push("<span>" + (x.k && x.k !== x.v ? keyHtml(x) + " " : "") + esc(x.v) +
            (x.o.d ? " " + esc(x.o.d.text) : "") + "</span>");
        });
        if (line) parts.push('<span class="' + (line.level === "warn" ? "ro-lwarn t-sub" : "hint") + '">' + esc(line.text) + "</span>");
        el.innerHTML = '<div class="ro-strip t-data" id="ro-strip" role="status">' + parts.join("") + "</div>" +
          '<div class="ro-vh" aria-live="polite" id="ro-live">' + esc(liveText) + "</div>";
        live = liveText;
        return;
      }
      var pinned = !!ui.baseline;
      var h = '<div class="ro"><div class="ro-head"><h2 class="t-label t-strong">Readout</h2>' +
        (pinned ? '<span class="ro-vs t-micro" id="ro-vs">vs pinned ' + esc(ui.baseline.label || "") + "</span>" : "") +
        PS.util.S("button", { type: "button", "class": "mini ro-pin", id: "ro-pin", "aria-pressed": pinned ? "true" : "false",
          title: pinned ? "Clear the baseline" : "Pin the baseline" }, pinned ? "Clear" : "Pin") + "</div>";
      if (L.drag) h += '<div class="ro-t1 t-data-lg ro-drag">' + esc(L.drag) + "</div>";
      else if (L.title) h += '<div class="ro-tw">' + titleHtml(L) + "</div>";
      if (L.sub) h += '<div class="ro-sub t-sub">' + esc(L.sub) + "</div>";
      L.l.forEach(function (x) { if (!x.w) h += rowHtml(x); });
      h += '<div class="ro-line t-sub' + (line && line.level === "warn" ? " ro-lwarn" : "") + '" id="ro-line">' + (line ? esc(line.text) : "") + "</div>";
      h += '<div class="ro-vh" aria-live="polite" id="ro-live">' + esc(liveText) + "</div></div>";
      var focused = doc.activeElement && doc.activeElement.id === "ro-pin";
      el.innerHTML = h;
      if (focused) { var b = doc.getElementById("ro-pin"); if (b) b.focus(); }
      live = liveText;
    }

    function onClick(e) {
      var b = e.target.closest ? e.target.closest("#ro-pin") : null;
      if (!b) return;
      var ui = store.get().ui || {};
      if (ui.baseline) {
        store.dispatch({ type: "baseline.clear" });
      } else {
        store.dispatch({ type: "baseline.pin", label: hhmm(new Date()) });
        if (PS.bus && PS.bus.emit) PS.bus.emit("toast", { text: "Baseline pinned." });
      }
    }

    var raf = null;
    function schedule() {
      var w = doc.defaultView;
      if (raf != null) return;
      if (w && w.requestAnimationFrame) raf = w.requestAnimationFrame(function () { raf = null; render(); });
      else render();
    }

    el.addEventListener("click", onClick);
    render();

    return {
      update: function (state, channel, payload) {
        trackDrag(state);
        if (channel === "readout") {
          msg = payload && payload.text ? payload : null;
          msgAt = Date.now();
          render();
          return;
        }
        if (channel === "time" || channel === "hover") { schedule(); return; }
        render();
      },
      unmount: function () {
        el.removeEventListener("click", onClick);
        var w = doc.defaultView;
        if (raf != null && w && w.cancelAnimationFrame) w.cancelAnimationFrame(raf);
        raf = null;
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("readout", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
