const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
const ctx = vm.createContext({ console, performance: { now: () => Date.now() } });
ctx.globalThis = ctx;
for (const f of order) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const PS = ctx.PS;
let fails = 0;
for (const c of fs.readdirSync(path.join(__dirname, "cases")).sort()) {
  try { require("./cases/" + c)(PS, assert); console.log("ok   " + c); }
  catch (e) { fails++; console.log("FAIL " + c + "\n     " + (e.stack || e.message)); }
}
console.log(fails ? fails + " failed" : "all passed");
process.exit(fails ? 1 : 0);
