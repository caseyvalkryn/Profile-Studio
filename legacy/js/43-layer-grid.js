(function (PS) {
  "use strict";

  // Layer grid: grid, axes, compass, scale bar, range rings (chip 7 "rings" reads ctx.layers.rings), axon hint.
  var r1 = PS.cameras.r1;

  function numOnly(s) { return String(s).replace(/\s*[a-zA-Z/]+(\s+[A-Z]+)?$/, ""); }

  // the other unit system's horizontal text, through PS.units
  function twinH(u, m) {
    var mode = u.mode;
    u.set(mode === "si" ? "nav" : "si");
    var s = u.h(m);
    u.set(mode);
    return s;
  }

  function ringRadii(u) {
    var unit = u.mode === "si" ? 1000 : u.NM;
    return [1, 2, 5, 10].map(function (n) { return { m: n * unit, label: n + (u.mode === "si" ? " km" : " nm") }; });
  }

  function gridStep(ext) { return PS.geo.gridStep(ext); }

  function drawPlan(ctx) {
    var S = ctx.S, cam = ctx.cam, out = "";
    // visible world rectangle, union with the content square
    var a = cam.unproject(0, 0), b = cam.unproject(cam.W, cam.H), bd = cam.bounds;
    var x0 = Math.min(a.x, b.x, bd.cx - bd.ext / 2), x1 = Math.max(a.x, b.x, bd.cx + bd.ext / 2);
    var y0 = Math.min(a.y, b.y, bd.cy - bd.ext / 2), y1 = Math.max(a.y, b.y, bd.cy + bd.ext / 2);
    var st = gridStep(bd.ext / (cam.zoom || 1)), g, p, q;
    if ((x1 - x0) / st > 400) st = (x1 - x0) / 400;
    for (g = Math.ceil(x0 / st) * st; g <= x1; g += st) {
      p = cam.project(g, y0); q = cam.project(g, y1);
      out += S("line", { x1: r1(p[0]), y1: r1(p[1]), x2: r1(q[0]), y2: r1(q[1]), class: Math.abs(g) < 1e-6 ? "axis" : "grid" });
    }
    for (g = Math.ceil(y0 / st) * st; g <= y1; g += st) {
      p = cam.project(x0, g); q = cam.project(x1, g);
      out += S("line", { x1: r1(p[0]), y1: r1(p[1]), x2: r1(q[0]), y2: r1(q[1]), class: Math.abs(g) < 1e-6 ? "axis" : "grid" });
    }
    if (!ctx.thumb) {
      out += ctx.sym.compass(cam.W - 30, 34, 14, cam.north);
      var u = ctx.u, visExt = bd.ext / (cam.zoom || 1), bar = u.roundBar(visExt);
      out += ctx.sym.scaleBar(16, cam.H - 22, bar.m * cam.scale, bar.label, twinH(u, bar.m));
    }
    return out;
  }

  function drawElev(ctx) {
    var S = ctx.S, cam = ctx.cam, out = "", u = ctx.u, ax = cam.axes;
    var f = cam.frame;
    ax.xTicks.forEach(function (t) {
      out += S("line", { x1: t.px, y1: r1(f.y0), x2: t.px, y2: r1(f.y1), class: t.v === 0 ? "axis" : "grid" });
      if (!ctx.thumb) out += S("text", { x: t.px, y: r1(f.y1 + 14), class: "tick", "text-anchor": "middle" }, PS.util.esc(numOnly(u.h(t.v))));
    });
    ax.yTicks.forEach(function (t) {
      out += S("line", { x1: r1(f.x0), y1: t.px, x2: r1(f.x1), y2: t.px, class: t.v === 0 ? "axis" : "grid" });
      if (!ctx.thumb) out += S("text", { x: r1(f.x0 - 6), y: r1(t.px + 3.5), class: "tick", "text-anchor": "end" }, PS.util.esc(numOnly(u.v(t.v))));
    });
    if (!ctx.thumb) {
      var L = u.labels(), datum = (ctx.profile.site && ctx.profile.site.datum) || "AGL";
      out += S("text", { x: r1(f.x1), y: r1(cam.H - 6), class: "axl", "text-anchor": "end" }, PS.util.esc(ax.xLabel + ", " + L.h));
      out += S("text", { x: 6, y: 14, class: "axl" }, PS.util.esc(ax.yLabel + " " + L.v + " " + datum));
    }
    return out;
  }

  function drawAxon(ctx) {
    var S = ctx.S, cam = ctx.cam, out = "", bd = cam.bounds;
    var lo = bd.cx - bd.ext / 2, hi = bd.cx + bd.ext / 2, lo2 = bd.cy - bd.ext / 2, hi2 = bd.cy + bd.ext / 2;
    var st = gridStep(bd.ext), g, a, b;
    for (g = Math.ceil(lo / st) * st; g <= hi; g += st) {
      a = cam.project(g, lo2, 0); b = cam.project(g, hi2, 0);
      out += S("line", { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: Math.abs(g) < 1e-6 ? "axis" : "grid" });
    }
    for (g = Math.ceil(lo2 / st) * st; g <= hi2; g += st) {
      a = cam.project(lo, g, 0); b = cam.project(hi, g, 0);
      out += S("line", { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: Math.abs(g) < 1e-6 ? "axis" : "grid" });
    }
    if (!ctx.thumb) {
      out += ctx.sym.compass(cam.W - 30, 34, 14, cam.north);
      if (cam.hint) out += S("text", { x: 16, y: r1(cam.H - 10), class: "hint" }, PS.util.esc(cam.hint));
    }
    return out;
  }

  function drawRings(ctx) {
    var S = ctx.S, cam = ctx.cam, o = ctx.cam.kind === "elev" ? cam.origin : ctx.origin, out = "";
    ringRadii(ctx.u).forEach(function (rr) {
      var lab;
      if (cam.kind === "plan") {
        var c = cam.project(o.x, o.y, 0), r = rr.m * cam.scale;
        out += S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: r1(r), class: "rring" });
        lab = [c[0] + r * 0.707 + 2, c[1] - r * 0.707 - 2];
      } else if (cam.kind === "axon") {
        var pts = [];
        for (var i = 0; i <= 72; i++) { var a = i / 72 * 2 * Math.PI; pts.push([o.x + rr.m * Math.cos(a), o.y + rr.m * Math.sin(a), 0]); }
        out += S("polyline", { points: PS.cameras.poly(cam, pts), class: "rring" });
        var e = cam.project(o.x + rr.m, o.y, 0);
        lab = [e[0] + 2, e[1] - 2];
      } else {
        if (rr.m > cam.maxR) return;
        var p = cam.projectRZ(rr.m, 0), q = cam.projectRZ(rr.m, cam.maxZ);
        out += S("line", { x1: r1(p[0]), y1: r1(p[1]), x2: r1(q[0]), y2: r1(q[1]), class: "rring" });
        lab = [q[0] + 2, q[1] + 10];
      }
      if (!ctx.thumb) out += S("text", { x: r1(lab[0]), y: r1(lab[1]), class: "lbl small ghostink" }, rr.label);
    });
    return out;
  }

  PS.layers.register({
    id: "grid", label: "Grid", order: 10, chip: null, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var out = ctx.cam.kind === "plan" ? drawPlan(ctx) : ctx.cam.kind === "elev" ? drawElev(ctx) : drawAxon(ctx);
      if (ctx.layers.rings) out += drawRings(ctx);
      return out;
    }
  });

  // chip 7: drawn above by the grid layer; this entry gives the layer bar its chip
  PS.layers.register({
    id: "rings", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.rings) || "Rings",
    order: 11, chip: 7, defaultOn: false, cameras: ["plan", "elev", "axon"],
    draw: function () { return ""; }
  });
})(globalThis.PS);
