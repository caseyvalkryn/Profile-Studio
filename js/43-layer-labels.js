(function (PS) {
  "use strict";

  // Layer labels (chip 6): one greedy placement pass over the label candidates the other layers queued.
  // The selected object goes first, then by priority p, then by queue order. A candidate whose padded box
  // overlaps a placed box is dropped. With the chip off only "always" candidates (data blocks) place.
  var PAD = 2;

  function overlaps(a, b) {
    return a.x0 - PAD < b.x1 + PAD && a.x1 + PAD > b.x0 - PAD && a.y0 - PAD < b.y1 + PAD && a.y1 + PAD > b.y0 - PAD;
  }

  PS.layers.register({
    id: "labels", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.labels) || "Labels",
    order: 90, chip: 6, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      if (ctx.thumb) return "";
      var selId = ctx.sel && ctx.sel.id;
      var list = (ctx.labels || []).filter(function (c) { return c && c.svg && (ctx.labelsOn || c.always); });
      list.sort(function (a, b) {
        var pa = selId != null && a.id === selId ? 0 : a.p, pb = selId != null && b.id === selId ? 0 : b.p;
        return pa - pb || a.n - b.n;
      });
      var placed = [], out = "";
      list.forEach(function (c) {
        var bx = c.box;
        if (bx && placed.some(function (q) { return overlaps(bx, q); })) return;
        if (bx) placed.push(bx);
        out += c.svg;
      });
      return out;
    }
  });
})(globalThis.PS);
