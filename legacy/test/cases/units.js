// Lane 0: PS.units and PS.fmt (contract 2 and 20).
module.exports = function (PS, assert) {
  const U = PS.units, prev = U.mode;
  try {
    U.set("nav");
    assert.strictEqual(U.h(1852), "1.00 nm");
    assert.strictEqual(U.h(20000), "10.8 nm");
    assert.strictEqual(U.hDual(4000), "2.16 nm (4,000 m)");
    assert.strictEqual(U.v(120), "394 ft AGL");
    assert.strictEqual(U.spd(12), "23 kt");
    assert.ok(Math.abs(U.toM("2.2", "h") - 4074) <= 1);
    assert.strictEqual(U.toM("2km", "h"), 2000);
    assert.strictEqual(U.toM("abc", "h"), null);
    assert.strictEqual(U.parseT("2:55", 0), 175);
    assert.strictEqual(U.parseT("+10", 100), 110);
    assert.strictEqual(U.parseT("x", 0), null);
    assert.strictEqual(U.t(95), "t+1:35");
    assert.strictEqual(U.t(null), "full run");
    const bar = U.roundBar(7400);
    assert.strictEqual(bar.m, 1852);
    assert.strictEqual(bar.label, "1 nm");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(U.labels())), { h: "nm", v: "ft", spd: "kt" });

    U.set("si");
    assert.strictEqual(U.h(1852), "1.85 km");
    assert.ok(Math.abs(U.toM("900ft", "v") - 274) <= 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(U.labels())), { h: "km", v: "m", spd: "m/s" });
  } finally {
    U.set(prev);
  }
};
