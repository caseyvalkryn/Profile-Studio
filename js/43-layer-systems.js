(function (PS) {
  "use strict";

  // Layer systems: ground frames by kind, status marks, selection ring, system id labels.
  var r1 = PS.cameras.r1;

  PS.layers.register({
    id: "systems", label: "Systems", order: 40, chip: null, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, out = "";
      (ctx.scene.systems || []).forEach(function (s) {
        var p = cam.project(s.x, s.y, cam.kind === "plan" ? 0 : (s.z || 0));
        var inner = "";
        if (cam.kind === "axon" && s.z > 0) {
          var g = cam.project(s.x, s.y, 0);
          inner += S("line", { x1: r1(g[0]), y1: r1(g[1]), x2: r1(p[0]), y2: r1(p[1]), class: "drop" });
        }
        var c = ctx.cls(s.id);
        if (c) inner += S("circle", { cx: r1(p[0]), cy: r1(p[1]), r: 11, class: "selring" + c });
        if (ctx.thumb) {
          inner += S("circle", { cx: r1(p[0]), cy: r1(p[1]), r: 2.5, class: "gfk gf-dot" });
        } else {
          inner += ctx.sym.groundFrame(s.kind, s.status, p[0], p[1]);
        }
        out += S("g", { class: "sys" + c + ctx.dim(s.id), "data-k": "system", "data-id": s.id, "data-role": "centre" }, inner);
        ctx.hit({ kind: "system", id: s.id, i: null, role: "centre", sx: p[0], sy: p[1], r: 7, handle: true });
        if (!ctx.thumb) {
          var x = p[0] + 10, y = p[1] + 14;
          ctx.label({ p: 4, id: s.id, box: ctx.sym.textBox(x, y, s.id, 11.5), svg: ctx.sym.label(x, y, s.id, "sl lid" + ctx.dim(s.id)) });
        }
      });
      return out;
    }
  });
})(globalThis.PS);
