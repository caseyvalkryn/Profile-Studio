(function (PS) {
  "use strict";
  var St = PS.store = {};
  var U = PS.util, C = PS.catalog, Sc = PS.schema;

  St.DEPTH = 100;

  function plain(o) { return o !== null && typeof o === "object" && !Array.isArray(o); }
  function now() { return new Date().toISOString(); }

  St.defaultUi = function () {
    return {
      mode: "build",
      cam: { proj: "plan", yaw: -35, pitch: 55, ref: "asset" },
      view: { zoom: 1, px: 0, py: 0 },
      tview: null,
      layers: Sc.defaultLayers(),
      units: "nav",
      t: null, playing: false, rate: 1,
      loop: "off", range: null,
      sel: { kind: null, id: null, i: null },
      hover: { kind: null, id: null, i: null, cx: 0, cy: 0, text: null, t: null },
      ghost: null,
      baseline: null,
      ladderSort: { key: "path", dir: 1 },
      readout: null,
      theme: "auto",
      focus: [],
      placing: null,
      ruler: null,
      snap: true,
      panels: { list: true, inspector: true, notes: true, fullStage: false, blank: false, roStrip: false, help: false },
      stripTab: "timeline",
      sheet: null,
      phone: false,
      cardIx: 0, query: "", paletteOpen: false, paletteGroup: null, menu: null,
      dialog: null
    };
  };

  // immutable set along a dotted path: every object on the path is copied
  function setIn(obj, ks, v) {
    if (!ks.length) return v;
    var k = ks[0];
    var src = obj != null && typeof obj === "object" ? obj : (/^\d+$/.test(k) ? [] : {});
    var copy = Array.isArray(src) ? src.slice() : Object.assign({}, src);
    copy[k] = setIn(src[k], ks.slice(1), v);
    return copy;
  }
  function pathKeys(p) { return Array.isArray(p) ? p.map(String) : String(p).split("."); }
  St.setIn = function (obj, path, v) { return setIn(obj, pathKeys(path), v); };

  function activeIx(state) {
    for (var i = 0; i < state.lib.length; i++) if (state.lib[i].id === state.activeId) return i;
    return state.lib.length ? 0 : -1;
  }
  function active(state) { var i = activeIx(state); return i < 0 ? null : state.lib[i]; }

  // replace the active record; marks it dirty
  function putActive(state, rec, touch) {
    var i = activeIx(state);
    if (i < 0) return state;
    if (touch) {
      rec.meta = Object.assign({}, rec.meta || { created: null }, { updated: now() });
    }
    var lib = state.lib.slice();
    lib[i] = rec;
    var dirty = Object.assign({}, state.dirty);
    dirty[rec.id] = true;
    return Object.assign({}, state, { lib: lib, dirty: dirty, activeId: rec.id });
  }
  function setUi(state, patch) {
    return Object.assign({}, state, { ui: Object.assign({}, state.ui, patch) });
  }
  function warn(state, text) { return setUi(state, { readout: { text: text, level: "warn" } }); }

  // ---------------------------------------------------------------- dependents
  var LIST_KIND = { paths: "path", aircraft: "aircraft", systems: "system", volumes: "volume", planes: "plane", events: "event", cards: "card" };
  var KIND_LIST = { path: "scene.paths", aircraft: "scene.aircraft", system: "scene.systems", volume: "scene.volumes", plane: "scene.planes", event: "events", card: "cards" };
  St.KIND_LIST = KIND_LIST;

  function dropFocus(r, ids) {
    (r.cards || []).forEach(function (c) {
      if (Array.isArray(c.focus)) c.focus = c.focus.filter(function (f) { return ids.indexOf(f) < 0; });
    });
  }

  function removeDependents(r, kind, id) {
    var gone = [id];
    if (kind === "path") {
      r.events = (r.events || []).filter(function (e) {
        if (e.path === id) { gone.push(e.id); return false; }
        return true;
      });
      if (r.debrief) {
        if (r.debrief.tspi) delete r.debrief.tspi[id];
        if (Array.isArray(r.debrief.events)) r.debrief.events = r.debrief.events.filter(function (e) { return e.path !== id; });
      }
    }
    if (kind === "system") {
      (r.events || []).forEach(function (e) { if (e.system === id) e.system = null; });
      if (r.telemetry && Array.isArray(r.telemetry.stations)) r.telemetry.stations = r.telemetry.stations.filter(function (s) { return s !== id; });
    }
    dropFocus(r, gone);
    return gone;
  }

  function rewire(r, kind, a, b) {
    var s = r.scene;
    if (kind === "path") {
      (r.events || []).forEach(function (e) { if (e.path === a) e.path = b; });
      if (r.debrief) {
        if (r.debrief.tspi && Object.prototype.hasOwnProperty.call(r.debrief.tspi, a)) {
          r.debrief.tspi[b] = r.debrief.tspi[a];
          delete r.debrief.tspi[a];
        }
        (r.debrief.events || []).forEach(function (e) { if (e.path === a) e.path = b; });
      }
    }
    if (kind === "aircraft") s.paths.forEach(function (p) { if (p.aircraft === a) p.aircraft = b; });
    if (kind === "system") {
      (r.events || []).forEach(function (e) { if (e.system === a) e.system = b; });
      if (r.telemetry && Array.isArray(r.telemetry.stations)) r.telemetry.stations = r.telemetry.stations.map(function (x) { return x === a ? b : x; });
      (r.cards || []).forEach(function (c) { if (c.cam && c.cam.ref === a) c.cam.ref = b; });
    }
    (r.cards || []).forEach(function (c) {
      if (Array.isArray(c.focus)) c.focus = c.focus.map(function (f) { return f === a ? b : f; });
    });
  }

  function lastKey(path) { var ks = pathKeys(path); return ks[ks.length - 1]; }

  // ---------------------------------------------------------------- default reducers
  var DEFAULTS = {};

  DEFAULTS["profile.set"] = function (state, a) {
    var rec = active(state);
    if (!rec) return state;
    var r = U.clone(rec);
    U.setPath(r, a.path, U.clone(a.value));
    return putActive(state, r, true);
  };

  DEFAULTS["profile.push"] = function (state, a) {
    var rec = active(state);
    if (!rec) return state;
    var r = U.clone(rec);
    var list = U.getPath(r, a.path);
    if (!Array.isArray(list)) { list = []; U.setPath(r, a.path, list); }
    list.push(U.clone(a.value));
    return putActive(state, r, true);
  };

  DEFAULTS["profile.remove"] = function (state, a) {
    var rec = active(state);
    if (!rec) return state;
    var list = U.getPath(rec, a.path);
    if (!Array.isArray(list)) return state;
    var kind = LIST_KIND[lastKey(a.path)];
    var ix = -1;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if ((o && typeof o === "object" && o.id === a.id) || (typeof a.id === "number" && i === a.id && !(o && typeof o === "object"))) { ix = i; break; }
    }
    if (ix < 0) return state;
    if (kind === "aircraft") {
      var user = (rec.scene.paths || []).filter(function (p) { return p.aircraft === a.id; })[0];
      if (user) return warn(state, user.id + " uses this aircraft. Delete " + user.id + " first.");
    }
    var r = U.clone(rec);
    U.getPath(r, a.path).splice(ix, 1);
    var gone = kind ? removeDependents(r, kind, a.id) : [];
    var next = putActive(state, r, true);
    var sel = next.ui.sel;
    if (sel && sel.id != null && gone.indexOf(sel.id) >= 0) next = setUi(next, { sel: { kind: null, id: null, i: null } });
    return next;
  };

  DEFAULTS["profile.patch"] = function (state, a) {
    var rec = active(state);
    if (!rec || typeof a.fn !== "function") return state;
    var c = U.clone(rec);
    var r = a.fn(c);
    if (r === undefined) r = c;
    if (!r || r === rec) return state;
    return putActive(state, r, true);
  };

  DEFAULTS["profile.rename"] = function (state, a) {
    var rec = active(state);
    var lp = KIND_LIST[a.kind];
    if (!rec || !lp || a.oldId === a.newId) return state;
    var newId = a.newId == null ? "" : String(a.newId).trim();
    if (!newId) return state;
    var list = U.getPath(rec, lp) || [];
    if (!list.some(function (o) { return o.id === a.oldId; })) return state;
    if (list.some(function (o) { return o.id === newId; })) return warn(state, newId + " is in use. Pick another id.");
    var r = U.clone(rec);
    U.getPath(r, lp).forEach(function (o) { if (o.id === a.oldId) o.id = newId; });
    rewire(r, a.kind, a.oldId, newId);
    var next = putActive(state, r, true);
    var sel = next.ui.sel;
    if (sel && sel.kind === a.kind && sel.id === a.oldId) next = setUi(next, { sel: Object.assign({}, sel, { id: newId }) });
    return next;
  };

  function clearForSwitch(ui) {
    return Object.assign({}, ui, {
      baseline: null, ghost: null, placing: null, ruler: null, menu: null,
      sel: { kind: null, id: null, i: null }, t: null, playing: false,
      range: null, tview: null, cardIx: 0, focus: []
    });
  }

  DEFAULTS["lib.add"] = function (state, a) {
    if (!a.record) return state;
    return Object.assign({}, state, { lib: state.lib.concat([a.record]) });
  };

  DEFAULTS["lib.remove"] = function (state, a) {
    var i = -1;
    state.lib.forEach(function (r, k) { if (r.id === a.id) i = k; });
    if (i < 0) return state;
    if (state.lib.length <= 1) return warn(state, "Keep at least one profile.");
    var lib = state.lib.slice();
    lib.splice(i, 1);
    var dirty = Object.assign({}, state.dirty);
    delete dirty[a.id];
    var next = Object.assign({}, state, { lib: lib, dirty: dirty });
    if (state.activeId === a.id) {
      next.activeId = lib[0].id;
      next.ui = clearForSwitch(state.ui);
    }
    return next;
  };

  DEFAULTS["lib.activate"] = function (state, a) {
    if (!state.lib.some(function (r) { return r.id === a.id; })) return state;
    return Object.assign({}, state, { activeId: a.id, ui: clearForSwitch(state.ui) });
  };

  DEFAULTS["lib.replace"] = function (state, a) {
    var recs = Array.isArray(a.records) ? a.records : [];
    if (!recs.length) return state;
    var lib = state.lib.slice(), dirty = Object.assign({}, state.dirty), replaced = 0, added = 0;
    recs.forEach(function (rec) {
      var i = -1;
      lib.forEach(function (r, k) { if (r.id === rec.id) i = k; });
      if (i >= 0) { lib[i] = rec; replaced++; } else { lib.push(rec); added++; }
      delete dirty[rec.id];
    });
    if (a.replaced == null) a.replaced = replaced;
    if (a.added == null) a.added = added;
    return Object.assign({}, state, { lib: lib, dirty: dirty, activeId: recs[recs.length - 1].id, ui: clearForSwitch(state.ui) });
  };

  DEFAULTS["lib.bump"] = function (state) {
    var rec = active(state);
    if (!rec || !state.dirty[rec.id]) return state;
    var r = Object.assign({}, rec, { v: (rec.v || 1) + 1 });
    var i = activeIx(state), lib = state.lib.slice();
    lib[i] = r;
    var dirty = Object.assign({}, state.dirty);
    delete dirty[rec.id];
    return Object.assign({}, state, { lib: lib, dirty: dirty });
  };

  DEFAULTS["ui.set"] = function (state, a) {
    return Object.assign({}, state, { ui: setIn(state.ui, pathKeys(a.path), a.value) });
  };

  DEFAULTS["time.set"] = function (state, a) { return setUi(state, { t: a.t == null ? null : a.t }); };
  DEFAULTS["time.play"] = function (state) { return setUi(state, { playing: true, t: state.ui.t == null ? 0 : state.ui.t }); };
  DEFAULTS["time.pause"] = function (state) { return setUi(state, { playing: false }); };
  DEFAULTS["time.rate"] = function (state, a) {
    return C.RATES.indexOf(a.rate) < 0 ? state : setUi(state, { rate: a.rate });
  };
  DEFAULTS["time.loop"] = function (state, a) {
    var loop = ["off", "all", "range"].indexOf(a.loop) >= 0 ? a.loop : state.ui.loop;
    return setUi(state, { loop: loop, range: a.range === undefined ? state.ui.range : a.range });
  };
  DEFAULTS["time.view"] = function (state, a) { return setUi(state, { tview: a.tview == null ? null : a.tview }); };

  DEFAULTS["baseline.pin"] = function (state, a) {
    var rec = active(state);
    return rec ? setUi(state, { baseline: { record: rec, label: a.label || "Baseline" } }) : state;
  };
  DEFAULTS["baseline.clear"] = function (state) { return setUi(state, { baseline: null }); };

  DEFAULTS["sel.set"] = function (state, a) {
    return setUi(state, { sel: { kind: a.kind == null ? null : a.kind, id: a.id == null ? null : a.id, i: a.i == null ? null : a.i } });
  };
  DEFAULTS["sel.clear"] = function (state) { return setUi(state, { sel: { kind: null, id: null, i: null } }); };

  // copied field by field; a missing field reads null, cx and cy read 0
  DEFAULTS["hover.set"] = function (state, a) {
    function n(v) { return v === undefined ? null : v; }
    return setUi(state, { hover: { kind: n(a.kind), id: n(a.id), i: n(a.i), cx: a.cx == null ? 0 : a.cx, cy: a.cy == null ? 0 : a.cy, text: n(a.text), t: n(a.t) } });
  };
  DEFAULTS["hover.clear"] = function (state) {
    return setUi(state, { hover: { kind: null, id: null, i: null, cx: 0, cy: 0, text: null, t: null } });
  };

  DEFAULTS["view.set"] = function (state, a) {
    var v = state.ui.view;
    return setUi(state, { view: { zoom: a.zoom == null ? v.zoom : a.zoom, px: a.px == null ? v.px : a.px, py: a.py == null ? v.py : a.py } });
  };
  DEFAULTS["view.fit"] = function (state) { return setUi(state, { view: { zoom: 1, px: 0, py: 0 } }); };

  St.reducers = DEFAULTS;

  function undoLabelOf(a) {
    if (a.label) return a.label;
    if (a.type === "profile.remove") return "delete " + a.id;
    if (a.type === "profile.rename") return "rename " + a.oldId;
    if (a.type === "profile.push") return "add " + (a.value && a.value.id ? a.value.id : lastKey(a.path));
    return "edit " + lastKey(a.path || "");
  }

  // ---------------------------------------------------------------- create
  St.create = function (initialState) {
    var init = initialState || {};
    var ui = St.defaultUi();
    var iu = init.ui || {};
    Object.keys(iu).forEach(function (k) {
      ui[k] = plain(ui[k]) && plain(iu[k]) ? Object.assign({}, ui[k], iu[k]) : iu[k];
    });
    var lib = Array.isArray(init.lib) ? init.lib : [];
    var state = {
      lib: lib,
      activeId: lib.some(function (r) { return r.id === init.activeId; }) ? init.activeId : (lib[0] ? lib[0].id : null),
      dirty: Object.assign({}, init.dirty || {}),
      ui: ui
    };
    var reducers = Object.assign({}, DEFAULTS);
    var subs = [];
    var undoStack = [], redoStack = [];
    var txn = null;

    function notify(next, action, prev) {
      subs.slice().forEach(function (fn) { fn(next, action, prev); });
    }
    function push(entry) {
      undoStack.push(entry);
      if (undoStack.length > St.DEPTH) undoStack.splice(0, undoStack.length - St.DEPTH);
      redoStack = [];
    }
    function restore(rec, action) {
      var prev = state;
      var next = putActive(state, rec, false);
      state = next;
      notify(next, action, prev);
    }

    var store = {
      get: function () { return state; },
      dispatch: function (action) {
        if (!action || !reducers[action.type]) return;
        var prev = state;
        var before = active(prev);
        var next = reducers[action.type](prev, action);
        if (!next || next === prev) return;
        var t = action.type;
        if (t === "lib.activate" || t === "lib.replace" || t === "lib.remove") {
          if (t !== "lib.remove" || next.lib !== prev.lib) { undoStack = []; redoStack = []; txn = null; }
        } else if (t.indexOf("profile.") === 0) {
          var after = active(next);
          if (after !== before && !txn) push({ label: undoLabelOf(action), before: before, after: after });
        }
        state = next;
        notify(next, action, prev);
      },
      reducer: function (type, fn) { reducers[type] = fn; },
      subscribe: function (fn) {
        subs.push(fn);
        return function () { subs = subs.filter(function (f) { return f !== fn; }); };
      },
      set: function (path, value) { store.dispatch({ type: "profile.set", path: path, value: value }); },
      patch: function (fn, label) { store.dispatch({ type: "profile.patch", fn: fn, label: label }); },
      ui: function (path, value) { store.dispatch({ type: "ui.set", path: path, value: value }); },
      begin: function (label) {
        if (txn) { txn.depth++; return; }
        txn = { label: label || "edit", before: active(state), lib: state.lib, activeId: state.activeId, depth: 1 };
      },
      commit: function () {
        if (!txn) return;
        if (--txn.depth > 0) return;
        var t = txn;
        txn = null;
        var after = active(state);
        if (after !== t.before && after && t.before) {
          push({ label: t.label, before: t.before, after: after });
          // prev holds the pre-transaction lib so the bus emits lib and profile once (undo button state)
          notify(state, { type: "history.commit", label: t.label }, Object.assign({}, state, { lib: t.lib, activeId: t.activeId }));
        }
      },
      cancel: function () {
        if (!txn) return;
        var t = txn;
        txn = null;
        var cur = active(state);
        if (cur !== t.before && cur && t.before) restore(t.before, { type: "history.cancel", label: t.label });
      },
      undo: function () {
        if (txn || !undoStack.length) return false;
        var e = undoStack.pop();
        redoStack.push(e);
        restore(e.before, { type: "history.undo", label: e.label });
        return true;
      },
      redo: function () {
        if (txn || !redoStack.length) return false;
        var e = redoStack.pop();
        undoStack.push(e);
        restore(e.after, { type: "history.redo", label: e.label });
        return true;
      },
      canUndo: function () { return !txn && undoStack.length > 0; },
      canRedo: function () { return !txn && redoStack.length > 0; },
      undoLabel: function () { return undoStack.length ? undoStack[undoStack.length - 1].label : null; },
      redoLabel: function () { return redoStack.length ? redoStack[redoStack.length - 1].label : null; },
      clearHistory: function () { undoStack = []; redoStack = []; }
    };
    return store;
  };
})(globalThis.PS);
