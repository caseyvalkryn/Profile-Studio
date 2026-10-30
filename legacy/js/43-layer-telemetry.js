(function (PS) {
  "use strict";

  // Layer telemetry (chip 5): planned TSPI samples, station links at t, flown samples and the flown frame at t.
  var r1 = PS.cameras.r1;

  function z(cam, v) { return cam.kind === "plan" ? 0 : (v || 0); }

  // position on a flown list: geo timed points ({t0, t1}) or resampled samples ({t})
  function flownAt(list, t) {
    if (list[0].t0 != null) return PS.geo.posAt(list, t);
    if (t <= list[0].t) return list[0];
    for (var i = 1; i < list.length; i++) {
      var a = list[i - 1], b = list[i];
      if (t <= b.t) {
        var f = (t - a.t) / ((b.t - a.t) || 1);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      }
    }
    return list[list.length - 1];
  }

  PS.layers.register({
    id: "telemetry", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.telemetry) || "Telemetry",
    order: 65, chip: 5, defaultOn: false, cameras: ["plan", "elev", "axon"],
    draw: function (ctx) {
      var S = ctx.S, cam = ctx.cam, d = ctx.derived, rec = ctx.profile, out = "";
      var tm = rec.telemetry || {}, step = tm.interval > 0 ? tm.interval : 20;
      var sysById = {};
      (ctx.scene.systems || []).forEach(function (s) { sysById[s.id] = s; });
      (ctx.scene.paths || []).forEach(function (p) {
        var w = d.timed && d.timed[p.id];
        if (!w || !w.length) return;
        var dim = ctx.dim(p.id), inner = "", end = w[w.length - 1].t1, t, q, s;
        for (t = 0; t <= end + 1e-6; t += step) {
          q = PS.geo.posAt(w, t); s = cam.project(q.x, q.y, z(cam, q.z));
          inner += S("rect", { x: r1(s[0] - 1.3), y: r1(s[1] - 1.3), width: 2.6, height: 2.6, class: "tel" });
        }
        var here = null;
        if (ctx.t != null) {
          q = PS.geo.posAt(w, ctx.t); here = cam.project(q.x, q.y, z(cam, q.z));
          (tm.stations || []).forEach(function (id) {
            var b = sysById[id];
            if (!b) return;
            var c = cam.project(b.x, b.y, z(cam, b.z));
            inner += S("line", { x1: r1(c[0]), y1: r1(c[1]), x2: r1(here[0]), y2: r1(here[1]), class: "tell" });
          });
        }
        var raw = rec.debrief && rec.debrief.tspi && rec.debrief.tspi[p.id];
        if (raw && raw.length) {
          var every = Math.max(1, Math.ceil(raw.length / 200));
          raw.forEach(function (smp, i) {
            if (i % every) return;
            var fs = cam.project(smp[1], smp[2], z(cam, smp[3]));
            inner += S("rect", { x: r1(fs[0] - 2), y: r1(fs[1] - 2), width: 4, height: 4, class: "flsq" });
          });
        }
        var fl = d.flown && d.flown[p.id];
        if (here && fl && fl.timed && fl.timed.length) {
          var last = fl.timed[fl.timed.length - 1];
          if (ctx.t <= (last.t1 != null ? last.t1 : last.t)) {
            var fq = flownAt(fl.timed, ctx.t), fp = cam.project(fq.x, fq.y, z(cam, fq.z));
            inner += S("line", { x1: r1(fp[0]), y1: r1(fp[1]), x2: r1(here[0]), y2: r1(here[1]), class: "fllink" });
            inner += S("g", { class: "flownfr" }, ctx.sym.airFrame(p.identity || "hostile", "lost", fp[0], fp[1], ctx.thumb ? 4 : 7));
          }
        }
        if (inner) out += S("g", { class: "telem" + dim, "data-k": "path", "data-id": p.id }, inner);
      });
      return out;
    }
  });
})(globalThis.PS);
