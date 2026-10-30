(function (PS) {
  "use strict";

  // Layer planes: height planes. Elevation draws a line at z; axonometric a square at z over the bounds.
  var r1 = PS.cameras.r1, poly = PS.cameras.poly;

  PS.layers.register({
    id: "planes", label: "Planes", order: 25, chip: null, defaultOn: true, cameras: ["elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, out = "";
      if (cam.kind !== "elev" && cam.kind !== "axon") return "";
      (ctx.scene.planes || []).forEach(function (p) {
        var c = "plane" + ctx.cls(p.id) + ctx.dim(p.id), at = { "data-k": "plane", "data-id": p.id }, lp;
        if (cam.kind === "elev") {
          var a = cam.projectRZ(0, p.z), b = cam.projectRZ(cam.maxR, p.z);
          out += S("line", Object.assign({ x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: c }, at));
          ctx.hit({ kind: "plane", id: p.id, i: null, role: "line", sx: a[0], sy: a[1], r: 0, seg: [a, b] });
          lp = [b[0] - 4, b[1] - 4];
        } else {
          var bd = cam.bounds, lo = bd.cx - bd.ext / 2, hi = bd.cx + bd.ext / 2, lo2 = bd.cy - bd.ext / 2, hi2 = bd.cy + bd.ext / 2;
          out += S("polygon", Object.assign({ points: poly(cam, [[lo, lo2, p.z], [hi, lo2, p.z], [hi, hi2, p.z], [lo, hi2, p.z]]), class: c }, at));
          var q = cam.project(lo, hi2, p.z);
          lp = [q[0] + 4, q[1] - 4];
        }
        if (!ctx.thumb && p.label) {
          var anchor = cam.kind === "elev" ? "end" : "start";
          ctx.label({ p: 5, id: p.id, box: ctx.sym.textBox(lp[0], lp[1], p.label, 11.5, anchor), svg: ctx.sym.label(lp[0], lp[1], p.label, "pl" + ctx.dim(p.id), anchor) });
        }
      });
      return out;
    }
  });
})(globalThis.PS);
