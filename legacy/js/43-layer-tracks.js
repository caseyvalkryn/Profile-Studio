(function (PS) {
  "use strict";

  // Layer tracks (chip 4): frames at t by the track lifecycle (derived.trackLine), leaders, data blocks,
  // sensor-to-track lines, engagement bars, mission kill, elevation slant line, axon drop lines, hover ghosts.
  // It also draws the target TSPI cross (chip 8 "target", registered below, read from ctx.layers.target).
  var r1 = PS.cameras.r1;

  function cat(name, fallback) { return (PS.catalog && PS.catalog[name] != null) ? PS.catalog[name] : fallback; }
  function isSensor(kind) { return cat("SENSOR_KINDS", ["radar", "rf", "eoir", "acoustic"]).indexOf(kind) >= 0; }
  function zOf(cam, v) { return cam.kind === "plan" ? 0 : (v || 0); }

  // the span of trackLine that holds t, with its index; the last span includes its end
  function spanAt(lines, t) {
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i];
      if (t >= s.t0 && (t < s.t1 || (i === lines.length - 1 && t <= s.t1))) return i;
    }
    return -1;
  }

  // { identity, status, gapStart } or null before Detect
  function frameState(lines, t, identity) {
    if (!lines || !lines.length || t == null) return null;
    var i = spanAt(lines, t);
    if (i < 0) return null;
    var st = lines[i].state, status = "normal", gapStart = null, base = st;
    if (st === "coast" || st === "lost") {
      status = st === "coast" ? "coasting" : "lost";
      var j = i;
      while (j > 0 && (lines[j - 1].state === "coast" || lines[j - 1].state === "lost")) j--;
      gapStart = lines[j].t0;
      base = "pending";
      for (var k = j - 1; k >= 0; k--) { if (lines[k].state !== "coast" && lines[k].state !== "lost") { base = lines[k].state; break; } }
    }
    var id = base === "pending" ? "pending" : base === "unknown" ? "unknown" : (identity || "hostile");
    return { identity: id, status: status, gapStart: gapStart };
  }

  // what the system holds: the planned position, or dead reckoning from the last cover while in a gap
  function heldPos(w, t, fs) {
    var q = PS.geo.posAt(w, t);
    if (!fs || fs.gapStart == null) return { p: q, v: [q.vx || 0, q.vy || 0, q.vz || 0], holding: !!q.holding };
    var g = PS.geo.posAt(w, fs.gapStart), dt = Math.min(t - fs.gapStart, cat("COAST_S", 10));
    var v = [g.vx || 0, g.vy || 0, g.vz || 0];
    return { p: { x: g.x + v[0] * dt, y: g.y + v[1] * dt, z: (g.z || 0) + v[2] * dt }, v: v, holding: !!g.holding };
  }

  function speedLine(u, z, spd) {
    var h = u.mode === "si" ? String(Math.round(z)) : PS.fmt.hundredsFt(z);
    return h + " " + u.spd(spd).replace(/\s+/g, "").toUpperCase();
  }

  function drawTracks(ctx) {
    var S = ctx.S, cam = ctx.cam, d = ctx.derived, u = ctx.u, t = ctx.t, out = "", under = "", over = "";
    var paths = ctx.scene.paths || [], R = ctx.thumb ? 4 : 7;
    var sysById = {};
    (ctx.scene.systems || []).forEach(function (s) { sysById[s.id] = s; });
    var events = ctx.profile.events || [];

    // hover ghost frames at the strip pointer time
    if (ctx.hoverT != null && !ctx.thumb) {
      paths.forEach(function (p) {
        var w = d.timed && d.timed[p.id];
        if (!w || !w.length) return;
        var fs = frameState(d.trackLine && d.trackLine[p.id], ctx.hoverT, p.identity);
        if (!fs) return;
        var hp = heldPos(w, ctx.hoverT, fs).p, s = cam.project(hp.x, hp.y, zOf(cam, hp.z));
        under += S("g", { class: "ghostfr" }, ctx.sym.airFrame(fs.identity, fs.status, s[0], s[1], R));
      });
    }
    if (t == null) return under;

    // raid collapse: with Envelopes on, one frame per hull unless a member is selected
    var lead = {}, skip = {};
    if (ctx.layers.envelopes && typeof d.envelopesAt === "function") {
      (d.envelopesAt(t) || []).forEach(function (env) {
        var m = env.members || [];
        if (m.length < 2) return;
        if (ctx.sel.kind === "path" && m.indexOf(ctx.sel.id) >= 0) return;
        lead[m[0]] = m;
        m.slice(1).forEach(function (id) { skip[id] = true; });
      });
    }

    paths.forEach(function (p) {
      var w = d.timed && d.timed[p.id];
      if (!w || !w.length) return;
      var dim = ctx.dim(p.id);
      var q = PS.geo.posAt(w, t), qs = cam.project(q.x, q.y, zOf(cam, q.z));
      var fs = frameState(d.trackLine && d.trackLine[p.id], t, p.identity);
      var cross = ctx.layers.target ? ctx.sym.tspiCross(qs[0], qs[1]) : "";
      if (!fs || skip[p.id] || !ctx.layers.tracks) {
        if (cross) under += S("g", { class: "tgt" + dim }, cross);
        return;
      }
      var hp = heldPos(w, t, fs), fp = hp.p, n = 1;
      if (lead[p.id]) {
        var cx = 0, cy = 0, cz = 0;
        n = lead[p.id].length;
        lead[p.id].forEach(function (id) {
          var mw = d.timed[id] && d.timed[id].length ? PS.geo.posAt(d.timed[id], t) : fp;
          cx += mw.x; cy += mw.y; cz += mw.z || 0;
        });
        fp = { x: cx / n, y: cy / n, z: cz / n };
      }
      var s = cam.project(fp.x, fp.y, zOf(cam, fp.z)), inner = "";
      var gap = fs.status === "coasting" || fs.status === "lost";

      if (cross) {
        under += S("g", { class: "tgt" + dim }, cross +
          (gap ? S("line", { x1: r1(qs[0]), y1: r1(qs[1]), x2: r1(s[0]), y2: r1(s[1]), class: "tgtl" }) : ""));
      }
      // sensor-to-track lines; a coasting track draws none
      if (!gap && typeof d.coveringAt === "function") {
        (d.coveringAt(p.id, t) || []).forEach(function (id) {
          var b = sysById[id];
          if (!b || !isSensor(b.kind)) return;
          var bs = cam.project(b.x, b.y, zOf(cam, b.z));
          under += S("g", { class: "trk" + dim }, ctx.sym.lockLine(bs, s, "tracking"));
        });
      }
      // axon drop line, elevation slant line from the reference
      if (cam.kind === "axon") {
        var gs = cam.project(fp.x, fp.y, 0);
        inner += S("line", { x1: r1(s[0]), y1: r1(s[1]), x2: r1(gs[0]), y2: r1(gs[1]), class: "drop id-" + fs.identity });
      }
      if (cam.kind === "elev") {
        var o = cam.origin, os = cam.project(o.x, o.y, o.z || 0);
        inner += S("line", { x1: r1(os[0]), y1: r1(os[1]), x2: r1(s[0]), y2: r1(s[1]), class: "slant" });
        if (!ctx.thumb) {
          var rh = Math.hypot(fp.x - o.x, fp.y - o.y), dz = (fp.z || 0) - (o.z || 0);
          var txt = u.h(Math.hypot(rh, dz)) + " " + Math.round(Math.atan2(dz, rh) * 180 / Math.PI) + "°";
          var mx = (os[0] + s[0]) / 2, my = (os[1] + s[1]) / 2 - 4;
          ctx.label({ p: 1.5, id: p.id, box: ctx.sym.textBox(mx, my, txt, 10, "middle"), svg: ctx.sym.label(mx, my, txt, "small slx" + dim, "middle") });
        }
      }
      // leader: distance flown in 10 s at the current scale; none while lost or holding
      var spd = Math.hypot(hp.v[0], hp.v[1]);
      if (fs.status !== "lost" && !hp.holding && spd > 0) {
        var a2 = cam.project(fp.x + hp.v[0], fp.y + hp.v[1], zOf(cam, (fp.z || 0) + hp.v[2]));
        inner += ctx.sym.leader(s[0], s[1], a2[0] - s[0], a2[1] - s[1], spd * 10 * cam.scale);
      }
      inner += ctx.sym.airFrame(fs.identity, fs.status, s[0], s[1], R);
      var c = ctx.cls(p.id);
      if (c) inner += S("circle", { cx: r1(s[0]), cy: r1(s[1]), r: R + 6, class: "selring" + c });

      // engagement marks from the latest engage at or before t
      var eng = null, term = null;
      events.forEach(function (e) {
        if (e.path !== p.id || e.t > t) return;
        if (e.type === "engage" && (!eng || e.t >= eng.t)) eng = e;
        if (e.type === "terminal" && (!term || e.t >= term.t)) term = e;
      });
      if (eng && t <= eng.t + 15) {
        var es = sysById[eng.system] || (d.firstEffector && d.firstEffector[p.id] && sysById[d.firstEffector[p.id].system]);
        if (es) {
          var ep = cam.project(es.x, es.y, zOf(cam, es.z));
          if (es.kind === "ew") {
            under += S("g", { class: "eng-l" + dim }, ctx.sym.lockLine(ep, s, "jam"));
            if (!ctx.thumb) inner += ctx.sym.engageBar(s[0], s[1], "ENG-EA") + S("text", { x: r1(s[0] - R - 9), y: r1(s[1] + 4), class: "jmk" }, "J");
          } else if (es.kind === "kinetic") {
            under += S("g", { class: "eng-l" + dim }, ctx.sym.lockLine(ep, s, "lock"));
            if (!ctx.thumb) inner += ctx.sym.engageBar(s[0], s[1], "MIF-M");
          } else if (es.kind === "de") {
            under += S("g", { class: "eng-l" + dim }, ctx.sym.lockLine(ep, s, "de"));
          }
        }
      }
      if (term) inner += ctx.sym.missionKill(s[0], s[1], R);

      over += S("g", { class: "trkf" + dim, "data-k": "path", "data-id": p.id, "data-role": "frame" }, inner);
      ctx.hit({ kind: "path", id: p.id, i: null, role: null, sx: s[0], sy: s[1], r: R });

      if (!ctx.thumb) {
        var l1 = p.id + (p.group ? " " + p.group : "") + (n > 1 ? " x" + n : "") +
          (fs.status === "coasting" ? " CST" : "") + (fs.status === "lost" ? " LOST" : "") + (hp.holding && !gap ? " HOLD" : "");
        var l2 = speedLine(u, fp.z || 0, gap ? spd : Math.hypot(q.vx || 0, q.vy || 0));
        var bx = s[0] + R + 6, by = s[1] - 2;
        ctx.label({ p: 1, id: p.id, always: true, box: ctx.sym.textBox(bx, by, [l1, l2], 11.5), svg: S("g", { class: "dbg" + dim + (fs.status === "lost" ? " lost" : "") }, ctx.sym.dataBlock(bx, by, l1, l2)) });
      }
    });
    return under + over;
  }

  PS.layers.register({
    id: "tracks", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.tracks) || "Tracks",
    order: 80, chip: 4, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: drawTracks
  });

  // chip 8: drawn by the tracks layer; this entry gives the layer bar its chip
  PS.layers.register({
    id: "target", label: (PS.schema && PS.schema.LAYER_LABELS && PS.schema.LAYER_LABELS.target) || "Target TSPI",
    order: 81, chip: 8, defaultOn: true, cameras: ["plan", "elev", "axon"],
    draw: function () { return ""; }
  });
})(globalThis.PS);
