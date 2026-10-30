(function (PS) {
  "use strict";
  // Time engine (contract 10). One time.set per frame. The ticker is injectable: raf(cb) schedules cb(nowMs);
  // raf.now() (optional) gives the same clock, else performance.now.

  var T = PS.time = {};
  var DEFAULT_RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
  var MAX_FRAME_S = 0.25;   // real seconds one frame may advance; a background tab does not jump the cursor
  var EPS = 0.05;

  var store = null, raf = null, last = null, stopAt = null, pending = false;
  T.reducedMotion = false;

  function rates() { return (PS.catalog && PS.catalog.RATES) || DEFAULT_RATES; }
  function clock() {
    if (raf && typeof raf.now === "function") return raf.now();
    return globalThis.performance && performance.now ? performance.now() : Date.now();
  }
  function ui() { return store.get().ui; }
  function record() {
    var s = store.get();
    if (PS.sel && typeof PS.sel.profile === "function") return PS.sel.profile(s);
    return (s.lib || []).filter(function (r) { return r.id === s.activeId; })[0] || (s.lib || [])[0];
  }
  function derived() { var r = record(); return r ? PS.derive.all(r) : null; }
  function tmax() { var d = derived(); return d ? d.tmax : 60; }
  function clamp(t) { return Math.max(0, Math.min(tmax(), t)); }

  function schedule() {
    if (pending || !raf || !store || !ui().playing) return;
    pending = true;
    raf(function (now) { pending = false; T.tick(now); });
  }

  T.attach = function (s, ticker) {
    store = s;
    raf = ticker || (typeof globalThis.requestAnimationFrame === "function" ? globalThis.requestAnimationFrame.bind(globalThis) : null);
    last = null; stopAt = null; pending = false;
    try {
      T.reducedMotion = !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { T.reducedMotion = false; }
    if (store.subscribe) {
      store.subscribe(function (state, action, prev) {
        var on = state.ui.playing, was = prev && prev.ui && prev.ui.playing;
        if (on && !was && last == null) last = clock();
        if (!on) { last = null; if (was) stopAt = null; }
        if (on) schedule();
      });
    }
  };

  T.set = function (t) {
    if (!store) return;
    store.dispatch({ type: "time.set", t: t == null ? null : clamp(t) });
  };
  T.on = function () { if (ui().t == null) T.set(0); };
  T.off = function () { T.pause(); T.set(null); };
  T.step = function (dt) { var t = ui().t; T.set((t == null ? 0 : t) + dt); };

  T.play = function () {
    if (!store) return;
    var u = ui(), t = u.t, end = tmax();
    if (t == null || (t >= end - 1e-9 && stopAt == null)) T.set(u.loop === "range" && u.range ? u.range.t0 : 0);
    last = clock();
    if (!ui().playing) store.dispatch({ type: "time.play" });
    schedule();
  };
  T.pause = function () {
    if (!store) return;
    stopAt = null; last = null;
    if (ui().playing) store.dispatch({ type: "time.pause" });
  };
  T.toggle = function () { if (ui().playing) T.pause(); else T.play(); };

  T.rate = function (r) {
    if (rates().indexOf(r) < 0 || !store) return;
    store.dispatch({ type: "time.rate", rate: r });
  };
  T.defaultRate = function (tm) {
    var target = tm / 30, list = rates(), best = list[0];
    list.forEach(function (r) { if (Math.abs(r - target) < Math.abs(best - target) - 1e-9) best = r; });
    return best;
  };

  T.loop = function (mode, range) {
    if (!store) return;
    if (mode === "range") {
      var rg = range || ui().range;
      if (!rg || !(rg.t0 < rg.t1)) return;
      store.dispatch({ type: "time.loop", loop: "range", range: { t0: rg.t0, t1: rg.t1 } });
      return;
    }
    store.dispatch({ type: "time.loop", loop: mode === "all" ? "all" : "off", range: range === undefined ? ui().range : range });
  };

  T.playTo = function (tStop) {
    if (!store || tStop == null) return;
    var t = ui().t;
    if (t == null) { T.set(0); t = 0; }
    if (t >= tStop - 1e-9) { T.pause(); return; }
    stopAt = tStop;
    last = clock();
    if (!ui().playing) store.dispatch({ type: "time.play" });
    schedule();
  };

  T.tick = function (now) {
    if (!store) return;
    var u = ui();
    if (!u.playing) { last = null; return; }
    if (last == null) last = now;
    var real = Math.max(0, Math.min(MAX_FRAME_S, (now - last) / 1000));
    last = now;
    var t = (u.t == null ? 0 : u.t) + real * u.rate, end = tmax();
    if (stopAt != null && t >= stopAt - 1e-9) {
      var s = stopAt;
      stopAt = null;
      store.dispatch({ type: "time.set", t: Math.min(s, end) });
      T.pause();
      return;
    }
    if (u.loop === "range" && u.range && u.t != null && u.t <= u.range.t1 && t >= u.range.t1) t = u.range.t0;
    else if (t >= end) {
      if (u.loop === "all") t = 0;
      else { store.dispatch({ type: "time.set", t: end }); T.pause(); return; }
    }
    store.dispatch({ type: "time.set", t: t });
    schedule();
  };

  // stops: authored events, derived ladder times, splits, first sees
  function stops() {
    var r = record(), d = derived(), out = [0];
    if (!r || !d) return out;
    (r.events || []).forEach(function (e) { out.push(e.t); });
    Object.keys(d.ladder).forEach(function (pid) {
      var L = d.ladder[pid];
      Object.keys(L).forEach(function (k) { out.push(L[k].t, L[k].tGeo); });
    });
    d.splits.forEach(function (s) { out.push(s.t); });
    Object.keys(d.first).forEach(function (pid) {
      Object.keys(d.first[pid]).forEach(function (sid) { var f = d.first[pid][sid]; if (f) out.push(f.t); });
    });
    out.push(d.tmax);
    return out.filter(function (x) { return x != null && isFinite(x) && x >= 0 && x <= d.tmax; }).sort(function (a, b) { return a - b; });
  }
  T.nextEvent = function () {
    var t = ui().t == null ? 0 : ui().t, s = stops();
    for (var i = 0; i < s.length; i++) if (s[i] > t + EPS) { T.set(s[i]); return; }
    T.set(tmax());
  };
  T.prevEvent = function () {
    var t = ui().t == null ? 0 : ui().t, s = stops();
    for (var i = s.length - 1; i >= 0; i--) if (s[i] < t - EPS) { T.set(s[i]); return; }
    T.set(0);
  };
})(globalThis.PS);
