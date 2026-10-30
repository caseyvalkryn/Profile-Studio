// Lane 1: PS.catalog (contract 3 and 20).
module.exports = function (PS, assert) {
  // vm objects carry another realm's prototypes, so deep comparisons go through a JSON copy
  const J = x => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const same = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
  const C = PS.catalog;
  assert.strictEqual(C.ARCHETYPES.length, 13);
  assert.strictEqual(new Set(C.ARCHETYPES.map(a => a.id)).size, 13);
  same(C.ARCHETYPES.filter(a => a.rf === false).map(a => a.id).sort(), ["g1-fpv-fiber", "g3-delta-owa", "g3-jet-owa"]);
  assert.ok(C.ARCHETYPES.every(a => typeof a.rf === "boolean"));
  const fpv = C.search("fpv");
  assert.ok(fpv.length >= 2);
  same(fpv.slice(0, 2).map(r => r.group), ["aircraft", "aircraft"]);
  same(C.search("FPV").map(r => r.id), fpv.map(r => r.id));
  assert.ok(C.search("").length > 13);
  C.SYS_KINDS.forEach(k => assert.ok(C.SYS_DEFAULTS[k[0]], "SYS_DEFAULTS has " + k[0]));
  C.SENSOR_KINDS.forEach(k => assert.ok(C.SYS_DEFAULTS[k].confirm > 0, k + " confirm"));
  C.EFFECTOR_KINDS.forEach(k => assert.ok(C.SYS_DEFAULTS[k].tte > 0, k + " tte"));
  same(C.RATES, [0.25, 0.5, 1, 2, 4, 8, 16, 32]);
  assert.strictEqual(C.ID_DWELL, 5);
  assert.strictEqual(C.COAST_S, 10);
  assert.strictEqual(C.arch("nope").id, "g1-quad-isr");
  assert.strictEqual(C.cruiseHeight(C.arch("g1-quad-isr")), 215);
};
