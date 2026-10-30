// Lane 4: PS.keys table, matching and cheat sheet (contract 18 and 20).
module.exports = function (PS, assert) {
  const K = PS.keys;
  assert.ok(Array.isArray(K.map) && K.map.length > 0, "PS.keys.map is a list");
  for (const e of K.map) {
    assert.ok(e.key && e.when && e.action, "entry needs key, when and action: " + JSON.stringify(e));
  }
  if (PS.app && PS.app.actions) {
    for (const e of K.map) assert.ok(e.action in PS.app.actions, "PS.app.actions has no " + e.action);
  }
  const seen = new Set();
  for (const e of K.map) {
    const k = e.key + "@" + e.when;
    assert.ok(!seen.has(k), "two entries share key and when: " + k);
    seen.add(k);
  }
  assert.ok(K.sheet("build").length > 25, "sheet(build) has more than 25 rows");
  const layer = K.map.find(e => e.key === "Shift+Digit1..8");
  assert.ok(layer, "Shift+Digit1..8 entry exists");
  assert.strictEqual(K.match({ key: "!", code: "Digit1", shiftKey: true }, layer), true);
  assert.strictEqual(K.match({ key: "*", code: "Digit8", shiftKey: true }, layer), true);
  assert.ok(K.map.some(e => e.key === "k" && e.when === "brief"), "k in brief exists");

  // the E key opens the palette on the Events group
  const e = K.map.find(x => x.key === "e" && x.when === "build");
  assert.strictEqual(e.action, "palette.open");
  assert.strictEqual(e.args.group, "events");
  // plain letters do not fire with a modifier, Shift+Arrow is not a plain arrow
  const a = K.map.find(x => x.key === "a");
  assert.strictEqual(K.match({ key: "a", code: "KeyA" }, a), true);
  assert.strictEqual(K.match({ key: "A", code: "KeyA", shiftKey: true }, a), false);
  assert.strictEqual(K.match({ key: "a", code: "KeyA", ctrlKey: true }, a), false);
  const arrows = K.map.find(x => x.action === "sel.nudge" && !x.args);
  assert.strictEqual(K.match({ key: "ArrowUp", code: "ArrowUp", shiftKey: true }, arrows), false);
  const shArrows = K.map.find(x => x.key === "Shift+Arrow*");
  assert.strictEqual(K.match({ key: "ArrowUp", code: "ArrowUp", shiftKey: true }, shArrows), true);
  const undo = K.map.find(x => x.action === "undo");
  assert.strictEqual(K.match({ key: "z", code: "KeyZ", ctrlKey: true }, undo), true);
  assert.strictEqual(K.match({ key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true }, undo), false);
  const redo = K.map.find(x => x.action === "redo");
  assert.strictEqual(K.match({ key: "Z", code: "KeyZ", ctrlKey: true, shiftKey: true }, redo), true);
  assert.strictEqual(K.match({ key: "y", code: "KeyY", ctrlKey: true }, redo), true);
  const step10 = K.map.find(x => x.key === "Shift+,|Shift+.");
  assert.strictEqual(K.match({ key: "<", code: "Comma", shiftKey: true }, step10), true);
  const help = K.map.find(x => x.action === "help.toggle");
  assert.strictEqual(K.match({ key: "?", code: "Slash", shiftKey: true }, help), true);
  const zoom = K.map.find(x => x.action === "view.zoom");
  assert.strictEqual(K.match({ key: "+", code: "Equal", shiftKey: true }, zoom), true);
  const jump = K.map.find(x => x.action === "card.jump");
  assert.strictEqual(K.match({ key: "9", code: "Digit9" }, jump), true);
  assert.strictEqual(K.match({ key: "0", code: "Digit0" }, jump), false);
  for (const row of K.sheet("brief")) assert.ok(row.keys && row.label, "sheet rows carry keys and label");
  assert.ok(!K.sheet("build").some(r => /\u2014/.test(r.label + r.keys)), "no em-dash in the sheet");
};
