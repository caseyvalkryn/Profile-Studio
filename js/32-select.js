(function (PS) {
  "use strict";
  var Sl = PS.sel = {};
  var Sc = PS.schema;

  Sl.profile = function (state) {
    var lib = state.lib || [];
    for (var i = 0; i < lib.length; i++) if (lib[i].id === state.activeId) return lib[i];
    return lib[0] || null;
  };

  Sl.scene = function (state) { var p = Sl.profile(state); return p ? p.scene : null; };

  Sl.derived = function (state) {
    var p = Sl.profile(state);
    return p && PS.derive && typeof PS.derive.all === "function" ? PS.derive.all(p) : null;
  };

  Sl.tmax = function (state) {
    var d = Sl.derived(state);
    return d && typeof d.tmax === "number" ? d.tmax : 60;
  };

  function byId(list, id) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  Sl.object = function (state, kind, id) {
    var p = Sl.profile(state);
    if (!p || id == null) return null;
    var s = p.scene;
    switch (kind) {
      case "path": return byId(s.paths, id);
      case "system": return byId(s.systems, id);
      case "volume": return byId(s.volumes, id);
      case "plane": return byId(s.planes, id);
      case "aircraft": return byId(s.aircraft, id);
      case "event": return byId(p.events, id);
      case "card": return byId(p.cards, id);
      case "group":
        var members = s.paths.filter(function (q) { return q.group === id; });
        return members.length ? members : null;
      default: return null;
    }
  };

  // kind "path" with i gives kind "wp"; kind "volume" with i gives kind "vertex"
  Sl.selected = function (state) {
    var s = state.ui && state.ui.sel;
    if (!s || !s.kind || s.id == null) return null;
    var obj = Sl.object(state, s.kind, s.id);
    if (!obj) return null;
    if (s.i != null && s.kind === "path" && obj.pts && obj.pts[s.i]) return { kind: "wp", id: s.id, i: s.i, obj: obj.pts[s.i], parent: obj };
    if (s.i != null && s.kind === "volume" && obj.pts && obj.pts[s.i]) return { kind: "vertex", id: s.id, i: s.i, obj: obj.pts[s.i], parent: obj };
    return { kind: s.kind, id: s.id, i: null, obj: obj, parent: null };
  };

  Sl.card = function (state) {
    var p = Sl.profile(state);
    var cards = p && p.cards ? p.cards : [];
    return cards[state.ui.cardIx] || null;
  };

  // ui.cam.ref in Build, the card cam.ref in Brief; a missing system id reads "asset"
  Sl.originId = function (state) {
    var ref = state.ui.cam && state.ui.cam.ref;
    if (state.ui.mode === "brief") {
      var c = Sl.card(state);
      if (c && c.cam && c.cam.ref) ref = c.cam.ref;
    }
    if (ref === "asset" || ref === "asset-edge") return ref;
    var s = Sl.scene(state);
    return s && byId(s.systems, ref) ? ref : "asset";
  };

  function selPathId(state) {
    var s = state.ui.sel;
    return s && s.kind === "path" ? s.id : null;
  }

  Sl.origin = function (state, t) {
    var d = Sl.derived(state);
    return d && d.originAt ? d.originAt(Sl.originId(state), selPathId(state), t == null ? null : t) : { x: 0, y: 0, z: 0 };
  };

  Sl.trackLine = function (state, pathId) {
    var d = Sl.derived(state);
    return (d && d.trackLine && d.trackLine[pathId]) || [];
  };

  Sl.checks = function (state) {
    var d = Sl.derived(state);
    return ((d && d.warnings) || []).filter(function (w) { return w.eventId != null; })
      .slice().sort(function (a, b) { return (a.tA == null ? Infinity : a.tA) - (b.tA == null ? Infinity : b.tA); });
  };

  function boundsOf(scene) {
    return PS.geo && typeof PS.geo.bounds === "function" && scene ? PS.geo.bounds(scene) : null;
  }

  // board bounds freeze during a drag: they come from the pre-drag record
  Sl.buildView = function (state) {
    var ui = state.ui, cam = ui.cam || {};
    var g = ui.ghost && ui.ghost.before;
    return {
      proj: cam.proj, yaw: cam.yaw, pitch: cam.pitch, ref: Sl.originId(state),
      layers: ui.layers, focus: [], t: ui.t, hoverT: ui.hover ? ui.hover.t : null,
      sel: ui.sel, hover: ui.hover, units: ui.units,
      bounds: boundsOf(g ? g.scene : Sl.scene(state)),
      zoom: ui.view.zoom, px: ui.view.px, py: ui.view.py,
      placing: ui.placing, ruler: ui.ruler, snap: ui.snap
    };
  };

  Sl.cardView = function (state, card) {
    var ui = state.ui;
    var cam = (card && card.cam) || { proj: "plan", yaw: -35, pitch: 55, ref: "asset" };
    return {
      proj: cam.proj, yaw: cam.yaw, pitch: cam.pitch, ref: cam.ref || "asset",
      layers: Object.assign(Sc.defaultLayers(), card ? card.layers : {}),
      focus: card && card.focus ? card.focus : [], t: card ? card.t : null, hoverT: null,
      sel: { kind: null, id: null, i: null }, hover: { kind: null, id: null, i: null, cx: 0, cy: 0, text: null, t: null },
      units: ui.units, bounds: boundsOf(Sl.scene(state)),
      zoom: 1, px: 0, py: 0, placing: null, ruler: null, snap: ui.snap
    };
  };

  function upd(r) { return r && r.meta && r.meta.updated ? r.meta.updated : null; }
  // newest first, null last
  function byUpdatedDesc(a, b) {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a < b ? 1 : -1;
  }

  Sl.library = function (state) {
    var q = String(state.ui.query || "").trim().toLowerCase();
    var act = Sl.profile(state);
    var groups = {};
    (state.lib || []).filter(function (r) {
      return !q || [r.id, r.name, r.collection, r.purpose].join(" ").toLowerCase().indexOf(q) >= 0;
    }).forEach(function (r) {
      var c = r.collection || "";
      (groups[c] = groups[c] || []).push(r);
    });
    var out = Object.keys(groups).map(function (c) {
      var profiles = groups[c].slice().sort(function (a, b) {
        return byUpdatedDesc(upd(a), upd(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
      return { collection: c, profiles: profiles, newest: upd(profiles[0]) };
    });
    var actC = act ? act.collection || "" : null;
    out.sort(function (a, b) {
      if (a.collection === actC) return -1;
      if (b.collection === actC) return 1;
      return byUpdatedDesc(a.newest, b.newest) || (a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : 0);
    });
    return out.map(function (g) { return { collection: g.collection, profiles: g.profiles }; });
  };

  Sl.layerDefs = function () {
    return Sc.LAYER_KEYS.map(function (k, i) { return { key: k, label: Sc.LAYER_LABELS[k], n: i + 1 }; });
  };

  Sl.canEdit = function (state) { return state.ui.mode === "build"; };
})(globalThis.PS);
