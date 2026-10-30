(function (PS) {
  "use strict";
  var P = PS.persist = {};
  var U = PS.util, C = PS.catalog, Sc = PS.schema;

  P.KEY_V4 = "profileStudio.v4";
  P.KEY_V3 = "profileStudio.v3";
  P.NOT_RECORD = "This is not a profile record. Check the JSON.";
  P.TSPI_ERROR = "Each line needs t, x, y, z.";
  var SAVED_UI = ["units", "layers", "panels", "snap", "stripTab", "theme"];
  var DERIVED_KEYS = ["windows", "ladder", "window"];

  function read(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
  }
  function parseJson(s) {
    if (s == null) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function migrateAll(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      try { if (r && r.scene) out.push(Sc.migrate(r)); } catch (e) { /* a record newer than this page is left out */ }
    });
    return out;
  }
  function pickActive(lib, id) {
    return lib.some(function (r) { return r.id === id; }) ? id : lib[0].id;
  }

  P.storageAvailable = function (storage) {
    if (!storage) return false;
    try {
      var k = "profileStudio.probe";
      storage.setItem(k, "1");
      var ok = storage.getItem(k) === "1";
      if (typeof storage.removeItem === "function") storage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  };

  // v4 first; else v3 migrated and written to v4; the v3 key stays
  P.load = function (storage) {
    var o = parseJson(read(storage, P.KEY_V4));
    if (o && Array.isArray(o.lib)) {
      var lib = migrateAll(o.lib);
      if (lib.length) {
        var ui = Object.assign({}, o.ui || {});
        delete ui.mode;
        return { lib: lib, activeId: pickActive(lib, o.activeId), ui: ui };
      }
    }
    var v3 = parseJson(read(storage, P.KEY_V3));
    if (v3 && Array.isArray(v3.lib)) {
      var lib3 = migrateAll(v3.lib);
      if (lib3.length) {
        var st = { lib: lib3, activeId: pickActive(lib3, v3.activeId), ui: {} };
        P.save(storage, st);
        return st;
      }
    }
    return null;
  };

  P.save = function (storage, state) {
    try {
      var ui = {};
      SAVED_UI.forEach(function (k) { if (state.ui && state.ui[k] !== undefined) ui[k] = state.ui[k]; });
      storage.setItem(P.KEY_V4, JSON.stringify({ schema: 4, lib: state.lib, activeId: state.activeId, ui: ui }));
      return true;
    } catch (e) { return false; }
  };

  function r0(v) { return Math.round(v); }

  P.exportText = function (record, derived) {
    var d = derived || {};
    var out = U.clone(record);
    out.scene.aircraft = out.scene.aircraft.map(function (a) { return Object.assign({}, C.arch(a.arch), a); });
    out.scene.paths = out.scene.paths.map(function (p) {
      var tp = d.timed && d.timed[p.id] ? d.timed[p.id] : [];
      return Object.assign({}, p, { timed: tp.map(function (q) { return [r0(q.x), r0(q.y), r0(q.z), r0(q.t0), r0(q.t1)]; }) });
    });
    DERIVED_KEYS.forEach(function (k) { if (d[k] !== undefined) out[k] = U.clone(d[k]); });
    return JSON.stringify(out, null, 2);
  };

  P.exportLibrary = function (lib) {
    return JSON.stringify({ schema: Sc.STAMP, library: (lib || []).map(function (r) { return U.clone(r); }) }, null, 2);
  };

  // v4 export: derived fields and merged archetype fields come off; v3 shapes are left to migrate
  function strip(r) {
    var c = U.clone(r);
    DERIVED_KEYS.forEach(function (k) { delete c[k]; });
    if (c.scene) {
      if (Array.isArray(c.scene.paths)) c.scene.paths.forEach(function (p) { delete p.timed; });
      if (Array.isArray(c.scene.aircraft)) c.scene.aircraft = c.scene.aircraft.map(function (a) {
        return { id: a.id, arch: a.arch, cruise: a.cruise === undefined ? null : a.cruise };
      });
    }
    return c;
  }

  P.parse = function (text) {
    var res = { records: [], errors: [] };
    var o = parseJson(text);
    if (!o || typeof o !== "object") { res.errors.push(P.NOT_RECORD); return res; }
    var items = Array.isArray(o) ? o : Array.isArray(o.library) ? o.library : [o];
    items.forEach(function (x) {
      if (!x || typeof x !== "object" || !x.scene || typeof x.scene !== "object" || !x.id) {
        if (res.errors.indexOf(P.NOT_RECORD) < 0) res.errors.push(P.NOT_RECORD);
        return;
      }
      var r;
      try {
        var n = Sc.detect(x);
        r = Sc.migrate(n >= Sc.VERSION ? strip(x) : x);
      } catch (e) {
        if (res.errors.indexOf(e.message) < 0) res.errors.push(e.message);
        return;
      }
      var v = Sc.validate(r);
      if (!v.ok) { v.errors.forEach(function (t) { res.errors.push(t); }); return; }
      res.records.push(r);
    });
    if (!items.length) res.errors.push(P.NOT_RECORD);
    return res;
  };

  function sample(v) {
    var q = Array.isArray(v) ? v : v && typeof v === "object" ? [v.t, v.x, v.y, v.z] : null;
    if (!q || q.length < 4) return null;
    q = q.slice(0, 4).map(Number);
    return q.every(function (n) { return isFinite(n); }) ? q : null;
  }

  // a JSON array of [t,x,y,z] or {t,x,y,z}, or CSV lines t,x,y,z; a first line with no numbers is a header
  P.parseTspi = function (text) {
    var res = { samples: [], errors: [] };
    var s = String(text == null ? "" : text).trim();
    if (!s) { res.errors.push(P.TSPI_ERROR); return res; }
    var bad = false;
    if (s.charAt(0) === "[") {
      var arr = parseJson(s);
      if (!Array.isArray(arr)) bad = true;
      else arr.forEach(function (v) { var q = sample(v); if (q) res.samples.push(q); else bad = true; });
    } else {
      s.split(/\r?\n/).forEach(function (line, i) {
        var l = line.trim();
        if (!l || l.charAt(0) === "#") return;
        var parts = l.split(/[\s,;]+/).filter(Boolean);
        var q = sample(parts);
        if (q) res.samples.push(q);
        else if (!(i === 0 && !/\d/.test(l))) bad = true;
      });
    }
    if (bad || !res.samples.length) res.errors.push(P.TSPI_ERROR);
    res.samples.sort(function (a, b) { return a[0] - b[0]; });
    return res;
  };
})(globalThis.PS);
