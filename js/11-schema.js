(function (PS) {
  "use strict";
  var Sc = PS.schema = {};
  var C = PS.catalog, U = PS.util;

  Sc.VERSION = 4;
  Sc.STAMP = "profile-studio/4";
  Sc.CAMERAS = ["plan", "elev", "axon"];
  Sc.LAYER_KEYS = ["reach", "events", "envelopes", "tracks", "telemetry", "labels", "rings", "target"];
  Sc.LAYER_LABELS = { reach: "Reach", events: "Events", envelopes: "Envelopes", tracks: "Tracks", telemetry: "Telemetry", labels: "Labels", rings: "Rings", target: "Target TSPI" };
  Sc.defaultLayers = function () {
    return { reach: true, events: true, envelopes: true, tracks: true, telemetry: false, labels: true, rings: false, target: true };
  };

  // the N in a "profile-studio/N" stamp; 3 when the stamp is missing or unreadable
  Sc.detect = function (record) {
    var s = record && record.schema;
    if (typeof s === "number" && isFinite(s)) return s;
    var m = /^profile-studio\/(\d+)$/.exec(String(s == null ? "" : s));
    return m ? Number(m[1]) : 3;
  };

  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  // v1 card layers {reach,events,envelopes,telemetry,labels} gain tracks, rings and target; key order is LAYER_KEYS
  var V1_LAYER_FILL = { tracks: true, rings: false, target: true };
  function orderLayers(layers) {
    var d = Sc.defaultLayers(), out = {};
    Sc.LAYER_KEYS.forEach(function (k) {
      if (layers && typeof layers[k] === "boolean") out[k] = layers[k];
      else out[k] = has(V1_LAYER_FILL, k) ? V1_LAYER_FILL[k] : d[k];
    });
    return out;
  }

  Sc.steps = {};
  Sc.steps[3] = function v3to4(r) {
    // 1
    r.schema = Sc.STAMP;
    delete r._dirty;
    r.scene = r.scene || {};
    var s = r.scene;
    ["aircraft", "systems", "volumes", "planes", "paths"].forEach(function (k) { s[k] = arr(s[k]); });
    // 2
    s.aircraft = s.aircraft.map(function (a) {
      var arch = a.arch != null ? a.arch : a.id;
      var cruise = a.cruise == null || a.cruise === C.arch(arch).cruise ? null : a.cruise;
      return { id: a.id, arch: arch, cruise: cruise };
    });
    // 3
    var identity = r.cls === "Surrogate" ? "neutral" : "hostile";
    s.paths.forEach(function (p) {
      delete p.timed;
      if (!has(p, "identity")) p.identity = identity;
      if (p.speed === undefined) p.speed = null;
      if (p.group == null) p.group = "";
      p.pts = arr(p.pts);
      p.pts.forEach(function (q) {
        if (q.hold == null) q.hold = 0;
        if (q.z == null) q.z = 0;
      });
    });
    // 4
    var SYS_FILL = { z: 0, rmin: 0, elMin: -90, elMax: 90, zmin: 0, zmax: null, status: "active" };
    s.systems.forEach(function (b) {
      if (b.kind === "truth") b.kind = "tspi";
      Object.keys(SYS_FILL).forEach(function (k) { if (!has(b, k)) b[k] = SYS_FILL[k]; });
    });
    // 5
    s.volumes.forEach(function (v) {
      if (!has(v, "zmin")) v.zmin = 0;
      if (v.zmax == null) v.zmax = 0;
    });
    // 6
    r.events = arr(r.events);
    r.events.forEach(function (e) { if (!has(e, "system")) e.system = null; });
    // 7
    var tm = r.telemetry || {};
    if (has(tm, "truth")) {
      if (!has(tm, "tspi")) tm.tspi = tm.truth;
      delete tm.truth;
    }
    r.telemetry = { tspi: tm.tspi != null ? tm.tspi : "", interval: tm.interval != null ? tm.interval : 20, stations: arr(tm.stations) };
    // 8
    ["snapshots", "data", "mop", "cards"].forEach(function (k) { r[k] = arr(r[k]); });
    r.cards.forEach(function (c) {
      c.layers = orderLayers(c.layers);
      if (!c.displays) c.displays = { timeline: true, chart: false, readout: false };
      else if (!has(c.displays, "readout")) c.displays.readout = false;
      if (!has(c, "clip")) c.clip = null;
      c.cam = c.cam || { proj: "plan", yaw: -35, pitch: 55 };
      if (!has(c.cam, "ref")) c.cam.ref = "asset";
      if (!has(c, "focus")) c.focus = [];
    });
    // 9
    if (!has(r, "units")) r.units = "nav";
    if (!has(r, "metricsCfg")) r.metricsCfg = { dLink: null };
    if (!has(r, "site")) r.site = { name: "", datum: "AGL", elev: 0 };
    if (!has(r, "meta")) r.meta = { created: null, updated: null };
    return r;
  };

  Sc.migrate = function (record) {
    var n = Sc.detect(record);
    if (n > Sc.VERSION) throw new Error("This record is version " + n + ". This page reads up to version " + Sc.VERSION + ".");
    var r = U.clone(record);
    for (var v = n; v < Sc.VERSION; v++) {
      if (!Sc.steps[v]) throw new Error("This record is version " + n + ". This page reads up to version " + Sc.VERSION + ".");
      r = Sc.steps[v](r);
    }
    return r;
  };

  // ---------------------------------------------------------------- builders shared with 12-seed.js
  Sc.square = function (r) { return [[-r, -r], [r, -r], [r, r], [-r, r]]; };
  Sc.makeSystem = function (id, kind, x, y, range, fov, bearing) {
    var d = C.SYS_DEFAULTS[kind] || { range: 0, fov: 360 };
    return { id: id, kind: kind, x: x || 0, y: y || 0, z: 0,
      range: range != null ? range : d.range, rmin: 0,
      fov: fov != null ? fov : d.fov, bearing: bearing || 0,
      elMin: -90, elMax: 90, zmin: 0, zmax: null, status: "active" };
  };
  Sc.makeVolume = function (id, kind, label, pts, zmax) {
    var d = C.VOL_DEFAULTS[kind] || { zmax: 0 };
    return { id: id, kind: kind, label: label, pts: pts, zmin: 0, zmax: zmax != null ? zmax : d.zmax };
  };

  Sc.blank = function (id) {
    var now = new Date().toISOString();
    return {
      schema: Sc.STAMP, id: id || "PROF-1", v: 1, name: "New profile", cls: "Custom", collection: "", purpose: "",
      units: "nav", metricsCfg: { dLink: null }, site: { name: "", datum: "AGL", elev: 0 },
      scene: { aircraft: [], systems: [], volumes: [Sc.makeVolume("DA", "asset", "Defended asset", Sc.square(200), 0)], planes: [], paths: [] },
      events: [], telemetry: { tspi: "", interval: 20, stations: [] },
      snapshots: [], data: [], mop: [], cards: [],
      meta: { created: now, updated: now }
    };
  };

  Sc.newId = function (lib, prefix) { return U.uid(prefix || "PROF-", lib || []); };

  // ---------------------------------------------------------------- validate
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function finOrNull(v) { return v === null || fin(v); }
  function keys(list) { return list.map(function (x) { return x[0]; }); }

  Sc.validate = function (r) {
    var errors = [];
    function err(t) { if (errors.indexOf(t) < 0) errors.push(t); }
    if (!r || typeof r !== "object" || !r.scene || typeof r.scene !== "object") {
      return { ok: false, errors: ["This is not a profile record. Check the JSON."] };
    }
    if (r.schema !== Sc.STAMP) err("The record stamp is not " + Sc.STAMP + ".");
    if (typeof r.id !== "string" || !r.id) err("The profile has no id.");
    if (C.CLASSES.indexOf(r.cls) < 0) err("The class " + r.cls + " is not in the catalog.");
    var s = r.scene;
    var lists = { aircraft: s.aircraft, systems: s.systems, volumes: s.volumes, planes: s.planes, paths: s.paths, events: r.events, cards: r.cards };
    var ids = {};
    Object.keys(lists).forEach(function (k) {
      if (!Array.isArray(lists[k])) { err("The list " + k + " is missing."); lists[k] = []; }
      ids[k] = {};
      lists[k].forEach(function (o) {
        if (!o || typeof o !== "object" || typeof o.id !== "string" || !o.id) { err("An item in " + k + " has no id."); return; }
        if (ids[k][o.id]) err("Two items in " + k + " use the id " + o.id + ".");
        ids[k][o.id] = true;
      });
    });
    function num(owner, v, ok) { if (!(ok || fin)(v)) err(owner + " has a value that is not a number."); }

    var sysKinds = keys(C.SYS_KINDS), volKinds = keys(C.VOL_KINDS);
    lists.aircraft.forEach(function (a) { num(a.id, a.cruise, finOrNull); });
    lists.systems.forEach(function (b) {
      if (sysKinds.indexOf(b.kind) < 0) err(b.id + " has the kind " + b.kind + " that is not in the catalog.");
      ["x", "y", "z", "range", "rmin", "fov", "bearing", "elMin", "elMax", "zmin"].forEach(function (k) { num(b.id, b[k]); });
      num(b.id, b.zmax, finOrNull);
      if (fin(b.range) && b.range > 0 && fin(b.rmin) && !(b.rmin >= 0 && b.rmin < b.range)) err(b.id + " needs a minimum range from 0 to less than its range.");
      if (fin(b.elMin) && fin(b.elMax) && !(b.elMin >= -90 && b.elMin < b.elMax && b.elMax <= 90)) err(b.id + " needs elevation limits from -90 to 90 with the lower limit first.");
    });
    lists.volumes.forEach(function (v) {
      if (volKinds.indexOf(v.kind) < 0) err(v.id + " has the kind " + v.kind + " that is not in the catalog.");
      if (!Array.isArray(v.pts) || v.pts.length < 3) err(v.id + " needs three or more vertices.");
      else v.pts.forEach(function (q) { if (!Array.isArray(q) || !fin(q[0]) || !fin(q[1])) err(v.id + " has a value that is not a number."); });
      num(v.id, v.zmin); num(v.id, v.zmax);
    });
    lists.planes.forEach(function (p) { num(p.id, p.z); });
    lists.paths.forEach(function (p) {
      if (!ids.aircraft[p.aircraft]) err(p.id + " refers to aircraft " + p.aircraft + " that does not exist.");
      if (C.IDENTITIES.indexOf(p.identity) < 0) err(p.id + " has the identity " + p.identity + " that is not in the catalog.");
      num(p.id, p.speed, finOrNull);
      if (!Array.isArray(p.pts) || p.pts.length < 1) err(p.id + " has no waypoints.");
      else p.pts.forEach(function (q) {
        if (!q || !fin(q.x) || !fin(q.y) || !fin(q.z) || !fin(q.hold)) err(p.id + " has a value that is not a number.");
      });
    });
    lists.events.forEach(function (e) {
      if (!C.EV_TYPES[e.type]) err(e.id + " has the type " + e.type + " that is not in the catalog.");
      if (!ids.paths[e.path]) err(e.id + " refers to path " + e.path + " that does not exist.");
      if (e.system != null && !ids.systems[e.system]) err(e.id + " refers to system " + e.system + " that does not exist.");
      num(e.id, e.t);
    });
    var tm = r.telemetry;
    if (!tm || typeof tm !== "object") err("The telemetry block is missing.");
    else {
      arr(tm.stations).forEach(function (id) { if (!ids.systems[id]) err("Telemetry refers to system " + id + " that does not exist."); });
      num("Telemetry", tm.interval);
    }
    if (!Array.isArray(r.snapshots)) err("The list snapshots is missing.");
    else r.snapshots.forEach(function (t) { num("Snapshots", t); });
    if (!r.metricsCfg || !(r.metricsCfg.dLink === null || (fin(r.metricsCfg.dLink) && r.metricsCfg.dLink > 0))) err("The link distance must be empty or above 0.");
    if (r.site && r.site.elev != null) num("Site", r.site.elev);
    lists.cards.forEach(function (c) {
      if (!c.cam || Sc.CAMERAS.indexOf(c.cam.proj) < 0) err(c.id + " has a camera that is not plan, elev or axon.");
      else { num(c.id, c.cam.yaw); num(c.id, c.cam.pitch); }
      num(c.id, c.t, finOrNull);
      var k = c.clip;
      if (k != null) {
        if (!fin(k.t0) || !fin(k.t1) || !(k.t0 < k.t1)) err(c.id + " needs a clip start before the clip end.");
        if (C.RATES.indexOf(k.rate) < 0) err(c.id + " has a clip rate that is not in the rate menu.");
        if (!Array.isArray(k.beats) || k.beats.some(function (b) { return !fin(b) || b < k.t0 || b > k.t1; })) err(c.id + " has a beat outside the clip.");
      }
    });
    var db = r.debrief;
    if (db != null) {
      var tspi = db.tspi || {};
      Object.keys(tspi).forEach(function (pid) {
        if (!ids.paths[pid]) err("Debrief refers to path " + pid + " that does not exist.");
        if (!Array.isArray(tspi[pid]) || tspi[pid].some(function (q) { return !Array.isArray(q) || q.length !== 4 || !q.every(fin); })) err("Debrief TSPI for " + pid + " needs t, x, y, z samples.");
      });
      arr(db.events).forEach(function (e) {
        if (!C.EV_TYPES[e.type]) err("A debrief event has the type " + e.type + " that is not in the catalog.");
        if (!ids.paths[e.path]) err("A debrief event refers to path " + e.path + " that does not exist.");
        num("A debrief event", e.t);
      });
    }
    return { ok: errors.length === 0, errors: errors };
  };
})(globalThis.PS);
