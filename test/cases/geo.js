// Lane 2: PS.geo on inline copies of the v1 seed geometry (geo is catalog-free, so no seed or catalog is needed).
module.exports = function (PS, assert) {
  const G = PS.geo;
  const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
  const near = (a, b, tol, what) => assert.ok(a != null && Math.abs(a - b) <= tol, what + ": got " + a + ", want " + b + " (" + tol + ")");
  const sys = (o) => Object.assign({ z: 0, rmin: 0, fov: 360, bearing: 0, elMin: -90, elMax: 90, zmin: 0, zmax: null, status: "active" }, o);
  const P = (x, y, z, hold) => ({ x, y, z: z || 0, hold: hold || 0 });
  const sq = (r) => [[-r, -r], [r, -r], [r, r], [-r, r]];

  // CUAS-001 T1 at 12 m/s
  const cuas = G.timed([P(3100, 3000, 120), P(1900, 2650, 120), P(1500, 1500, 120, 60), P(180, 160, 120)], 12);
  near(cuas[1].t0, 104.2, 0.2, "CUAS T1 [1].t0");
  near(cuas[2].t0, 205.6, 0.2, "CUAS T1 [2].t0");
  near(cuas[2].t1, 265.6, 0.2, "CUAS T1 [2].t1");
  near(cuas[3].t1, 422.4, 0.2, "CUAS T1 end");
  const p0 = G.posAt(cuas, 0);
  eq([p0.x, p0.y, p0.z], [3100, 3000, 120]);
  const ph = G.posAt(cuas, 230);
  assert.ok(ph.vx === 0 && ph.vy === 0 && ph.holding === true, "posAt in the hold");
  assert.ok(G.posAt(cuas, 50).holding === false, "posAt on a leg is not holding");
  const C = {
    "RDR-1": sys({ kind: "radar", x: 0, y: 0, range: 4000 }),
    "RF-1": sys({ kind: "rf", x: 180, y: -90, range: 3000 }),
    "EO-1": sys({ kind: "eoir", x: -140, y: 70, range: 2500, fov: 30, bearing: 45 }),
    "EW-1": sys({ kind: "ew", x: 0, y: 0, range: 1500 })
  };
  near(G.firstSee(C["RDR-1"], cuas).t, 30.1, 0.5, "firstSee RDR-1 T1");
  near(G.firstSee(C["RF-1"], cuas).t, 124.5, 0.5, "firstSee RF-1 T1");
  near(G.firstSee(C["EW-1"], cuas).t, 317.8, 0.5, "firstSee EW-1 T1");
  near(G.firstSee(C["EO-1"], cuas).t, 175.4, 0.5, "firstSee EO-1 T1");
  near(G.closingSpeed(cuas, 10, { x: 0, y: 0, z: 0 }), 10.5, 0.3, "closingSpeed at t 10");
  const da = { id: "DA", kind: "asset", pts: sq(250), zmin: 0, zmax: 0 };
  near(G.volumeEntries(da, cuas)[0].tIn, 414.1, 0.5, "DA first tIn");

  // OWA-001 T1 at 46 m/s
  const owa = G.timed([P(-9200, -8200, 300), P(-5000, -4400, 300), P(-2400, -2100, 260), P(-900, -800, 150), P(-120, -100, 20)], 46);
  const O = {
    "RDR-1": sys({ kind: "radar", x: 0, y: 0, range: 9000 }),
    "EO-1": sys({ kind: "eoir", x: -140, y: 70, range: 5000, fov: 30, bearing: 225 }),
    "KIN-1": sys({ kind: "kinetic", x: 0, y: 0, range: 3000 })
  };
  const noRf = { emitsRf: false };
  near(G.firstSee(O["RDR-1"], owa, noRf).t, 72.3, 0.5, "OWA firstSee RDR-1");
  near(G.firstSee(O["EO-1"], owa, noRf).t, 158.2, 0.5, "OWA firstSee EO-1");
  near(G.firstSee(O["KIN-1"], owa, noRf).t, 203.0, 0.5, "OWA firstSee KIN-1");
  near(owa[owa.length - 1].t1, 264.8, 0.2, "OWA end");
  const wez = { id: "WEZ", kind: "wez", pts: [[-3000, -3000], [-300, -3000], [-300, -300], [-3000, -300]], zmin: 0, zmax: 1200 };
  const we = G.volumeEntries(wez, owa);
  assert.strictEqual(we.length, 1, "one WEZ window");
  near(we[0].tIn, 181.2, 0.5, "WEZ tIn");
  near(we[0].tOut, 258.2, 0.5, "WEZ tOut");

  // MULTI-001 at 14 m/s
  const M = {
    A1: [P(3200, 2200, 100), P(2100, 1500, 100), P(1200, 1300, 100), P(150, 120, 100)],
    A2: [P(3350, 2350, 110), P(2250, 1650, 110), P(1350, 1450, 110), P(120, 180, 110)],
    A3: [P(3050, 2400, 90), P(1950, 1700, 90), P(1050, 1500, 90), P(60, 200, 90)],
    B1: [P(3200, 2200, 100), P(2300, 900, 100), P(1200, -300, 100), P(150, -120, 100)],
    B2: [P(3350, 2050, 105), P(2450, 750, 105), P(1350, -450, 105), P(200, -60, 105)],
    B3: [P(3050, 2050, 95), P(2150, 750, 95), P(1050, -450, 95), P(80, -200, 95)]
  };
  const byPath = {}, groupOf = {};
  Object.keys(M).forEach(id => { byPath[id] = G.timed(M[id], 14); groupOf[id] = id[0]; });
  near(G.medianNN(byPath, Object.keys(M), 0), 212.2, 0.5, "MULTI medianNN at t 0");
  const tm = G.tmax(Object.values(byPath));
  near(tm, 316, 0.5, "MULTI tmax");
  const sp = G.splitTimes(byPath, groupOf, tm, 530.5);
  assert.strictEqual(sp.length, 2, "two cluster changes");
  assert.ok(sp[0].from === 1 && sp[0].to === 2, "first change 1 to 2");
  near(sp[0].t, 94.6, 0.5, "split time");
  assert.ok(sp[1].from === 2 && sp[1].to === 1, "second change 2 to 1");
  near(sp[1].t, 282.4, 0.5, "merge time");
  assert.strictEqual(G.envelopesAt(byPath, groupOf, 0, 530.5).length, 1, "one envelope at t 0");
  assert.strictEqual(G.envelopesAt(byPath, groupOf, 150, 530.5).length, 2, "two envelopes at t 150");

  // shapes
  assert.strictEqual(G.hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]).length, 4, "hull of a square");
  assert.strictEqual(G.polygonArea(sq(250)), 250000);
  assert.ok(G.pointInPolygon([0, 0], sq(250)) && !G.pointInPolygon([300, 0], sq(250)));
  near(G.bearingTo({ x: 0, y: 0 }, { x: 0, y: 10 }), 0, 1e-9, "bearing north");
  near(G.bearingTo({ x: 0, y: 0 }, { x: 10, y: 0 }), 90, 1e-9, "bearing east");
  eq([G.gridStep(3000), G.gridStep(5000), G.gridStep(13000), G.gridStep(30000)], [500, 1000, 2000, 5000]);
  assert.strictEqual(G.snapStep(5000), 200);
  eq(G.bounds({}), { cx: 0, cy: 0, ext: 4400 });
  const fp = G.formationPoints([P(0, 0, 100), P(0, 1000, 100)], 3, 50);
  assert.strictEqual(fp.length, 2, "n - 1 member lists");
  eq(fp[0][0], { x: -50, y: 0, z: 100, hold: 0 });
  eq(fp[1][0], { x: 50, y: 0, z: 105, hold: 0 });
  eq(G.formationPoints([P(0, 0)], 3, 50), []);

  // coverage predicate (brief 6.1)
  const eo = sys({ kind: "eoir", x: 0, y: 0, range: 2500, fov: 30, bearing: 45 });
  assert.strictEqual(G.inCoverage(eo, { x: 1000, y: 0, z: 0 }), false, "outside a 30 degree sector");
  assert.strictEqual(G.inCoverage(eo, { x: 707, y: 707, z: 0 }), true, "inside a 30 degree sector");
  const rdr = sys({ kind: "radar", x: 0, y: 0, range: 4000 });
  assert.strictEqual(G.inCoverage(Object.assign({}, rdr, { status: "inactive" }), { x: 10, y: 0, z: 0 }), false, "inactive");
  assert.strictEqual(G.inCoverage(rdr, { x: 3990, y: 0, z: 300 }), false, "slant range 4,001 m");
  assert.strictEqual(G.inCoverage(rdr, { x: 3990, y: 0, z: 200 }), true, "slant range under 4,000 m");
  assert.strictEqual(G.inCoverage(Object.assign({}, rdr, { elMax: 45 }), { x: 100, y: 0, z: 100 * Math.tan(50 * Math.PI / 180) }), false, "above elMax");
  assert.strictEqual(G.inCoverage(Object.assign({}, rdr, { rmin: 500 }), { x: 200, y: 0, z: 0 }), false, "inside rmin");
  const rf = sys({ kind: "rf", x: 0, y: 0, range: 3000 });
  assert.strictEqual(G.inCoverage(rf, { x: 100, y: 0, z: 0 }, { emitsRf: false }), false, "rf on a silent target");
  assert.strictEqual(G.inCoverage(rf, { x: 100, y: 0, z: 0 }), true, "rf on an emitting target");

  // windows
  const ring = sys({ kind: "radar", x: 0, y: 0, range: 1000 });
  const twice = G.timed([P(-1500, 0), P(1500, 0), P(1500, 2000), P(0, 2000), P(0, 0)], 20);
  assert.strictEqual(G.coverageWindows(ring, twice).length, 2, "two ring crossings give two windows");
  const blip = G.timed([P(0, 0), P(1002.5, 0), P(0, 0)], 10);
  assert.strictEqual(G.coverageWindows(ring, blip).length, 1, "a 0.5 s exit merges into one window");
  const high = G.timed([P(-500, 0, 300), P(500, 0, 300)], 10);
  assert.strictEqual(G.volumeEntries({ pts: sq(250), zmin: 0, zmax: 0 }, high).length, 1, "zmax 0 has no top");
  assert.strictEqual(G.volumeEntries({ pts: sq(250), zmin: 0, zmax: 150 }, high).length, 0, "zmax 150 stops z 300");

  // resample and nearest point
  const rs = G.resample([[0, 0, 0, 0], [10, 100, 0, 50]], 1);
  assert.strictEqual(rs.length, 11);
  eq(rs[5], { t: 5, x: 50, y: 0, z: 25 });
  const nn = G.nearestOnPolyline(sq(250), 400, 0, true);
  assert.ok(Math.abs(nn.d - 150) < 1e-9 && nn.x === 250 && nn.y === 0, "nearest edge point");
};
