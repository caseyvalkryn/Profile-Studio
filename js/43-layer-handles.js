(function (PS) {
  "use strict";

  // Layer handles (edit only, plan and elev): handles of the selected object (sel.i filled), the pre-drag
  // ghost record at 32 percent, the ruler, the placement ghost and the formation member ghost.
  var r1 = PS.cameras.r1, D2R = Math.PI / 180;

  function find(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0] || null; }
  function zOf(cam, v) { return cam.kind === "plan" ? 0 : (v || 0); }
  function P(q) { return Array.isArray(q) ? { x: q[0], y: q[1], z: q[2] || 0 } : { x: q.x, y: q.y, z: q.z || 0 }; }
  function numOnly(s) { return String(s).replace(/\s*[a-zA-Z/]+(\s+[A-Z]+)?$/, ""); }

  function h(ctx, kind, sx, sy, k, id, i, role, extra) {
    extra = extra || {};
    extra.attrs = { "data-k": k, "data-id": id, "data-i": i == null ? null : i, "data-role": role };
    ctx.hit({ kind: k, id: id, i: i == null ? null : i, role: role, sx: sx, sy: sy, r: 5, handle: true });
    return ctx.sym.handle(kind, sx, sy, extra);
  }

  function tag(ctx, x, y, text) {
    return ctx.S("text", { x: r1(x), y: r1(y), class: "hlab" }, PS.util.esc(text));
  }

  // the point on the segment a to b that stays inside the board rect (inset 12 px), so a far ray end stays in reach
  function clipToBoard(cam, a, b) {
    var m = 12, x0 = m, y0 = m, x1 = (cam.W || 0) - m, y1 = (cam.H || 0) - m, f = 1;
    var dx = b[0] - a[0], dy = b[1] - a[1];
    if (!(x1 > x0 && y1 > y0)) return b;
    if (dx > 0 && b[0] > x1) f = Math.min(f, (x1 - a[0]) / dx);
    if (dx < 0 && b[0] < x0) f = Math.min(f, (x0 - a[0]) / dx);
    if (dy > 0 && b[1] > y1) f = Math.min(f, (y1 - a[1]) / dy);
    if (dy < 0 && b[1] < y0) f = Math.min(f, (y0 - a[1]) / dy);
    f = Math.max(0, f);
    return [a[0] + dx * f, a[1] + dy * f];
  }

  // screen angle in degrees of a plan bearing (clockwise from north)
  function scrAngle(brg) { return brg - 90; }

  function pathHandles(ctx, p) {
    var cam = ctx.cam, d = ctx.derived, out = "";
    var w = (d.timed && d.timed[p.id]) || [];
    if (!w.length) return "";
    w.forEach(function (q, i) {
      var s = cam.project(q.x, q.y, zOf(cam, q.z)), hold = (p.pts[i] && p.pts[i].hold) || 0;
      if (cam.kind === "plan" && (ctx.sel.i === i || hold > 0)) {
        var rr = 9 + hold / 10 * 12;
        out += h(ctx, "hold", s[0], s[1], "path", p.id, i, "hold", { r: rr });
        if (hold > 0) out += tag(ctx, s[0] + rr + 6, s[1] - 6, "hold " + Math.round(hold) + " s");
      }
      out += h(ctx, "wp", s[0], s[1], "path", p.id, i, "centre", { filled: ctx.sel.i === i });
      if (cam.kind === "elev" && ctx.sel.i === i) out += tag(ctx, s[0] + 9, s[1] - 9, ctx.u.v(q.z) + " (" + PS.fmt.n(q.z, 0) + " m)");
    });
    for (var i = 0; i < w.length - 1; i++) {
      var m = PS.geo.segmentPoint(w, i, 0.5), ms = cam.project(m.x, m.y, zOf(cam, m.z));
      out += h(ctx, "insert", ms[0], ms[1], "path", p.id, i, "insert");
    }
    return out;
  }

  function systemHandles(ctx, s) {
    var cam = ctx.cam, out = "";
    var c = cam.project(s.x, s.y, zOf(cam, s.z));
    out += h(ctx, "wp", c[0], c[1], "system", s.id, null, "centre", { filled: true });
    if (!(s.range > 0)) return out;
    var lab = s.id + " " + ctx.u.hDual(s.range);
    if (cam.kind === "plan") {
      var R = s.range * cam.scale, sector = s.fov < 360, b = sector ? s.bearing : 90;
      var at = function (brg, f) { return [c[0] + Math.sin(brg * D2R) * R * f, c[1] - Math.cos(brg * D2R) * R * f]; };
      var rp = at(b, 1);
      out += h(ctx, "range", rp[0], rp[1], "system", s.id, null, "range");
      out += tag(ctx, rp[0] + 8, rp[1] - 8, lab);
      if (sector) {
        var e0 = at(s.bearing - s.fov / 2, 1), e1 = at(s.bearing + s.fov / 2, 1), mid = at(s.bearing, 0.85);
        out += h(ctx, "arcEnd", e0[0], e0[1], "system", s.id, null, "arcEnd0", { angle: scrAngle(s.bearing - s.fov / 2) });
        out += h(ctx, "arcEnd", e1[0], e1[1], "system", s.id, null, "arcEnd1", { angle: scrAngle(s.bearing + s.fov / 2) });
        out += h(ctx, "arcMid", mid[0], mid[1], "system", s.id, null, "arcMid");
      }
    } else {
      var o = cam.origin, rs = Math.hypot(s.x - o.x, s.y - o.y), zs = s.z || 0;
      var rr = cam.projectRZ(rs + s.range, zs);
      out += h(ctx, "range", rr[0], rr[1], "system", s.id, null, "range");
      out += tag(ctx, rr[0] - 8, rr[1] - 10, lab).replace('class="hlab"', 'class="hlab" text-anchor="end"');
      [["elRay0", s.elMin, s.elMin > -90], ["elRay1", s.elMax, s.elMax < 90]].forEach(function (e) {
        if (!e[2]) return;
        var a = cam.projectRZ(rs, zs), b2 = cam.projectRZ(rs + s.range * Math.cos(e[1] * D2R), zs + s.range * Math.sin(e[1] * D2R));
        b2 = clipToBoard(cam, a, b2);
        var ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) / D2R;
        out += h(ctx, "elRay", b2[0], b2[1], "system", s.id, null, e[0], { angle: ang });
        out += tag(ctx, b2[0] + 8, b2[1] - 4, (e[0] === "elRay0" ? "elMin " : "elMax ") + Math.round(e[1]) + "°");
      });
    }
    return out;
  }

  function volumeHandles(ctx, v) {
    var cam = ctx.cam, out = "";
    if (cam.kind === "plan") {
      v.pts.forEach(function (q, i) {
        var s = cam.project(q[0], q[1], 0);
        out += h(ctx, "vertex", s[0], s[1], "volume", v.id, i, "vertex", { filled: ctx.sel.i === i });
      });
      v.pts.forEach(function (q, i) {
        var n = v.pts[(i + 1) % v.pts.length], s = cam.project((q[0] + n[0]) / 2, (q[1] + n[1]) / 2, 0);
        out += h(ctx, "edge", s[0], s[1], "volume", v.id, i, "edge");
      });
    } else if (v.zmax > 0) {
      var o = cam.origin, lo = Infinity, hi = 0;
      v.pts.forEach(function (q) { var r = Math.hypot(q[0] - o.x, q[1] - o.y); lo = Math.min(lo, r); hi = Math.max(hi, r); });
      var t = cam.projectRZ((lo + hi) / 2, v.zmax);
      out += h(ctx, "top", t[0], t[1], "volume", v.id, null, "top");
      out += tag(ctx, t[0] + 12, t[1] - 6, ctx.u.v(v.zmax));
    }
    return out;
  }

  function selected(ctx) {
    var sel = ctx.sel, sc = ctx.scene, cam = ctx.cam, d = ctx.derived;
    if (!sel || !sel.kind || sel.id == null) return "";
    if (sel.kind === "path") { var p = find(sc.paths, sel.id); return p ? pathHandles(ctx, p) : ""; }
    if (sel.kind === "system") { var s = find(sc.systems, sel.id); return s ? systemHandles(ctx, s) : ""; }
    if (sel.kind === "volume") { var v = find(sc.volumes, sel.id); return v ? volumeHandles(ctx, v) : ""; }
    if (sel.kind === "plane" && cam.kind === "elev") {
      var pl = find(sc.planes, sel.id);
      if (!pl) return "";
      var m = cam.projectRZ(cam.maxR / 2, pl.z);
      return h(ctx, "line", m[0], m[1], "plane", pl.id, null, "line") + tag(ctx, m[0] + 10, m[1] - 6, ctx.u.v(pl.z));
    }
    if (sel.kind === "event") {
      var e = find(ctx.profile.events, sel.id), w = e && d.timed && d.timed[e.path];
      if (!w || !w.length) return "";
      var q = PS.geo.posAt(w, e.t), bs = cam.project(q.x, q.y, zOf(cam, q.z));
      return h(ctx, "bead", bs[0], bs[1], "event", e.id, null, "bead", { filled: true });
    }
    return "";
  }

  function ghostRecord(ctx) {
    var g = ctx.ghost, S = ctx.S, cam = ctx.cam, out = "";
    if (!g || !g.scene) return "";
    var gd = PS.derive.all(g);
    (g.scene.volumes || []).forEach(function (v) {
      if (cam.kind === "plan" && v.pts && v.pts.length > 2) out += S("polygon", { points: PS.cameras.poly(cam, v.pts), class: "gvol" });
    });
    (g.scene.systems || []).forEach(function (s) {
      var c = cam.project(s.x, s.y, zOf(cam, s.z));
      out += S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: 4, class: "gsys" });
      if (cam.kind === "plan" && s.range > 0) out += S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: r1(s.range * cam.scale), class: "gring" });
    });
    (g.scene.paths || []).forEach(function (p) {
      var w = (gd.timed && gd.timed[p.id]) || [];
      if (w.length > 1) out += S("polyline", { points: PS.cameras.poly(cam, w.map(function (q) { return [q.x, q.y, zOf(cam, q.z)]; })), class: "groute" });
    });
    return out ? S("g", { class: "ghostrec" }, out) : "";
  }

  function rulerEnd(ctx, e) {
    var d = ctx.derived, pid = e.kind === "path" ? e.id : e.pathId;
    if (pid && ctx.t != null && d.timed && d.timed[pid] && d.timed[pid].length) {
      var q = PS.geo.posAt(d.timed[pid], ctx.t);
      return { x: q.x, y: q.y, z: q.z || 0, v: [q.vx || 0, q.vy || 0], track: true };
    }
    return { x: e.x, y: e.y, z: e.z || 0, v: [0, 0], track: false };
  }

  function ruler(ctx) {
    var rl = ctx.ruler, S = ctx.S, cam = ctx.cam, u = ctx.u;
    if (!rl || !rl.a || cam.kind !== "plan") return "";
    var a = rulerEnd(ctx, rl.a), b = rl.b ? rulerEnd(ctx, rl.b) : a;
    var sa = cam.project(a.x, a.y, 0), sb = cam.project(b.x, b.y, 0);
    var out = S("line", { x1: r1(sa[0]), y1: r1(sa[1]), x2: r1(sb[0]), y2: r1(sb[1]), class: "ruler" }) +
      S("circle", { cx: r1(sa[0]), cy: r1(sa[1]), r: 2.5, class: "rulerend" }) +
      S("circle", { cx: r1(sb[0]), cy: r1(sb[1]), r: 2.5, class: "rulerend" });
    var dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    if (dist > 0) {
      var lines = [u.h(dist) + " " + u.brg(PS.geo.bearingTo({ x: a.x, y: a.y }, { x: b.x, y: b.y }))];
      if (a.track && b.track) {
        var vc = -(dx * (b.v[0] - a.v[0]) + dy * (b.v[1] - a.v[1])) / dist, dz = b.z - a.z;
        lines.push("closing " + u.spd(vc), (dz >= 0 ? "+" : "-") + numOnly(u.v(Math.abs(dz))) + " " + u.labels().v);
      }
      var lx = r1((sa[0] + sb[0]) / 2 + 6);
      out += S("text", { x: lx, y: r1((sa[1] + sb[1]) / 2 - 6), class: "rulerl" }, lines.map(function (ln, k) {
        return S("tspan", k ? { x: lx, dy: "1.2em" } : { x: lx }, PS.util.esc(ln));
      }).join(""));
    }
    return S("g", { class: "rulerg" }, out);
  }

  function placingGhost(ctx) {
    var pl = ctx.placing, S = ctx.S, cam = ctx.cam, out = "";
    if (!pl || !pl.kind) return "";
    var pts = (pl.pts || []).map(P);
    var cur = pl.cur ? P(pl.cur) : pl.at ? P(pl.at) : pl.cursor ? P(pl.cursor) : pts.length ? pts[pts.length - 1] : null;
    if (pl.kind === "formation") {
      var path = find(ctx.scene.paths, pl.pathId);
      if (!path || !(path.pts && path.pts.length >= 2)) return "";
      (PS.geo.formationPoints(path.pts, pl.n || 2, pl.spacing || 100) || []).forEach(function (m) {
        if (m.length > 1) out += S("polyline", { points: PS.cameras.poly(cam, m.map(function (q) { return [q.x, q.y, zOf(cam, q.z)]; })), class: "groute form" });
        m.forEach(function (q) { var s = cam.project(q.x, q.y, zOf(cam, q.z)); out += S("circle", { cx: r1(s[0]), cy: r1(s[1]), r: 2, class: "gsys" }); });
      });
      return S("g", { class: "placing" }, out);
    }
    var all = cur && pts.indexOf(cur) < 0 ? pts.concat([cur]) : pts;
    if ((pl.kind === "aircraft" || pl.kind === "volume") && all.length > 1) {
      out += S(pl.kind === "volume" && all.length > 2 ? "polygon" : "polyline", { points: PS.cameras.poly(cam, all.map(function (q) { return [q.x, q.y, zOf(cam, q.z)]; })), class: "groute" });
    }
    pts.forEach(function (q) { var s = cam.project(q.x, q.y, zOf(cam, q.z)); out += S("circle", { cx: r1(s[0]), cy: r1(s[1]), r: 3, class: "gsys" }); });
    if (cur) {
      var c = cam.project(cur.x, cur.y, zOf(cam, cur.z));
      if (pl.kind === "system") {
        var def = (PS.catalog && PS.catalog.SYS_DEFAULTS && PS.catalog.SYS_DEFAULTS[pl.sysKind]) || { range: 0 };
        if (cam.kind === "plan" && def.range > 0) out += S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: r1(def.range * cam.scale), class: "gring" });
        out += S("g", { class: "gframe" }, ctx.sym.groundFrame(pl.sysKind || "radar", "active", c[0], c[1]));
      } else if (pl.kind === "event") {
        out += S("circle", { cx: r1(c[0]), cy: r1(c[1]), r: 6, class: "gbead" });
      } else if (pl.kind === "aircraft") {
        var ar = PS.catalog && typeof PS.catalog.arch === "function" ? PS.catalog.arch(pl.arch) : null;
        out += S("g", { class: "gframe" }, ctx.sym.airFrame(ar && ar.role === "surrogate" ? "neutral" : "hostile", "normal", c[0], c[1]));
      }
      // the snap label shows only in #bd-label (board panel), not in the SVG
      out += S("path", { d: "M" + r1(c[0] - 12) + "," + r1(c[1]) + "H" + r1(c[0] + 12) + "M" + r1(c[0]) + "," + r1(c[1] - 12) + "V" + r1(c[1] + 12), class: "xhair" });
    }
    return out ? S("g", { class: "placing" }, out) : "";
  }

  PS.layers.register({
    id: "handles", label: "Handles", order: 85, chip: null, defaultOn: true, cameras: ["plan", "elev"],
    draw: function (ctx) {
      if (!ctx.edit || ctx.thumb || (ctx.cam.kind !== "plan" && ctx.cam.kind !== "elev")) return "";
      return ghostRecord(ctx) + selected(ctx) + placingGhost(ctx) + ruler(ctx);
    }
  });
})(globalThis.PS);
