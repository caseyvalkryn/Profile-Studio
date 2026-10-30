// Lane 0: every js file in index order loads in a bare vm context and defines no global other than PS.
const fs = require("fs"), path = require("path"), vm = require("vm");

module.exports = function (PS, assert) {
  assert.strictEqual(PS.VERSION, "4.0.0");
  const root = path.join(__dirname, "..", "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(order.length > 0, "index.html lists no scripts");
  assert.strictEqual(order[0], "js/00-ns.js", "js/00-ns.js loads first");
  for (const f of order) assert.ok(fs.existsSync(path.join(root, f)), f + " is missing");
  const nums = order.map(f => Number(/js\/(\d+)-/.exec(f)[1]));
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i] >= nums[i - 1], order[i] + " loads before a lower prefix");
  const ctx = vm.createContext({ console, performance: { now: () => Date.now() } });
  ctx.globalThis = ctx;
  const base = new Set(Object.getOwnPropertyNames(ctx));
  for (const f of order) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
    const extra = Object.getOwnPropertyNames(ctx).filter(k => !base.has(k) && k !== "PS");
    assert.deepStrictEqual(extra, [], f + " defined globals: " + extra.join(", "));
  }
  assert.strictEqual(typeof ctx.PS, "object");
  assert.strictEqual(typeof PS.layers.register, "function");
  assert.strictEqual(typeof PS.panels.register, "function");
};
