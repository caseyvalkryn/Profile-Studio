(function (PS) {
  "use strict";
  // Pure geometry. No catalog, no store, no DOM. Metres and seconds.

  var G = PS.geo = {};
  var DEG = 180 / Math.PI;

  // ---------------------------------------------------------------- timing (v1: leg time = 3D length / speed)
  G.timed = function (pts, speed) {
    var v = speed > 0 ? speed : 15, t = 0, out = [];
    (pts || []).forEach(function (q, i) {
      if (i > 0) {
        var a = pts[i - 1];
        t += Math.hypot(q.x - a.x, q.y - a.y, (q.z || 0) - (a.z || 0)) / v;
      }
      var h = q.hold || 0;
      out.push({ x: q.x, y: q.y, z: q.z || 0, t0: t, t1: t + h });
      t += h;
    });
    return out;
  };

  function endOf(w) { return w && w.length ? w[w.length - 1].t1 : 0; }

  G.tmax = function (timedList) {
    var list = Array.isArray(timedList) ? timedList : Object.keys(timedList || {}).map(function (k) { return timedList[k]; });
    var m = 0;
    list.forEach(function (w) { if (w && w.length) m = Math.max(m, endOf(w)); });
    return Math.max(m, 60);
  };

  function heading(a, b) {
    var L = Math.hypot(b.x - a.x, b.y - a.y);
    return L ? { hx: (b.x - a.x) / L, hy: (b.y - a.y) / L } : { hx: 1, hy: 0 };
  }
  function legVel(a, b) {
    var dt = b.t0 - a.t1;
    if (!(dt > 0)) return { vx: 0, vy: 0, vz: 0 };
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt, vz: (b.z - a.z) / dt };
  }
  function out(p, h, v, leg, holding) {
    return { x: p.x, y: p.y, z: p.z, hx: h.hx, hy: h.hy, vx: v.vx, vy: v.vy, vz: v.vz, leg: leg, holding: holding };
  }
  var V0 = { vx: 0, vy: 0, vz: 0 };

  G.posAt = function (w, t) {
    if (!w || !w.length) return out({ x: 0, y: 0, z: 0 }, { hx: 1, hy: 0 }, V0, 0, false);
    var n = w.length;
    if (n === 1) {
      var only = w[0];
      return out(only, { hx: 1, hy: 0 }, V0, 0, only.t1 > only.t0 && t >= only.t0 && t <= only.t1);
    }
    if (t == null || t < w[0].t0) t = w[0].t0;
    for (var i = 0; i < n; i++) {
      var a = w[i], b = w[i + 1];
      if (t <= a.t1) {
        var hold = a.t1 > a.t0;
        if (!b) return out(a, heading(w[i - 1], a), V0, i - 1, hold && t >= a.t0);
        return out(a, heading(a, b), hold ? V0 : legVel(a, b), i, hold);
      }
      if (!b) return out(a, heading(w[i - 1], a), V0, i - 1, false);
      if (t <= b.t0) {
        var f = (t - a.t1) / Math.max(1e-9, b.t0 - a.t1);
        return out({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
          heading(a, b), legVel(a, b), i, false);
      }
    }
    var e = w[n - 1];
    return out(e, heading(w[n - 2], e), V0, n - 2, false);
  };

  G.tAtPoint = function (w, x, y) {
    var best = { d: Infinity, t: 0 };
    if (!w || !w.length) return 0;
    if (w.length === 1) return w[0].t0;
    for (var i = 0; i < w.length - 1; i++) {
      var a = w[i], b = w[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
      var f = ((x - a.x) * dx + (y - a.y) * dy) / L;
      f = Math.max(0, Math.min(1, f));
      var d = Math.hypot(a.x + dx * f - x, a.y + dy * f - y);
      if (d < best.d) best = { d: d, t: a.t1 + (b.t0 - a.t1) * f };
    }
    return best.t;
  };

  // nearest point in (horizontal range from origin, height) space; legs sampled at 64 steps
  G.tAtRZ = function (w, r, z, origin) {
    if (!w || !w.length) return 0;
    var o = origin || { x: 0, y: 0 }, best = { d: Infinity, t: w[0].t0 };
    function test(p, t) {
      var d = Math.hypot(Math.hypot(p.x - o.x, p.y - o.y) - r, p.z - z);
      if (d < best.d) best = { d: d, t: t };
    }
    test(w[0], w[0].t0);
    for (var i = 0; i < w.length - 1; i++) {
      var a = w[i], b = w[i + 1];
      for (var k = 1; k <= 64; k++) {
        var f = k / 64;
        test({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }, a.t1 + (b.t0 - a.t1) * f);
      }
    }
    return best.t;
  };

  function d3(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }

  G.pathLength = function (w) {
    var L = 0;
    for (var i = 1; i < (w || []).length; i++) L += d3(w[i - 1], w[i]);
    return L;
  };

  G.remaining = function (w, t) {
    if (!w || !w.length) return { metres: 0, holds: 0 };
    var p = G.posAt(w, t), metres = 0, holds = 0, tt = t == null ? w[0].t0 : t;
    var startLeg = -1;
    for (var i = 0; i < w.length; i++) {
      if (w[i].t0 > tt) { startLeg = i; break; }
    }
    if (startLeg > 0) {
      metres += d3(p, w[startLeg]);
      for (var j = startLeg + 1; j < w.length; j++) metres += d3(w[j - 1], w[j]);
    }
    w.forEach(function (q) { if (q.t1 > tt) holds += q.t1 - Math.max(q.t0, tt); });
    return { metres: metres, holds: holds };
  };

  // ---------------------------------------------------------------- plan shapes
  G.hull = function (pts) {
    var s = (pts || []).slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (s.length < 3) return s;
    var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lo = [], up = [], i, q;
    for (i = 0; i < s.length; i++) {
      q = s[i];
      while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
      lo.push(q);
    }
    for (i = s.length - 1; i >= 0; i--) {
      q = s[i];
      while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
      up.push(q);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };

  G.spread = function (pts) {
    if (!pts || !pts.length) return 0;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    });
    return Math.hypot(x1 - x0, y1 - y0);
  };

  G.bounds = function (scene) {
    var xs = [], ys = [], s = scene || {};
    (s.paths || []).forEach(function (p) { (p.pts || []).forEach(function (q) { xs.push(q.x); ys.push(q.y); }); });
    (s.systems || []).forEach(function (b) {
      var r = b.range || 0;
      xs.push(b.x - r, b.x + r); ys.push(b.y - r, b.y + r);
    });
    (s.volumes || []).forEach(function (v) { (v.pts || []).forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
    if (!xs.length) { xs = [-2000, 2000]; ys = [-2000, 2000]; }
    var a = Math.min.apply(null, xs), b2 = Math.max.apply(null, xs), c = Math.min.apply(null, ys), d = Math.max.apply(null, ys);
    return { cx: (a + b2) / 2, cy: (c + d) / 2, ext: Math.max(b2 - a, d - c, 1000) * 1.1 };
  };

  G.gridStep = function (ext) { return ext > 24000 ? 5000 : ext > 12000 ? 2000 : ext > 4000 ? 1000 : 500; };
  G.snapStep = function (ext) { return G.gridStep(ext) / 5; };

  G.bearingTo = function (from, to) {
    return ((90 - Math.atan2(to.y - from.y, to.x - from.x) * DEG) % 360 + 360) % 360;
  };

  // ---------------------------------------------------------------- coverage (brief 6.1)
  G.slantRange = function (s, p) { return Math.hypot(p.x - s.x, p.y - s.y, (p.z || 0) - (s.z || 0)); };
  G.elevAngle = function (s, p) {
    return Math.atan2((p.z || 0) - (s.z || 0), Math.hypot(p.x - s.x, p.y - s.y)) * DEG;
  };

  // opts.emitsRf (default true); opts.ringOnly keeps only the status and range terms (derive windowsRing)
  G.inCoverage = function (s, p, opts) {
    if (!s || s.status === "inactive" || !(s.range > 0)) return false;
    var R = G.slantRange(s, p);
    if (R < (s.rmin || 0) || R > s.range) return false;
    if (opts && opts.ringOnly) return true;
    if (opts && opts.emitsRf === false && (s.kind === "rf" || s.kind === "ew")) return false;
    var fov = s.fov == null ? 360 : s.fov;
    if (fov < 360 && PS.util.angleDiff(G.bearingTo(s, p), s.bearing || 0) > fov / 2) return false;
    var el = G.elevAngle(s, p);
    var elMin = s.elMin == null ? -90 : s.elMin, elMax = s.elMax == null ? 90 : s.elMax;
    if (el < elMin || el > elMax) return false;
    var z = p.z || 0;
    if (z < (s.zmin || 0)) return false;
    if (s.zmax != null && z > s.zmax) return false;
    return true;
  };

  // shared sampler: 1 s (or dt) from the path start, every waypoint t0 and t1 and the path end;
  // bisection to 0.1 s at each boundary; gaps under 1 s merged; windows under 0.2 s dropped
  function windowsOf(pred, w, dt) {
    if (!w || !w.length) return [];
    var step = dt > 0 ? dt : 1, start = w[0].t0, end = endOf(w), ts = [], i;
    for (var t = start; t < end; t += step) ts.push(t);
    w.forEach(function (q) { ts.push(q.t0, q.t1); });
    ts.push(end);
    ts.sort(function (a, b) { return a - b; });
    var uniq = [];
    for (i = 0; i < ts.length; i++) if (!uniq.length || ts[i] - uniq[uniq.length - 1] > 1e-9) uniq.push(ts[i]);
    var at = function (tt) { return pred(G.posAt(w, tt)); };
    function edge(lo, hi, loState) {
      while (hi - lo > 0.1) {
        var mid = (lo + hi) / 2;
        if (at(mid) === loState) lo = mid; else hi = mid;
      }
      return loState ? lo : hi;   // the covered side
    }
    var raw = [], prevT = uniq[0], prev = at(prevT), tIn = prev ? prevT : null;
    for (i = 1; i < uniq.length; i++) {
      var tt = uniq[i], cur = at(tt);
      if (cur !== prev) {
        var b = edge(prevT, tt, prev);
        if (cur) tIn = b; else { raw.push([tIn, b]); tIn = null; }
      }
      prev = cur; prevT = tt;
    }
    if (tIn != null) raw.push([tIn, end]);
    var merged = [];
    raw.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] - last[1] < 1) last[1] = r[1]; else merged.push([r[0], r[1]]);
    });
    return merged.filter(function (r) { return r[1] - r[0] >= 0.2; });
  }

  G.coverageWindows = function (s, w, dt, opts) {
    var o = opts || { emitsRf: true };
    return windowsOf(function (p) { return G.inCoverage(s, p, o); }, w, dt).map(function (r) {
      var tIn = r[0], tOut = r[1];
      return { tIn: tIn, tOut: tOut, rIn: G.slantRange(s, G.posAt(w, tIn)), rOut: G.slantRange(s, G.posAt(w, tOut)) };
    });
  };

  G.firstSee = function (s, w, opts) {
    var ws = G.coverageWindows(s, w, 1, opts);
    if (!ws.length) return null;
    var p = G.posAt(w, ws[0].tIn);
    return { t: ws[0].tIn, r: ws[0].rIn, pos: { x: p.x, y: p.y, z: p.z } };
  };

  G.lastSee = function (s, w, opts) {
    var ws = G.coverageWindows(s, w, 1, opts);
    if (!ws.length) return null;
    var l = ws[ws.length - 1], p = G.posAt(w, l.tOut);
    return { t: l.tOut, r: l.rOut, pos: { x: p.x, y: p.y, z: p.z } };
  };

  G.ringCrossings = function (s, w, opts) {
    var outv = [];
    G.coverageWindows(s, w, 1, opts).forEach(function (x) {
      outv.push({ t: x.tIn, kind: "in", r: x.rIn }, { t: x.tOut, kind: "out", r: x.rOut });
    });
    return outv;
  };

  // ---------------------------------------------------------------- range, closing
  G.rangeAt = function (w, t, o) {
    var p = G.posAt(w, t);
    return Math.hypot(p.x - o.x, p.y - o.y);
  };

  G.closingSpeed = function (w, t, o) {
    var p = G.posAt(w, t), dx = p.x - o.x, dy = p.y - o.y, r = Math.hypot(dx, dy);
    if (!r) return 0;
    return -(dx * p.vx + dy * p.vy) / r;
  };

  G.rangeSeries = function (w, o, dt) {
    if (!w || !w.length) return [];
    var step = dt > 0 ? dt : 1, end = endOf(w), outv = [];
    for (var t = w[0].t0; ; t += step) {
      var tt = Math.min(t, end), p = G.posAt(w, tt);
      outv.push({ t: tt, r: Math.hypot(p.x - o.x, p.y - o.y), z: p.z, spd: Math.hypot(p.vx, p.vy) });
      if (tt >= end) break;
    }
    return outv;
  };

  // ---------------------------------------------------------------- groups and link clustering
  G.medianNN = function (byPath, ids, t) {
    var ps = ids.map(function (id) { return G.posAt(byPath[id], t); });
    if (ps.length < 2) return 0;
    var nn = ps.map(function (a, i) {
      var m = Infinity;
      ps.forEach(function (b, j) { if (i !== j) m = Math.min(m, d3(a, b)); });
      return m;
    }).sort(function (a, b) { return a - b; });
    var h = nn.length >> 1;
    return nn.length % 2 ? nn[h] : (nn[h - 1] + nn[h]) / 2;
  };

  function members(byPath, groupOf) {
    return Object.keys(byPath).filter(function (id) { return groupOf && groupOf[id]; });
  }
  function components(n, linked) {
    var lab = new Array(n).fill(-1), c = 0;
    for (var i = 0; i < n; i++) {
      if (lab[i] >= 0) continue;
      var stack = [i]; lab[i] = c;
      while (stack.length) {
        var k = stack.pop();
        for (var j = 0; j < n; j++) if (lab[j] < 0 && linked(k, j)) { lab[j] = c; stack.push(j); }
      }
      c++;
    }
    return { count: c, lab: lab };
  }

  G.envelopesAt = function (byPath, groupOf, t, dLink) {
    var ids = members(byPath, groupOf);
    var ps = ids.map(function (id) { return G.posAt(byPath[id], t); });
    var cmp = components(ids.length, function (a, b) { return dLink != null && d3(ps[a], ps[b]) <= dLink; });
    var outv = [];
    for (var c = 0; c < cmp.count; c++) {
      var mem = [], pts = [];
      cmp.lab.forEach(function (l, i) { if (l === c) { mem.push(ids[i]); pts.push([ps[i].x, ps[i].y]); } });
      outv.push({ hull: G.hull(pts), members: mem });
    }
    return outv;
  };

  G.splitTimes = function (byPath, groupOf, tmax, dLink) {
    var ids = members(byPath, groupOf), n = ids.length;
    if (n < 2 || dLink == null) return [];
    var steps = Math.round(tmax / 0.1), link = [], outv = [], i, j;
    for (i = 0; i < n; i++) link.push(new Array(n).fill(false));
    var confirmed = null, cand = null;
    for (var k = 0; k <= steps; k++) {
      var t = Math.min(k * 0.1, tmax);
      var ps = ids.map(function (id) { return G.posAt(byPath[id], t); });
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var d = d3(ps[i], ps[j]);
        var l = k === 0 ? d <= dLink : link[i][j] ? d <= dLink : d <= 0.8 * dLink;
        link[i][j] = link[j][i] = l;
      }
      var count = components(n, function (a, b) { return link[a][b]; }).count;
      if (confirmed == null) { confirmed = count; continue; }
      if (count === confirmed) { cand = null; continue; }
      if (!cand || cand.count !== count) cand = { count: count, t: t };
      if (t - cand.t >= 3 - 1e-9) {
        outv.push({ t: Math.round(cand.t * 10) / 10, from: confirmed, to: count });
        confirmed = count; cand = null;
      }
    }
    return outv;
  };

  // ---------------------------------------------------------------- polygons, polylines, volumes
  G.segmentPoint = function (w, i, f) {
    var a = w[i], b = w[i + 1] || a;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * f };
  };

  G.polygonArea = function (pts) {
    var s = 0;
    for (var i = 0; i < (pts || []).length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  };

  G.pointInPolygon = function (pt, pts) {
    var x = Array.isArray(pt) ? pt[0] : pt.x, y = Array.isArray(pt) ? pt[1] : pt.y, inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  G.volumeEntries = function (vol, w) {
    var top = vol.zmax, bottom = vol.zmin || 0;
    return windowsOf(function (p) {
      return G.pointInPolygon(p, vol.pts) && p.z >= bottom && (!top || p.z <= top);
    }, w, 1).map(function (r) { return { tIn: r[0], tOut: r[1] }; });
  };

  // pts as [[x,y]] or [{x,y}]; closed true adds the closing edge (polygons)
  G.nearestOnPolyline = function (pts, x, y, closed) {
    var P = (pts || []).map(function (q) { return Array.isArray(q) ? q : [q.x, q.y]; });
    var best = { d: Infinity, i: 0, f: 0, x: P.length ? P[0][0] : x, y: P.length ? P[0][1] : y };
    if (P.length === 1) { best.d = Math.hypot(x - P[0][0], y - P[0][1]); return best; }
    var nseg = closed ? P.length : P.length - 1;
    for (var i = 0; i < nseg; i++) {
      var a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      var f = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
      f = Math.max(0, Math.min(1, f));
      var px = a[0] + dx * f, py = a[1] + dy * f, d = Math.hypot(x - px, y - py);
      if (d < best.d) best = { d: d, i: i, f: f, x: px, y: py };
    }
    return best;
  };

  // debrief samples [[t,x,y,z]] -> [{t,x,y,z}] at dt from the first to the last sample, linear
  G.resample = function (samples, dt) {
    var s = (samples || []).filter(function (q) { return q && q.length >= 4 && isFinite(q[0]); })
      .slice().sort(function (a, b) { return a[0] - b[0]; });
    if (!s.length) return [];
    var step = dt > 0 ? dt : 1, outv = [], k = 0, t0 = s[0][0], tEnd = s[s.length - 1][0];
    for (var t = t0; t <= tEnd + 1e-9; t += step) {
      while (k < s.length - 2 && s[k + 1][0] < t) k++;
      var a = s[k], b = s[Math.min(k + 1, s.length - 1)], span = b[0] - a[0];
      var f = span > 0 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 0;
      outv.push({ t: t, x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f });
    }
    return outv;
  };

  G.formationPoints = function (pts, n, spacing) {
    if (!pts || pts.length < 2 || !(n > 1)) return [];
    var a = pts[0], b = pts[1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    var nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, outv = [];
    for (var k = 1; k <= n - 1; k++) {
      var off = spacing * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      outv.push(pts.map(function (q) {
        return { x: Math.round(q.x + nx * off), y: Math.round(q.y + ny * off), z: (q.z || 0) + ((k % 3) - 1) * 5, hold: q.hold || 0 };
      }));
    }
    return outv;
  };
})(globalThis.PS);
