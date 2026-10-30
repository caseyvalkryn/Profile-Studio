// Freezes legacy derive output as golden fixtures for the TypeScript port (plan lane 2.2).
// Usage: node legacy/test/golden.js          writes fixtures/legacy-derive/*.json
//        node legacy/test/golden.js --check  compares in memory with the files on disk
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const outDir = path.join(root, "..", "fixtures", "legacy-derive");
const check = process.argv.includes("--check");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
const ctx = vm.createContext({ console, performance: { now: () => Date.now() } });
ctx.globalThis = ctx;
// Sc.blank stamps meta.created from the wall clock; pin the clock so template fixtures are stable.
vm.runInContext('(function (R) { var F = Date.UTC(2026, 0, 1); globalThis.Date = class extends R {' +
  ' constructor(...a) { super(...(a.length ? a : [F])); } static now() { return F; } }; })(Date);', ctx);
for (const f of order) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const PS = ctx.PS;

const FIELDS = ["speeds", "timed", "groupOf", "tmax", "origin", "emitsRf", "windows", "windowsRing",
  "first", "last", "firstSensor", "firstEffector", "vols", "daEntry", "dLink", "ladder", "window",
  "splits", "warnings", "crossings", "trackLine", "flown"];
const STEP = 10;
const issues = new Set();

// Round numbers to 6 decimals, sort keys, drop functions; record anything JSON cannot hold.
function norm(v, where) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) { issues.add(where + ": " + v); return String(v); }
    const r = Math.round(v * 1e6) / 1e6;
    return Object.is(r, -0) ? 0 : r;
  }
  if (typeof v === "function") { issues.add(where + ": function"); return undefined; }
  if (v === undefined) { issues.add(where + ": undefined"); return undefined; }
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x, i) => { const n = norm(x, where + "[" + i + "]"); return n === undefined ? null : n; });
  const out = {};
  for (const k of Object.keys(v).sort()) {
    const n = norm(v[k], where + "." + k);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

function build(id, rec) {
  PS.derive.invalidate();
  const d = PS.derive.all(rec);
  const derived = {};
  for (const k of FIELDS) derived[k] = d[k];
  const times = [];
  for (let t = 0; t < d.tmax; t += STEP) times.push(t);
  times.push(d.tmax);
  const paths = (rec.scene && rec.scene.paths) || [];
  const samples = {
    t: times,
    at: Object.fromEntries(paths.map(p => [p.id, times.map(t => d.at(p.id, t, "asset"))])),
    envelopesAt: times.map(t => d.envelopesAt(t))
  };
  const doc = norm({ input: rec, derived: derived, samples: samples }, id);
  return JSON.stringify(doc, null, 2) + "\n";
}

const outputs = [];
for (const rec of PS.seed.load()) outputs.push([rec.id, build(rec.id, rec)]);
for (const tp of PS.seed.templates) outputs.push([tp.id, build(tp.id, tp.make(tp.id))]);

function firstDiff(a, b, where) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== "object")
    return JSON.stringify(a) === JSON.stringify(b) ? null : where;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) { const r = firstDiff(a[k], b[k], where + (Array.isArray(a) ? "[" + k + "]" : "." + k)); if (r) return r; }
  return null;
}

let bad = 0;
for (const [id, text] of outputs) {
  const file = path.join(outDir, id + ".json");
  if (check) {
    if (!fs.existsSync(file)) { console.log("missing " + file); bad++; continue; }
    const disk = fs.readFileSync(file, "utf8");
    if (disk !== text) { console.log("differs " + id + ".json at " + (firstDiff(JSON.parse(disk), JSON.parse(text), id) || "(formatting)")); bad++; }
    else console.log("same    " + id + ".json");
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, text);
    console.log("wrote   " + id + ".json " + text.length + " bytes");
  }
}
if (issues.size) { console.log("non-JSON values (" + issues.size + "):"); [...issues].slice(0, 20).forEach(s => console.log("  " + s)); }
console.log(check ? (bad ? bad + " differ" : "all " + outputs.length + " match") : outputs.length + " files written");
process.exit(bad ? 1 : 0);
