// Lane 1: PS.persist (contract 9 and 20).
module.exports = function (PS, assert) {
  // vm objects carry another realm's prototypes, so deep comparisons go through a JSON copy
  const J = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const same = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
  const P = PS.persist, Sc = PS.schema;
  const fake = (init) => {
    const m = Object.assign({}, init);
    return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  };
  const raw = PS.seed.raw(), lib = PS.seed.load();
  const derivedOf = r => (PS.derive && typeof PS.derive.all === "function" ? PS.derive.all(r) : {});

  // v3 fallback
  const v3text = JSON.stringify({ lib: raw, activeId: "OWA-001" });
  const st = fake({ "profileStudio.v3": v3text });
  const got = P.load(st);
  assert.strictEqual(got.lib.length, 4);
  assert.strictEqual(got.activeId, "OWA-001");
  same(got.lib, lib);
  assert.ok(st.m["profileStudio.v4"], "v4 written");
  assert.strictEqual(st.m["profileStudio.v3"], v3text);
  assert.strictEqual(JSON.parse(st.m["profileStudio.v4"]).schema, 4);

  // save and load v4; a saved ui without mode
  const ui = Object.assign(PS.store.defaultUi(), { mode: "brief", units: "si", theme: "dark" });
  const st4 = fake();
  assert.strictEqual(P.save(st4, { lib, activeId: "MULTI-001", ui }), true);
  const saved = JSON.parse(st4.m["profileStudio.v4"]);
  same(Object.keys(saved.ui).sort(), ["layers", "panels", "snap", "stripTab", "theme", "units"]);
  const back = P.load(st4);
  assert.strictEqual(back.activeId, "MULTI-001");
  assert.strictEqual(back.ui.units, "si");
  assert.ok(!("mode" in back.ui));
  assert.strictEqual(P.load(fake()), null);

  // export round trip, single and library
  lib.forEach(r => {
    const text = P.exportText(r, derivedOf(r));
    const ex = JSON.parse(text);
    assert.ok("cruise" in ex.scene.aircraft[0] && "name" in ex.scene.aircraft[0], "merged archetype fields");
    assert.ok(Array.isArray(ex.scene.paths[0].timed));
    const res = P.parse(text);
    same(res.errors, []);
    assert.strictEqual(res.records.length, 1);
    same(res.records[0], Sc.migrate(r));
  });
  const L = P.parse(P.exportLibrary(lib));
  assert.strictEqual(L.records.length, 4);
  same(L.records, lib);

  // a v1 export pasted into parse
  const v1 = JSON.parse(JSON.stringify(raw[0]));
  v1.schema = "profile-studio/3";
  v1.scene.aircraft = v1.scene.aircraft.map(a => Object.assign({}, PS.catalog.arch(a.arch), a));
  v1.scene.paths.forEach(p => { p.timed = p.pts.map(q => [q.x, q.y, q.z, 0, 0]); });
  const r1 = P.parse(JSON.stringify(v1, null, 2));
  same(r1.errors, []);
  same(r1.records[0], lib[0]);
  const r1l = P.parse(JSON.stringify({ schema: "profile-studio/3", library: raw }));
  same(r1l.records, lib);

  // errors
  assert.strictEqual(P.parse("{}").errors.length, 1);
  assert.strictEqual(P.parse("{}").errors[0], "This is not a profile record. Check the JSON.");
  assert.strictEqual(P.parse("not json").errors[0], "This is not a profile record. Check the JSON.");
  const v5 = JSON.parse(JSON.stringify(lib[0])); v5.schema = "profile-studio/5";
  same(P.parse(JSON.stringify(v5)), { records: [], errors: ["This record is version 5. This page reads up to version 4."] });
  const bad = JSON.parse(JSON.stringify(lib[0])); bad.events[0].path = "T9";
  const rb = P.parse(JSON.stringify(bad));
  assert.strictEqual(rb.records.length, 0);
  assert.ok(rb.errors[0].indexOf("T9") >= 0);

  // TSPI
  same(P.parseTspi("0,1,2,3\n1,2,3,4"), { samples: [[0, 1, 2, 3], [1, 2, 3, 4]], errors: [] });
  assert.strictEqual(P.parseTspi("t,x,y,z\n0,1,2,3").samples.length, 1);
  assert.strictEqual(P.parseTspi("[[0,1,2,3],{\"t\":1,\"x\":1,\"y\":1,\"z\":1}]").samples.length, 2);
  same(P.parseTspi("0,1,2").errors, ["Each line needs t, x, y, z."]);

  // blocked storage
  const thrower = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.strictEqual(P.storageAvailable(thrower), false);
  assert.strictEqual(P.load(thrower), null);
  assert.strictEqual(P.save(thrower, { lib, activeId: "CUAS-001", ui }), false);
  assert.strictEqual(P.storageAvailable(fake()), true);
};
