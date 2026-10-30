(function (PS) {
  "use strict";
  // One derived object per record reference (contract 7). Reads PS.catalog at call time, never at load.

  var G = PS.geo;
  var D = PS.derive = PS.derive || {};
  var RUNGS = ["detect", "track", "id", "engage", "effect"];
  var VERB = { detect: "detect", track: "track", id: "identify" };
  var TOL = 3;   // bead snap tolerance in seconds

  function cat() { return PS.catalog || {}; }
  function sysDef(kind) { var d = cat().SYS_DEFAULTS || {}; return d[kind] || {}; }
  function isSensor(s) { return (cat().SENSOR_KINDS || []).indexOf(s.kind) >= 0; }
  function isEffector(s) { return (cat().EFFECTOR_KINDS || []).indexOf(s.kind) >= 0; }
  function archOf(id) { return cat().arch ? cat().arch(id) : null; }
  function endOf(w) { return w && w.length ? w[w.length - 1].t1 : 0; }

  // signed m:ss for durations ("+2:22", "0:12")
  function mmss(s, signed) {
    var neg = s < 0, r = Math.round(Math.abs(s)), m = Math.floor(r / 60), ss = r % 60;
    return (signed ? (neg ? "-" : "+") : neg ? "-" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function centroid(pts) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length], c = p[0] * q[1] - q[0] * p[1];
      a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
    }
    if (Math.abs(a) < 1e-9) {
      var sx = 0, sy = 0;
      pts.forEach(function (p) { sx += p[0]; sy += p[1]; });
      return { x: sx / (pts.length || 1), y: sy / (pts.length || 1), z: 0 };
    }
    return { x: cx / (3 * a), y: cy / (3 * a), z: 0 };
  }

  function firstWindowFrom(ws, t) {
    for (var i = 0; i < (ws || []).length; i++) if (ws[i].tOut >= t) return ws[i];
    return null;
  }
  function contains(ws, t) {
    return (ws || []).some(function (w) { return t >= w.tIn && t <= w.tOut; });
  }

  function compute(rec) {
    var scene = rec.scene || {}, paths = scene.paths || [], systems = scene.systems || [], volumes = scene.volumes || [];
    var events = rec.events || [];
    var acById = {}, sysById = {}, pathById = {};
    (scene.aircraft || []).forEach(function (a) { acById[a.id] = a; });
    systems.forEach(function (s) { sysById[s.id] = s; });
    paths.forEach(function (p) { pathById[p.id] = p; });

    var d = {
      speeds: {}, timed: {}, groupOf: {}, tmax: 60, origin: { x: 0, y: 0, z: 0 }, emitsRf: {},
      windows: {}, windowsRing: {}, first: {}, last: {}, firstSensor: {}, firstEffector: {},
      vols: {}, daEntry: {}, dLink: { value: null, auto: true }, ladder: {}, window: {}, splits: [],
      warnings: [], crossings: {}, trackLine: {}, flown: {}
    };

    paths.forEach(function (p) {
      var ac = acById[p.aircraft] || (scene.aircraft || [])[0] || {};
      var arch = archOf(ac.arch) || {};
      d.speeds[p.id] = p.speed || ac.cruise || arch.cruise || 15;
      d.timed[p.id] = G.timed(p.pts || [], d.speeds[p.id]);
      d.groupOf[p.id] = p.group || "";
      d.emitsRf[p.id] = arch.rf !== false;
    });
    d.tmax = G.tmax(paths.map(function (p) { return d.timed[p.id]; }));
    var asset = volumes.filter(function (v) { return v.kind === "asset"; })[0] || null;
    if (asset && asset.pts && asset.pts.length) d.origin = centroid(asset.pts);

    // coverage windows, first and last see
    systems.forEach(function (s) {
      d.windows[s.id] = {}; d.windowsRing[s.id] = {};
      paths.forEach(function (p) {
        var w = d.timed[p.id];
        d.windows[s.id][p.id] = G.coverageWindows(s, w, 1, { emitsRf: d.emitsRf[p.id] });
        d.windowsRing[s.id][p.id] = G.coverageWindows(s, w, 1, { ringOnly: true }).map(function (x) { return { tIn: x.tIn, tOut: x.tOut }; });
      });
    });
    paths.forEach(function (p) {
      var w = d.timed[p.id];
      d.first[p.id] = {}; d.last[p.id] = {}; d.crossings[p.id] = [];
      var fs = null, fe = null;
      systems.forEach(function (s) {
        var ws = d.windows[s.id][p.id];
        if (!ws.length) { d.first[p.id][s.id] = null; d.last[p.id][s.id] = null; return; }
        var f = ws[0], l = ws[ws.length - 1], fp = G.posAt(w, f.tIn);
        d.first[p.id][s.id] = { t: f.tIn, r: f.rIn, pos: { x: fp.x, y: fp.y, z: fp.z } };
        d.last[p.id][s.id] = { t: l.tOut, r: l.rOut };
        ws.forEach(function (x) {
          d.crossings[p.id].push({ t: x.tIn, system: s.id, kind: "in", r: x.rIn }, { t: x.tOut, system: s.id, kind: "out", r: x.rOut });
        });
        if (isSensor(s) && (!fs || f.tIn < fs.t)) fs = { system: s.id, t: f.tIn };
        if (isEffector(s) && (!fe || f.tIn < fe.t)) fe = { system: s.id, t: f.tIn };
      });
      d.crossings[p.id].sort(function (a, b) { return a.t - b.t; });
      d.firstSensor[p.id] = fs; d.firstEffector[p.id] = fe;
    });

    // volumes
    volumes.forEach(function (v) {
      d.vols[v.id] = {};
      paths.forEach(function (p) { d.vols[v.id][p.id] = G.volumeEntries(v, d.timed[p.id]); });
    });
    paths.forEach(function (p) {
      var e = asset ? d.vols[asset.id][p.id] : [];
      d.daEntry[p.id] = e.length ? e[0].tIn : null;
    });

    // link distance and splits
    var grouped = paths.filter(function (p) { return p.group; }).map(function (p) { return p.id; });
    var cfg = rec.metricsCfg && rec.metricsCfg.dLink;
    if (cfg > 0) d.dLink = { value: cfg, auto: false };
    else if (grouped.length >= 2) d.dLink = { value: 2.5 * G.medianNN(d.timed, grouped, 0), auto: true };
    if (d.dLink.value != null) d.splits = G.splitTimes(d.timed, d.groupOf, d.tmax, d.dLink.value);

    // ladder, window, warnings
    var evWarn = [];
    paths.forEach(function (p) { ladderFor(rec, d, p, sysById, events, evWarn); });

    systems.forEach(function (s) {
      if ((isSensor(s) || isEffector(s)) && !(s.range > 0)) {
        d.warnings.push({ kind: "system", id: s.id, text: s.id + " has no reach. Drag its ring out.", eventId: null,
          rung: null, tA: null, tGeo: null, delta: null, system: s.id, rangeAtA: null });
      }
    });
    paths.forEach(function (p) {
      if ((p.pts || []).length < 2) {
        d.warnings.push({ kind: "path", id: p.id, text: p.id + " needs two waypoints.", eventId: null,
          rung: null, tA: null, tGeo: null, delta: null, system: null, rangeAtA: null });
      }
    });
    events.forEach(function (e) {
      var w = d.timed[e.path];
      if (w && w.length > 1 && e.t > endOf(w) + 0.05) { // event times are stored at 0.1 s
        evWarn.push({ kind: "event", id: e.id, text: e.id + " is after " + e.path + " lands. Drag it back.", eventId: e.id,
          rung: null, tA: e.t, tGeo: endOf(w), delta: endOf(w) - e.t, system: null, rangeAtA: G.rangeAt(w, e.t, d.origin) });
      }
    });
    evWarn.sort(function (a, b) { return a.tA - b.tA; });
    d.warnings = d.warnings.concat(evWarn);

    paths.forEach(function (p) { d.trackLine[p.id] = trackLineFor(d, p, systems); });
    if (rec.debrief && rec.debrief.tspi) d.flown = flownFor(rec, d, systems, sysById);

    attachFns(rec, d, scene, asset, sysById, systems);
    return d;
  }

  function rung(t, r, source, ev, sys, tGeo, planning) {
    return { t: t, r: r, source: source, event: ev, system: sys, tGeo: tGeo, warn: false, warnText: "", planning: !!planning };
  }
  var NULL_RUNG = function () { return rung(null, null, null, null, null, null, false); };

  function ladderFor(rec, d, p, sysById, events, evWarn) {
    var w = d.timed[p.id], C = cat(), dwell = C.ID_DWELL == null ? 5 : C.ID_DWELL;
    var mine = events.filter(function (e) { return e.path === p.id; }).slice().sort(function (a, b) { return a.t - b.t; });
    function evOf(type) { for (var i = 0; i < mine.length; i++) if (mine[i].type === type) return mine[i]; return null; }
    function rangeFrom(sysId, t) {
      if (t == null || !w.length) return null;
      var s = sysById[sysId];
      return G.rangeAt(w, t, s ? s : d.origin);
    }
    var systems = (rec.scene.systems || []);

    // geometric times
    var fs = d.firstSensor[p.id], fe = d.firstEffector[p.id];
    var geo = { detect: fs ? { t: fs.t, system: fs.system } : null, track: null, id: null, engage: fe ? { t: fe.t, system: fe.system } : null };
    systems.forEach(function (s) {
      if (!isSensor(s)) return;
      var c = sysDef(s.kind).confirm || 0;
      var win = (d.windows[s.id][p.id] || []).filter(function (x) { return x.tOut - x.tIn >= c; })[0];
      if (win && (!geo.track || win.tIn + c < geo.track.t)) geo.track = { t: win.tIn + c, system: s.id };
    });
    var eo = null;
    systems.forEach(function (s) {
      if (s.kind !== "eoir") return;
      var win = (d.windows[s.id][p.id] || []).filter(function (x) { return x.tOut - x.tIn >= dwell; })[0];
      if (win && (!eo || win.tIn + dwell < eo.t)) eo = { t: win.tIn + dwell, system: s.id };
    });
    geo.id = eo;

    var L = {};
    ["detect", "track", "id", "engage"].forEach(function (k) {
      var e = evOf(k), g = geo[k], planning = k === "track" || k === "id";
      if (e) {
        var sys = e.system || (g && g.system) || null;
        L[k] = rung(e.t, rangeFrom(sys, e.t), "event", e.id, sys, g ? g.t : null, planning && !!g);
      } else if (g) {
        L[k] = rung(g.t, rangeFrom(g.system, g.t), "geometry", null, g.system, g.t, planning);
      } else L[k] = NULL_RUNG();
    });

    // engage effector, effect, latest engage and margin
    var E = L.engage.t, effId = null, effWin = null, tte = 0;
    if (E != null) {
      var evE = L.engage.event ? evOf("engage") : null;
      effId = (evE && evE.system && sysById[evE.system]) ? evE.system : (fe ? fe.system : null);
      if (effId) {
        tte = sysDef(sysById[effId].kind).tte || 0;
        effWin = firstWindowFrom(d.windows[effId][p.id], E);
      }
    }
    var tDA = d.daEntry[p.id], latest = null, margin = null;
    if (E != null && effWin) {
      var tLim = tDA != null ? Math.min(tDA, effWin.tOut) : effWin.tOut;
      latest = tLim - tte;
      margin = latest - E;
    }
    L.effect = NULL_RUNG();
    if (E != null) {
      var term = null;
      for (var i = 0; i < mine.length; i++) if ((mine[i].type === "terminal" || mine[i].type === "checkpoint") && mine[i].t >= E) { term = mine[i]; break; }
      if (term) {
        var sysT = term.system || effId;
        L.effect = rung(term.t, rangeFrom(sysT, term.t), "event", term.id, sysT, effWin ? effWin.tIn : null, false);
      } else if (effWin) {
        var tg = Math.max(E + tte, effWin.tIn);
        L.effect = rung(tg, rangeFrom(effId, tg), "geometry", null, effId, tg, true);
      }
    }
    if (L.engage.system == null && effId) L.engage.system = effId;

    // warnings on authored events
    RUNGS.forEach(function (k) {
      var R = L[k];
      if (R.source !== "event") return;
      var text = null, tGeo = R.tGeo, sys = R.system;
      if (k === "detect" || k === "track" || k === "id") {
        if (tGeo != null && tGeo - R.t > TOL) {
          text = R.event + " is " + Math.round(tGeo - R.t) + " s early. " + (sys || "No system") + " can " + VERB[k] + " " + p.id + " at " + PS.units.t(tGeo) + ".";
        }
      } else if (k === "engage") {
        if (margin != null && margin < 0) {
          tGeo = latest; sys = effId;
          text = R.event + " is " + mmss(-margin) + " late. The latest engage is " + PS.units.t(latest) + ".";
        }
      } else if (k === "effect") {
        if (effWin && effWin.tIn - R.t > TOL) {
          tGeo = effWin.tIn; sys = effId;
          text = R.event + " is before " + effId + " reach at " + PS.units.t(effWin.tIn) + ".";
        }
      }
      if (!text) return;
      R.warn = true; R.warnText = text;
      evWarn.push({ kind: "event", id: R.event, text: text, eventId: R.event, rung: k, tA: R.t, tGeo: tGeo,
        delta: tGeo - R.t, system: sys, rangeAtA: rangeFrom(sys, R.t) });
    });
    d.ladder[p.id] = L;

    var evD = evOf("detect"), evEn = evOf("engage");
    d.window[p.id] = {
      planned: evD && evEn ? evEn.t - evD.t : null,
      geometric: fs && fe ? fe.t - fs.t : null,
      detectT: L.detect.t, engageT: E, rangeAtEngage: E != null && w.length ? G.rangeAt(w, E, d.origin) : null,
      tDA: tDA, latest: latest, margin: margin
    };
  }

  // track lifecycle spans (brief 6.3)
  function trackLineFor(d, p, systems) {
    var w = d.timed[p.id], L = d.ladder[p.id], end = endOf(w);
    var tD = L.detect.t, tT = L.track.t, tI = L.id.t, coast = cat().COAST_S == null ? 10 : cat().COAST_S;
    if (tD == null || !w.length) return [];
    var cover = [];
    systems.forEach(function (s) { if (isSensor(s)) (d.windows[s.id][p.id] || []).forEach(function (x) { cover.push([x.tIn, x.tOut]); }); });
    cover.sort(function (a, b) { return a[0] - b[0]; });
    var U = [];
    cover.forEach(function (c) {
      var l = U[U.length - 1];
      if (l && c[0] <= l[1]) l[1] = Math.max(l[1], c[1]); else U.push([c[0], c[1]]);
    });
    var gaps = [];
    U.forEach(function (u, i) {
      var next = U[i + 1] ? U[i + 1][0] : end;
      if (next - u[1] > 0.01) gaps.push([u[1], next]);
    });
    var cuts = [tD, end];
    [tT, tI].forEach(function (x) { if (x != null) cuts.push(x); });
    gaps.forEach(function (g) { cuts.push(g[0], Math.min(g[0] + coast, g[1]), g[1]); });
    cuts = cuts.filter(function (x) { return x >= tD - 1e-9 && x <= end + 1e-9; }).sort(function (a, b) { return a - b; });
    function stateAt(t) {
      for (var i = 0; i < gaps.length; i++) if (t > gaps[i][0] && t < gaps[i][1]) return t < gaps[i][0] + coast ? "coast" : "lost";
      if (tI != null && t >= tI) return "identity";
      if (tT != null && t >= tT) return "unknown";
      return "pending";
    }
    var spans = [];
    for (var i = 0; i < cuts.length - 1; i++) {
      var a = cuts[i], b = cuts[i + 1];
      if (b - a < 1e-9) continue;
      var st = stateAt((a + b) / 2), last = spans[spans.length - 1];
      if (last && last.state === st && Math.abs(last.t1 - a) < 1e-9) last.t1 = b;
      else spans.push({ t0: a, t1: b, state: st });
    }
    if (!spans.length) spans.push({ t0: tD, t1: Math.max(tD, end), state: stateAt(tD) });
    return spans;
  }

  // flown series and ladder from debrief (brief 6.9)
  function flownFor(rec, d, systems, sysById) {
    var outv = {}, tspi = rec.debrief.tspi, evs = rec.debrief.events || [];
    Object.keys(tspi).forEach(function (pid) {
      var rs = G.resample(tspi[pid], 1);
      if (!rs.length) return;
      var w = rs.map(function (q) { return { x: q.x, y: q.y, z: q.z, t0: q.t, t1: q.t }; });
      var series = rs.map(function (q) { return { t: q.t, r: Math.hypot(q.x - d.origin.x, q.y - d.origin.y), z: q.z }; });
      var opts = { emitsRf: d.emitsRf[pid] !== false };
      var det = null, eng = null, eo = null;
      systems.forEach(function (s) {
        var ws = (isSensor(s) || isEffector(s)) ? G.coverageWindows(s, w, 1, opts) : [];
        if (!ws.length) return;
        if (isSensor(s) && (!det || ws[0].tIn < det.t)) det = { t: ws[0].tIn, system: s.id };
        if (isEffector(s) && (!eng || ws[0].tIn < eng.t)) eng = { t: ws[0].tIn, system: s.id };
        if (s.kind === "eoir" && !eo) eo = { t: ws[0].tIn, system: s.id };
      });
      var g = function (t, sys) { return t == null ? { t: null, source: null, system: null } : { t: t, source: "geometry", system: sys || null }; };
      var lad = {
        detect: det ? g(det.t, det.system) : g(null),
        track: det ? g(det.t + 20, det.system) : g(null),
        id: eo ? g(eo.t, eo.system) : det ? g(det.t + 60, det.system) : g(null),
        engage: eng ? g(eng.t, eng.system) : g(null),
        effect: g(null)
      };
      var mine = evs.filter(function (e) { return e.path === pid; }).slice().sort(function (a, b) { return a.t - b.t; });
      ["detect", "track", "id", "engage"].forEach(function (k) {
        var e = mine.filter(function (x) { return x.type === k; })[0];
        if (e) lad[k] = { t: e.t, source: "event", system: e.system || lad[k].system || null };
      });
      if (lad.engage.t != null) {
        var term = mine.filter(function (x) { return (x.type === "terminal" || x.type === "checkpoint") && x.t >= lad.engage.t; })[0];
        lad.effect = term ? { t: term.t, source: "event", system: term.system || lad.engage.system }
          : { t: rs[rs.length - 1].t, source: "geometry", system: lad.engage.system };
      }
      outv[pid] = { timed: w, series: series, ladder: lad };
    });
    return outv;
  }

  function attachFns(rec, d, scene, asset, sysById, systems) {
    function originAt(refId, pathId, t) {
      var s = refId && sysById[refId];
      if (s) return { x: s.x, y: s.y, z: s.z || 0 };
      if (refId === "asset-edge" && asset && pathId != null && t != null && d.timed[pathId] && d.timed[pathId].length) {
        var p = G.posAt(d.timed[pathId], t);
        if (G.pointInPolygon(p, asset.pts)) return { x: p.x, y: p.y, z: 0 };
        var n = G.nearestOnPolyline(asset.pts, p.x, p.y, true);
        return { x: n.x, y: n.y, z: 0 };
      }
      return { x: d.origin.x, y: d.origin.y, z: d.origin.z };
    }
    d.originAt = originAt;
    d.closing = function (pathId, t, originId) {
      var w = d.timed[pathId];
      if (!w || !w.length || t == null) return 0;
      return G.closingSpeed(w, t, originId == null ? d.origin : originAt(originId, pathId, t));
    };
    d.tta = function (pathId, t) {
      var tDA = d.daEntry[pathId];
      if (tDA == null) return null;
      var tt = t == null ? 0 : t;
      if (asset && d.timed[pathId] && G.pointInPolygon(G.posAt(d.timed[pathId], tt), asset.pts) && tt >= tDA) return 0;
      return tDA > tt ? tDA - tt : 0;
    };
    d.envelopesAt = function (t) { return G.envelopesAt(d.timed, d.groupOf, t == null ? 0 : t, d.dLink.value); };
    var cache = {};
    d.rangeSeries = function (pathId, refId) {
      var key = pathId + "\u0000" + (refId || "asset");
      if (cache[key]) return cache[key];
      var w = d.timed[pathId];
      if (!w || !w.length) return (cache[key] = []);
      var edge = refId === "asset-edge" && asset;
      var series = G.rangeSeries(w, edge ? d.origin : originAt(refId, null, null), 1);
      if (edge) series.forEach(function (q) { var o = originAt("asset-edge", pathId, q.t), p = G.posAt(w, q.t); q.r = Math.hypot(p.x - o.x, p.y - o.y); });
      return (cache[key] = series);
    };
    d.coveringAt = function (pathId, t) {
      if (t == null) return [];
      return systems.filter(function (s) { return contains(d.windows[s.id][pathId], t); }).map(function (s) { return s.id; });
    };
    d.holdsAt = function (systemId, t) {
      if (t == null || !d.windows[systemId]) return [];
      return (scene.paths || []).filter(function (p) { return contains(d.windows[systemId][p.id], t); }).map(function (p) { return p.id; });
    };
    d.at = function (pathId, t, refId) {
      var w = d.timed[pathId];
      if (!w || !w.length) return null;
      var tt = t == null ? 0 : t, p = G.posAt(w, tt), o = originAt(refId || "asset", pathId, tt);
      var moving = p.vx || p.vy, win = d.window[pathId] || null;
      return {
        x: p.x, y: p.y, z: p.z, r: Math.hypot(p.x - o.x, p.y - o.y), brg: G.bearingTo(o, p),
        hdg: moving ? G.bearingTo({ x: 0, y: 0 }, { x: p.vx, y: p.vy }) : null,
        spd: Math.hypot(p.vx, p.vy), vc: d.closing(pathId, tt, refId || "asset"), tta: d.tta(pathId, tt),
        window: win, margin: win ? win.margin : null, covering: d.coveringAt(pathId, tt)
      };
    };
  }

  var memo = PS.util.memo1(compute);
  D.all = function (record) { return memo(record); };
  D.invalidate = function () { memo.clear(); };

  // live tokens in caption and notes text (brief 4.4); unknown tokens stay as typed
  D.tokens = function (record, text, t, refId) {
    if (text == null) return "";
    if (!record) return String(text);
    var d = D.all(record), U = PS.units, tt = t == null ? 0 : t, site = record.site || {};
    return String(text).replace(/\{([A-Za-z0-9_-]+)\.(rng|alt|spd|vc|tta|window|margin|see:([A-Za-z0-9_-]+))\}/g, function (all, id, key, pid) {
      if (pid) {
        var f = d.first[pid] && d.first[pid][id];
        if (f === undefined) return all;
        if (f === null) return "no see";
        var s = (record.scene.systems || []).filter(function (x) { return x.id === id; })[0];
        return U.t(f.t) + " " + U.h(G.rangeAt(d.timed[pid], f.t, s));
      }
      if (!d.timed[id]) return all;
      var a = d.at(id, tt, refId || "asset"), win = d.window[id] || {};
      switch (key) {
        case "rng": return U.h(a.r);
        case "alt": return U.v(a.z + (site.datum === "MSL" ? site.elev || 0 : 0), site.datum);
        case "spd": return U.spd(a.spd);
        case "vc": return U.spd(a.vc);
        case "tta": return a.tta == null ? "no entry" : mmss(a.tta);
        case "window": return win.geometric == null ? "no window" : mmss(win.geometric);
        case "margin": return win.margin == null ? "no margin" : mmss(win.margin, true);
      }
      return all;
    });
  };
})(globalThis.PS);
