// Lane 2: PS.time with a manual ticker and a minimal store that holds the time.* reducers (contract 8.1 action names).
module.exports = function (PS, assert) {
  if (!PS.seed || typeof PS.seed.load !== "function" || !PS.catalog || typeof PS.catalog.arch !== "function") {
    console.log("wait time.js: needs the Lane 1 catalog and seed");
    return;
  }
  const near = (a, b, tol, what) => assert.ok(a != null && Math.abs(a - b) <= tol, what + ": got " + a + ", want " + b + " (" + tol + ")");
  const T = PS.time;
  assert.strictEqual(T.defaultRate(422.4), 16);
  assert.strictEqual(T.defaultRate(264.8), 8);

  const rec = PS.seed.load().filter(r => r.id === "CUAS-001")[0];
  const tmax = PS.derive.all(rec).tmax;
  function fakeStore() {
    let state = { lib: [rec], activeId: rec.id, ui: { t: null, playing: false, rate: 1, loop: "off", range: null } };
    const subs = [];
    const red = {
      "time.set": (u, a) => Object.assign({}, u, { t: a.t }),
      "time.play": u => Object.assign({}, u, { playing: true }),
      "time.pause": u => Object.assign({}, u, { playing: false }),
      "time.rate": (u, a) => Object.assign({}, u, { rate: a.rate }),
      "time.loop": (u, a) => Object.assign({}, u, { loop: a.loop, range: a.range })
    };
    return {
      get: () => state,
      dispatch: a => { const prev = state; state = Object.assign({}, state, { ui: red[a.type](state.ui, a) }); subs.forEach(f => f(state, a, prev)); },
      subscribe: f => { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); }
    };
  }
  let now = 0, queue = [];
  const ticker = cb => { queue.push(cb); };
  ticker.now = () => now;
  const frame = ms => { now += ms; const q = queue; queue = []; q.forEach(cb => cb(now)); };
  const setup = () => { const s = fakeStore(); now = 0; queue = []; T.attach(s, ticker); return s; };

  let s = setup();
  T.play();
  assert.strictEqual(s.get().ui.t, 0, "play turns time on at 0");
  frame(100); frame(100);
  near(s.get().ui.t, 0.2, 0.01, "two 100 ms ticks at rate 1");

  s = setup(); T.set(0); T.nextEvent();
  assert.strictEqual(s.get().ui.t, 28, "next stop from 0 is e1");
  T.nextEvent();
  near(s.get().ui.t, 30.1, 0.5, "next stop from 28 is the RDR-1 first see");
  T.prevEvent();
  assert.strictEqual(s.get().ui.t, 28, "previous stop");

  s = setup(); T.set(tmax - 0.05); T.rate(1); T.play(); frame(100);
  assert.ok(s.get().ui.t === tmax && s.get().ui.playing === false, "play pauses at tmax");

  s = setup(); T.loop("all"); T.set(tmax - 0.05); T.play(); frame(100);
  assert.ok(s.get().ui.t === 0 && s.get().ui.playing === true, "loop all wraps to 0");
  T.pause();

  s = setup(); T.loop("range", { t0: 100, t1: 110 }); T.set(109.95); T.play(); frame(100);
  assert.strictEqual(s.get().ui.t, 100, "loop range wraps to t0");
  T.pause();

  s = setup(); T.set(0); T.rate(16); T.playTo(28);
  for (let i = 0; i < 40 && s.get().ui.playing; i++) frame(100);
  near(s.get().ui.t, 28, 0.1, "playTo stops at 28");
  assert.strictEqual(s.get().ui.playing, false, "playTo pauses");

  s = setup(); T.reducedMotion = true; T.set(0); T.play(); frame(100);
  assert.ok(s.get().ui.t > 0, "reduced motion keeps playback");
  T.reducedMotion = false;

  T.off();
  assert.ok(s.get().ui.t === null && s.get().ui.playing === false, "off");
  T.rate(3);
  assert.strictEqual(s.get().ui.rate, 1, "a rate outside RATES is ignored");
};
