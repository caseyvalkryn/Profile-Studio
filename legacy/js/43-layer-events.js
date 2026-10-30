(function (PS) {
  "use strict";

  // Layer events (chip 2): event beads with letter glyphs, warning triangles on early events,
  // and first-see ticks per sensor and effector in the system ink.
  var r1 = PS.cameras.r1;

  function kinds(name, fallback) { return (PS.catalog && PS.catalog[name]) || fallback; }

  function sysInk(kind) {
    if (kind === "ew") return "ink-ew";
    return kinds("SENSOR_KINDS", ["radar", "rf", "eoir", "acoustic"]).indexOf(kind) >= 0 ? "ink-sensor" : "ink-eff";
  }

  function zOf(cam, v) { return cam.kind === "plan" ? 0 : (v || 0); }

  // unit screen direction of travel at time t, else null
  function screenDir(cam, w, t) {
    var q = PS.geo.posAt(w, t);
    var hx = q.hx || 0, hy = q.hy || 0;
    if (!hx && !hy) return null;
    var a = cam.project(q.x, q.y, zOf(cam, q.z)), b = cam.project(q.x + hx * 20, q.y + hy * 20, zOf(cam, q.z));
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return L > 1e-6 ? [dx / L, dy / L] : null;
  }

  PS.layers.register({
    id: "events", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.events) || "Events",
    order: 70, chip: 2, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, d = ctx.derived, out = "";
      var EVT = kinds("EV_TYPES", {}), see = kinds("SENSOR_KINDS", []).concat(kinds("EFFECTOR_KINDS", []));
      var warnBy = {};
      (d.warnings || []).forEach(function (w) { if (w.eventId) warnBy[w.eventId] = w; });

      // first-see ticks
      if (!ctx.thumb) {
        (ctx.scene.paths || []).forEach(function (p) {
          var w = d.timed && d.timed[p.id], f = d.first && d.first[p.id];
          if (!w || !w.length || !f) return;
          (ctx.scene.systems || []).forEach(function (s) {
            if (see.length && see.indexOf(s.kind) < 0) return;
            var fs = f[s.id];
            if (!fs || fs.t == null) return;
            var pos = fs.pos || PS.geo.posAt(w, fs.t);
            var c = cam.project(pos.x, pos.y, zOf(cam, pos.z)), dir = screenDir(cam, w, fs.t) || [1, 0];
            var nx = -dir[1] * 6, ny = dir[0] * 6, ink = sysInk(s.kind), dim = ctx.dim(p.id);
            out += S("line", { x1: r1(c[0] - nx), y1: r1(c[1] - ny), x2: r1(c[0] + nx), y2: r1(c[1] + ny), class: "fst " + ink + dim });
            var lx = c[0] + nx * 1.4 + 2, ly = c[1] + ny * 1.4 + 3;
            ctx.label({ p: 4.5, id: s.id, box: ctx.sym.textBox(lx, ly, s.id, 10), svg: ctx.sym.label(lx, ly, s.id, "small fstx lid " + ink + dim) });
          });
        });
      }

      // beads
      (ctx.profile.events || []).forEach(function (e) {
        var w = d.timed && d.timed[e.path];
        if (!w || !w.length || e.t == null) return;
        var q = PS.geo.posAt(w, e.t), c = cam.project(q.x, q.y, zOf(cam, q.z));
        var cls = ctx.cls(e.id) || (ctx.focus.indexOf(e.id) >= 0 ? " sel" : ""), dim = ctx.dim(e.id);
        var r = ctx.thumb ? 3 : 6, inner = S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: r, class: "bead" });
        if (!ctx.thumb) inner += S("text", { x: r1(c[0]), y: r1(c[1] + 3), class: "beadtx" }, PS.util.esc(EVT[e.type] || "?"));
        if (warnBy[e.id] && !ctx.thumb) inner += ctx.sym.warn(c[0] + 9, c[1] - 9);
        out += S("g", { class: "ev" + cls + dim + (warnBy[e.id] ? " warned" : ""), "data-k": "event", "data-id": e.id, "data-role": "bead" }, inner);
        ctx.hit({ kind: "event", id: e.id, i: null, role: "bead", sx: c[0], sy: c[1], r: r, handle: true });
        if (!ctx.thumb && e.label) {
          var lx = c[0] + 10, ly = c[1] + 14;
          ctx.label({ p: 3, id: e.id, box: ctx.sym.textBox(lx, ly, e.label, 11.5), svg: ctx.sym.label(lx, ly, e.label, "evl" + dim) });
        }
      });
      return out;
    }
  });
})(globalThis.PS);
