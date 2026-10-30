// Lane 1: PS.schema and PS.seed (contract 4, 5 and 20).
module.exports = function (PS, assert) {
  // vm objects carry another realm's prototypes, so deep comparisons go through a JSON copy
  const J = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const same = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
  const Sc = PS.schema, raw = PS.seed.raw(), lib = PS.seed.load();
  assert.strictEqual(lib.length, 4);
  same(lib.map(r => r.id), ["CUAS-001", "MULTI-001", "OWA-001", "SURR-001"]);
  lib.forEach((r, i) => {
    assert.strictEqual(r.schema, "profile-studio/4");
    assert.strictEqual(r.scene.paths.length, raw[i].scene.paths.length);
    assert.strictEqual(r.events.length, raw[i].events.length);
    assert.ok("tspi" in r.telemetry && !("truth" in r.telemetry), r.id + " telemetry");
    r.scene.paths.forEach(p => assert.strictEqual(p.identity, r.id === "SURR-001" ? "neutral" : "hostile"));
    r.cards.forEach(c => {
      same(Object.keys(c.layers), Sc.LAYER_KEYS);
      assert.strictEqual(c.layers.target, true);
      assert.strictEqual(c.displays.readout, false);
      assert.strictEqual(c.clip, null);
      assert.strictEqual(c.cam.ref, "asset");
    });
    r.scene.systems.forEach(b => { assert.strictEqual(b.rmin, 0); assert.strictEqual(b.elMin, -90); assert.strictEqual(b.elMax, 90); });
    r.events.forEach(e => assert.strictEqual(e.system, null));
    assert.strictEqual(r.metricsCfg.dLink, null);
    const v = Sc.validate(r);
    assert.ok(v.ok, r.id + ": " + v.errors.join(" "));
    same(Sc.migrate(r), r);
    same(Sc.migrate(Sc.migrate(raw[i])), Sc.migrate(raw[i]));
  });
  const surr = lib[3].scene.systems;
  assert.strictEqual(surr.find(s => s.id === "TM-1").kind, "tspi");
  assert.strictEqual(surr.find(s => s.id === "RTK").kind, "tspi");
  assert.strictEqual(lib[0].scene.aircraft[0].cruise, null);
  assert.strictEqual(Sc.detect({}), 3);
  assert.strictEqual(Sc.detect({ schema: "profile-studio/5" }), 5);
  assert.throws(() => Sc.migrate({ schema: "profile-studio/5", id: "X", scene: {} }), { message: "This record is version 5. This page reads up to version 4." });

  // validate failures
  const bad = JSON.parse(JSON.stringify(lib[0]));
  bad.scene.systems[0].elMin = 30; bad.scene.systems[0].elMax = 10;
  assert.strictEqual(Sc.validate(bad).ok, false);
  const bad2 = JSON.parse(JSON.stringify(lib[0]));
  bad2.cards[0].clip = { t0: 50, t1: 40, rate: 1, beats: [] };
  assert.strictEqual(Sc.validate(bad2).ok, false);
  const ok2 = JSON.parse(JSON.stringify(lib[0]));
  ok2.cards[0].clip = { t0: 40, t1: 50, rate: 2, beats: [45] };
  assert.ok(Sc.validate(ok2).ok);
  const bad3 = JSON.parse(JSON.stringify(lib[0]));
  bad3.events[2].path = "T9";
  assert.ok(Sc.validate(bad3).errors.includes("e3 refers to path T9 that does not exist."));
  const bad4 = JSON.parse(JSON.stringify(lib[0]));
  bad4.scene.systems[0].rmin = 5000;
  assert.strictEqual(Sc.validate(bad4).ok, false);
  const bad5 = JSON.parse(JSON.stringify(lib[0]));
  bad5.metricsCfg.dLink = 0;
  assert.strictEqual(Sc.validate(bad5).ok, false);

  // a v1 export shape migrates to the same result as the storage shape
  raw.forEach((r, i) => {
    const ex = JSON.parse(JSON.stringify(r));
    ex.schema = "profile-studio/3";
    ex.scene.aircraft = ex.scene.aircraft.map(a => Object.assign({}, PS.catalog.arch(a.arch), a));
    ex.scene.paths.forEach(p => { p.timed = p.pts.map(q => [q.x, q.y, q.z, 0, 0]); });
    same(Sc.migrate(ex), lib[i]);
  });

  // templates
  same(PS.seed.templates.map(t => t.id), ["point-defence", "fixed-wing-ingress", "range-test", "swarm", "blank"]);
  PS.seed.templates.forEach(t => {
    const r = t.make("PROF-1");
    const v = Sc.validate(r);
    assert.ok(v.ok, t.id + ": " + v.errors.join(" "));
    assert.strictEqual(r.id, "PROF-1");
    same([r.scene.paths.length, r.cards.length, r.events.length], [0, 0, 0]);
  });
  same(PS.seed.templates[4].make("B").scene, Sc.blank("B").scene);
  same(PS.seed.templates[3].make("S").snapshots, [10, 95]);
  assert.strictEqual(Sc.newId(lib, "PROF-"), "PROF-1");
  same(PS.sel.layerDefs().map(d => d.n + d.label), ["1Reach", "2Events", "3Envelopes", "4Tracks", "5Telemetry", "6Labels", "7Rings", "8Target TSPI"]);
};
