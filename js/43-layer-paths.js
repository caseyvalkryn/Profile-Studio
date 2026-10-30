(function (PS) {
  "use strict";

  // Layer paths: planned routes in the identity ink, hold rings, waypoint dots, one-point warning.
  var r1 = PS.cameras.r1;

  function timedOf(ctx, p) {
    var t = ctx.derived.timed && ctx.derived.timed[p.id];
    if (t && t.length) return t;
    return (p.pts || []).map(function (q) { return { x: q.x, y: q.y, z: q.z || 0, t0: 0, t1: q.hold || 0 }; });
  }

  // screen points of the route; elevation subdivides legs because range from the origin is not linear
  function routePts(cam, w) {
    var out = [];
    w.forEach(function (q, i) {
      if (cam.kind === "elev" && i > 0) {
        var a = w[i - 1], n = 12;
        for (var k = 1; k < n; k++) {
          var f = k / n;
          out.push(cam.project(a.x + (q.x - a.x) * f, a.y + (q.y - a.y) * f, a.z + (q.z - a.z) * f));
        }
      }
      out.push(cam.project(q.x, q.y, cam.kind === "plan" ? 0 : q.z));
    });
    return out;
  }

  function str(pts) { return pts.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" "); }

  PS.layers.register({
    id: "paths", label: "Paths", order: 60, chip: null, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, out = "", paths = ctx.scene.paths || [];
      paths.forEach(function (p) {
        var w = timedOf(ctx, p);
        if (!w.length) return;
        var selP = ctx.sel.kind === "path" && ctx.sel.id === p.id;
        var wt = ctx.focus.indexOf(p.id) >= 0 ? " w3" : selP || paths.length < 2 ? " w2" : " w1";
        var ink = " id-" + (p.identity || "hostile"), dim = ctx.dim(p.id);
        var spts = routePts(cam, w), inner = "";
        if (cam.kind === "axon") {
          inner += S("polyline", { points: PS.cameras.poly(cam, w.map(function (q) { return [q.x, q.y, 0]; })), class: "shadow" + ink });
          w.forEach(function (q) {
            var a = cam.project(q.x, q.y, q.z), b = cam.project(q.x, q.y, 0);
            inner += S("line", { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: "drop" });
          });
        }
        if (spts.length > 1) inner += S("polyline", { points: str(spts), class: "route" + ink + wt + ctx.cls(p.id) });
        w.forEach(function (q) {
          var s = cam.project(q.x, q.y, cam.kind === "plan" ? 0 : q.z);
          inner += S("circle", { cx: r1(s[0]), cy: r1(s[1]), r: ctx.thumb ? 1.2 : 1.8, class: "wpd" + ink });
          if (q.t1 > q.t0 && cam.kind === "plan" && !ctx.thumb) inner += S("circle", { cx: r1(s[0]), cy: r1(s[1]), r: 8, class: "holdring" + ink });
        });
        if (w.length === 1 && !ctx.thumb) inner += ctx.sym.warn(spts[0][0] + 12, spts[0][1] - 10);
        out += S("g", { class: "path" + dim, "data-k": "path", "data-id": p.id }, inner);
        ctx.hit({ kind: "path", id: p.id, i: null, role: null, sx: spts[0][0], sy: spts[0][1], r: 0, seg: spts });
        if (!ctx.thumb) {
          var a0 = spts[0], x = a0[0] + 6, y = a0[1] + 14;
          ctx.label({ p: 2, id: p.id, box: ctx.sym.textBox(x, y, p.id, 11.5), svg: ctx.sym.label(x, y, p.id, "pid" + ink + dim) });
          if (selP || paths.length <= 2) {
            w.forEach(function (q, i) {
              var s = cam.project(q.x, q.y, cam.kind === "plan" ? 0 : q.z), lx = s[0] + 6, ly = s[1] - 6, n = String(i + 1);
              ctx.label({ p: 6, id: p.id, box: ctx.sym.textBox(lx, ly, n, 10), svg: ctx.sym.label(lx, ly, n, "small wpn" + dim) });
            });
          }
        }
      });
      return out;
    }
  });
})(globalThis.PS);
