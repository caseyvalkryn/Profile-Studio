(function (PS) {
  "use strict";

  // Layer volumes: defended asset, engagement zone, no fly volume, reference pattern.
  var r1 = PS.cameras.r1, poly = PS.cameras.poly;

  function centroid(pts) {
    var x = 0, y = 0;
    pts.forEach(function (q) { x += q[0]; y += q[1]; });
    return [x / pts.length, y / pts.length];
  }

  function inside(pt, pts) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // nearest and farthest horizontal distance of the footprint from o
  function rSpan(pts, o) {
    var lo = Infinity, hi = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      hi = Math.max(hi, Math.hypot(a[0] - o.x, a[1] - o.y));
      var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      var f = L > 0 ? Math.max(0, Math.min(1, ((o.x - a[0]) * dx + (o.y - a[1]) * dy) / L)) : 0;
      lo = Math.min(lo, Math.hypot(a[0] + f * dx - o.x, a[1] + f * dy - o.y));
    }
    if (inside([o.x, o.y], pts)) lo = 0;
    return [lo, hi];
  }

  PS.layers.register({
    id: "volumes", label: "Volumes", order: 20, chip: null, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, out = "";
      (ctx.scene.volumes || []).forEach(function (v) {
        if (!v.pts || v.pts.length < 2) return;
        var c = "vol vol-" + v.kind + ctx.cls(v.id) + ctx.dim(v.id);
        var at = { "data-k": "volume", "data-id": v.id };
        var lp;
        if (cam.kind === "plan") {
          var spts = v.pts.map(function (q) { return cam.project(q[0], q[1], 0); });
          out += S("polygon", Object.assign({ points: poly(cam, v.pts), class: c }, at));
          ctx.hit({ kind: "volume", id: v.id, i: null, role: null, sx: spts[0][0], sy: spts[0][1], r: 0, poly: spts });
          if (v.kind === "asset" && !ctx.thumb) {
            var ce = centroid(v.pts), cs = cam.project(ce[0], ce[1], 0);
            out += S("g", Object.assign({ class: "vsym" + ctx.dim(v.id) }, at), ctx.sym.groundFrame("asset", "active", cs[0], cs[1]));
          }
          lp = spts[0];
        } else if (cam.kind === "elev") {
          var rs = rSpan(v.pts, cam.origin), z0 = v.zmin || 0, z1 = v.zmax || 0;
          var a = cam.projectRZ(rs[0], z1 > z0 ? z1 : z0), b = cam.projectRZ(rs[1], z0);
          if (z1 > z0) {
            out += S("rect", Object.assign({ x: r1(a[0]), y: r1(a[1]), width: r1(Math.max(1, b[0] - a[0])), height: r1(Math.max(1, b[1] - a[1])), class: c }, at));
          } else {
            out += S("line", Object.assign({ x1: r1(a[0]), y1: r1(b[1]), x2: r1(b[0]), y2: r1(b[1]), class: c + " flat" }, at));
          }
          ctx.hit({ kind: "volume", id: v.id, i: null, role: null, sx: a[0], sy: a[1], r: 0, poly: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]] });
          lp = [a[0], a[1]];
        } else {
          var zb = v.zmin || 0;
          out += S("polygon", Object.assign({ points: poly(cam, v.pts.map(function (q) { return [q[0], q[1], zb]; })), class: c }, at));
          if (v.zmax > zb) {
            out += S("polygon", Object.assign({ points: poly(cam, v.pts.map(function (q) { return [q[0], q[1], v.zmax]; })), class: c }, at));
            v.pts.forEach(function (q) {
              var p0 = cam.project(q[0], q[1], zb), p1 = cam.project(q[0], q[1], v.zmax);
              out += S("line", { x1: r1(p0[0]), y1: r1(p0[1]), x2: r1(p1[0]), y2: r1(p1[1]), class: c + " edge" });
            });
          }
          if (v.kind === "asset" && !ctx.thumb) {
            var ca = centroid(v.pts), cp = cam.project(ca[0], ca[1], 0);
            out += S("g", Object.assign({ class: "vsym" + ctx.dim(v.id) }, at), ctx.sym.groundFrame("asset", "active", cp[0], cp[1]));
          }
          lp = cam.project(v.pts[0][0], v.pts[0][1], v.zmax || 0);
        }
        if (!ctx.thumb && v.label) {
          var x = lp[0] + 4, y = lp[1] - 4;
          ctx.label({ p: 5, id: v.id, box: ctx.sym.textBox(x, y, v.label, 11.5), svg: ctx.sym.label(x, y, v.label, "vl" + ctx.dim(v.id)) });
        }
      });
      return out;
    }
  });
})(globalThis.PS);
