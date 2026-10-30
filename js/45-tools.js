(function (PS) {
  "use strict";

  // Board tools (contract 17): placement flows, handle drags, snapping, ruler, zoom and pan,
  // formation, groups, clipboard, cards. Every record change goes through the store.
  var util = PS.util;
  var DEG = 180 / Math.PI;
  var clipboard = null;   // { kind, obj, aircraft } private to this file; survives a profile switch

  // ---------------------------------------------------------------- helpers
  function rec(state) {
    if (PS.sel && typeof PS.sel.profile === "function") return PS.sel.profile(state);
    var lib = state.lib || [];
    for (var i = 0; i < lib.length; i++) if (lib[i].id === state.activeId) return lib[i];
    return lib[0] || null;
  }
  function der(record) {
    return record && PS.derive && typeof PS.derive.all === "function" ? PS.derive.all(record) : null;
  }
  function emit(ch, payload) { if (PS.bus && typeof PS.bus.emit === "function") PS.bus.emit(ch, payload); }
  function toast(text) { emit("toast", { text: text }); }
  function readout(store, text, level) { store.ui("readout", { text: text, level: level || "info" }); }
  function cat() { return PS.catalog || {}; }
  function byId(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function idxOf(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }
  function patch(store, label, fn) {
    store.patch(function (c) { var out = fn(c); return out && typeof out === "object" ? out : c; }, label);
  }
  function hyp(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function bearing(from, to) {
    if (PS.geo && typeof PS.geo.bearingTo === "function") return PS.geo.bearingTo(from, to);
    return ((90 - Math.atan2(to.y - from.y, to.x - from.x) * DEG) % 360 + 360) % 360;
  }
  function boundsOf(scene) {
    if (PS.geo && typeof PS.geo.bounds === "function") return PS.geo.bounds(scene);
    return { cx: 0, cy: 0, ext: 4400 };
  }
  function snapStepOf(ext) {
    if (PS.geo && typeof PS.geo.snapStep === "function") return PS.geo.snapStep(ext);
    var g = ext > 24000 ? 5000 : ext > 12000 ? 2000 : ext > 4000 ? 1000 : 500;
    return g / 5;
  }
  function originOf(d) { return (d && d.origin) || { x: 0, y: 0, z: 0 }; }
  function archOf(id) {
    var c = cat();
    return typeof c.arch === "function" ? c.arch(id) : { id: id, cruise: 12, alt: [100, 100], role: "" };
  }
  function cruiseHeight(arch) {
    var c = cat();
    if (typeof c.cruiseHeight === "function") return c.cruiseHeight(arch);
    return Math.round(((arch.alt || [100, 100])[0] + (arch.alt || [100, 100])[1]) / 2);
  }
  // a palette row id may carry a group prefix; reduce it to the table key
  function normKey(id, table) {
    if (!table || id in table) return id;
    var s = String(id).replace(/^[a-z]+[-:]/i, "");
    return s in table ? s : id;
  }
  function evTypeKey(id) { return normKey(id, cat().EV_TYPES); }
  function sysKindKey(id) { return normKey(id, cat().SYS_DEFAULTS); }
  function volKindKey(id) { return normKey(id, cat().VOL_DEFAULTS); }
  function sysDef(kind) {
    var d = cat().SYS_DEFAULTS && cat().SYS_DEFAULTS[kind];
    return d || { range: 0, fov: 360, prefix: String(kind).toUpperCase() + "-" };
  }
  function volDef(kind) {
    var d = cat().VOL_DEFAULTS && cat().VOL_DEFAULTS[kind];
    return d || { zmax: 0, prefix: String(kind).toUpperCase() };
  }
  function volLabel(kind) {
    var k = cat().VOL_KINDS || [];
    for (var i = 0; i < k.length; i++) if (k[i][0] === kind) return k[i][1];
    return kind;
  }
  function evName(type) {
    var n = cat().EV_NAMES;
    return (n && n[type]) || (type.charAt(0).toUpperCase() + type.slice(1));
  }
  function dedupe(pts) {
    var out = [];
    pts.forEach(function (p) {
      var q = out[out.length - 1];
      if (!q || hyp(p.x, p.y, q.x, q.y) >= 0.5) out.push(p);
    });
    return out;
  }
  function nearestOnSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    var f = L2 ? util.clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
    var x = ax + dx * f, y = ay + dy * f;
    return { x: x, y: y, f: f, d: hyp(px, py, x, y) };
  }
  function signed(v, d) { return (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(d == null ? 1 : d); }
  function signedClock(s) {
    var a = Math.round(Math.abs(s)), m = Math.floor(a / 60), ss = a % 60;
    return (s >= 0 ? "+" : "-") + m + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function isElev(world) { return world && world.x == null && world.r != null; }

  var tools = PS.tools = {};

  // ---------------------------------------------------------------- labels
  tools.dragLabel = function (role, obj, value) {
    var U = PS.units, id = obj && obj.id ? obj.id + " " : "";
    switch (role) {
      case "range": return id + U.hDual(value);
      case "hold": return "hold " + Math.round(value) + " s";
      case "arcEnd0": case "arcEnd1": case "fov": return id + "fov " + Math.round(value) + "°";
      case "arcMid": case "bearing": return id + "bearing " + U.brg(value);
      case "elRay0": case "elMin": return id + "elMin " + Math.round(value) + "°";
      case "elRay1": case "elMax": return id + "elMax " + Math.round(value) + "°";
      case "bead": return id + U.t(value);
      case "top": case "line": case "z": return id + vDual(value);
      default:
        if (typeof value === "number") return id + vDual(value);
        if (value && value.r != null) return id + U.h(value.r) + " " + U.brg(value.brg);
        return id + (value == null ? "" : String(value));
    }
  };
  function vDual(m) {
    var U = PS.units;
    return U.mode === "si" ? U.v(m, "AGL") + " (" + PS.fmt.n(m / U.FT, 0) + " ft)" : U.v(m, "AGL") + " (" + PS.fmt.n(m, 0) + " m)";
  }

  // leg text of the placement ghost: "1.40 nm, 93 s" from the last point to cur
  tools.legText = function (placing, cur) {
    if (!placing || placing.kind !== "aircraft" || !placing.pts || !placing.pts.length || !cur || cur.x == null) return "";
    var a = placing.pts[placing.pts.length - 1], arch = archOf(placing.arch);
    var z = cruiseHeight(arch), len = Math.hypot(cur.x - a.x, cur.y - a.y, z - a.z);
    var spd = arch.cruise || 1;
    return PS.units.h(len) + ", " + Math.round(len / spd) + " s";
  };

  // ---------------------------------------------------------------- snapping
  tools.snap = function (world, context) {
    context = context || {};
    var mods = context.modifiers || {};
    if (mods.alt || !world) return world;
    var cam = context.cam || {}, scale = cam.scale || 1;
    var scene = context.scene || { systems: [], volumes: [], planes: [] };
    var ex = context.exclude;

    if (isElev(world)) {
      var z = world.z, label = null, best = 6;
      var o = cam.origin || { x: 0, y: 0 };
      (scene.planes || []).forEach(function (pl) {
        if (pl.id === ex || typeof cam.project !== "function") return;
        var a = cam.project(o.x + world.r, o.y, world.z)[1], b = cam.project(o.x + world.r, o.y, pl.z)[1];
        if (Math.abs(a - b) <= best) { best = Math.abs(a - b); z = pl.z; label = "on " + pl.id; }
      });
      if (label == null) z = Math.round(z / 5) * 5;
      return { r: world.r, z: Math.max(0, z), label: label };
    }

    // 1. sensor ring, 8 px
    var hit = null, hd = 8;
    (scene.systems || []).forEach(function (s) {
      if (s.id === ex || !(s.range > 0)) return;
      var d = hyp(world.x, world.y, s.x, s.y);
      var px = Math.abs(d - s.range) * scale;
      if (d > 0 && px <= hd) {
        hd = px;
        hit = { x: s.x + (world.x - s.x) * s.range / d, y: s.y + (world.y - s.y) * s.range / d, label: "on " + s.id + " ring" };
      }
    });
    if (hit) return hit;
    // 2. volume vertex, then edge, 8 px
    hd = 8;
    (scene.volumes || []).forEach(function (v) {
      if (v.id === ex) return;
      (v.pts || []).forEach(function (q) {
        var px = hyp(world.x, world.y, q[0], q[1]) * scale;
        if (px <= hd) { hd = px; hit = { x: q[0], y: q[1], label: "on " + v.id + " vertex" }; }
      });
    });
    if (hit) return hit;
    hd = 8;
    (scene.volumes || []).forEach(function (v) {
      if (v.id === ex) return;
      var p = v.pts || [];
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length];
        var n = nearestOnSeg(world.x, world.y, a[0], a[1], b[0], b[1]);
        if (n.d * scale <= hd) { hd = n.d * scale; hit = { x: n.x, y: n.y, label: "on " + v.id + " edge" }; }
      }
    });
    if (hit) return hit;
    // angle with Shift: 15 degree steps from the previous waypoint
    if (mods.shift && context.from) {
      var f = context.from, dist = hyp(world.x, world.y, f.x, f.y);
      var ang = Math.round(bearing(f, world) / 15) * 15;
      return { x: f.x + dist * Math.sin(ang / DEG), y: f.y + dist * Math.cos(ang / DEG), label: PS.units.brg(ang) };
    }
    // grid
    var step = snapStepOf(context.ext || boundsOf(scene).ext);
    return { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step, label: null };
  };

  tools.snapBead = function (pathId, t, derived) {
    var cr = (derived && derived.crossings && derived.crossings[pathId]) || [];
    var best = null, bd = 3;
    cr.forEach(function (c) {
      var d = Math.abs(c.t - t);
      if (d <= bd) { bd = d; best = c; }
    });
    if (!best) return { t: t };
    return {
      t: best.t, system: best.system,
      label: best.system + (best.kind === "out" ? " last see, " : " first see, ") + "t+" + Math.round(best.t) + " s"
    };
  };

  // ---------------------------------------------------------------- placement
  tools.startPlacing = function (store, pick) {
    if (!pick) return false;
    var s = store.get(), r = rec(s), g = pick.group;
    var p = null;
    if (g === "aircraft") p = { kind: "aircraft", arch: pick.id, pts: [] };
    else if (g === "systems") p = { kind: "system", sysKind: sysKindKey(pick.id), pts: [] };
    else if (g === "volumes") p = { kind: "volume", volKind: volKindKey(pick.id), pts: [] };
    else if (g === "events") {
      if (!r || !r.scene.paths.length) { readout(store, "Add an aircraft first.", "warn"); return false; }
      p = { kind: "event", evType: evTypeKey(pick.id), pts: [] };
    } else if (g === "reference") {
      return addPlane(store);
    }
    if (!p) return false;
    store.ui("ruler", null);
    store.ui("placing", p);
    return true;
  };

  function addPlane(store) {
    var r = rec(store.get()), id = util.uid("P", r.scene.planes || []);
    patch(store, "add " + id, function (c) {
      c.scene.planes = c.scene.planes || [];
      c.scene.planes.push({ id: id, label: "120 m ceiling", z: 120 });
    });
    store.ui("placing", null);
    store.dispatch({ type: "sel.set", kind: "plane", id: id, i: null });
    toast(id + " added.");
    return true;
  }

  function addSystem(store, kind, world) {
    var r = rec(store.get()), d = der(r), def = sysDef(kind);
    var id = util.uid(def.prefix, r.scene.systems);
    var x = Math.round(world.x), y = Math.round(world.y);
    var fov = def.fov == null ? 360 : def.fov, brgv = 0;
    if (fov < 360) brgv = Math.round(bearing({ x: x, y: y }, originOf(d)));
    var sys = {
      id: id, kind: kind, x: x, y: y, z: 0, range: def.range || 0, rmin: 0, fov: fov, bearing: brgv,
      elMin: -90, elMax: 90, zmin: 0, zmax: null, status: "active"
    };
    patch(store, "add " + id, function (c) { c.scene.systems.push(sys); });
    store.ui("placing", null);
    store.dispatch({ type: "sel.set", kind: "system", id: id, i: null });
    readout(store, sys.range > 0 ? tools.dragLabel("range", sys, sys.range) : id + " added.");
    toast(id + " added.");
    return id;
  }

  function addVolume(store, kind, pts) {
    var r = rec(store.get()), def = volDef(kind);
    var id = util.uid(def.prefix, r.scene.volumes, true);
    var vol = { id: id, kind: kind, label: volLabel(kind), pts: pts.map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }), zmin: 0, zmax: def.zmax || 0 };
    patch(store, "add " + id, function (c) { c.scene.volumes.push(vol); });
    store.ui("placing", null);
    store.dispatch({ type: "sel.set", kind: "volume", id: id, i: null });
    toast(id + " added.");
    return id;
  }

  // nearest path and its time to a board point; plan {x,y} or elev {r,z}
  function nearestPath(r, d, world, cam, preferId) {
    var best = null, bd = Infinity, o = (cam && cam.origin) || originOf(d);
    if (!d || !PS.geo) return null;
    r.scene.paths.forEach(function (p) {
      var tm = d.timed && d.timed[p.id];
      if (!tm || !tm.length) return;
      var t, pos, dist;
      if (isElev(world)) {
        if (typeof PS.geo.tAtRZ !== "function") return;
        t = PS.geo.tAtRZ(tm, world.r, world.z, o);
        pos = PS.geo.posAt(tm, t);
        dist = Math.hypot(hyp(pos.x, pos.y, o.x, o.y) - world.r, pos.z - world.z);
      } else {
        if (typeof PS.geo.tAtPoint !== "function") return;
        t = PS.geo.tAtPoint(tm, world.x, world.y);
        pos = PS.geo.posAt(tm, t);
        dist = hyp(pos.x, pos.y, world.x, world.y);
      }
      if (p.id === preferId && isElev(world)) dist = -1;
      if (dist < bd) { bd = dist; best = { pathId: p.id, t: t }; }
    });
    return best;
  }

  tools.placeAt = function (store, world, opts) {
    opts = opts || {};
    var s = store.get(), p = s.ui.placing;
    if (!p || !world) return false;
    var r = rec(s);
    if (p.kind === "aircraft") {
      if (isElev(world)) { readout(store, "Press P to add in Plan.", "info"); return false; }
      var arch = archOf(p.arch);
      var pts = (p.pts || []).concat([{ x: Math.round(world.x), y: Math.round(world.y), z: cruiseHeight(arch), hold: 0 }]);
      store.ui("placing", Object.assign({}, p, { pts: pts }));
      if (opts.dbl && dedupe(pts).length >= 2) return tools.finishPlacing(store);
      var dp = dedupe(pts);
      if (dp.length >= 2) {
        var a = dp[dp.length - 2], b = dp[dp.length - 1];
        readout(store, tools.legText({ kind: "aircraft", arch: p.arch, pts: [a] }, b));
      }
      return false;
    }
    if (p.kind === "system") {
      if (isElev(world)) { readout(store, "Press P to add in Plan.", "info"); return false; }
      addSystem(store, p.sysKind, world);
      return true;
    }
    if (p.kind === "volume") {
      if (isElev(world)) { readout(store, "Press P to add in Plan.", "info"); return false; }
      if (opts.rect) {
        var A = opts.rect.a, B = opts.rect.b;
        addVolume(store, p.volKind, [[A.x, A.y], [B.x, A.y], [B.x, B.y], [A.x, B.y]]);
        return true;
      }
      var vp = (p.pts || []).concat([{ x: Math.round(world.x), y: Math.round(world.y), z: 0, hold: 0 }]);
      store.ui("placing", Object.assign({}, p, { pts: vp }));
      if (opts.dbl) return tools.finishPlacing(store);
      return false;
    }
    if (p.kind === "event") {
      var d = der(r), np = nearestPath(r, d, world, opts.cam, s.ui.sel && s.ui.sel.kind === "path" ? s.ui.sel.id : null);
      if (!np) { readout(store, "Add an aircraft first.", "warn"); return false; }
      store.ui("placing", null);
      tools.addEventAt(store, np.pathId, np.t, p.evType, null);
      return true;
    }
    return false;
  };

  tools.finishPlacing = function (store) {
    var s = store.get(), p = s.ui.placing;
    if (!p) return false;
    var r = rec(s);
    if (p.kind === "aircraft") {
      var pts = dedupe(p.pts || []);
      if (!pts.length) { store.ui("placing", null); return false; }
      var arch = archOf(p.arch);
      var pathId = util.uid("T", r.scene.paths);
      var identity = arch.role === "surrogate" ? "neutral" : "hostile";
      patch(store, "add " + pathId, function (c) {
        var ac = null;
        c.scene.aircraft.forEach(function (a) { if (!ac && a.arch === p.arch) ac = a; });
        if (!ac) { ac = { id: util.uid("A", c.scene.aircraft), arch: p.arch, cruise: null }; c.scene.aircraft.push(ac); }
        c.scene.paths.push({
          id: pathId, aircraft: ac.id, group: "", identity: identity, speed: null,
          pts: pts.map(function (q) { return { x: q.x, y: q.y, z: q.z, hold: q.hold || 0 }; })
        });
      });
      store.ui("placing", null);
      store.dispatch({ type: "sel.set", kind: "path", id: pathId, i: null });
      toast(pathId + " added.");
      // the leg text of the last placement step is transient: clear it when the route ends
      if (pts.length === 1) readout(store, pathId + " needs two waypoints.", "warn");
      else readout(store, "");
      return true;
    }
    if (p.kind === "volume") {
      var vp = dedupe(p.pts || []);
      if (vp.length < 3) { readout(store, "Add three or more points.", "info"); return false; }
      addVolume(store, p.volKind, vp.map(function (q) { return [q.x, q.y]; }));
      return true;
    }
    store.ui("placing", null);
    return false;
  };

  // Escape: a route with two or more points ends; everything else leaves no half object
  tools.cancelPlacing = function (store) {
    var p = store.get().ui.placing;
    if (!p) return false;
    if (p.kind === "aircraft" && dedupe(p.pts || []).length >= 2) return tools.finishPlacing(store);
    store.ui("placing", null);
    return true;
  };

  // ---------------------------------------------------------------- drags
  function affectedPaths(kind, id, r) {
    if (kind === "path") return [id];
    if (kind === "event") { var e = byId(r.events, id); return e ? [e.path] : []; }
    if (kind === "system" || kind === "volume") return r.scene.paths.map(function (p) { return p.id; });
    return [];
  }

  function deltasOf(d0, d1, paths) {
    var out = [], largest = null, lv = 0;
    if (!d0 || !d1) return { deltas: out, largest: null };
    paths.forEach(function (pid) {
      var parts = [];
      var f0 = (d0.first && d0.first[pid]) || {}, f1 = (d1.first && d1.first[pid]) || {};
      var ids = Object.keys(f0);
      Object.keys(f1).forEach(function (k) { if (ids.indexOf(k) < 0) ids.push(k); });
      ids.forEach(function (sid) {
        var a = f0[sid], b = f1[sid], txt = null, v = 0;
        if (a && b && Math.abs(b.t - a.t) >= 0.05) { v = b.t - a.t; txt = "first see " + sid + " " + signed(v) + " s"; }
        else if (a && !b) { v = 9999; txt = "first see " + sid + " none"; }
        else if (!a && b) { v = 9999; txt = "first see " + sid + " " + PS.units.t(b.t); }
        if (txt) { parts.push(txt); if (Math.abs(v) > lv) { lv = Math.abs(v); largest = pid + " " + txt; } }
      });
      var w0 = d0.window && d0.window[pid], w1 = d1.window && d1.window[pid];
      if (w0 && w1 && w0.geometric != null && w1.geometric != null && Math.abs(w1.geometric - w0.geometric) >= 0.05) {
        var dw = w1.geometric - w0.geometric;
        parts.push("window " + signed(dw) + " s");
        if (Math.abs(dw) > lv) { lv = Math.abs(dw); largest = pid + " window " + signed(dw) + " s"; }
      }
      if (w0 && w1 && w0.margin != null && w1.margin != null && Math.abs(w1.margin - w0.margin) >= 0.5) {
        var dm = w1.margin - w0.margin;
        parts.push("margin " + signedClock(dm));
        if (Math.abs(dm) > lv) { lv = Math.abs(dm); largest = pid + " margin " + signedClock(dm); }
      }
      if (parts.length) out.push({ id: pid, lines: parts });
    });
    return { deltas: out, largest: largest };
  }

  var LABELS = {
    range: "set {id} range", arcEnd0: "set {id} sector", arcEnd1: "set {id} sector", arcMid: "set {id} bearing",
    elRay0: "set {id} elevation limits", elRay1: "set {id} elevation limits", hold: "set {id} hold",
    insert: "add point to {id}", edge: "add vertex to {id}", top: "set {id} top", line: "move {id}"
  };

  // returns null for a hit that has no drag (a path line, a group)
  tools.beginDrag = function (store, hit, world, cam) {
    if (!hit || !world) return null;
    var s = store.get(), r = rec(s);
    var kind = hit.kind === "wp" ? "path" : hit.kind === "vertex" ? "volume" : hit.kind;
    var id = hit.id, role = hit.role || "centre";
    var i = hit.i == null || hit.i === "" ? null : Number(hit.i);
    var list = kind === "system" ? r.scene.systems : kind === "path" ? r.scene.paths : kind === "volume" ? r.scene.volumes :
      kind === "plane" ? r.scene.planes : kind === "event" ? r.events : null;
    var obj = list ? byId(list, id) : null;
    if (!obj) return null;
    if (kind === "path" && i == null && role !== "insert") return null;
    if (kind === "event") role = "bead";
    if (kind === "plane" && !isElev(world)) return null;

    var d0 = der(r), b0 = boundsOf(r.scene), ext = b0.ext, step = snapStepOf(ext);
    var label0 = (LABELS[role] || "move {id}").replace("{id}", id);
    var ref = (s.ui.cam && s.ui.cam.ref) || "asset";
    var start = world, orig = util.clone(obj), done = false;
    var affected = affectedPaths(kind, id, r);

    store.begin(label0);
    var ghost = { kind: kind, id: id, before: r, label: null };
    store.ui("ghost", ghost);

    // insert and edge add their point once, at drag start
    if (kind === "path" && role === "insert") {
      var a = obj.pts[i], b = obj.pts[i + 1];
      if (!a || !b) { store.cancel(); store.ui("ghost", null); return null; }
      var mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), z: Math.round((a.z + b.z) / 2), hold: 0 };
      patch(store, label0, function (c) { byId(c.scene.paths, id).pts.splice(i + 1, 0, mid); });
      i = i + 1; role = "centre";
      orig = util.clone(byId(rec(store.get()).scene.paths, id));
    } else if (kind === "volume" && role === "edge") {
      var va = obj.pts[i], vb = obj.pts[(i + 1) % obj.pts.length];
      var vm = [Math.round((va[0] + vb[0]) / 2), Math.round((va[1] + vb[1]) / 2)];
      patch(store, label0, function (c) { byId(c.scene.volumes, id).pts.splice(i + 1, 0, vm); });
      i = i + 1; role = "vertex";
      orig = util.clone(byId(rec(store.get()).scene.volumes, id));
    }

    function sysR(sys) {
      var o = (cam && cam.origin) || originOf(d0);
      return hyp(sys.x, sys.y, o.x, o.y);
    }

    function apply(c, w, mods, snapOn) {
      var ctx = { derived: d0, scene: c.scene, cam: cam, modifiers: mods, exclude: id, ext: ext };
      var sn = function (pt, from) { if (!snapOn) return pt; ctx.from = from || null; return tools.snap(pt, ctx); };
      var lbl = "", o = originOf(d0);
      if (kind === "system") {
        var sy = byId(c.scene.systems, id);
        if (role === "centre") {
          if (isElev(w)) {
            if (ref !== id) return "";
            sy.z = Math.max(0, Math.round(sn(w).z));
            return tools.dragLabel("z", sy, sy.z);
          }
          var q = sn(w);
          sy.x = Math.round(q.x); sy.y = Math.round(q.y);
          lbl = tools.dragLabel("centre", sy, { r: hyp(sy.x, sy.y, o.x, o.y), brg: bearing(o, sy) });
          return q.label ? lbl + " " + q.label : lbl;
        }
        if (role === "range") {
          var dist = isElev(w) ? (ref === id ? Math.hypot(w.r, w.z - sy.z) : Math.abs(w.r - sysR(sy))) : hyp(w.x, w.y, sy.x, sy.y);
          var rv = snapOn ? Math.max(step, Math.round(dist / step) * step) : Math.round(dist);
          sy.range = Math.max(rv, (sy.rmin || 0) + 1);
          return tools.dragLabel("range", sy, sy.range);
        }
        if (role === "arcEnd0" || role === "arcEnd1" || role === "arcMid") {
          if (isElev(w)) return "";
          var bp = bearing(sy, w);
          if (role === "arcMid") { sy.bearing = Math.round(bp); return tools.dragLabel("arcMid", sy, sy.bearing); }
          var e0 = orig.bearing - orig.fov / 2, e1 = orig.bearing + orig.fov / 2, fov;
          if (role === "arcEnd1") { fov = ((bp - e0) % 360 + 360) % 360; fov = util.clamp(Math.round(fov), 1, 359); sy.fov = fov; sy.bearing = Math.round(((e0 + fov / 2) % 360 + 360) % 360); }
          else { fov = ((e1 - bp) % 360 + 360) % 360; fov = util.clamp(Math.round(fov), 1, 359); sy.fov = fov; sy.bearing = Math.round(((e1 - fov / 2) % 360 + 360) % 360); }
          return tools.dragLabel(role, sy, sy.fov);
        }
        if (role === "elRay0" || role === "elRay1") {
          if (!isElev(w)) return "";
          var rel = ref === id ? w.r : w.r - sysR(sy);
          var ang = Math.round(Math.atan2(w.z - (sy.z || 0), Math.max(Math.abs(rel), 1e-6)) * DEG);
          if (role === "elRay0") sy.elMin = util.clamp(ang, -90, (sy.elMax == null ? 90 : sy.elMax) - 1);
          else sy.elMax = util.clamp(ang, (sy.elMin == null ? -90 : sy.elMin) + 1, 90);
          return tools.dragLabel(role, sy, role === "elRay0" ? sy.elMin : sy.elMax);
        }
        return "";
      }
      if (kind === "path") {
        var pa = byId(c.scene.paths, id), pt = pa.pts[i];
        if (!pt) return "";
        if (role === "hold") {
          if (!cam || typeof cam.project !== "function" || mods.sx == null) return "";
          var sp = cam.project(pt.x, pt.y, pt.z);
          var dpx = Math.hypot(mods.sx - sp[0], mods.sy - sp[1]);
          pt.hold = Math.max(0, Math.round((dpx - 9) / 12) * 10);
          return tools.dragLabel("hold", pt, pt.hold);
        }
        if (isElev(w)) {
          pt.z = Math.max(0, Math.round(sn(w).z));
          return tools.dragLabel("z", { id: id + " point " + (i + 1) }, pt.z);
        }
        var qq = sn(w, i > 0 ? pa.pts[i - 1] : null);
        pt.x = Math.round(qq.x); pt.y = Math.round(qq.y);
        lbl = tools.dragLabel("centre", { id: id + " point " + (i + 1) }, { r: hyp(pt.x, pt.y, o.x, o.y), brg: bearing(o, pt) });
        return qq.label ? lbl + " " + qq.label : lbl;
      }
      if (kind === "volume") {
        var vo = byId(c.scene.volumes, id);
        if (role === "top") {
          if (!isElev(w)) return "";
          vo.zmax = Math.max(0, Math.round(sn(w).z));
          return "top " + tools.dragLabel("top", vo, vo.zmax);
        }
        if (isElev(w)) return "";
        if (role === "vertex" && i != null) {
          var vq = sn(w);
          vo.pts[i] = [Math.round(vq.x), Math.round(vq.y)];
          return id + " vertex " + (i + 1) + (vq.label ? " " + vq.label : "");
        }
        var dx = w.x - start.x, dy = w.y - start.y;
        if (snapOn) { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; }
        vo.pts = orig.pts.map(function (q) { return [Math.round(q[0] + dx), Math.round(q[1] + dy)]; });
        return "move " + id + " " + PS.units.h(Math.hypot(dx, dy));
      }
      if (kind === "plane") {
        var pl = byId(c.scene.planes, id);
        pl.z = Math.max(0, Math.round(snapOn ? Math.round(w.z / 5) * 5 : w.z));
        return tools.dragLabel("line", pl, pl.z);
      }
      if (kind === "event") {
        var ev = byId(c.events, id), tm = d0 && d0.timed && d0.timed[ev.path];
        if (!tm || !PS.geo) return "";
        var t = isElev(w) ? PS.geo.tAtRZ(tm, w.r, w.z, (cam && cam.origin) || o) : PS.geo.tAtPoint(tm, w.x, w.y);
        var sb = snapOn ? tools.snapBead(ev.path, t, d0) : { t: t };
        ev.t = round1(sb.t);
        if (sb.system) ev.system = sb.system;
        return sb.label ? id + " " + sb.label : tools.dragLabel("bead", ev, ev.t);
      }
      return "";
    }

    var drag = {
      kind: kind, id: id, role: role, label: label0,
      move: function (w, mods) {
        if (done || !w) return { label: "", deltas: [] };
        mods = mods || {};
        var st = store.get(), snapOn = st.ui.snap !== false && !mods.alt, lbl = "";
        patch(store, label0, function (c) { lbl = apply(c, w, mods, snapOn) || ""; });
        var dl = deltasOf(d0, der(rec(store.get())), affected);
        ghost = { kind: kind, id: id, before: r, label: lbl };
        store.ui("ghost", ghost);
        return { label: lbl, deltas: dl.deltas, largest: dl.largest };
      },
      end: function () {
        if (done) return;
        done = true;
        store.commit();
        store.ui("ghost", null);
      },
      cancel: function () {
        if (done) return;
        done = true;
        store.cancel();
        store.ui("ghost", null);
      }
    };
    return drag;
  };

  // ---------------------------------------------------------------- nudge
  tools.nudge = function (store, dx, dy) {
    var s = store.get(), r = rec(s), sel = s.ui.sel || {};
    if (!r || !sel.kind) return false;
    var step = snapStepOf(boundsOf(r.scene).ext), mx = dx * step, my = dy * step;
    var i = sel.i == null ? null : Number(sel.i);
    var ok = false;
    patch(store, "move " + sel.id, function (c) {
      var o;
      if (sel.kind === "system" && (o = byId(c.scene.systems, sel.id))) { o.x += mx; o.y += my; ok = true; }
      else if (sel.kind === "path" && (o = byId(c.scene.paths, sel.id))) {
        o.pts.forEach(function (p, k) { if (i == null || i === k) { p.x += mx; p.y += my; } });
        ok = true;
      } else if (sel.kind === "volume" && (o = byId(c.scene.volumes, sel.id))) {
        o.pts = o.pts.map(function (p, k) { return i == null || i === k ? [p[0] + mx, p[1] + my] : p; });
        ok = true;
      } else if (sel.kind === "plane" && (o = byId(c.scene.planes, sel.id))) { o.z = Math.max(0, o.z + dy * 10); ok = true; }
      else if (sel.kind === "event" && (o = byId(c.events, sel.id))) { o.t = Math.max(0, round1(o.t + dx)); ok = true; }
    });
    return ok;
  };

  // ---------------------------------------------------------------- formation and groups
  tools.startFormation = function (store, pathId) {
    var s = store.get(), r = rec(s);
    var id = pathId || (s.ui.sel && s.ui.sel.kind === "path" ? s.ui.sel.id : null);
    var p = id ? byId(r.scene.paths, id) : null;
    if (!p || p.pts.length < 2) { readout(store, "Select a path with two or more waypoints.", "warn"); return false; }
    store.ui("paletteOpen", false);
    store.ui("placing", { kind: "formation", pts: [], pathId: p.id, n: 3, spacing: 120, group: p.group || "A" });
    return true;
  };

  tools.formation = function (store, pathId, n, spacing, group) {
    var s = store.get(), r = rec(s), path = byId(r.scene.paths, pathId);
    if (!path || path.pts.length < 2) { readout(store, "Select a path with two or more waypoints.", "warn"); return false; }
    var g = String(group || "A").trim().toUpperCase().replace(/[^A-Z]/g, "").charAt(0) || "A";
    n = util.clamp(Math.round(Number(n) || 3), 2, 12);
    spacing = Number(spacing) > 0 ? Number(spacing) : 120;
    var members = PS.geo && typeof PS.geo.formationPoints === "function" ? PS.geo.formationPoints(path.pts, n, spacing) : [];
    var d = der(r), tmax = d && d.tmax ? d.tmax : 60;
    patch(store, "formation " + g, function (c) {
      var src = byId(c.scene.paths, pathId);
      src.group = g;
      members.forEach(function (pts) {
        c.scene.paths.push({
          id: util.uid(g, c.scene.paths), aircraft: src.aircraft, group: g, identity: src.identity || "hostile",
          speed: src.speed == null ? null : src.speed, pts: util.clone(pts)
        });
      });
      if (!c.snapshots || !c.snapshots.length) c.snapshots = [10, Math.round(tmax / 2)];
    });
    store.ui("placing", null);
    return true;
  };

  function lettersInUse(paths) {
    var u = {};
    paths.forEach(function (p) { if (p.group) u[p.group] = true; });
    return u;
  }

  tools.splitGroup = function (store, letter, t) {
    if (t == null || !letter) return false;
    var r = rec(store.get()), d = der(r);
    if (!d || typeof d.envelopesAt !== "function") return false;
    var index = {};
    r.scene.paths.forEach(function (p, k) { index[p.id] = k; });
    var clusters = d.envelopesAt(t).map(function (c) {
      return c.members.filter(function (m) { var p = byId(r.scene.paths, m); return p && p.group === letter; });
    }).filter(function (m) { return m.length; });
    if (clusters.length < 2) return false;
    clusters.sort(function (a, b) {
      return Math.min.apply(null, a.map(function (m) { return index[m]; })) - Math.min.apply(null, b.map(function (m) { return index[m]; }));
    });
    var used = lettersInUse(r.scene.paths), assign = {};
    clusters.slice(1).forEach(function (members) {
      var L = null;
      for (var k = 0; k < 26; k++) { var ch = String.fromCharCode(65 + k); if (!used[ch]) { L = ch; break; } }
      if (!L) return;
      used[L] = true;
      members.forEach(function (m) { assign[m] = L; });
    });
    patch(store, "split " + letter, function (c) {
      c.scene.paths.forEach(function (p) { if (assign[p.id]) p.group = assign[p.id]; });
    });
    return true;
  };

  tools.mergeGroup = function (store, letters) {
    if (!letters || !letters.length) return false;
    patch(store, "merge " + letters.join(" "), function (c) {
      c.scene.paths.forEach(function (p) { if (p.group && letters.indexOf(p.group) >= 0) p.group = letters[0]; });
    });
    return true;
  };

  tools.removeGroup = function (store, letter) {
    patch(store, "delete group " + letter, function (c) {
      c.scene.paths.forEach(function (p) { if (p.group === letter) p.group = ""; });
    });
    return true;
  };

  tools.reverse = function (store, pathId) {
    patch(store, "reverse " + pathId, function (c) {
      var p = byId(c.scene.paths, pathId);
      if (p) p.pts.reverse();
    });
  };

  // ---------------------------------------------------------------- events and waypoints
  tools.addEventAt = function (store, pathId, t, type, system) {
    var r = rec(store.get()), d = der(r);
    if (!byId(r.scene.paths, pathId) || t == null) return null;
    type = evTypeKey(type);
    var sb = system ? { t: t } : tools.snapBead(pathId, t, d);
    var id = util.uid("e", r.events);
    var ev = { id: id, t: round1(Math.max(0, sb.t)), type: type, label: evName(type), path: pathId, system: system || sb.system || null };
    patch(store, "add " + id, function (c) { c.events = c.events || []; c.events.push(ev); });
    store.dispatch({ type: "sel.set", kind: "event", id: id, i: null });
    return id;
  };

  tools.removeWaypoint = function (store, pathId, i) {
    var s = store.get(), r = rec(s), p = byId(r.scene.paths, pathId);
    if (!p || i == null || !p.pts[i]) return false;
    if (p.pts.length <= 1) { readout(store, pathId + " keeps its last waypoint. Delete " + pathId + " to remove it.", "warn"); return false; }
    patch(store, "delete " + pathId + " point " + (Number(i) + 1), function (c) { byId(c.scene.paths, pathId).pts.splice(Number(i), 1); });
    var sel = s.ui.sel || {};
    if (sel.kind === "path" && sel.id === pathId && sel.i != null) store.dispatch({ type: "sel.set", kind: "path", id: pathId, i: null });
    return true;
  };

  tools.moveToGeometry = function (store, eventId) {
    var r = rec(store.get()), d = der(r);
    var w = null;
    ((d && d.warnings) || []).forEach(function (x) { if (!w && x.eventId === eventId) w = x; });
    var ev = byId(r.events, eventId);
    if (!w || !ev) return false;
    var t = w.tGeo;
    if (w.rung === "engage" && d.window && d.window[ev.path] && d.window[ev.path].latest != null) t = d.window[ev.path].latest;
    if (t == null) return false;
    t = round1(t);
    patch(store, "move " + eventId, function (c) {
      var e = byId(c.events, eventId);
      e.t = t;
      if (w.system) e.system = w.system;
    });
    return true;
  };

  // ---------------------------------------------------------------- systems
  tools.makeSector = function (store, systemId) {
    var r = rec(store.get()), d = der(r), sy = byId(r.scene.systems, systemId);
    if (!sy) return false;
    var o = originOf(d), b = hyp(sy.x, sy.y, o.x, o.y) > 1 ? Math.round(bearing(sy, o)) : 0;
    patch(store, "set " + systemId + " sector", function (c) { var x = byId(c.scene.systems, systemId); x.fov = 90; x.bearing = b; });
    return true;
  };
  tools.makeOmni = function (store, systemId) {
    patch(store, "set " + systemId + " omni", function (c) { var x = byId(c.scene.systems, systemId); if (x) x.fov = 360; });
    return true;
  };
  tools.setRange = function (store, systemId, metres) {
    var r = rec(store.get()), i = idxOf(r.scene.systems, systemId);
    if (i < 0 || metres == null || !isFinite(metres)) return false;
    var sy = r.scene.systems[i];
    store.set("scene.systems." + i + ".range", Math.max(Math.round(metres), (sy.rmin || 0) + 1));
    return true;
  };

  // ---------------------------------------------------------------- duplicate, clipboard
  function prefixFor(kind, obj) {
    if (kind === "path") return { p: "T", bare: false };
    if (kind === "system") return { p: sysDef(obj.kind).prefix, bare: false };
    if (kind === "volume") return { p: volDef(obj.kind).prefix, bare: true };
    return { p: "P", bare: false };
  }
  function listKey(kind) { return { path: "paths", system: "systems", volume: "volumes", plane: "planes" }[kind]; }

  function addCopy(store, kind, src, aircraft, label) {
    var r = rec(store.get()), lk = listKey(kind);
    if (!lk || !src) return null;
    var step = snapStepOf(boundsOf(r.scene).ext);
    var pf = prefixFor(kind, src), id = util.uid(pf.p, r.scene[lk], pf.bare);
    var o = util.clone(src);
    o.id = id;
    if (kind === "system") { o.x += step; o.y += step; }
    else if (kind === "path") o.pts.forEach(function (p) { p.x += step; p.y += step; });
    else if (kind === "volume") o.pts = o.pts.map(function (p) { return [p[0] + step, p[1] + step]; });
    patch(store, (label || "duplicate") + " " + id, function (c) {
      if (kind === "path" && aircraft && !byId(c.scene.aircraft, o.aircraft)) c.scene.aircraft.push(util.clone(aircraft));
      c.scene[lk].push(o);
    });
    store.dispatch({ type: "sel.set", kind: kind, id: id, i: null });
    return id;
  }

  tools.duplicate = function (store, kind, id) {
    var r = rec(store.get()), lk = listKey(kind);
    if (!lk) return null;
    return addCopy(store, kind, byId(r.scene[lk], id), null, "duplicate");
  };

  tools.copy = function (store) {
    var s = store.get(), r = rec(s), sel = s.ui.sel || {}, lk = listKey(sel.kind);
    var o = lk ? byId(r.scene[lk], sel.id) : null;
    if (!o) return false;
    clipboard = { kind: sel.kind, obj: util.clone(o), aircraft: sel.kind === "path" ? util.clone(byId(r.scene.aircraft, o.aircraft)) : null };
    toast("Copied.");
    return true;
  };

  tools.paste = function (store) {
    if (!clipboard) return null;
    return addCopy(store, clipboard.kind, clipboard.obj, clipboard.aircraft, "paste");
  };

  // ---------------------------------------------------------------- cards and clips
  var SCENE_KINDS = { path: 1, system: 1, volume: 1, plane: 1, event: 1 };

  tools.saveCard = function (store, view, ix) {
    var r = rec(store.get());
    view = view || {};
    var cards = r.cards || [], n = cards.length + 1, sel = view.sel || {};
    var cam = view.cam || { proj: "plan", yaw: -35, pitch: 55, ref: "asset" };
    var card = {
      id: util.uid("c", cards), name: "Card " + n,
      cam: { proj: cam.proj, yaw: cam.yaw, pitch: cam.pitch, ref: cam.ref || "asset" },
      layers: util.clone(view.layers || (PS.schema && PS.schema.defaultLayers ? PS.schema.defaultLayers() : {})),
      focus: SCENE_KINDS[sel.kind] && sel.id != null && sel.i == null ? [sel.id] : [],
      t: view.t == null ? null : view.t,
      clip: null,
      displays: { timeline: true, chart: false, readout: false },
      caption: "", notes: ""
    };
    patch(store, "save card " + n, function (c) {
      c.cards = c.cards || [];
      if (ix == null || ix < 0 || ix > c.cards.length) c.cards.push(card);
      else c.cards.splice(ix, 0, card);
    });
    toast("Card " + n + " saved.");
    return card.id;
  };

  tools.saveClip = function (store, cardIx, clip) {
    var r = rec(store.get());
    if (!r.cards || !r.cards[cardIx]) return false;
    var out = null;
    if (clip) {
      var t0 = Math.min(clip.t0, clip.t1), t1 = Math.max(clip.t0, clip.t1);
      var beats = (clip.beats || []).map(Number).filter(isFinite).map(function (b) { return util.clamp(b, t0, t1); });
      beats.sort(function (a, b) { return a - b; });
      out = { t0: t0, t1: t1, rate: clip.rate, beats: beats };
    }
    patch(store, "save clip", function (c) { c.cards[cardIx].clip = out; });
    toast("Clip saved.");
    return true;
  };

  tools.cardMove = function (store, ix, d) {
    var r = rec(store.get()), j = ix + d;
    if (!r.cards || !r.cards[ix] || j < 0 || j >= r.cards.length) return false;
    patch(store, "move card", function (c) { var x = c.cards.splice(ix, 1)[0]; c.cards.splice(j, 0, x); });
    if (store.get().ui.cardIx === ix) store.ui("cardIx", j);
    return true;
  };

  tools.cardRemove = function (store, ix) {
    var r = rec(store.get());
    if (!r.cards || !r.cards[ix]) return false;
    patch(store, "delete card", function (c) { c.cards.splice(ix, 1); });
    var n = (rec(store.get()).cards || []).length, cur = store.get().ui.cardIx || 0;
    if (cur >= n) store.ui("cardIx", Math.max(0, n - 1));
    return true;
  };

  // ---------------------------------------------------------------- ruler
  function anchor(state, world, cam) {
    var r = rec(state), d = der(r), t = state.ui.t;
    var tol = 14 / ((cam && cam.scale) || 1), best = null, bd = tol;
    var out = { x: world.x, y: world.y };
    if (t != null && d && d.timed && PS.geo && typeof PS.geo.posAt === "function") {
      r.scene.paths.forEach(function (p) {
        var tm = d.timed[p.id];
        if (!tm || !tm.length) return;
        var pos = PS.geo.posAt(tm, t), dd = hyp(pos.x, pos.y, world.x, world.y);
        if (dd <= bd) { bd = dd; best = { x: pos.x, y: pos.y, kind: "path", id: p.id }; }
      });
    }
    if (best) return best;
    r.scene.systems.forEach(function (s) {
      var dd = hyp(s.x, s.y, world.x, world.y);
      if (dd <= bd) { bd = dd; best = { x: s.x, y: s.y, kind: "system", id: s.id }; }
    });
    if (best) return best;
    r.scene.paths.forEach(function (p) {
      p.pts.forEach(function (q, k) {
        var dd = hyp(q.x, q.y, world.x, world.y);
        if (dd <= bd) { bd = dd; best = { x: q.x, y: q.y, kind: "wp", id: p.id, i: k }; }
      });
    });
    return best || out;
  }

  tools.ruler = {
    toggle: function (store) {
      if (store.get().ui.ruler) { store.ui("ruler", null); return false; }
      store.ui("placing", null);
      store.ui("ruler", { a: null, b: null, done: false });
      return true;
    },
    // press-drag draws a ruler in one gesture; a click with no movement places the first end and the next click the second
    start: function (store, world, cam) {
      if (!world || world.x == null) return;
      var r = store.get().ui.ruler;
      if (r && r.a && !r.done) { store.ui("ruler", { a: r.a, b: anchor(store.get(), world, cam), done: false }); return; }
      var a = anchor(store.get(), world, cam);
      store.ui("ruler", { a: a, b: { x: a.x, y: a.y }, done: false });
    },
    move: function (store, world, cam) {
      var r = store.get().ui.ruler;
      if (!r || !r.a || r.done || !world || world.x == null) return;
      store.ui("ruler", { a: r.a, b: anchor(store.get(), world, cam), done: false });
    },
    end: function (store, world, cam) {
      var r = store.get().ui.ruler;
      if (!r || !r.a) return;
      var b = world && world.x != null ? anchor(store.get(), world, cam) : r.b;
      var tol = 3 / ((cam && cam.scale) || 1);
      if (!b || hyp(b.x, b.y, r.a.x, r.a.y) <= tol) { store.ui("ruler", { a: r.a, b: { x: r.a.x, y: r.a.y }, done: false }); return; }
      store.ui("ruler", { a: r.a, b: b, done: true });
    },
    clear: function (store) { store.ui("ruler", null); }
  };

  // ---------------------------------------------------------------- viewer zoom and pan (5.8)
  function viewOf(store) {
    var v = store.get().ui.view || {};
    return { zoom: v.zoom || 1, px: v.px || 0, py: v.py || 0 };
  }
  tools.zoom = function (store, factor, aboutSx, aboutSy, cam) {
    var v = viewOf(store);
    var z = util.clamp(v.zoom * factor, 0.5, 8);
    var sx = aboutSx == null ? (cam && cam.W ? cam.W / 2 : 0) : aboutSx;
    var sy = aboutSy == null ? (cam && cam.H ? cam.H / 2 : 0) : aboutSy;
    var k = z / v.zoom;
    store.dispatch({ type: "view.set", zoom: z, px: sx - (sx - v.px) * k, py: sy - (sy - v.py) * k });
  };
  tools.pan = function (store, dx, dy) {
    var v = viewOf(store);
    store.dispatch({ type: "view.set", zoom: v.zoom, px: v.px + dx, py: v.py + dy });
  };
  tools.fit = function (store) { store.dispatch({ type: "view.fit" }); };
})(globalThis.PS);
