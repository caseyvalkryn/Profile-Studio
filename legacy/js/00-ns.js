(function (PS) {
  "use strict";

  PS.VERSION = "4.0.0";

  // ---------------------------------------------------------------- util
  var util = PS.util = {};

  util.clone = function (o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  };

  util.uid = function (prefix, list, bare) {
    var used = {};
    (list || []).forEach(function (x) {
      var id = x && typeof x === "object" ? x.id : x;
      if (id != null) used[id] = true;
    });
    if (bare && !used[prefix]) return prefix;
    var n = bare ? 2 : 1;
    while (used[prefix + n]) n++;
    return prefix + n;
  };

  util.esc = function (s) {
    return (s == null ? "" : String(s))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  // attrs with a null, undefined or false value are left out; values are escaped
  util.S = function (tag, attrs, inner) {
    var a = "";
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        a += " " + k + '="' + util.esc(v) + '"';
      });
    }
    return "<" + tag + a + ">" + (inner == null ? "" : inner) + "</" + tag + ">";
  };

  function keysOf(path) {
    return Array.isArray(path) ? path : String(path).split(".");
  }

  util.setPath = function (obj, path, v) {
    var ks = keysOf(path), c = obj;
    for (var i = 0; i < ks.length - 1; i++) {
      if (c[ks[i]] == null || typeof c[ks[i]] !== "object") c[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      c = c[ks[i]];
    }
    c[ks[ks.length - 1]] = v;
    return obj;
  };

  util.getPath = function (obj, path) {
    var ks = keysOf(path), c = obj;
    for (var i = 0; i < ks.length; i++) {
      if (c == null) return undefined;
      c = c[ks[i]];
    }
    return c;
  };

  util.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  util.lerp = function (a, b, f) { return a + (b - a) * f; };

  util.angleDiff = function (a, b) {
    var d = Math.abs((((a - b) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  };

  // memoise on the identity of the first argument; objects in a WeakMap, primitives in a Map
  util.memo1 = function (fn) {
    var weak = new WeakMap(), prim = new Map();
    var m = function (a) {
      var obj = a !== null && (typeof a === "object" || typeof a === "function");
      var store = obj ? weak : prim;
      if (store.has(a)) return store.get(a);
      var v = fn.apply(this, arguments);
      store.set(a, v);
      return v;
    };
    m.clear = function () { weak = new WeakMap(); prim = new Map(); };
    return m;
  };

  // ---------------------------------------------------------------- fmt
  var fmt = PS.fmt = {};

  fmt.n = function (x, d) {
    d = d || 0;
    if (x == null || !isFinite(x)) return "";
    var s = Math.abs(x).toFixed(d).split(".");
    var neg = x < 0 && Number(s.join(".")) !== 0;
    var int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + int + (s.length > 1 ? "." + s[1] : "");
  };

  // ---------------------------------------------------------------- units
  var U = PS.units = {};
  U.NM = 1852;
  U.FT = 0.3048;
  U.KT = 0.514444;
  U.mode = "nav";

  U.set = function (mode) { U.mode = mode === "si" ? "si" : "nav"; return U.mode; };

  U.labels = function () {
    return U.mode === "si" ? { h: "km", v: "m", spd: "m/s" } : { h: "nm", v: "ft", spd: "kt" };
  };

  function hNum(m, mode) {
    var x = m / (mode === "si" ? 1000 : U.NM);
    return fmt.n(x, Math.abs(x) < 10 ? 2 : 1) + (mode === "si" ? " km" : " nm");
  }

  U.h = function (m) { return hNum(m, U.mode); };

  // the twin is metres in nav and nm in si
  U.hDual = function (m) {
    return U.mode === "si" ? hNum(m, "si") + " (" + hNum(m, "nav") + ")" : hNum(m, "nav") + " (" + fmt.n(m, 0) + " m)";
  };

  // nav always names the datum (default AGL); si names it only when the caller passes it
  U.v = function (m, datum) {
    if (U.mode === "si") return fmt.n(m, 0) + " m" + (datum ? " " + datum : "");
    return fmt.n(m / U.FT, 0) + " ft " + (datum || "AGL");
  };

  function spdNum(ms, mode) {
    return mode === "si" ? fmt.n(ms, 0) + " m/s" : fmt.n(ms / U.KT, 0) + " kt";
  }
  U.spd = function (ms) { return spdNum(ms, U.mode); };
  U.spdDual = function (ms) {
    return spdNum(ms, U.mode) + " (" + spdNum(ms, U.mode === "si" ? "nav" : "si") + ")";
  };

  U.t = function (s) {
    if (s == null) return "full run";
    var r = Math.max(0, Math.round(s));
    var m = Math.floor(r / 60), ss = r % 60;
    return "t+" + m + ":" + (ss < 10 ? "0" : "") + ss;
  };

  U.brg = function (deg) {
    var d = ((Math.round(deg) % 360) + 360) % 360;
    return (d < 10 ? "00" : d < 100 ? "0" : "") + d + "°";
  };

  var SUFFIX = {
    h: { nm: U.NM, km: 1000, m: 1, ft: U.FT },
    v: { ft: U.FT, m: 1, km: 1000, nm: U.NM },
    spd: { kt: U.KT, kts: U.KT, "m/s": 1, mps: 1 }
  };
  function baseFactor(kind) {
    var si = U.mode === "si";
    if (kind === "h") return si ? 1000 : U.NM;
    if (kind === "v") return si ? 1 : U.FT;
    return si ? 1 : U.KT;
  }

  U.toM = function (value, kind) {
    if (value == null || !SUFFIX[kind]) return null;
    var s = String(value).replace(/\s+/g, "").replace(/,/g, "").toLowerCase();
    var m = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z/]*)$/.exec(s);
    if (!m) return null;
    var x = Number(m[1]);
    if (!isFinite(x)) return null;
    if (!m[2]) return x * baseFactor(kind);
    var f = SUFFIX[kind][m[2]];
    return f == null ? null : x * f;
  };

  U.parseT = function (text, tNow) {
    if (text == null) return null;
    var s = String(text).replace(/\s+/g, "").toLowerCase();
    var rel = /^([+-])(\d+(?:\.\d+)?)$/.exec(s);
    if (rel) {
      var v = (tNow || 0) + (rel[1] === "-" ? -1 : 1) * Number(rel[2]);
      return Math.max(0, v);
    }
    s = s.replace(/^t\+/, "");
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    var ms = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
    if (ms && Number(ms[2]) < 60) return Number(ms[1]) * 60 + Number(ms[2]);
    return null;
  };

  var BAR = [0.5, 1, 2, 5, 10];
  U.roundBar = function (ext) {
    var unit = U.mode === "si" ? 1000 : U.NM;
    var target = ext / 4 / unit, best = BAR[0], bd = Infinity;
    BAR.forEach(function (b) {
      var d = Math.abs(b - target);
      if (d < bd - 1e-9 || Math.abs(d - bd) <= 1e-9) { best = b; bd = d; }
    });
    return { m: best * unit, label: best + (U.mode === "si" ? " km" : " nm") };
  };

  fmt.hundredsFt = function (m) {
    var h = Math.max(0, Math.round(m / U.FT / 100));
    return (h < 10 ? "00" : h < 100 ? "0" : "") + h;
  };
})(globalThis.PS = {});
