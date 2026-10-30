(function (PS) {
  "use strict";
  var B = PS.bus = {};
  var subs = {};

  B.on = function (channel, fn) {
    (subs[channel] = subs[channel] || []).push(fn);
    return function () {
      subs[channel] = (subs[channel] || []).filter(function (f) { return f !== fn; });
    };
  };

  B.emit = function (channel, payload) {
    (subs[channel] || []).slice().forEach(function (fn) { fn(payload); });
  };

  // channel: ui keys diffed by reference
  var UI_CHANNELS = [
    ["mode", ["mode"]],
    ["cam", ["cam", "view"]],
    ["layers", ["layers"]],
    ["units", ["units"]],
    ["time", ["t", "playing", "rate", "loop", "range", "tview"]],
    ["sel", ["sel"]],
    ["hover", ["hover", "ghost"]],
    ["baseline", ["baseline"]],
    ["placing", ["placing", "ruler", "snap"]],
    ["panels", ["panels", "stripTab", "sheet", "phone", "paletteOpen", "menu", "cardIx", "query", "focus", "theme", "dialog", "ladderSort"]]
  ];
  B.UI_CHANNELS = UI_CHANNELS;

  function activeOf(state) {
    var lib = state.lib || [];
    for (var i = 0; i < lib.length; i++) if (lib[i].id === state.activeId) return lib[i];
    return lib[0] || null;
  }

  // the payload of a ui channel: the one key, or an object of the keys
  function payloadOf(ui, ks) {
    if (ks.length === 1) return ui[ks[0]];
    var o = {};
    ks.forEach(function (k) { o[k] = ui[k]; });
    return o;
  }

  B.diff = function (prev, next) {
    var out = [];
    var pr = activeOf(prev), nr = activeOf(next);
    if (pr !== nr) {
      out.push(["profile", nr]);
      if (PS.derive && typeof PS.derive.all === "function" && nr) out.push(["derived", PS.derive.all(nr)]);
    }
    if (prev.lib !== next.lib || prev.activeId !== next.activeId) out.push(["lib", { lib: next.lib, activeId: next.activeId }]);
    var a = prev.ui || {}, b = next.ui || {};
    UI_CHANNELS.forEach(function (c) {
      if (c[1].some(function (k) { return a[k] !== b[k]; })) out.push([c[0], payloadOf(b, c[1])]);
    });
    if (a.readout !== b.readout && b.readout) out.push(["readout", b.readout]);
    return out;
  };

  var wired = [];
  B.wire = function (store) {
    if (wired.indexOf(store) >= 0) return;
    wired.push(store);
    if (PS.units && store.get().ui) PS.units.set(store.get().ui.units);
    store.subscribe(function (next, action, prev) {
      if (!prev || prev === next) return;
      B.diff(prev, next).forEach(function (e) {
        if (e[0] === "units" && PS.units) PS.units.set(e[1]);
        B.emit(e[0], e[1]);
      });
    });
  };

  // tests only
  B.reset = function () { subs = {}; wired = []; };
})(globalThis.PS);
