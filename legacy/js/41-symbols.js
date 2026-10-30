(function (PS) {
  "use strict";

  // 2525-derived marks as SVG strings (contract section 13). Class names only; css/board.css
  // maps every class to a token. No literal colour here.

  var S = PS.util.S, esc = PS.util.esc;
  function r1(v) { return Math.round(v * 10) / 10; }
  function pts(list) { return list.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" "); }

  var DIAMOND = { hostile: 1, suspect: 1 };
  var SQUARE = { neutral: 1 };
  var DASHED_ID = { pending: 1, suspect: 1 };

  // Air track frame: closed line frame with board-tone knockout and the unmanned aircraft shallow V.
  function airFrame(identity, status, sx, sy, r) {
    identity = identity || "unknown";
    status = status || "normal";
    r = r || 7;
    var shape;
    if (DIAMOND[identity]) {
      shape = S("polygon", { points: pts([[sx, sy - r * 1.25], [sx + r * 1.25, sy], [sx, sy + r * 1.25], [sx - r * 1.25, sy]]), class: "fk" });
    } else if (SQUARE[identity]) {
      shape = S("rect", { x: r1(sx - r), y: r1(sy - r), width: r1(2 * r), height: r1(2 * r), class: "fk" });
    } else {
      shape = S("circle", { cx: r1(sx), cy: r1(sy), r: r1(r), class: "fk" });
    }
    var v = r * 2 >= 10 ? S("polyline", {
      points: pts([[sx - r * 0.55, sy - r * 0.2], [sx, sy + r * 0.3], [sx + r * 0.55, sy - r * 0.2]]), class: "fv"
    }) : "";
    var dashed = DASHED_ID[identity] || status === "pending" || status === "lost";
    return S("g", { class: "af af-" + identity + " st-" + status + (dashed ? " dash" : "") }, shape + v);
  }

  // Target TSPI mark: a 9 px cross in the control ink.
  function tspiCross(sx, sy) {
    var h = 4.5;
    return S("path", { d: "M" + r1(sx - h) + "," + r1(sy) + "H" + r1(sx + h) + "M" + r1(sx) + "," + r1(sy - h) + "V" + r1(sy + h), class: "tspi" });
  }

  // Velocity leader. hx, hy: unit direction in screen px (y down). px clamped 10..48.
  function leader(sx, sy, hx, hy, px) {
    var L = Math.hypot(hx || 0, hy || 0);
    if (!(L > 1e-9)) return "";
    var n = PS.util.clamp(px || 0, 10, 48);
    return S("line", { x1: r1(sx), y1: r1(sy), x2: r1(sx + hx / L * n), y2: r1(sy + hy / L * n), class: "leader" });
  }

  // Two mono lines right of the frame.
  function dataBlock(sx, sy, line1, line2) {
    var x = r1(sx);
    return S("text", { x: x, y: r1(sy - 2), class: "db" },
      S("tspan", { x: x }, esc(line1 || "")) + (line2 ? S("tspan", { x: x, dy: 12 }, esc(line2)) : ""));
  }

  var GLYPH = {
    radar: function (x, y) { return S("path", { d: "M" + r1(x - 4) + "," + r1(y + 1) + "Q" + r1(x) + "," + r1(y - 5) + " " + r1(x + 4) + "," + r1(y + 1) + "M" + r1(x) + "," + r1(y - 1) + "V" + r1(y - 6), class: "gg" }); },
    rf: function (x, y) { return S("path", { d: "M" + r1(x) + "," + r1(y + 4) + "V" + r1(y - 3) + "M" + r1(x - 3.5) + "," + r1(y - 4) + "L" + r1(x) + "," + r1(y - 1) + "L" + r1(x + 3.5) + "," + r1(y - 4), class: "gg" }); },
    eoir: function (x, y) { return S("ellipse", { cx: r1(x), cy: r1(y), rx: 4, ry: 2.2, class: "gg" }) + S("circle", { cx: r1(x), cy: r1(y), r: 1, class: "ggf" }); },
    acoustic: function (x, y) { return S("path", { d: "M" + r1(x - 2) + "," + r1(y - 3) + "Q" + r1(x + 1) + "," + r1(y) + " " + r1(x - 2) + "," + r1(y + 3) + "M" + r1(x + 1) + "," + r1(y - 4.5) + "Q" + r1(x + 4.5) + "," + r1(y) + " " + r1(x + 1) + "," + r1(y + 4.5), class: "gg" }); },
    kinetic: function (x, y) { return S("path", { d: "M" + r1(x) + "," + r1(y - 4.5) + "L" + r1(x + 2.5) + "," + r1(y - 1) + "H" + r1(x + 1) + "V" + r1(y + 4) + "H" + r1(x - 1) + "V" + r1(y - 1) + "H" + r1(x - 2.5) + "Z", class: "gg" }); },
    de: function (x, y) { return S("path", { d: "M" + r1(x - 4) + "," + r1(y + 3) + "L" + r1(x + 4) + "," + r1(y - 3) + "M" + r1(x + 1.5) + "," + r1(y - 3.5) + "L" + r1(x + 4) + "," + r1(y - 3) + "L" + r1(x + 3.5) + "," + r1(y - 0.5), class: "gg" }); },
    ew: function (x, y) { return S("text", { x: r1(x), y: r1(y + 2.6), class: "gt" }, "EW"); }
  };

  // Ground system frame. kind: a system kind, "c2", "tspi" or "asset". status: active|inactive|degraded.
  function groundFrame(kind, status, sx, sy) {
    status = status || "active";
    var body;
    if (kind === "tspi") {
      body = S("rect", { x: r1(sx - 4.5), y: r1(sy - 4.5), width: 9, height: 9, class: "gfk gf-tspi" }) +
        S("circle", { cx: r1(sx), cy: r1(sy), r: 1.3, class: "ggf gf-tspi" });
    } else if (kind === "c2") {
      body = S("rect", { x: r1(sx - 9), y: r1(sy - 6), width: 18, height: 12, class: "gfk" }) +
        S("text", { x: r1(sx), y: r1(sy + 2.6), class: "gt" }, "C2");
    } else if (kind === "asset") {
      body = S("rect", { x: r1(sx - 10), y: r1(sy - 7), width: 20, height: 14, class: "gfk" }) +
        S("line", { x1: r1(sx - 10), y1: r1(sy - 4), x2: r1(sx + 10), y2: r1(sy - 4), class: "gg" }) +
        S("text", { x: r1(sx), y: r1(sy + 4), class: "gt" }, "DA");
    } else {
      body = S("circle", { cx: r1(sx), cy: r1(sy), r: 7, class: "gfk" }) + (GLYPH[kind] ? GLYPH[kind](sx, sy) : "");
    }
    var bar = status === "degraded" ? S("rect", { x: r1(sx - 7), y: r1(sy + 9), width: 14, height: 2.5, class: "degr" }) : "";
    return S("g", { class: "gf gf-" + kind + " gs-" + status }, body + bar);
  }

  // a and b are [sx, sy]
  function lockLine(a, b, style) {
    return S("line", { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: "ll ll-" + (style || "tracking") });
  }

  // Engagement bar above the frame.
  function engageBar(sx, sy, text) {
    var w = Math.max(30, String(text).length * 6.4 + 6);
    return S("g", { class: "eng" },
      S("rect", { x: r1(sx - w / 2), y: r1(sy - 25), width: r1(w), height: 11, class: "engb" }) +
      S("text", { x: r1(sx), y: r1(sy - 16.5), class: "engt" }, esc(text)));
  }

  function missionKill(sx, sy, r) {
    r = (r || 7) * 1.5;
    return S("line", { x1: r1(sx - r), y1: r1(sy + r), x2: r1(sx + r), y2: r1(sy - r), class: "mk" });
  }

  // Handle marks with a transparent hit circle under them.
  // extra: { filled, angle (deg, screen, for arcEnd and elRay), r (hold ring radius px), attrs (data-* for the group) }
  function handle(kind, sx, sy, extra) {
    extra = extra || {};
    var x = r1(sx), y = r1(sy), mark = "", on = extra.filled ? " on" : "";
    switch (kind) {
      case "wp": mark = S("circle", { cx: x, cy: y, r: 5, class: "hm" + on }); break;
      case "vertex": mark = S("rect", { x: r1(sx - 4), y: r1(sy - 4), width: 8, height: 8, class: "hm" + on }); break;
      case "bead": mark = S("circle", { cx: x, cy: y, r: 8, class: "hm hm-bead" + on }); break;
      case "range": mark = S("rect", { x: r1(sx - 3), y: r1(sy - 3), width: 6, height: 6, class: "hm hm-sq" + on }); break;
      case "arcEnd": case "elRay":
        var a = (extra.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        var tri = [[6, 0], [-3, 4.5], [-3, -4.5]].map(function (p) { return [sx + p[0] * c - p[1] * s, sy + p[0] * s + p[1] * c]; });
        mark = S("polygon", { points: pts(tri), class: "hm hm-tri" + on }); break;
      case "arcMid": mark = S("circle", { cx: x, cy: y, r: 3.5, class: "hm hm-mid" + on }); break;
      case "insert": case "edge":
        mark = S("path", { d: "M" + r1(sx - 3.5) + "," + y + "H" + r1(sx + 3.5) + "M" + x + "," + r1(sy - 3.5) + "V" + r1(sy + 3.5), class: "hm hm-plus" }); break;
      case "hold":
        mark = S("circle", { cx: x, cy: y, r: r1(extra.r || 9), class: "hm hm-hold" }) +
          S("circle", { cx: r1(sx + (extra.r || 9)), cy: y, r: 3, class: "hm" + on });
        break;
      case "top": mark = S("rect", { x: r1(sx - 8), y: r1(sy - 2), width: 16, height: 4, class: "hm hm-sq" + on }); break;
      case "line": mark = S("polygon", { points: pts([[sx, sy - 5], [sx + 5, sy], [sx, sy + 5], [sx - 5, sy]]), class: "hm" + on }); break;
      default: mark = S("circle", { cx: x, cy: y, r: 4, class: "hm" + on });
    }
    var hx = kind === "hold" ? r1(sx + (extra.r || 9)) : x;
    var attrs = Object.assign({ class: "h h-" + kind }, extra.attrs || {});
    return S("g", attrs, S("circle", { cx: hx, cy: y, r: 7, class: "hit" }) + mark);
  }

  // North arrow with 30 degree ticks; northDeg rotates it clockwise.
  function compass(sx, sy, r, northDeg) {
    var t = "";
    for (var a = 0; a < 360; a += 30) {
      var q = a * Math.PI / 180, i = a % 90 === 0 ? r - 4 : r - 2.5;
      t += "M" + r1(sx + Math.sin(q) * i) + "," + r1(sy - Math.cos(q) * i) + "L" + r1(sx + Math.sin(q) * r) + "," + r1(sy - Math.cos(q) * r);
    }
    var arrow = S("polygon", { points: pts([[sx, sy - r + 1], [sx + 3.5, sy + 2], [sx, sy], [sx - 3.5, sy + 2]]), class: "cpa" });
    return S("g", { class: "compass", transform: "rotate(" + r1(northDeg || 0) + " " + r1(sx) + " " + r1(sy) + ")" },
      S("circle", { cx: r1(sx), cy: r1(sy), r: r1(r), class: "cpr" }) + S("path", { d: t, class: "cpt" }) + arrow +
      S("text", { x: r1(sx), y: r1(sy - r - 3), class: "cpn" }, "N"));
  }

  function scaleBar(sx, sy, px, label, twin) {
    var x0 = r1(sx), x1 = r1(sx + px);
    return S("g", { class: "scale" },
      S("path", { d: "M" + x0 + "," + r1(sy - 4) + "V" + r1(sy) + "H" + x1 + "V" + r1(sy - 4), class: "scl" }) +
      S("text", { x: x0, y: r1(sy - 7), class: "sct" }, esc(label)) +
      (twin ? S("text", { x: x0, y: r1(sy + 12), class: "sct sct2" }, esc(twin)) : ""));
  }

  function warn(sx, sy) {
    return S("g", { class: "warnmk" },
      S("polygon", { points: pts([[sx, sy - 6], [sx + 6, sy + 4.5], [sx - 6, sy + 4.5]]), class: "wt" }) +
      S("text", { x: r1(sx), y: r1(sy + 3.5), class: "wx" }, "!"));
  }

  // ---------------------------------------------------------------- shared label helpers
  // Approximate text box for the label pass. size: font px; mono width 0.6 em per character.
  function textBox(x, y, lines, size, anchor) {
    lines = Array.isArray(lines) ? lines : [String(lines)];
    size = size || 11.5;
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, String(l).length * size * 0.6); });
    var h = lines.length * size * 1.05;
    var x0 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    return { x0: x0, y0: y - size * 0.85, x1: x0 + w, y1: y - size * 0.85 + h };
  }

  function label(x, y, text, cls, anchor) {
    return S("text", { x: r1(x), y: r1(y), class: "lbl" + (cls ? " " + cls : ""), "text-anchor": anchor && anchor !== "start" ? anchor : null }, esc(text));
  }

  PS.symbols = {
    airFrame: airFrame, tspiCross: tspiCross, leader: leader, dataBlock: dataBlock,
    groundFrame: groundFrame, lockLine: lockLine, engageBar: engageBar, missionKill: missionKill,
    handle: handle, compass: compass, scaleBar: scaleBar, warn: warn,
    textBox: textBox, label: label
  };
})(globalThis.PS);
