(function (PS) {
  "use strict";

  // Layer envelopes (chip 3): one hull per link cluster at t, or at each profile snapshot when t is null.
  var r1 = PS.cameras.r1;

  function xy(q) { return Array.isArray(q) ? q : [q.x, q.y]; }

  PS.layers.register({
    id: "envelopes", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.envelopes) || "Envelopes",
    order: 50, chip: 3, defaultOn: true, cameras: ["plan", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, d = ctx.derived, out = "";
      if (cam.kind === "elev" || typeof d.envelopesAt !== "function") return "";
      var times = ctx.t != null ? [ctx.t] : (ctx.profile.snapshots || []);
      times.forEach(function (t) {
        (d.envelopesAt(t) || []).forEach(function (env) {
          var hull = (env.hull || []).map(xy);
          if (!hull.length) return;
          var members = env.members || [];
          var gid = (d.groupOf && members.length && d.groupOf[members[0]]) || members[0] || "group";
          var dim = members.length && members.every(function (m) { return ctx.dim(m); }) ? " dim" : "";
          var c = "hull" + ctx.cls(gid) + dim + (hull.length < 3 ? " thin" : "");
          var spts = hull.map(function (q) { return cam.project(q[0], q[1], 0); });
          var pts = spts.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" ");
          out += S(hull.length < 3 ? "polyline" : "polygon", { points: pts, class: c, "data-k": "group", "data-id": gid });
          if (hull.length >= 3) ctx.hit({ kind: "group", id: gid, i: null, role: null, sx: spts[0][0], sy: spts[0][1], r: 0, poly: spts });
          if (!ctx.thumb && ctx.t == null) {
            var top = spts.reduce(function (a, b) { return b[1] < a[1] ? b : a; });
            var text = ctx.u.t(t);
            ctx.label({ p: 5, id: gid, box: ctx.sym.textBox(top[0], top[1] - 6, text, 10, "middle"), svg: ctx.sym.label(top[0], top[1] - 6, text, "small hl" + dim, "middle") });
          }
        });
      });
      return out;
    }
  });
})(globalThis.PS);
