// Lane 3: cameras, symbols, layers and render.
module.exports = function (PS, assert) {
  var CAMS = ["plan", "elev", "axon"], SIZE = { W: 900, H: 600 };
  var recs = PS.seed.load();
  assert.ok(recs.length > 0, "seed has records");

  // every element with data-k carries data-id; no em-dash in output
  function checkSvg(svg, where) {
    assert.strictEqual(typeof svg, "string", where + ": svg is a string");
    var tags = svg.match(/<[a-z][^>]*\sdata-k="[^"]*"[^>]*>/g) || [];
    tags.forEach(function (t) { assert.ok(/\sdata-id="[^"]+"/.test(t), where + ": data-k without data-id: " + t); });
    assert.ok(svg.indexOf("\u2014") < 0, where + ": em-dash in output");
    assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(svg.replace(/url\(#[^)]*\)/g, "")), where + ": literal colour in output");
  }
  function find(r, kind) { return r.scene[kind] && r.scene[kind][0]; }

  recs.forEach(function (r) {
    var d = PS.derive.all(r);
    CAMS.forEach(function (proj) {
      [null, 0, d.tmax].forEach(function (t) {
        var out = PS.render.scene(r, { proj: proj, t: t }, SIZE, {});
        var where = r.id + " " + proj + " t " + t;
        assert.ok(out.svg.indexOf("<svg") === 0, where + ": starts with <svg");
        assert.ok(out.svg.indexOf('data-k="path"') >= 0, where + ": has a path");
        assert.ok(out.cam && out.cam.kind === proj, where + ": cam kind");
        checkSvg(out.svg, where);
      });
      // edit mode with a selected path and sub-selection, then each selectable kind
      var p = find(r, "paths");
      var e = PS.render.scene(r, { proj: proj, t: 60, sel: { kind: "path", id: p.id, i: 0 } }, SIZE, { edit: true });
      assert.ok(e.hits.length > 0, r.id + " " + proj + ": hits with edit and a selected path");
      if (proj !== "axon") assert.ok(e.hits.some(function (h) { return h.handle && h.kind === "path" && h.id === p.id; }), r.id + " " + proj + ": path handles");
      checkSvg(e.svg, r.id + " " + proj + " edit");
      ["systems", "volumes", "planes"].forEach(function (k) {
        var o = find(r, k);
        if (!o) return;
        var kind = k.slice(0, -1);
        checkSvg(PS.render.scene(r, { proj: proj, t: 60, sel: { kind: kind, id: o.id, i: 0 } }, SIZE, { edit: true }).svg, r.id + " " + proj + " sel " + kind);
      });
      var ev = (r.events || [])[0];
      if (ev) checkSvg(PS.render.scene(r, { proj: proj, t: ev.t, sel: { kind: "event", id: ev.id } }, SIZE, { edit: true }).svg, r.id + " " + proj + " sel event");
      // every layer key false: no layer throws
      var off = {};
      PS.layers.list().forEach(function (L) { off[L.id] = false; });
      checkSvg(PS.render.scene(r, { proj: proj, t: 60, layers: off }, SIZE, { edit: true }).svg, r.id + " " + proj + " layers off");
      // every layer on, with hover ghosts, focus and a thumb
      var on = {};
      PS.layers.list().forEach(function (L) { on[L.id] = true; });
      checkSvg(PS.render.scene(r, { proj: proj, t: 120, hoverT: 90, layers: on, focus: [p.id] }, SIZE, {}).svg, r.id + " " + proj + " layers on");
      checkSvg(PS.render.scene(r, { proj: proj, t: 120 }, { W: 300, H: 160 }, { thumb: true }).svg, r.id + " " + proj + " thumb");
    });
    // cards, with the null card fallback
    (r.cards || []).concat([null]).forEach(function (c, i) {
      var s = PS.render.card(r, c, { W: 300, H: 160 }, true);
      assert.strictEqual(typeof s, "string", r.id + " card " + i);
      checkSvg(s, r.id + " card " + i);
    });
    ["range", "alt", "speed"].forEach(function (m) {
      checkSvg(PS.render.chart(r, d, { W: 600, H: 160 }, { mode: m, t: 60, hoverT: 30, ref: "asset" }), r.id + " chart " + m);
    });
  });

  // placing views: system ghost, aircraft route, formation ghost, ruler between two tracks
  var c1 = recs.filter(function (r) { return r.id === "CUAS-001"; })[0];
  assert.ok(c1, "seed has CUAS-001");
  var sysGhost = PS.render.scene(c1, { proj: "plan", t: 60, placing: { kind: "system", sysKind: "radar", pts: [], at: { x: 500, y: 500 } } }, SIZE, { edit: true });
  assert.ok(sysGhost.svg.indexOf('class="placing"') >= 0, "system placement ghost draws");
  checkSvg(sysGhost.svg, "placing system");
  checkSvg(PS.render.scene(c1, { proj: "elev", t: 60, placing: { kind: "system", sysKind: "radar", pts: [] } }, SIZE, { edit: true }).svg, "placing system elev");
  checkSvg(PS.render.scene(c1, { proj: "plan", t: 60, placing: { kind: "aircraft", pts: [{ x: 0, y: 3000, z: 100 }, { x: 500, y: 2000, z: 100 }] } }, SIZE, { edit: true }).svg, "placing aircraft");
  checkSvg(PS.render.scene(c1, { proj: "plan", t: 60, placing: { kind: "formation", pts: [], pathId: "T1", n: 3, spacing: 120 } }, SIZE, { edit: true }).svg, "placing formation");
  var rl = PS.render.scene(c1, { proj: "plan", t: 60, ruler: { a: { x: 0, y: 0, kind: "system", id: "RDR-1" }, b: { x: 1000, y: 1000, kind: "path", id: "T1" }, done: true } }, SIZE, { edit: true });
  assert.ok(rl.svg.indexOf('class="rulerl"') >= 0, "ruler label draws");
  var ghost = PS.render.scene(c1, { proj: "plan", t: 60, sel: { kind: "path", id: "T1", i: 0 } }, SIZE, { edit: true, ghost: c1 });
  assert.ok(ghost.svg.indexOf('class="ghostrec"') >= 0, "ghost record draws");

  // track lifecycle on CUAS-001 T1: rungs e1 28 s, e2 46 s, e3 150 s
  function frameAt(t) {
    var s = PS.render.scene(c1, { proj: "plan", t: t }, SIZE, {}).svg;
    var m = s.match(/<g class="af af-([a-z]+)[^"]*"/);
    return { id: m ? m[1] : null, cross: s.indexOf('class="tspi"') >= 0 };
  }
  var f20 = frameAt(20), f31 = frameAt(31), f120 = frameAt(120), f200 = frameAt(200);
  assert.strictEqual(f20.id, null, "t 20: no frame before Detect");
  assert.ok(f20.cross, "t 20: TSPI cross present");
  assert.strictEqual(f31.id, "pending", "t 31: pending");
  assert.strictEqual(f120.id, "unknown", "t 120: unknown");
  assert.strictEqual(f200.id, "hostile", "t 200: hostile");
  var noTracks = PS.render.scene(c1, { proj: "plan", t: 200, layers: { tracks: false, target: true } }, SIZE, {}).svg;
  assert.ok(noTracks.indexOf('class="tspi"') >= 0 && noTracks.indexOf('class="af ') < 0, "Tracks off: cross only");

  // charts
  var ch = PS.render.chart(c1, PS.derive.all(c1), { W: 600, H: 160 }, { ref: "RDR-1", t: 100 });
  var rdr = (ch.match(/<line[^>]*class="chr[^"]*"[^>]*data-id="RDR-1"[^>]*>/g) || []);
  assert.strictEqual(rdr.length, 1, "CUAS-001 chart: one RDR-1 range line");
  assert.ok(/>RDR-1<\/text>/.test(ch), "RDR-1 line label");
  ["RF-1", "EO-1"].forEach(function (id) {
    assert.ok(new RegExp('class="chd[^"]*" data-k="see" data-id="' + id + '"').test(ch), "first-see dot " + id);
    assert.ok(new RegExp(">" + id + "</text>").test(ch), "first-see label " + id);
  });
  var owa = recs.filter(function (r) { return r.id === "OWA-001"; })[0];
  assert.ok(owa, "seed has OWA-001");
  var och = PS.render.chart(owa, PS.derive.all(owa), { W: 600, H: 160 }, {});
  assert.ok(och.indexOf("RDR-1") >= 0 && och.indexOf("KIN-1") >= 0, "OWA-001 chart names RDR-1 and KIN-1");

  // hit test: a handle wins over the object under it
  var sel = PS.render.scene(c1, { proj: "plan", t: 60, sel: { kind: "path", id: "T1", i: 0 } }, SIZE, { edit: true });
  var wp = sel.hits.filter(function (h) { return h.handle && h.role === "centre" && h.kind === "path"; })[0];
  assert.ok(wp, "waypoint handle hit");
  var got = PS.render.hitTest(sel.hits, wp.sx, wp.sy);
  assert.ok(got && got.handle && got.kind === "path" && got.i === 0, "hitTest returns the waypoint handle");
  assert.strictEqual(PS.render.hitTest(sel.hits, -500, -500), null, "hitTest misses off the board");

  // cameras round trip
  var cam = PS.cameras.get("plan").setup(c1.scene, PS.derive.all(c1), SIZE, { proj: "plan", bounds: PS.geo.bounds(c1.scene) }, {});
  var sp = cam.project(1234, -567, 0), back = cam.unproject(sp[0], sp[1]);
  assert.ok(Math.abs(back.x - 1234) < 1e-6 && Math.abs(back.y + 567) < 1e-6, "plan unproject inverts project");
  var ec = PS.cameras.get("elev").setup(c1.scene, PS.derive.all(c1), SIZE, { proj: "elev", ref: "asset", bounds: PS.geo.bounds(c1.scene) }, {});
  var ep = ec.projectRZ(1500, 120), eb = ec.unproject(ep[0], ep[1]);
  assert.ok(Math.abs(eb.r - 1500) < 1e-6 && Math.abs(eb.z - 120) < 1e-6, "elev unproject inverts projectRZ");
};
