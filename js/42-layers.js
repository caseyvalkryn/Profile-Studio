(function (PS) {
  "use strict";

  // Layer registry. A layer is { id, label, order, chip, defaultOn, cameras, draw(ctx), hit(ctx, sx, sy, tol) }.
  // Registering an id again replaces the earlier entry.
  var reg = {};

  function norm(def) {
    if (!def || typeof def.id !== "string" || !def.id) throw new Error("PS.layers.register needs an id.");
    var labels = PS.schema && PS.schema.LAYER_LABELS;
    var chip = def.chip == null ? null : def.chip;
    return {
      id: def.id,
      label: def.label || (chip != null && labels && labels[def.id]) || def.id,
      order: typeof def.order === "number" ? def.order : 0,
      chip: chip,
      defaultOn: def.defaultOn !== false,
      cameras: Array.isArray(def.cameras) ? def.cameras.slice() : ["plan", "elev", "axon"],
      draw: typeof def.draw === "function" ? def.draw : function () { return ""; },
      hit: typeof def.hit === "function" ? def.hit : null
    };
  }

  function byOrder(a, b) { return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

  PS.layers = {
    register: function (def) {
      var l = norm(def);
      reg[l.id] = l;
      return l;
    },
    list: function () {
      return Object.keys(reg).map(function (k) { return reg[k]; }).sort(byOrder);
    },
    chips: function () {
      return Object.keys(reg).map(function (k) { return reg[k]; })
        .filter(function (l) { return l.chip != null; })
        .sort(function (a, b) { return a.chip - b.chip; });
    }
  };
})(globalThis.PS);
