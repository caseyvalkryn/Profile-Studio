(function (PS) {
  "use strict";

  // Three cameras: plan, elev, axon (contract section 12).
  // Each setup(scene, derived, size, view, opts) returns a cam. Every camera applies the viewer
  // transform after its base mapping: sx = base_x * zoom + px, sy = base_y * zoom + py.

  var D2R = Math.PI / 180;

  function r1(v) { return Math.round(v * 10) / 10; }

  function viewer(view) {
    var z = view && typeof view.zoom === "number" && view.zoom > 0 ? view.zoom : 1;
    return { zoom: z, px: (view && view.px) || 0, py: (view && view.py) || 0 };
  }

  function gridStep(ext) {
    if (PS.geo && PS.geo.gridStep) return PS.geo.gridStep(ext);
    return ext > 24000 ? 5000 : ext > 12000 ? 2000 : ext > 4000 ? 1000 : 500;
  }

  function boundsOf(scene, view) {
    if (view && view.bounds) return view.bounds;
    return PS.geo.bounds(scene);
  }

  function originOf(derived, ref) {
    if (derived && typeof derived.originAt === "function") return derived.originAt(ref || "asset", null, null);
    return (derived && derived.origin) || { x: 0, y: 0, z: 0 };
  }

  function allPts(scene) {
    var out = [];
    ((scene && scene.paths) || []).forEach(function (p) { (p.pts || []).forEach(function (q) { out.push(q); }); });
    return out;
  }

  function maxZOf(scene) {
    var m = 0;
    allPts(scene).forEach(function (q) { m = Math.max(m, q.z || 0); });
    ((scene && scene.volumes) || []).forEach(function (v) { m = Math.max(m, v.zmax || 0); });
    ((scene && scene.planes) || []).forEach(function (p) { m = Math.max(m, p.z || 0); });
    return m;
  }

  // ---------------------------------------------------------------- plan
  var plan = {
    kind: "plan",
    setup: function (scene, derived, size, view, opts) {
      opts = opts || {};
      var W = size.W, H = size.H, m = opts.thumb ? 8 : 28;
      var b = boundsOf(scene, view), cx = b.cx, cy = b.cy, ext = b.ext;
      var k = (Math.min(W, H) - 2 * m) / ext;
      var ox = (W - ext * k) / 2, oy = (H - ext * k) / 2;
      var v = viewer(view);
      function project(x, y) {
        var bx = ox + (x - cx + ext / 2) * k, by = H - oy - (y - cy + ext / 2) * k;
        return [bx * v.zoom + v.px, by * v.zoom + v.py];
      }
      function unproject(sx, sy) {
        var bx = (sx - v.px) / v.zoom, by = (sy - v.py) / v.zoom;
        return { x: (bx - ox) / k + cx - ext / 2, y: cy - ext / 2 + (H - oy - by) / k };
      }
      var st = gridStep(ext), xTicks = [], yTicks = [], g;
      for (g = Math.ceil((cx - ext / 2) / st) * st; g <= cx + ext / 2; g += st) xTicks.push({ v: g, px: r1(project(g, cy)[0]) });
      for (g = Math.ceil((cy - ext / 2) / st) * st; g <= cy + ext / 2; g += st) yTicks.push({ v: g, px: r1(project(cx, g)[1]) });
      var a = project(cx - ext / 2, cy + ext / 2), c = project(cx + ext / 2, cy - ext / 2);
      return {
        kind: "plan", W: W, H: H, scale: k * v.zoom, zoom: v.zoom,
        bounds: { cx: cx, cy: cy, ext: ext },
        frame: { x0: a[0], y0: a[1], x1: c[0], y1: c[1] },
        project: project, unproject: unproject,
        axes: { xTicks: xTicks, yTicks: yTicks, xLabel: "East", yLabel: "North" },
        preserveAspectRatio: "xMidYMid meet",
        hint: null, north: 0,
        origin: originOf(derived, view && view.ref)
      };
    }
  };

  // ---------------------------------------------------------------- elevation
  function refName(scene, ref) {
    var sys = ((scene && scene.systems) || []).filter(function (s) { return s.id === ref; })[0];
    return sys ? sys.id : "asset";
  }

  var elev = {
    kind: "elev",
    setup: function (scene, derived, size, view, opts) {
      opts = opts || {};
      var W = size.W, H = size.H, th = !!opts.thumb;
      var ml = th ? 8 : 52, mr = th ? 8 : 20, mt = th ? 8 : 24, mb = th ? 8 : 36;
      var o = originOf(derived, view && view.ref);
      var maxR = 0, maxZ = 0;
      allPts(scene).forEach(function (q) { maxR = Math.max(maxR, Math.hypot(q.x - o.x, q.y - o.y)); maxZ = Math.max(maxZ, q.z || 0); });
      ((scene && scene.systems) || []).forEach(function (s) { maxR = Math.max(maxR, s.range || 0); maxZ = Math.max(maxZ, s.z || 0); });
      ((scene && scene.volumes) || []).forEach(function (vv) { maxZ = Math.max(maxZ, vv.zmax || 0); });
      ((scene && scene.planes) || []).forEach(function (p) { maxZ = Math.max(maxZ, p.z || 0); });
      maxR = Math.max(1.05 * maxR, 1000);
      maxZ = Math.max(1.3 * maxZ, 150);
      var v = viewer(view);
      var kx = (W - ml - mr) / maxR, kz = (H - mt - mb) / maxZ;
      function projectRZ(r, z) {
        return [(ml + r * kx) * v.zoom + v.px, (H - mb - z * kz) * v.zoom + v.py];
      }
      function project(x, y, z) { return projectRZ(Math.hypot(x - o.x, y - o.y), z || 0); }
      function unproject(sx, sy) {
        var bx = (sx - v.px) / v.zoom, by = (sy - v.py) / v.zoom;
        return { r: (bx - ml) / kx, z: (H - mb - by) / kz };
      }
      var rs = gridStep(maxR), zs = maxZ > 1500 ? 500 : maxZ > 500 ? 200 : 50, xTicks = [], yTicks = [], g;
      for (g = 0; g <= maxR; g += rs) xTicks.push({ v: g, px: r1(projectRZ(g, 0)[0]) });
      for (g = 0; g <= maxZ; g += zs) yTicks.push({ v: g, px: r1(projectRZ(0, g)[1]) });
      var a = projectRZ(0, maxZ), c = projectRZ(maxR, 0);
      return {
        kind: "elev", W: W, H: H, scale: kx * v.zoom, scaleZ: kz * v.zoom, zoom: v.zoom,
        maxR: maxR, maxZ: maxZ,
        frame: { x0: a[0], y0: a[1], x1: c[0], y1: c[1] },
        project: project, projectRZ: projectRZ, unproject: unproject,
        axes: { xTicks: xTicks, yTicks: yTicks, xLabel: "Range from " + refName(scene, view && view.ref), yLabel: "Height" },
        preserveAspectRatio: "none",
        hint: null, north: 0,
        origin: o
      };
    }
  };

  // ---------------------------------------------------------------- axonometric
  var axon = {
    kind: "axon",
    setup: function (scene, derived, size, view, opts) {
      opts = opts || {};
      var W = size.W, H = size.H, m = opts.thumb ? 8 : 20;
      var b = boundsOf(scene, view), cx = b.cx, cy = b.cy, ext = b.ext;
      var maxZ = Math.max(1, maxZOf(scene));
      var zx = Math.max(1, Math.round(0.14 * ext / maxZ));
      var yawD = view && typeof view.yaw === "number" ? view.yaw : -35;
      var pitchD = view && typeof view.pitch === "number" ? view.pitch : 55;
      var yaw = yawD * D2R, pitch = pitchD * D2R;
      var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      function pr(x, y, z) {
        var dx = x - cx, dy = y - cy;
        return [dx * cyw - dy * syw, (dx * syw + dy * cyw) * sp + (z || 0) * zx * cp];
      }
      var cs = [[cx - ext / 2, cy - ext / 2, 0], [cx + ext / 2, cy - ext / 2, 0], [cx + ext / 2, cy + ext / 2, 0],
        [cx - ext / 2, cy + ext / 2, 0], [cx, cy, maxZ]].map(function (q) { return pr(q[0], q[1], q[2]); });
      var xs = cs.map(function (q) { return q[0]; }), ys = cs.map(function (q) { return q[1]; });
      var xspan = Math.max(1e-9, Math.max.apply(null, xs) - Math.min.apply(null, xs));
      var yspan = Math.max(1e-9, Math.max.apply(null, ys) - Math.min.apply(null, ys));
      var k = Math.min((W - 2 * m) / xspan, (H - 2 * m) / yspan);
      var ox = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2;
      var oy = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
      var v = viewer(view);
      function project(x, y, z) {
        var q = pr(x, y, z);
        return [(W / 2 + (q[0] - ox) * k) * v.zoom + v.px, (H / 2 - (q[1] - oy) * k) * v.zoom + v.py];
      }
      // screen direction of north: the ground vector (0, 1, 0)
      var nx = -syw, ny = -(cyw * sp);
      var north = Math.atan2(nx, -ny) / D2R;
      var st = gridStep(ext), xTicks = [], yTicks = [], g;
      for (g = Math.ceil((cx - ext / 2) / st) * st; g <= cx + ext / 2; g += st) xTicks.push({ v: g, px: null });
      for (g = Math.ceil((cy - ext / 2) / st) * st; g <= cy + ext / 2; g += st) yTicks.push({ v: g, px: null });
      return {
        kind: "axon", W: W, H: H, scale: k * v.zoom, zoom: v.zoom, zx: zx, yaw: yawD, pitch: pitchD,
        bounds: { cx: cx, cy: cy, ext: ext },
        frame: { x0: m, y0: m, x1: W - m, y1: H - m },
        project: project,
        unproject: function () { return null; },
        axes: { xTicks: xTicks, yTicks: yTicks, xLabel: "East", yLabel: "North" },
        preserveAspectRatio: "xMidYMid meet",
        hint: "vertical x" + zx + "  yaw " + Math.round(yawD) + "°  pitch " + Math.round(pitchD) + "°",
        north: north,
        origin: originOf(derived, view && view.ref)
      };
    },
    // drag rotation (contract 12): yaw += dx * 0.45, pitch = clamp(pitch + dy * 0.35, 8, 86)
    rotate: function (yaw, pitch, dxPx, dyPx) {
      return { yaw: yaw + dxPx * 0.45, pitch: PS.util.clamp(pitch + dyPx * 0.35, 8, 86) };
    }
  };

  // "x,y x,y" point list through cam.project; pts are {x,y,z} or [x,y(,z)]
  function poly(cam, pts) {
    return pts.map(function (q) {
      var s = Array.isArray(q) ? cam.project(q[0], q[1], q[2] || 0) : cam.project(q.x, q.y, q.z || 0);
      return r1(s[0]) + "," + r1(s[1]);
    }).join(" ");
  }

  PS.cameras = {
    plan: plan, elev: elev, axon: axon,
    get: function (kind) { return PS.cameras[kind === "elev" || kind === "axon" ? kind : "plan"]; },
    poly: poly,
    r1: r1
  };
})(globalThis.PS);
