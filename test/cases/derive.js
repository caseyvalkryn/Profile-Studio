// Lane 2: PS.derive.all on the seed (contract 20). Needs the Lane 1 catalog and seed; waits until they exist.
module.exports = function (PS, assert) {
  if (!PS.seed || typeof PS.seed.load !== "function" || !PS.catalog || typeof PS.catalog.arch !== "function") {
    console.log("wait derive.js: needs the Lane 1 catalog and seed");
    return;
  }
  const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
  const near = (a, b, tol, what) => assert.ok(a != null && Math.abs(a - b) <= tol, what + ": got " + a + ", want " + b + " (" + tol + ")");
  const recs = PS.seed.load(), by = {};
  recs.forEach(r => { by[r.id] = r; });

  // CUAS-001
  const c = PS.derive.all(by["CUAS-001"]), L = c.ladder.T1;
  ["detect", "track", "id", "engage"].forEach(k => assert.strictEqual(L[k].source, "event", "CUAS " + k + " from an event"));
  assert.strictEqual(c.window.T1.planned, 234);
  near(c.window.T1.geometric, 287.7, 1, "CUAS geometric window");
  near(c.first.T1["EO-1"].t, 175.4, 0.5, "CUAS EO-1 first see");
  assert.strictEqual(L.detect.warn, false, "CUAS detect does not warn");
  near(L.track.tGeo, 33.1, 0.5, "CUAS track tGeo");
  assert.strictEqual(L.track.warn, false, "CUAS track does not warn");
  near(L.id.tGeo, 180.4, 0.5, "CUAS id tGeo");
  assert.strictEqual(L.id.warn, true, "CUAS id warns");
  near(c.daEntry.T1, 414.1, 0.5, "CUAS daEntry");
  near(c.window.T1.latest, 404.1, 1, "CUAS latest engage");
  near(c.window.T1.margin, 142.1, 1, "CUAS margin");
  assert.strictEqual(L.engage.warn, false, "CUAS engage does not warn");
  assert.ok(L.effect.source === "event" && L.effect.event === "e6" && L.effect.t === 300 && L.effect.warn === true, "CUAS effect from e6 warns");
  near(c.window.T1.rangeAtEngage, 2121, 5, "CUAS range at engage");
  near(c.tta("T1", 0), 414.1, 0.5, "CUAS tta at 0");
  assert.ok(PS.derive.tokens(by["CUAS-001"], "{T1.margin}", 262).indexOf("2:22") >= 0, "margin token");
  assert.strictEqual(PS.derive.tokens(by["CUAS-001"], "{T9.rng}", 0), "{T9.rng}", "unknown token stays as typed");
  const cov = c.coveringAt("T1", 150);
  assert.ok(cov.indexOf("RDR-1") >= 0 && cov.indexOf("RF-1") >= 0 && cov.indexOf("EW-1") < 0, "coveringAt T1 150");
  eq(c.holdsAt("RDR-1", 150), ["T1"]);
  const span = c.trackLine.T1;
  eq(span.map(s => s.state), ["pending", "unknown", "identity"], "CUAS track lifecycle");
  const at = c.at("T1", 262, "asset");
  near(at.r, 2121, 5, "at() range"); near(at.margin, 142.1, 1, "at() margin");
  assert.ok(c.originAt("asset-edge", "T1", 0).x === 250, "asset edge origin");
  assert.strictEqual(c.originAt("RF-1", null, null).x, 180, "system origin");

  // OWA-001
  const o = PS.derive.all(by["OWA-001"]), LO = o.ladder.T1;
  assert.strictEqual(o.emitsRf.T1, false);
  near(o.first.T1["EO-1"].t, 158.2, 0.5, "OWA EO-1 first see");
  assert.strictEqual(LO.detect.warn, true, "OWA detect warns");
  near(LO.track.tGeo, 75.3, 0.5, "OWA track tGeo");
  assert.strictEqual(LO.track.warn, true, "OWA track warns");
  near(LO.id.tGeo, 163.2, 0.5, "OWA id tGeo");
  assert.strictEqual(LO.id.warn, true, "OWA id warns");
  near(o.window.T1.latest, 251.5, 1, "OWA latest engage");
  near(o.window.T1.margin, 76.5, 1, "OWA margin");
  assert.strictEqual(LO.engage.warn, false, "OWA engage does not warn");
  assert.ok(LO.effect.source === "event" && LO.effect.event === "e5" && LO.effect.t === 200, "OWA effect from e5");
  assert.strictEqual(o.window.T1.planned, 135);
  near(o.window.T1.geometric, 130.6, 1, "OWA geometric window");
  assert.strictEqual(o.firstSensor.T1.system, "RDR-1");

  // event warnings over the four seeds, OWA-001 e5 left out
  const got = [];
  recs.forEach(r => PS.derive.all(r).warnings.forEach(w => {
    if (!w.eventId || (r.id === "OWA-001" && w.eventId === "e5")) return;
    assert.ok(w.tA != null && w.tGeo != null && w.delta != null && w.text, "warning fields on " + r.id + " " + w.eventId);
    got.push(r.id + " " + w.eventId);
  }));
  eq(got.sort(), ["CUAS-001 e3", "CUAS-001 e6", "OWA-001 e1", "OWA-001 e2", "OWA-001 e3"]);
  const w3 = c.warnings.filter(w => w.eventId === "e3")[0];
  assert.strictEqual(w3.text, "e3 is 30 s early. EO-1 can identify T1 at t+3:00.");
  assert.strictEqual(c.warnings.filter(w => w.eventId === "e6")[0].text, "e6 is before EW-1 reach at t+5:18.");

  // MULTI-001
  const m = PS.derive.all(by["MULTI-001"]);
  near(m.dLink.value, 530.5, 1, "MULTI dLink"); assert.strictEqual(m.dLink.auto, true);
  assert.strictEqual(m.splits.length, 2, "MULTI two cluster changes");
  assert.ok(m.splits[0].from === 1 && m.splits[0].to === 2); near(m.splits[0].t, 94.6, 0.5, "MULTI split");
  assert.ok(m.splits[1].from === 2 && m.splits[1].to === 1); near(m.splits[1].t, 282.4, 0.5, "MULTI merge");
  assert.strictEqual(m.warnings.length, 0, "MULTI no warnings");
  near(m.window.B2.margin, 132.2, 1, "MULTI B2 margin");
  near(m.window.A3.margin, 61.2, 1, "MULTI A3 margin");
  assert.strictEqual(m.envelopesAt(150).length, 2, "MULTI two envelopes at 150");

  // flown series and ladder from debrief
  const r1 = PS.util.clone(by["CUAS-001"]), w = c.timed.T1, samples = [];
  for (let t = 0; t <= 120; t += 5) { const p = PS.geo.posAt(w, t); samples.push([t, p.x, p.y, p.z]); }
  r1.debrief = { tspi: { T1: samples }, events: [] };
  const f1 = PS.derive.all(r1).flown.T1;
  assert.strictEqual(f1.series.length, 121, "one flown sample per second");
  assert.strictEqual(f1.ladder.detect.source, "geometry");
  near(f1.ladder.detect.t, 30.1, 1, "flown detect");
  const r2 = PS.util.clone(r1);
  r2.debrief.events = [{ t: 31, type: "detect", path: "T1", label: "Radar detect, flown" }];
  const f2 = PS.derive.all(r2).flown.T1;
  assert.strictEqual(f2.ladder.detect.source, "event");
  assert.strictEqual(f2.ladder.detect.t, 31);

  // memo
  assert.strictEqual(PS.derive.all(by["CUAS-001"]), PS.derive.all(by["CUAS-001"]));
  assert.notStrictEqual(PS.derive.all(PS.util.clone(by["CUAS-001"])), PS.derive.all(by["CUAS-001"]));
};
