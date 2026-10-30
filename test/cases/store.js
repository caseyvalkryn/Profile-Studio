// Lane 1: PS.store, PS.bus and PS.sel (contract 8 and 20). No assertion depends on derived values.
module.exports = function (PS, assert) {
  // vm objects carry another realm's prototypes, so deep comparisons go through a JSON copy
  const J = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const same = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
  const mk = () => PS.store.create({ lib: PS.seed.load(), activeId: "CUAS-001" });
  const P = s => PS.sel.profile(s.get());

  // undo, redo, transactions
  let s = mk();
  const r0 = P(s);
  s.set("name", "Changed");
  assert.strictEqual(P(s).name, "Changed");
  assert.ok(s.get().dirty["CUAS-001"]);
  assert.ok(P(s).meta.updated);
  assert.ok(s.undo());
  assert.strictEqual(P(s), r0);
  assert.ok(s.redo());
  assert.strictEqual(P(s).name, "Changed");
  s = mk();
  const r1 = P(s);
  s.begin("move RDR-1");
  s.set("scene.systems.0.x", 10); s.set("scene.systems.0.x", 20); s.set("scene.systems.0.y", 30);
  assert.strictEqual(s.canUndo(), false);
  s.commit();
  assert.strictEqual(s.undoLabel(), "move RDR-1");
  assert.ok(s.undo());
  assert.strictEqual(P(s), r1);
  assert.strictEqual(s.canUndo(), false);
  assert.ok(s.redo());
  assert.strictEqual(P(s).scene.systems[0].y, 30);
  s = mk();
  const r2 = P(s);
  s.begin("drag"); s.set("scene.systems.0.x", 99); s.cancel();
  assert.strictEqual(P(s), r2);
  assert.strictEqual(s.canUndo(), false);
  s.ui("panels.help", true);
  s.dispatch({ type: "time.set", t: 10 });
  s.dispatch({ type: "sel.set", kind: "path", id: "T1" });
  s.dispatch({ type: "hover.set", kind: "system", id: "RDR-1", t: 5 });
  s.dispatch({ type: "view.set", zoom: 2 });
  assert.strictEqual(s.canUndo(), false);
  assert.strictEqual(s.get().ui.panels.help, true);
  assert.strictEqual(s.get().ui.panels.list, true);
  same(s.get().ui.hover, { kind: "system", id: "RDR-1", i: null, cx: 0, cy: 0, text: null, t: 5 });
  same(s.get().ui.view, { zoom: 2, px: 0, py: 0 });

  // dependent removal
  s = mk();
  s.dispatch({ type: "profile.remove", path: "scene.paths", id: "T1" });
  assert.strictEqual(P(s).scene.paths.length, 0);
  assert.strictEqual(P(s).events.length, 0);
  assert.strictEqual(s.get().ui.sel.id, null);
  s.undo();
  assert.strictEqual(P(s).events.length, 6);

  // refused remove of an aircraft in use
  s = mk();
  const r3 = P(s), depth = s.canUndo();
  s.dispatch({ type: "profile.remove", path: "scene.aircraft", id: "T1" });
  assert.strictEqual(P(s), r3);
  assert.strictEqual(s.canUndo(), depth);
  same(s.get().ui.readout, { text: "T1 uses this aircraft. Delete T1 first.", level: "warn" });

  // rename rewires
  s = mk();
  s.dispatch({ type: "sel.set", kind: "path", id: "T1" });
  s.dispatch({ type: "profile.rename", kind: "path", oldId: "T1", newId: "T7" });
  assert.ok(P(s).events.every(e => e.path === "T7"));
  assert.strictEqual(s.get().ui.sel.id, "T7");
  s.dispatch({ type: "profile.rename", kind: "system", oldId: "RF-1", newId: "RDR-1" });
  assert.strictEqual(s.get().ui.readout.text, "RDR-1 is in use. Pick another id.");
  s.dispatch({ type: "profile.rename", kind: "system", oldId: "RDR-1", newId: "RDR-9" });
  same(P(s).telemetry.stations, ["RDR-9"]);

  // depth 100
  s = mk();
  for (let i = 0; i < 120; i++) s.set("scene.systems.0.x", i);
  let n = 0; while (s.undo()) n++;
  assert.strictEqual(n, 100);

  // library actions
  s = mk();
  s.set("name", "x");
  s.dispatch({ type: "baseline.pin", label: "before" });
  assert.strictEqual(s.get().ui.baseline.record, P(s));
  s.dispatch({ type: "lib.activate", id: "OWA-001" });
  assert.strictEqual(s.get().activeId, "OWA-001");
  assert.strictEqual(s.canUndo(), false);
  assert.strictEqual(s.get().ui.baseline, null);
  const lib0 = s.get().lib.length;
  const rep = JSON.parse(JSON.stringify(s.get().lib[1]));
  rep.name = "Replaced";
  const act = { type: "lib.replace", records: [rep] };
  s.dispatch(act);
  assert.strictEqual(s.get().lib.length, lib0);
  assert.strictEqual(s.get().lib[1].name, "Replaced");
  assert.strictEqual(s.get().activeId, rep.id);
  same([act.replaced, act.added], [1, 0]);
  s = PS.store.create({ lib: [PS.seed.load()[0]] });
  s.dispatch({ type: "lib.remove", id: "CUAS-001" });
  assert.strictEqual(s.get().lib.length, 1);
  same(s.get().ui.readout, { text: "Keep at least one profile.", level: "warn" });
  s = mk();
  s.set("name", "y");
  const v0 = P(s).v;
  s.dispatch({ type: "lib.bump" });
  assert.strictEqual(P(s).v, v0 + 1);
  assert.ok(!s.get().dirty["CUAS-001"]);
  s.dispatch({ type: "time.loop", loop: "range", range: { t0: 100, t1: 110 } });
  same([s.get().ui.loop, s.get().ui.range.t0], ["range", 100]);
  s.dispatch({ type: "time.rate", rate: 3 });
  assert.strictEqual(s.get().ui.rate, 1);

  // bus: reference diffs, readout from ui.readout, units
  s = mk();
  PS.bus.wire(s);
  const got = [];
  const chans = ["profile", "lib", "sel", "panels", "time", "hover", "baseline", "readout", "units", "cam"];
  const offs = chans.map(c => PS.bus.on(c, p => got.push(c)));
  try {
    s.ui("panels.help", true);
    same(got, ["panels"]);
    got.length = 0;
    s.set("name", "z");
    assert.ok(got.includes("profile") && got.includes("lib") && !got.includes("sel"));
    got.length = 0;
    s.dispatch({ type: "profile.remove", path: "scene.aircraft", id: "T1" });
    same(got, ["readout"]);
    got.length = 0;
    s.dispatch({ type: "hover.set", kind: "path", id: "T1", t: 3 });
    s.dispatch({ type: "baseline.pin" });
    s.dispatch({ type: "time.view", tview: { t0: 0, t1: 10 } });
    same(got, ["hover", "baseline", "time"]);
    got.length = 0;
    s.ui("units", "si");
    same(got, ["units"]);
    assert.strictEqual(PS.units.mode, "si");
  } finally {
    offs.forEach(f => f());
    PS.units.set("nav");
  }

  // selectors
  s = mk();
  s.dispatch({ type: "sel.set", kind: "path", id: "T1", i: 2 });
  let x = PS.sel.selected(s.get());
  same([x.kind, x.obj.hold, x.parent.id], ["wp", 60, "T1"]);
  s.dispatch({ type: "sel.set", kind: "volume", id: "DA", i: 1 });
  x = PS.sel.selected(s.get());
  same([x.kind, x.obj, x.parent.id], ["vertex", [250, -250], "DA"]);
  s.dispatch({ type: "sel.set", kind: "system", id: "EO-1" });
  x = PS.sel.selected(s.get());
  same([x.kind, x.parent], ["system", null]);
  assert.strictEqual(PS.sel.originId(s.get()), "asset");
  s.ui("cam.ref", "RF-1");
  assert.strictEqual(PS.sel.originId(s.get()), "RF-1");
  s.ui("cam.ref", "NOPE");
  assert.strictEqual(PS.sel.originId(s.get()), "asset");
  s.ui("mode", "brief");
  s.dispatch({ type: "profile.set", path: "cards.0.cam.ref", value: "EO-1" });
  assert.strictEqual(PS.sel.originId(s.get()), "EO-1");
  assert.strictEqual(PS.sel.card(s.get()).id, "c1");
  assert.strictEqual(PS.sel.canEdit(s.get()), false);
  const bv = PS.sel.buildView(s.get());
  ["proj", "yaw", "pitch", "ref", "layers", "focus", "t", "hoverT", "sel", "hover", "units", "bounds", "zoom", "px", "py", "placing", "ruler", "snap"].forEach(k => assert.ok(k in bv, "buildView." + k));
  assert.strictEqual(PS.sel.cardView(s.get(), PS.sel.card(s.get())).proj, "plan");

  // library order: active collection first, then newest updated
  s = mk();
  s.dispatch({ type: "lib.activate", id: "SURR-001" });
  let L = PS.sel.library(s.get());
  same(L.map(g => g.collection), ["Reference", "Toughstump"]);
  s.dispatch({ type: "lib.activate", id: "CUAS-001" });
  s.dispatch({ type: "profile.set", path: "name", value: "n" });
  L = PS.sel.library(s.get());
  same(L[0].profiles.map(p => p.id), ["CUAS-001", "MULTI-001", "OWA-001"]);
  s.ui("query", "racetrack");
  same(PS.sel.library(s.get()).map(g => g.profiles.map(p => p.id)), [["SURR-001"]]);
};
