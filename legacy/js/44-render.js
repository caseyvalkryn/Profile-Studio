(function (PS) {
  "use strict";

  // PS.render: compose cameras and layers; hit list; card render; chart render (contract section 15).

  var S = PS.util.S, esc = PS.util.esc;
  function r1(v) { return Math.round(v * 10) / 10; }
  var NS = "http://www.w3.org/2000/svg";
  var FALLBACK_LAYERS = { reach: true, events: true, envelopes: true, tracks: true, telemetry: false, labels: true, rings: false, target: true };

  function defaultLayers() {
    return PS.schema && typeof PS.schema.defaultLayers === "function" ? PS.schema.defaultLayers() : Object.assign({}, FALLBACK_LAYERS);
  }

  // Run fn with PS.units in the given mode, then restore the previous mode.
  function withUnits(mode, fn) {
    var prev = PS.units.mode;
    if (mode && mode !== prev) PS.units.set(mode);
    try { return fn(); } finally { if (PS.units.mode !== prev) PS.units.set(prev); }
  }

  function makeCtx(record, derived, cam, view, opts, layers) {
    var t = view.t == null ? null : view.t;
    var ref = view.ref || "asset";
    var sel = view.sel || { kind: null, id: null, i: null };
    var hover = view.hover || { kind: null, id: null, i: null };
    var focus = view.focus || [];
    var fset = {}, fpaths = {};
    focus.forEach(function (id) { fset[id] = true; });
    (record.events || []).forEach(function (e) { if (fset[e.id] && e.path) fpaths[e.path] = true; });
    var origin = typeof derived.originAt === "function" ? derived.originAt(ref, null, t) : (derived.origin || { x: 0, y: 0, z: 0 });
    var ctx = {
      profile: record, scene: record.scene, derived: derived, cam: cam, t: t,
      sel: sel, hover: hover, focus: focus, layers: layers,
      units: PS.units.mode, thumb: !!opts.thumb, edit: !!opts.edit && !opts.thumb,
      placing: view.placing || null, ruler: view.ruler || null, snap: view.snap !== false,
      ghost: opts.ghost || null,
      hoverT: view.hoverT == null ? null : view.hoverT, ref: ref, origin: origin,
      S: S, sym: PS.symbols, u: PS.units,
      dim: function (id) {
        if (!focus.length || fset[id] || fpaths[id]) return "";
        return " dim";
      },
      cls: function (id) {
        if (id != null && sel.id === id) return " sel";
        if (id != null && hover.id === id) return " hov";
        return "";
      },
      // render-owned collectors (not in the layer contract list; layers may use them)
      hits: [],
      labels: [],
      labelsOn: true,
      hit: function (h) { ctx.hits.push(h); },
      // label candidate: { p: priority (0 first), box: {x0,y0,x1,y1}, svg, always, id }
      label: function (c) { c.n = ctx.labels.length; ctx.labels.push(c); }
    };
    return ctx;
  }

  function scene(record, view, size, opts) {
    view = view || {};
    opts = opts || {};
    size = size || { W: 900, H: 600 };
    return withUnits(view.units, function () {
      var derived = opts.derived || PS.derive.all(record);
      var sc = record.scene;
      var kind = view.proj === "elev" || view.proj === "axon" ? view.proj : "plan";
      var layers = Object.assign(defaultLayers(), view.layers || {});
      var camView = {
        proj: kind, yaw: view.yaw, pitch: view.pitch, ref: view.ref || "asset",
        bounds: view.bounds || PS.geo.bounds(sc),
        zoom: view.zoom, px: view.px, py: view.py
      };
      var datum = (record.site && record.site.datum) || "AGL";
      var cam = PS.cameras.get(kind).setup(sc, derived, size, camView, { thumb: !!opts.thumb, datum: datum });
      var ctx = makeCtx(record, derived, cam, view, opts, layers);
      var body = "";
      PS.layers.list().forEach(function (L) {
        if (L.cameras.indexOf(cam.kind) < 0) return;
        if (L.id === "handles" && !ctx.edit) return;
        var on = L.chip == null || (layers[L.id] == null ? L.defaultOn : !!layers[L.id]);
        // the tracks layer also draws the target TSPI cross (chip 8) when Tracks is off
        if (L.id === "tracks" && !on && layers.target) on = true;
        if (L.id === "labels") ctx.labelsOn = on && !ctx.thumb;
        else if (!on) return;
        var s = L.draw(ctx);
        if (s) body += '<g class="ly ly-' + L.id + '">' + s + "</g>";
      });
      var svg = S("svg", {
        xmlns: NS, viewBox: "0 0 " + size.W + " " + size.H, width: size.W, height: size.H,
        preserveAspectRatio: cam.preserveAspectRatio,
        class: "board" + (opts.thumb ? " thumb" : "") + (ctx.edit ? " edit" : ""),
        "data-proj": cam.kind, role: "img",
        "aria-label": kind === "plan" ? "Board in plan" : kind === "elev" ? "Board in elevation" : "Board in axonometric"
      }, body);
      return { svg: svg, cam: cam, hits: ctx.hits };
    });
  }

  function card(record, cd, size, thumb) {
    size = size || { W: 300, H: 160 };
    var view;
    if (!cd) {
      view = { proj: "plan", yaw: -35, pitch: 55, ref: "asset", layers: defaultLayers(), focus: [], t: null };
    } else {
      var c = cd.cam || {};
      view = {
        proj: c.proj || "plan", yaw: c.yaw, pitch: c.pitch, ref: c.ref || "asset",
        layers: Object.assign(defaultLayers(), cd.layers || {}), focus: cd.focus || [], t: cd.t == null ? null : cd.t
      };
    }
    return scene(record, view, size, { thumb: !!thumb, edit: false }).svg;
  }

  // ---------------------------------------------------------------- hit test
  function segDist(px, py, seg) {
    var best = Infinity;
    for (var i = 0; i < seg.length; i++) {
      var a = seg[i], b = seg[i + 1] || seg[i];
      var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      var f = L > 0 ? PS.util.clamp(((px - a[0]) * dx + (py - a[1]) * dy) / L, 0, 1) : 0;
      best = Math.min(best, Math.hypot(px - (a[0] + f * dx), py - (a[1] + f * dy)));
    }
    return best;
  }
  function inPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function hitDist(h, sx, sy) {
    if (h.seg) return segDist(sx, sy, h.seg);
    if (h.poly) return inPoly(sx, sy, h.poly) ? 0 : segDist(sx, sy, h.poly.concat([h.poly[0]]));
    return Math.max(0, Math.hypot(sx - h.sx, sy - h.sy) - (h.r || 0));
  }

  // nearest within tol, handles before objects; on a tie the later (upper) hit wins
  function hitTest(hits, sx, sy, tol) {
    tol = tol == null ? 7 : tol;
    var bestH = null, dH = Infinity, bestO = null, dO = Infinity;
    (hits || []).forEach(function (h) {
      var d = hitDist(h, sx, sy);
      if (d > tol) return;
      if (h.handle) { if (d <= dH) { dH = d; bestH = h; } }
      else if (d <= dO) { dO = d; bestO = h; }
    });
    return bestH || bestO;
  }

  // ---------------------------------------------------------------- chart
  var chartN = 0;
  var SENSOR = { radar: 1, rf: 1, eoir: 1, acoustic: 1 };

  function niceStep(span, n) {
    var raw = span / (n || 4), p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function interp(series, t, key) {
    if (!series || !series.length) return null;
    if (t <= series[0].t) return series[0][key];
    var last = series[series.length - 1];
    if (t >= last.t) return last[key];
    var lo = 0, hi = series.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (series[mid].t <= t) lo = mid; else hi = mid; }
    var a = series[lo], b = series[hi], f = (t - a.t) / ((b.t - a.t) || 1);
    return a[key] + (b[key] - a[key]) * f;
  }

  function otherH(m) {
    var mode = PS.units.mode;
    PS.units.set(mode === "si" ? "nav" : "si");
    var s = PS.units.h(m);
    PS.units.set(mode);
    return s;
  }
  function numOnly(s) { return String(s).replace(/\s*[a-zA-Z/]+(\s+[A-Z]+)?$/, ""); }

  function inkOf(identity) { return "id-" + (identity || "hostile"); }
  function sysInk(kind) { return kind === "ew" ? "ink-ew" : SENSOR[kind] ? "ink-sensor" : "ink-eff"; }

  function chart(record, derived, size, opts) {
    opts = opts || {};
    size = size || { W: 600, H: 160 };
    return withUnits(opts.units, function () { return chartBody(record, derived || PS.derive.all(record), size, opts); });
  }

  function chartBody(record, d, size, opts) {
    var W = size.W, H = size.H, th = !!opts.thumb;
    var mode = opts.mode === "alt" || opts.mode === "speed" ? opts.mode : "range";
    var ref = opts.ref || "asset";
    var key = mode === "range" ? "r" : mode === "alt" ? "z" : "spd";
    var ml = th ? 4 : 46, mr = th ? 4 : 60, mt = th ? 4 : 12, mb = th ? 4 : 22;
    var sc = record.scene, paths = sc.paths || [], systems = sc.systems || [];
    var tmax = d.tmax || 60;
    var tv = opts.tview && opts.tview.t1 > opts.tview.t0 ? opts.tview : { t0: 0, t1: tmax };
    var sel = opts.sel || {};
    var U = PS.units;
    var unitF = mode === "range" ? (U.mode === "si" ? 1000 : U.NM) : mode === "alt" ? (U.mode === "si" ? 1 : U.FT) : (U.mode === "si" ? 1 : U.KT);

    var series = {}, vmax = 0;
    paths.forEach(function (p) {
      var s = typeof d.rangeSeries === "function" ? d.rangeSeries(p.id, ref) : [];
      series[p.id] = s || [];
      series[p.id].forEach(function (q) { if (q[key] > vmax) vmax = q[key]; });
    });
    var flown = {};
    // flown ground speed: horizontal distance between successive timed samples over dt
    function flownSpd(tm) {
      var out = [];
      for (var i = 0; i < tm.length; i++) {
        var a = tm[i > 0 ? i - 1 : 0], c = tm[i > 0 ? i : Math.min(1, tm.length - 1)];
        var dt = c.t0 - a.t0;
        out.push({ t: tm[i].t0, spd: dt > 0 ? Math.hypot(c.x - a.x, c.y - a.y) / dt : 0 });
      }
      return out;
    }
    if (opts.flown !== false && d.flown) {
      paths.forEach(function (p) {
        var f = d.flown[p.id];
        if (mode === "speed") {
          if (f && f.timed && f.timed.length > 1) {
            flown[p.id] = flownSpd(f.timed);
            flown[p.id].forEach(function (q) { if (q.spd > vmax) vmax = q.spd; });
          }
          return;
        }
        if (f && f.series && f.series.length) {
          flown[p.id] = f.series;
          f.series.forEach(function (q) { if (q[key] > vmax) vmax = q[key]; });
        }
      });
    }
    var o = typeof d.originAt === "function" ? d.originAt(ref, null, null) : (d.origin || { x: 0, y: 0, z: 0 });
    var lineSys = [], dotSys = [];
    if (mode === "range") {
      // first pass with the path extent to decide co-location, then include the line ranges in the extent
      systems.forEach(function (s) { if (s.range > 0) vmax = Math.max(vmax, s.id === ref ? s.range : 0); });
    }
    var yTop = Math.max(vmax, mode === "range" ? 500 : mode === "alt" ? 50 : 5) * 1.08;
    if (mode === "range") {
      systems.forEach(function (s) {
        if (!(s.range > 0)) return;
        var dist = Math.hypot(s.x - o.x, s.y - o.y);
        if (s.id === ref || dist <= 0.01 * yTop) lineSys.push(s); else dotSys.push(s);
      });
      lineSys.forEach(function (s) { yTop = Math.max(yTop, s.range * 1.08); });
    }
    var step = niceStep(yTop / unitF, th ? 2 : 4) * unitF;
    yTop = Math.ceil(yTop / step - 1e-9) * step;

    var pw = Math.max(1, W - ml - mr), ph = Math.max(1, H - mt - mb);
    function X(t) { return ml + (t - tv.t0) / (tv.t1 - tv.t0) * pw; }
    function Y(v) { return H - mb - v / yTop * ph; }
    var cid = "ps-chc-" + (++chartN);
    var out = "";
    out += S("defs", null, S("clipPath", { id: cid }, S("rect", { x: ml, y: mt - 2, width: r1(pw), height: r1(ph + 4) })));

    // axes and grid
    var g = "", v;
    for (v = 0; v <= yTop + 1e-6; v += step) {
      g += S("line", { x1: ml, y1: r1(Y(v)), x2: r1(ml + pw), y2: r1(Y(v)), class: v === 0 ? "axis" : "grid" });
      if (!th) {
        var main = mode === "range" ? U.h(v) : mode === "alt" ? U.v(v) : U.spd(v);
        // the axis title sits at the top left (baseline mt - 2): leave out a left tick label whose box meets it
        if (Y(v) - 6.5 >= mt + 1) g += S("text", { x: ml - 5, y: r1(Y(v) + 3.5), class: "tick", "text-anchor": "end" }, esc(numOnly(main)));
        if (mode === "range") g += S("text", { x: r1(ml + pw + 5), y: r1(Y(v) + 3.5), class: "tick tick2" }, esc(otherH(v)));
      }
    }
    var span = tv.t1 - tv.t0, ts = span <= 60 ? 10 : span <= 180 ? 30 : span <= 600 ? 60 : 120;
    for (v = Math.ceil(tv.t0 / ts) * ts; v <= tv.t1 + 1e-6; v += ts) {
      g += S("line", { x1: r1(X(v)), y1: mt, x2: r1(X(v)), y2: r1(H - mb), class: "grid" });
      if (!th) g += S("text", { x: r1(X(v)), y: r1(H - mb + 14), class: "tick", "text-anchor": "middle" }, esc(U.t(v)));
    }
    if (!th) {
      var L = U.labels();
      var yl = mode === "range" ? "Range " + L.h : mode === "alt" ? "Height " + L.v + " " + ((record.site && record.site.datum) || "AGL") : "Speed " + L.spd;
      g += S("text", { x: 4, y: mt - 2, class: "axl" }, esc(yl));
    }
    out += S("g", { class: "ch-axes" }, g);

    var plot = "";
    // planned decision window band: the selected path, else the first path with both events
    var bandPath = null;
    paths.forEach(function (p) {
      var w = d.window && d.window[p.id];
      if (!w || w.planned == null || w.detectT == null || w.engageT == null) return;
      if (!bandPath || (sel.kind === "path" && sel.id === p.id)) bandPath = p.id;
    });
    if (bandPath) {
      var bw = d.window[bandPath];
      plot += S("rect", { x: r1(X(bw.detectT)), y: mt, width: r1(Math.max(0, X(bw.engageT) - X(bw.detectT))), height: r1(ph), class: "band" });
    }
    (d.splits || []).forEach(function (s) {
      plot += S("line", { x1: r1(X(s.t)), y1: mt, x2: r1(X(s.t)), y2: r1(H - mb), class: "split" });
      if (!th) plot += S("text", { x: r1(X(s.t) + 3), y: mt + 9, class: "lbl small" }, (s.to > s.from ? "S " : "M ") + s.to);
    });

    // range lines for the reference system and co-located systems
    lineSys.forEach(function (s) {
      var y = r1(Y(s.range));
      plot += S("line", {
        x1: ml, y1: y, x2: r1(ml + pw), y2: y,
        class: "chr " + sysInk(s.kind) + (s.fov < 360 ? " dot" : ""), "data-k": "system", "data-id": s.id, "data-role": "range"
      });
      if (!th) plot += S("text", { x: r1(ml + pw - 3), y: r1(y - 3), class: "lbl small lid " + sysInk(s.kind), "text-anchor": "end" }, esc(s.id));
    });

    paths.forEach(function (p) {
      var s = series[p.id];
      if (!s.length) return;
      var lad = d.ladder && d.ladder[p.id], tD = lad && lad.detect ? lad.detect.t : null;
      var pre = [], post = [];
      s.forEach(function (q, i) {
        var nxt = s[i + 1], prv = s[i - 1];
        if (q.t < tv.t0 && !(nxt && nxt.t >= tv.t0)) return;
        if (q.t > tv.t1 && !(prv && prv.t <= tv.t1)) return;
        var pt = r1(X(q.t)) + "," + r1(Y(q[key]));
        if (tD == null || q.t < tD) pre.push(pt);
        if (tD != null && q.t >= tD) post.push(pt);
      });
      if (tD != null && pre.length && tD >= tv.t0 && tD <= tv.t1) {
        var jp = r1(X(tD)) + "," + r1(Y(interp(s, tD, key)));
        pre.push(jp); post.unshift(jp);
      }
      var selc = sel.kind === "path" && sel.id === p.id ? " w3" : paths.length > 1 ? " w1" : " w2";
      if (pre.length > 1) plot += S("polyline", { points: pre.join(" "), class: "chl pre " + inkOf(p.identity) + selc, "data-k": "path", "data-id": p.id });
      if (post.length > 1) plot += S("polyline", { points: post.join(" "), class: "chl " + inkOf(p.identity) + selc, "data-k": "path", "data-id": p.id });
      var end = s[s.length - 1];
      if (!th && end.t >= tv.t0 && end.t <= tv.t1) plot += S("text", { x: r1(X(end.t) + 4), y: r1(Y(end[key]) + 3.5), class: "lbl small lid " + inkOf(p.identity) }, esc(p.id));
      if (flown[p.id]) {
        var fs = flown[p.id].filter(function (q) { return q.t >= tv.t0 - 1 && q.t <= tv.t1 + 1; })
          .map(function (q) { return r1(X(q.t)) + "," + r1(Y(q[key])); });
        if (fs.length > 1) plot += S("polyline", { points: fs.join(" "), class: "chf", "data-k": "flown", "data-id": p.id });
        var fe = flown[p.id][flown[p.id].length - 1];
        if (!th && fe.t >= tv.t0 && fe.t <= tv.t1) plot += S("text", { x: r1(X(fe.t) + 4), y: r1(Y(fe[key]) + 14), class: "lbl small ghostink" }, esc(p.id + " flown"));
      }
      // first-see dots for systems away from the reference
      dotSys.forEach(function (sy) {
        var f = d.first && d.first[p.id] && d.first[p.id][sy.id];
        if (!f || f.t == null || f.t < tv.t0 || f.t > tv.t1) return;
        var x = r1(X(f.t)), y = r1(Y(interp(s, f.t, key)));
        plot += S("circle", { cx: x, cy: y, r: 3, class: "chd " + sysInk(sy.kind), "data-k": "see", "data-id": sy.id, "data-path": p.id, "data-t": r1(f.t) });
        if (!th) plot += S("text", { x: r1(x + 4), y: r1(y - 4), class: "lbl small lid " + sysInk(sy.kind) }, esc(sy.id));
      });
    });

    // event beads and ticks
    var EVT = (PS.catalog && PS.catalog.EV_TYPES) || {};
    (record.events || []).forEach(function (e) {
      var s = series[e.path];
      if (!s || !s.length || e.t < tv.t0 || e.t > tv.t1) return;
      var x = r1(X(e.t)), y = r1(Y(interp(s, e.t, key)));
      plot += S("line", { x1: x, y1: r1(H - mb), x2: x, y2: r1(H - mb - 4), class: "chtick" });
      plot += S("g", { class: "chb" + (sel.kind === "event" && sel.id === e.id ? " sel" : ""), "data-k": "event", "data-id": e.id },
        S("circle", { cx: x, cy: y, r: th ? 2 : 4.5, class: "bead" }) +
        (th ? "" : S("text", { x: x, y: r1(y + 2.6), class: "beadtx" }, esc(EVT[e.type] || "?"))));
    });

    if (opts.hoverT != null && opts.hoverT >= tv.t0 && opts.hoverT <= tv.t1) {
      plot += S("line", { x1: r1(X(opts.hoverT)), y1: mt, x2: r1(X(opts.hoverT)), y2: r1(H - mb), class: "hovt" });
    }
    if (opts.t != null && opts.t >= tv.t0 && opts.t <= tv.t1) {
      var cx = r1(X(opts.t));
      plot += S("line", { x1: cx, y1: mt, x2: cx, y2: r1(H - mb), class: "cursor" }) +
        S("polygon", { points: (cx - 4) + "," + (mt - 4) + " " + (cx + 4) + "," + (mt - 4) + " " + cx + "," + (mt + 2), class: "cursorg" });
    }
    out += S("g", { "clip-path": "url(#" + cid + ")" }, plot);

    if (!th) {
      var msg = !paths.length ? "Add an aircraft to see time." :
        !systems.some(function (s) { return s.range > 0 && SENSOR[s.kind]; }) ? "Add a sensor to see detection." : "";
      if (msg) out += S("text", { x: r1(ml + pw / 2), y: r1(mt + ph / 2), class: "empty", "text-anchor": "middle" }, esc(msg));
    }

    return S("svg", {
      xmlns: NS, viewBox: "0 0 " + W + " " + H, width: W, height: H, preserveAspectRatio: "none",
      class: "chart" + (th ? " thumb" : ""), "data-mode": mode, "data-ref": ref, role: "img", "aria-label": "Range and time chart",
      "data-x0": ml, "data-x1": r1(ml + pw), "data-t0": r1(tv.t0), "data-t1": r1(tv.t1),
      "data-y0": r1(H - mb), "data-y1": mt, "data-v0": 0, "data-v1": r1(yTop)
    }, out);
  }

  PS.render = { scene: scene, card: card, chart: chart, hitTest: hitTest };
})(globalThis.PS);
