(function (PS) {
  "use strict";
  // Inspector (contract 16.2, brief 5.6 and 6.10): the selected object, or the profile sections with no selection.

  var CHANNELS = ["profile", "derived", "sel", "units", "panels"];
  var CSS = [
    "#slot-inspector{color:var(--t1)}",
    ".in{display:flex;flex-direction:column;gap:2px;padding:0 0 12px}",
    ".in .sec{padding:6px 10px 8px;border-bottom:1px solid var(--rule)}",
    ".in .sec h2{margin:0 0 6px}",
    ".in .fld{display:flex;align-items:center;gap:6px;margin:3px 0}",
    ".in .fld>label{flex:0 0 96px}",
    ".in input,.in select,.in textarea{flex:1 1 auto;min-width:0;background:var(--sunken);color:var(--t1);border:1px solid var(--rule-strong);",
    "border-radius:3px;font:var(--fw) var(--fs-2)/var(--lh-2) var(--ui);padding:2px 5px;height:var(--ctl-dense);min-height:var(--ctl-dense);box-sizing:border-box}",
    ".in .mono{font:var(--fw) var(--fs-2)/var(--lh-2) var(--mono);font-variant-numeric:var(--tnum)}",
    ".in textarea{height:auto;min-height:64px;resize:vertical}",
    ".in input[type=checkbox]{flex:0 0 auto;width:14px;height:14px;min-height:0}",
    ".in input:focus-visible,.in select:focus-visible,.in textarea:focus-visible,.in button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    ".in-suf{flex:0 0 auto;min-width:34px}",
    ".in-acts{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid var(--rule)}",
    ".in-head{display:flex;align-items:baseline;gap:8px;padding:8px 10px 0}",
    ".in-arch{margin:2px 0 6px 102px}",
    ".in-arch a{color:var(--accent)}",
    ".in-tab{width:100%;border-collapse:collapse}",
    ".in-tab th{text-align:left;padding:2px 2px}",
    ".in-tab td{padding:1px 2px}.in-tab td:first-child{color:var(--t3);width:22px}",
    ".in-tab input{width:100%}",
    ".in-tab tr.in-on td{background:color-mix(in srgb,var(--select) 10%,transparent)}",
    ".in-row{display:flex;align-items:center;gap:4px;margin:3px 0}",
    ".in-row input,.in-row select{flex:1 1 auto}",
    ".in-err{margin:4px 0;white-space:pre-line}",
    ".in-mem{display:flex;flex-wrap:wrap;gap:4px}",
    ".in-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}"
  ].join("");

  var ACTS = {
    path: [["event", "Add event here"], ["formation", "Formation"], ["reverse", "Reverse"], ["duplicate", "Duplicate"], ["delete", "Delete"]],
    wp: [["hold", "Hold"], ["insert", "Insert after"], ["wp-delete", "Delete"]],
    system: [["shape", ""], ["duplicate", "Duplicate"], ["delete", "Delete"]],
    volume: [["top", "Set top"], ["duplicate", "Duplicate"], ["delete", "Delete"]],
    plane: [["delete", "Delete"]],
    event: [["type", "Change type"], ["move", "Move to geometry"], ["delete", "Delete"]],
    group: [["split", "Split here"], ["merge", "Merge"], ["delgroup", "Delete group"]],
    card: [["apply", "Apply view"], ["open", "Open in Brief"], ["up", "Up"], ["down", "Down"], ["delete", "Delete"]],
    none: [["add", "Add"], ["card", "Save card"]]
  };
  var LISTS = { path: "scene.paths", system: "scene.systems", volume: "scene.volumes", plane: "scene.planes", event: "events", card: "cards", aircraft: "scene.aircraft" };

  function addStyle(doc, name, css) {
    if (!doc || !doc.head || doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }
  function prof(state) {
    if (!state) return null;
    if (PS.sel && PS.sel.profile) return PS.sel.profile(state);
    var l = state.lib || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === state.activeId) return l[i];
    return l[0] || null;
  }
  function der(state) {
    var r = prof(state);
    if (!r || !PS.derive || typeof PS.derive.all !== "function") return null;
    try { return PS.derive.all(r); } catch (e) { if (typeof console !== "undefined") console.error(e); return null; }
  }
  function esc(s) { return PS.util.esc(s == null ? "" : String(s)); }
  function find(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function index(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }
  function emit(ch, p) { if (PS.bus && PS.bus.emit) PS.bus.emit(ch, p); }
  function warn(text) { emit("readout", { text: text, level: "warn" }); }
  function isMsl(r) { return !!(r && r.site && r.site.datum === "MSL"); }
  function elevOf(r) { return (r && r.site && r.site.elev) || 0; }

  // display a stored metre or m/s value in the current unit, without the suffix
  function factor(kind) {
    var u = PS.units, nav = u.mode !== "si";
    if (kind === "h") return nav ? u.NM : 1000;
    if (kind === "v") return nav ? u.FT : 1;
    if (kind === "spd") return nav ? u.KT : 1;
    return 1;
  }
  function shown(m, kind) {
    if (m == null || !isFinite(m)) return "";
    var d = kind === "h" ? 3 : kind === "spd" ? 1 : 0;
    return String(Number((m / factor(kind)).toFixed(d)));
  }
  function suffix(kind) {
    var l = PS.units.labels();
    return kind === "h" ? l.h : kind === "v" ? l.v : kind === "spd" ? l.spd : kind === "deg" ? "deg" : kind === "s" ? "s" : "";
  }

  // ------------------------------------------------------------ form builders
  // input with data-p (record path), data-ty (parse type), data-null (empty is null), data-rn (rename kind)
  function inp(id, value, o) {
    o = o || {};
    // prose fields (txt) use the ui family; values, units and ids use mono
    return '<input id="' + id + '" type="text" autocomplete="off" spellcheck="false"' +
      (o.ty === "txt" && !o.rn ? "" : ' class="mono"') +
      (o.p ? ' data-p="' + esc(o.p) + '"' : "") + (o.ty ? ' data-ty="' + o.ty + '"' : "") +
      (o.nul ? ' data-null="1"' : "") + (o.rn ? ' data-rn="' + o.rn + '" data-old="' + esc(value) + '"' : "") +
      (o.act ? ' data-act="' + o.act + '"' : "") +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ' value="' + esc(value) + '">';
  }
  function sel(id, value, opts, o) {
    o = o || {};
    var h = '<select id="' + id + '"' + (o.p ? ' data-p="' + esc(o.p) + '"' : "") + (o.ty ? ' data-ty="' + o.ty + '"' : "") + ">";
    opts.forEach(function (x) {
      var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x;
      h += '<option value="' + esc(v) + '"' + (String(v) === String(value == null ? "" : value) ? " selected" : "") + ">" + esc(l) + "</option>";
    });
    return h + "</select>";
  }
  function fld(id, label, control, suf) {
    return '<div class="fld"><label class="t-sub" for="' + id + '">' + esc(label) + "</label>" + control +
      (suf != null ? '<span class="in-suf t-key">' + esc(suf) + "</span>" : "") + "</div>";
  }
  // a unit field: kind h, v, vz (point height with MSL offset), spd, deg, s, num
  function ufld(id, label, value, path, kind, o) {
    o = o || {};
    var disp = kind === "h" || kind === "v" || kind === "spd" ? shown(value, kind)
      : kind === "vz" ? shown(value == null ? null : value + (o.msl ? o.elev : 0), "v")
      : value == null ? "" : String(value);
    var suf = kind === "vz" ? suffix("v") + (o.msl ? " MSL" : " AGL") : suffix(kind);
    return fld(id, label, inp(id, disp, { p: path, ty: kind, nul: o.nul, ph: o.ph }), suf);
  }
  function btn(id, label, act, o) {
    o = o || {};
    return '<button type="button" class="' + (o.cls || "mini") + '" id="' + id + '" data-act="' + act + '"' +
      (o.aria ? ' aria-label="' + esc(o.aria) + '"' : "") + (o.data ? " " + o.data : "") + (o.dis ? " disabled" : "") + ">" + esc(label) + "</button>";
  }
  function sec(title, inner, id) {
    return '<section class="sec"' + (id ? ' id="' + id + '"' : "") + "><h2 class=\"t-label\">" + esc(title) + "</h2>" + inner + "</section>";
  }

  function catList(name) { return (PS.catalog && PS.catalog[name]) || []; }

  // ------------------------------------------------------------ selected object forms
  function actionRow(kind, ctx) {
    var list = ACTS[kind] || [];
    var h = '<div class="in-acts" id="in-actions" role="toolbar" aria-label="Actions">';
    list.forEach(function (a) {
      var act = a[0], label = a[1];
      if (act === "shape") { var omni = ctx.obj && ctx.obj.fov >= 360; act = omni ? "sector" : "omni"; label = omni ? "Make a sector" : "Make omni"; }
      if (act === "move" && !ctx.hasCheck) return;
      h += btn("in-act-" + act, label, act, { cls: act === "delete" || act === "wp-delete" || act === "delgroup" ? "mini warn" : "mini" });
    });
    return h + "</div>";
  }

  function archLine(arch) {
    if (!arch) return "";
    var u = PS.units, parts = [];
    if (arch.alt) parts.push("Height " + u.v(arch.alt[0]) + " to " + u.v(arch.alt[1]));
    if (arch.link) parts.push("Link " + arch.link);
    if (arch.sig) parts.push("Signature " + arch.sig);
    if (arch.behaviors && arch.behaviors.length) parts.push(arch.behaviors.join(", "));
    var src = arch.src && /^https?:\/\//.test(arch.src) ? ' <a href="' + esc(arch.src) + '" target="_blank" rel="noopener noreferrer">Source</a>' : "";
    return '<div class="in-arch t-sub" id="in-path-arch">' + esc(parts.join(". ")) + (parts.length ? "." : "") + src + "</div>";
  }

  function pathForm(r, d, p, ix, si) {
    var sc = r.scene || {}, base = "scene.paths." + ix, u = PS.units, msl = isMsl(r), elev = elevOf(r);
    var ac = find(sc.aircraft, p.aircraft), arch = ac && PS.catalog ? PS.catalog.arch(ac.arch) : null;
    var eff = d && d.speeds && d.speeds[p.id] != null ? d.speeds[p.id] : null;
    var h = fld("in-path-id", "Id", inp("in-path-id", p.id, { rn: "path" }));
    h += fld("in-path-aircraft", "Aircraft", sel("in-path-aircraft", p.aircraft, (sc.aircraft || []).map(function (a) {
      var ar = PS.catalog ? PS.catalog.arch(a.arch) : null;
      return [a.id, a.id + (ar ? " " + ar.name : "")];
    }), { p: base + ".aircraft", ty: "txt" }));
    h += archLine(arch);
    h += fld("in-path-group", "Group", inp("in-path-group", p.group || "", { p: base + ".group", ty: "grp", ph: "none" }));
    h += fld("in-path-identity", "Identity", sel("in-path-identity", p.identity, catList("IDENTITIES"), { p: base + ".identity", ty: "txt" }));
    h += ufld("in-path-speed", "Speed", p.speed, base + ".speed", "spd", { nul: true, ph: eff != null ? "auto " + shown(eff, "spd") : "auto" });
    var tm = d && d.timed ? d.timed[p.id] : null;
    if (tm && tm.length) h += '<div class="in-arch t-sub">Run ' + esc(u.t(tm[tm.length - 1].t1)) + "</div>";
    h += '<table class="in-tab t-data" aria-label="Waypoints"><thead><tr><th class=\"t-label\">#</th><th class=\"t-label\">x ' + esc(suffix("h")) + "</th><th class=\"t-label\">y " + esc(suffix("h")) +
      "</th><th class=\"t-label\">Height " + esc(suffix("v")) + "</th><th class=\"t-label\">Hold s</th><th class=\"t-label\"></th></tr></thead><tbody>";
    (p.pts || []).forEach(function (pt, i) {
      var b = base + ".pts." + i;
      h += '<tr class="' + (si === i ? "in-on" : "") + '"><td>' + (i + 1) + "</td>" +
        '<td><label class="in-vh" for="in-wp-' + i + '-x">Waypoint ' + (i + 1) + " x</label>" + inp("in-wp-" + i + "-x", shown(pt.x, "h"), { p: b + ".x", ty: "h" }) + "</td>" +
        '<td><label class="in-vh" for="in-wp-' + i + '-y">Waypoint ' + (i + 1) + " y</label>" + inp("in-wp-" + i + "-y", shown(pt.y, "h"), { p: b + ".y", ty: "h" }) + "</td>" +
        '<td><label class="in-vh" for="in-wp-' + i + '-z">Waypoint ' + (i + 1) + " height</label>" + inp("in-wp-" + i + "-z", shown((pt.z || 0) + (msl ? elev : 0), "v"), { p: b + ".z", ty: "vz" }) + "</td>" +
        '<td><label class="in-vh" for="in-wp-' + i + '-hold">Waypoint ' + (i + 1) + " hold</label>" + inp("in-wp-" + i + "-hold", String(pt.hold || 0), { p: b + ".hold", ty: "s" }) + "</td>" +
        "<td>" + btn("in-wp-" + i + "-del", "x", "wp-del", { aria: "Delete waypoint " + (i + 1), data: 'data-i="' + i + '"', dis: (p.pts || []).length < 2 }) + "</td></tr>";
    });
    h += "</tbody></table>";
    if ((p.pts || []).length < 2) h += '<p class="in-err t-sub t-warn">' + esc(p.id + " needs two waypoints.") + "</p>";
    return h;
  }

  function systemForm(r, s, ix) {
    var base = "scene.systems." + ix, msl = isMsl(r), elev = elevOf(r);
    var h = fld("in-system-id", "Id", inp("in-system-id", s.id, { rn: "system" }));
    h += fld("in-system-kind", "Kind", sel("in-system-kind", s.kind, catList("SYS_KINDS"), { p: base + ".kind", ty: "txt" }));
    h += ufld("in-system-x", "x", s.x, base + ".x", "h");
    h += ufld("in-system-y", "y", s.y, base + ".y", "h");
    h += ufld("in-system-z", "Height", s.z || 0, base + ".z", "vz", { msl: msl, elev: elev });
    h += ufld("in-system-range", "Range", s.range, base + ".range", "h");
    h += ufld("in-system-rmin", "Minimum range", s.rmin || 0, base + ".rmin", "h");
    h += ufld("in-system-fov", "Field of view", s.fov, base + ".fov", "deg");
    h += ufld("in-system-bearing", "Bearing", s.bearing || 0, base + ".bearing", "deg");
    h += ufld("in-system-elMin", "Elevation min", s.elMin == null ? -90 : s.elMin, base + ".elMin", "deg");
    h += ufld("in-system-elMax", "Elevation max", s.elMax == null ? 90 : s.elMax, base + ".elMax", "deg");
    h += ufld("in-system-zmin", "Bottom", s.zmin || 0, base + ".zmin", "v");
    h += ufld("in-system-zmax", "Top", s.zmax, base + ".zmax", "v", { nul: true, ph: "no top" });
    h += fld("in-system-status", "Status", sel("in-system-status", s.status || "active", [["active", "Active"], ["degraded", "Degraded"], ["inactive", "Inactive"]], { p: base + ".status", ty: "txt" }));
    if (!(s.range > 0) && PS.catalog && PS.catalog.SENSOR_KINDS.concat(PS.catalog.EFFECTOR_KINDS).indexOf(s.kind) >= 0) {
      h += '<p class="in-err t-sub t-warn">' + esc(s.id + " has no reach. Drag its ring out.") + "</p>";
    }
    return h;
  }

  function volumeForm(r, v, ix, si) {
    var base = "scene.volumes." + ix;
    var h = fld("in-volume-id", "Id", inp("in-volume-id", v.id, { rn: "volume" }));
    h += fld("in-volume-kind", "Kind", sel("in-volume-kind", v.kind, catList("VOL_KINDS"), { p: base + ".kind", ty: "txt" }));
    h += fld("in-volume-label", "Label", inp("in-volume-label", v.label || "", { p: base + ".label", ty: "txt" }));
    h += ufld("in-volume-zmin", "Bottom", v.zmin || 0, base + ".zmin", "v");
    h += ufld("in-volume-zmax", "Top", v.zmax || 0, base + ".zmax", "v");
    h += '<table class="in-tab t-data" aria-label="Vertices"><thead><tr><th class=\"t-label\">#</th><th class=\"t-label\">x ' + esc(suffix("h")) + "</th><th class=\"t-label\">y " + esc(suffix("h")) + "</th><th class=\"t-label\"></th></tr></thead><tbody>";
    (v.pts || []).forEach(function (pt, i) {
      var b = base + ".pts." + i;
      h += '<tr class="' + (si === i ? "in-on" : "") + '"><td>' + (i + 1) + "</td>" +
        '<td><label class="in-vh" for="in-vx-' + i + '-x">Vertex ' + (i + 1) + " x</label>" + inp("in-vx-" + i + "-x", shown(pt[0], "h"), { p: b + ".0", ty: "h" }) + "</td>" +
        '<td><label class="in-vh" for="in-vx-' + i + '-y">Vertex ' + (i + 1) + " y</label>" + inp("in-vx-" + i + "-y", shown(pt[1], "h"), { p: b + ".1", ty: "h" }) + "</td>" +
        "<td>" + btn("in-vx-" + i + "-del", "x", "vx-del", { aria: "Delete vertex " + (i + 1), data: 'data-i="' + i + '"', dis: (v.pts || []).length <= 3 }) + "</td></tr>";
    });
    return h + "</tbody></table>";
  }

  function planeForm(r, p, ix) {
    var base = "scene.planes." + ix;
    var h = fld("in-plane-id", "Id", inp("in-plane-id", p.id, { rn: "plane" }));
    h += fld("in-plane-label", "Label", inp("in-plane-label", p.label || "", { p: base + ".label", ty: "txt" }));
    h += ufld("in-plane-z", "Height", p.z || 0, base + ".z", "vz", { msl: isMsl(r), elev: elevOf(r) });
    return h;
  }

  function eventForm(r, d, e, ix) {
    var sc = r.scene || {}, base = "events." + ix, types = PS.catalog ? PS.catalog.EV_TYPES : {}, names = PS.catalog ? PS.catalog.EV_NAMES : {};
    var h = fld("in-event-id", "Id", inp("in-event-id", e.id, { rn: "event" }));
    h += fld("in-event-type", "Type", sel("in-event-type", e.type, Object.keys(types).map(function (k) { return [k, types[k] + " " + (names[k] || k)]; }), { p: base + ".type", ty: "txt" }));
    h += fld("in-event-label", "Label", inp("in-event-label", e.label || "", { p: base + ".label", ty: "txt" }));
    h += fld("in-event-path", "Path", sel("in-event-path", e.path, (sc.paths || []).map(function (p) { return p.id; }), { p: base + ".path", ty: "txt" }));
    h += fld("in-event-t", "Time", inp("in-event-t", e.t == null ? "" : String(Math.round(e.t * 10) / 10), { p: base + ".t", ty: "t", ph: "2:55 or 175" }), "s");
    h += fld("in-event-system", "System", sel("in-event-system", e.system || "", [["", "None"]].concat((sc.systems || []).map(function (s) { return s.id; })), { p: base + ".system", ty: "sys" }));
    ((d && d.warnings) || []).forEach(function (w) { if (w.eventId === e.id) h += '<p class="in-err t-sub t-warn">' + esc(w.text) + "</p>"; });
    return h;
  }

  function groupForm(r, letter) {
    var mem = ((r.scene && r.scene.paths) || []).filter(function (p) { return p.group === letter; });
    var h = '<div class="in-mem" role="list">';
    mem.forEach(function (p) { h += btn("in-group-" + p.id, p.id, "pick", { data: 'data-k="path" data-id="' + esc(p.id) + '"', aria: "Select " + p.id }); });
    h += "</div>";
    if (!mem.length) h += '<p class="hint">No paths use group ' + esc(letter) + ".</p>";
    return h;
  }

  function cardForm(r, c, ix) {
    var base = "cards." + ix, disp = c.displays || {};
    var h = fld("in-card-name", "Name", inp("in-card-name", c.name || "", { p: base + ".name", ty: "txt" }));
    h += fld("in-card-t", "Time", inp("in-card-t", c.t == null ? "" : String(Math.round(c.t * 10) / 10), { p: base + ".t", ty: "t", nul: true, ph: "full run" }), "s");
    h += fld("in-card-caption", "Caption", '<textarea id="in-card-caption" data-p="' + base + '.caption" data-ty="txt" rows="2">' + esc(c.caption || "") + "</textarea>");
    h += fld("in-card-notes", "Notes", '<textarea id="in-card-notes" data-p="' + base + '.notes" data-ty="txt" rows="3">' + esc(c.notes || "") + "</textarea>");
    ["timeline", "chart", "readout"].forEach(function (k) {
      h += '<div class="fld"><label class="t-sub" for="in-card-show-' + k + '">Show ' + k + '</label><input type="checkbox" id="in-card-show-' + k + '" data-p="' + base + ".displays." + k + '" data-ty="bool"' + (disp[k] ? " checked" : "") + "></div>";
    });
    return h;
  }

  // ------------------------------------------------------------ no selection
  function profileSections(state, r, d, dbPath, dbErr) {
    var u = PS.units, sc = r.scene || {}, h = "";
    var p = fld("in-name", "Name", inp("in-name", r.name || "", { p: "name", ty: "txt" }));
    p += fld("in-id", "Id", inp("in-id", r.id || "", { rn: "profile" }));
    p += fld("in-cls", "Class", sel("in-cls", r.cls, catList("CLASSES"), { p: "cls", ty: "txt" }));
    p += fld("in-collection", "Collection", inp("in-collection", r.collection || "", { p: "collection", ty: "txt" }));
    p += fld("in-purpose", "Purpose", '<textarea id="in-purpose" data-p="purpose" data-ty="txt" rows="2">' + esc(r.purpose || "") + "</textarea>");
    p += fld("in-units", "Units", sel("in-units", r.units || "nav", [["nav", "Nautical (nm, ft, kt)"], ["si", "Metric (km, m, m/s)"]], { p: "units", ty: "txt" }));
    var site = r.site || {};
    p += fld("in-datum", "Datum", sel("in-datum", site.datum || "AGL", [["AGL", "AGL"], ["MSL", "MSL"]], { p: "site.datum", ty: "txt" }));
    p += ufld("in-elev", "Site elevation", site.elev || 0, "site.elev", "v");
    var auto = d && d.dLink ? d.dLink.value : null, dl = r.metricsCfg ? r.metricsCfg.dLink : null;
    p += ufld("in-dlink", "Envelope link", dl, "metricsCfg.dLink", "h", { nul: true, ph: auto != null ? "auto " + u.h(auto) : "auto" });
    h += sec("Profile", p, "in-sec-profile");

    var a = "";
    (sc.aircraft || []).forEach(function (ac, n) {
      var ar = PS.catalog ? PS.catalog.arch(ac.arch) : null;
      a += '<div class="in-row">' +
        '<label class="in-vh" for="in-ac-' + n + '-id">Aircraft ' + (n + 1) + " id</label>" + inp("in-ac-" + n + "-id", ac.id, { rn: "aircraft" }) +
        '<label class="in-vh" for="in-ac-' + n + '-arch">Aircraft ' + (n + 1) + " archetype</label>" +
        sel("in-ac-" + n + "-arch", ac.arch, catList("ARCHETYPES").map(function (x) { return [x.id, x.name]; }), { p: "scene.aircraft." + n + ".arch", ty: "txt" }) +
        '<label class="in-vh" for="in-ac-' + n + '-cruise">Aircraft ' + (n + 1) + " cruise " + esc(suffix("spd")) + "</label>" +
        inp("in-ac-" + n + "-cruise", shown(ac.cruise, "spd"), { p: "scene.aircraft." + n + ".cruise", ty: "spd", nul: true, ph: ar ? "auto " + shown(ar.cruise, "spd") : "auto" }) +
        '<span class="in-suf t-key">' + esc(suffix("spd")) + "</span>" +
        btn("in-ac-" + n + "-del", "x", "ac-del", { aria: "Remove aircraft " + ac.id, data: 'data-id="' + esc(ac.id) + '"' }) + "</div>";
    });
    if (!(sc.aircraft || []).length) a += '<p class="hint">Press A to add an aircraft.</p>';
    a += btn("in-ac-add", "Add", "ac-add");
    h += sec("Aircraft", a, "in-sec-aircraft");

    var tel = r.telemetry || {};
    var t = fld("in-tel-tspi", "TSPI source", inp("in-tel-tspi", tel.tspi || "", { p: "telemetry.tspi", ty: "txt" }));
    t += fld("in-tel-interval", "Interval", inp("in-tel-interval", tel.interval == null ? "" : String(tel.interval), { p: "telemetry.interval", ty: "s" }), "s");
    t += fld("in-tel-stations", "Stations", inp("in-tel-stations", (tel.stations || []).join(", "), { p: "telemetry.stations", ty: "ids", ph: "RDR-1, TM-1" }));
    h += sec("Telemetry", t, "in-sec-telemetry");

    h += sec("Snapshots", fld("in-snapshots", "Times", inp("in-snapshots", (r.snapshots || []).join(", "), { p: "snapshots", ty: "nums", ph: "10, 95" }), "s"), "in-sec-snapshots");

    function lines(key, title, label) {
      var x = "";
      (r[key] || []).forEach(function (v, n) {
        x += '<div class="in-row"><label class="in-vh" for="in-' + key + "-" + n + '">' + esc(label + " " + (n + 1)) + "</label>" +
          inp("in-" + key + "-" + n, v, { p: key + "." + n, ty: "txt" }) +
          btn("in-" + key + "-" + n + "-del", "x", "line-del", { aria: "Remove " + label.toLowerCase() + " " + (n + 1), data: 'data-key="' + key + '" data-i="' + n + '"' }) + "</div>";
      });
      x += btn("in-" + key + "-add", "Add", "line-add", { data: 'data-key="' + key + '"' });
      return sec(title, x, "in-sec-" + key);
    }
    h += lines("data", "Data products", "Data product");
    h += lines("mop", "Measures of performance", "Measure");

    var paths = sc.paths || [], db = r.debrief || null;
    var pid = dbPath && find(paths, dbPath) ? dbPath : paths.length ? paths[0].id : "";
    var b = fld("in-debrief-path", "Path", sel("in-debrief-path", pid, paths.length ? paths.map(function (x) { return x.id; }) : [["", "No paths"]]));
    var have = db && db.tspi && db.tspi[pid] ? db.tspi[pid].length : 0;
    b += fld("in-debrief-tspi", "Flown TSPI", '<textarea id="in-debrief-tspi" class="mono" rows="4" placeholder="0, 3100, 3000, 120" spellcheck="false"></textarea>');
    b += '<div class="in-row">' + btn("in-debrief-apply", "Apply", "db-apply", { dis: !pid }) + btn("in-debrief-clear", "Clear", "db-clear", { dis: !have }) + "</div>";
    b += '<div class="in-err t-sub t-warn" id="in-debrief-errors" role="status">' + esc(dbErr || "") + "</div>";
    b += '<p class="hint">' + (have ? esc(pid + " has " + have + " flown samples.") : "Paste flown TSPI as t,x,y,z lines.") + "</p>";
    h += sec("Debrief", b, "in-sec-debrief");
    return h;
  }

  // ------------------------------------------------------------ mount
  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "inspector", CSS);
    var dbPath = null, dbErr = "", lastKey = null;

    function context(state) {
      var ui = state.ui || {}, s = ui.sel || {}, r = prof(state);
      var kind = s.kind || null, obj = null, ix = -1;
      if (r && kind && LISTS[kind]) {
        var list = PS.util.getPath(r, LISTS[kind]) || [];
        ix = index(list, s.id);
        obj = ix >= 0 ? list[ix] : null;
        if (!obj) kind = null;
      } else if (kind === "group") {
        if (!r || !((r.scene && r.scene.paths) || []).some(function (p) { return p.group === s.id; })) kind = null;
      } else kind = null;
      return { r: r, kind: kind, obj: obj, ix: ix, id: s.id, i: s.i == null ? null : s.i };
    }

    function render() {
      var state = store.get(), ui = state.ui || {};
      var r = prof(state);
      if (!r) { el.innerHTML = '<div class="in"><p class="hint">No profile.</p></div>'; return; }
      var d = der(state), c = context(state), h = '<div class="in">';
      var kind = c.kind;
      var actKind = kind === "path" && c.i != null ? "wp" : kind || "none";
      var hasCheck = kind === "event" && ((d && d.warnings) || []).some(function (w) { return w.eventId === c.id; });
      if (kind) {
        var label = kind === "group" ? "Group " + c.id : c.id;
        var sub = kind === "path" && c.i != null ? "waypoint " + (c.i + 1) : kind === "system" ? (PS.catalog ? (catList("SYS_KINDS").filter(function (k) { return k[0] === c.obj.kind; })[0] || [0, ""])[1] : "") : kind;
        h += '<div class="in-head"><b class="t-data-lg">' + esc(label) + '</b><span class="t-sub">' + esc(sub) + "</span></div>";
      }
      h += actionRow(actKind, { obj: c.obj, hasCheck: hasCheck });
      if (kind === "path") h += sec("Path", pathForm(r, d, c.obj, c.ix, c.i), "in-sec-path");
      else if (kind === "system") h += sec("System", systemForm(r, c.obj, c.ix), "in-sec-system");
      else if (kind === "volume") h += sec("Volume", volumeForm(r, c.obj, c.ix, c.i), "in-sec-volume");
      else if (kind === "plane") h += sec("Height plane", planeForm(r, c.obj, c.ix), "in-sec-plane");
      else if (kind === "event") h += sec("Event", eventForm(r, d, c.obj, c.ix), "in-sec-event");
      else if (kind === "group") h += sec("Members", groupForm(r, c.id), "in-sec-group");
      else if (kind === "card") h += sec("Card", cardForm(r, c.obj, c.ix), "in-sec-card");
      else h += profileSections(state, r, d, dbPath, dbErr);
      h += "</div>";

      // keep focus and an unsent debrief paste across the rebuild
      var a = doc.activeElement, fid = a && el.contains(a) ? a.id : null, selS = null, selE = null;
      try { if (fid && a.selectionStart != null) { selS = a.selectionStart; selE = a.selectionEnd; } } catch (x) { /* not a text control */ }
      var paste = el.querySelector("#in-debrief-tspi");
      var pasteVal = paste ? paste.value : "";
      var scroll = el.scrollTop;
      el.innerHTML = h;
      el.scrollTop = scroll;
      var np = el.querySelector("#in-debrief-tspi");
      if (np && pasteVal) np.value = pasteVal;
      if (fid) {
        var f = el.querySelector("#" + fid.replace(/([^\w-])/g, "\\$1"));
        if (f) {
          f.focus();
          try { if (selS != null && f.setSelectionRange) f.setSelectionRange(selS, selE); } catch (x) { /* not a text control */ }
        }
      }
      lastKey = keyOf(state);
    }

    function keyOf(state) {
      var ui = state.ui || {}, s = ui.sel || {};
      return [prof(state), s.kind, s.id, s.i, PS.units.mode, ui.mode].map(function (x) { return typeof x === "object" ? "" : String(x); }).join("|");
    }

    // ---------------------------------------------------------- parse and write
    function parseVal(ty, raw, state) {
      var r = prof(state), t = String(raw).trim();
      if (ty === "txt") return { v: raw };
      if (ty === "grp") return { v: t.toUpperCase().slice(0, 1) };
      if (ty === "bool") return { v: !!raw };
      if (ty === "sys") return { v: t || null };
      if (ty === "h" || ty === "v" || ty === "spd") {
        var m = PS.units.toM(t, ty);
        return m == null || !isFinite(m) ? { err: "Type a number, for example 2km or 900ft." } : { v: ty === "spd" ? Math.round(m * 100) / 100 : Math.round(m * 10) / 10 };
      }
      if (ty === "vz") {
        var z = PS.units.toM(t, "v");
        if (z == null || !isFinite(z)) return { err: "Type a number, for example 120m or 400ft." };
        return { v: Math.round((z - (isMsl(r) ? elevOf(r) : 0)) * 10) / 10 };
      }
      if (ty === "deg" || ty === "s" || ty === "num") {
        var n = Number(t);
        if (!t || !isFinite(n)) return { err: "Type a number." };
        if (ty === "s" && n < 0) return { err: "Type a number of 0 or more." };
        return { v: n };
      }
      if (ty === "t") {
        var v = PS.units.parseT(t, (state.ui && state.ui.t) || 0);
        return v == null ? { err: "Type a time as 2:55 or 175." } : { v: Math.round(v * 10) / 10 };
      }
      if (ty === "nums") {
        if (!t) return { v: [] };
        var parts = t.split(/[\s,]+/).filter(Boolean), out = [];
        for (var i = 0; i < parts.length; i++) {
          var x = /:/.test(parts[i]) ? PS.units.parseT(parts[i], 0) : Number(parts[i]);
          if (x == null || !isFinite(x) || x < 0) return { err: "Type times as seconds, for example 10, 95." };
          out.push(Math.round(x * 10) / 10);
        }
        return { v: out.sort(function (a, b) { return a - b; }) };
      }
      if (ty === "ids") {
        var ids = t ? t.split(/[\s,]+/).filter(Boolean) : [], sys = (r.scene && r.scene.systems) || [];
        for (var k = 0; k < ids.length; k++) if (!find(sys, ids[k])) return { err: ids[k] + " is not a system id." };
        return { v: ids };
      }
      return { v: raw };
    }

    function idsOf(kind, r, state) {
      if (kind === "profile") return (state.lib || []).map(function (x) { return x.id; });
      return (PS.util.getPath(r, LISTS[kind]) || []).map(function (x) { return x.id; });
    }

    function rename(elm, state) {
      var kind = elm.getAttribute("data-rn"), oldId = elm.getAttribute("data-old"), newId = elm.value.trim(), r = prof(state);
      if (newId === oldId) return;
      if (!newId) { warn("Type an id."); render(); return; }
      if (idsOf(kind, r, state).indexOf(newId) >= 0) { warn(newId + " is in use. Pick another id."); render(); return; }
      if (kind === "profile") { store.set("id", newId); return; }
      store.dispatch({ type: "profile.rename", kind: kind, oldId: oldId, newId: newId });
      var s = (state.ui && state.ui.sel) || {};
      if (s.kind === kind && s.id === oldId) store.dispatch({ type: "sel.set", kind: kind, id: newId, i: s.i == null ? null : s.i });
    }

    function onChange(e) {
      var t = e.target;
      if (!t || !el.contains(t)) return;
      var state = store.get();
      if (t.id === "in-debrief-path") { dbPath = t.value; dbErr = ""; render(); return; }
      if (t.hasAttribute("data-rn")) { rename(t, state); return; }
      var p = t.getAttribute("data-p"), ty = t.getAttribute("data-ty");
      if (!p || !ty) return;
      var raw = ty === "bool" ? t.checked : t.value;
      var res;
      if (t.getAttribute("data-null") && String(raw).trim() === "") res = { v: null };
      else res = parseVal(ty, raw, state);
      if (res.err) { warn(res.err); render(); return; }
      var cur = PS.util.getPath(prof(state), p);
      if (JSON.stringify(cur) === JSON.stringify(res.v)) { render(); return; }
      if (ty === "txt" && p === "units" && PS.units.set) { store.set(p, res.v); return; }
      store.set(p, res.v);
    }

    // ---------------------------------------------------------- actions
    function pathMidT(state, pid) {
      var d = der(state), tm = d && d.timed ? d.timed[pid] : null;
      if (!tm || !tm.length) return 0;
      return Math.round(tm[tm.length - 1].t1 / 2 * 10) / 10;
    }
    function removeObj(kind, id) {
      store.dispatch({ type: "profile.remove", path: LISTS[kind], id: id });
      var r = prof(store.get());
      if (!find(PS.util.getPath(r, LISTS[kind]), id)) {
        store.dispatch({ type: "sel.clear" });
        emit("toast", { text: "Deleted " + id + "." });
      }
    }
    function act(name, b) {
      var state = store.get(), ui = state.ui || {}, c = context(state), r = c.r, T = PS.tools || {};
      if (!r) return;
      switch (name) {
        case "add": store.ui("paletteOpen", true); break;
        case "card":
          if (T.saveCard) T.saveCard(store, { cam: ui.cam, layers: ui.layers, t: ui.t, sel: ui.sel });
          break;
        case "event":
          if (T.addEventAt) T.addEventAt(store, c.id, ui.t != null ? ui.t : pathMidT(state, c.id), "checkpoint", null);
          break;
        case "formation":
          if (((c.obj && c.obj.pts) || []).length < 2) { warn("Select a path with two or more waypoints."); break; }
          store.ui("placing", { kind: "formation", pathId: c.id, n: 3, spacing: 120, group: c.obj.group || "A", pts: [] });
          break;
        case "reverse": if (T.reverse) T.reverse(store, c.id); break;
        case "duplicate": if (T.duplicate) T.duplicate(store, c.kind, c.id); break;
        case "delete":
          if (c.kind === "card") { if (T.cardRemove) { T.cardRemove(store, c.ix); store.dispatch({ type: "sel.clear" }); } }
          else if (c.kind) removeObj(c.kind, c.id);
          break;
        case "hold":
          if (c.i != null) store.set("scene.paths." + c.ix + ".pts." + c.i + ".hold", ((c.obj.pts[c.i] || {}).hold || 0) + 30);
          break;
        case "insert":
          if (c.i != null) {
            var pts = PS.util.clone(c.obj.pts), a = pts[c.i], nb = pts[c.i + 1];
            if (!nb) { warn("Select a waypoint that has a next segment."); break; }
            pts.splice(c.i + 1, 0, { x: Math.round((a.x + nb.x) / 2), y: Math.round((a.y + nb.y) / 2), z: Math.round(((a.z || 0) + (nb.z || 0)) / 2), hold: 0 });
            store.set("scene.paths." + c.ix + ".pts", pts);
            store.dispatch({ type: "sel.set", kind: "path", id: c.id, i: c.i + 1 });
          }
          break;
        case "wp-delete":
          if (c.i != null && T.removeWaypoint) { T.removeWaypoint(store, c.id, c.i); store.dispatch({ type: "sel.set", kind: "path", id: c.id, i: null }); }
          break;
        case "wp-del":
          if (T.removeWaypoint) T.removeWaypoint(store, c.id, Number(b.getAttribute("data-i")));
          break;
        case "vx-del":
          var vi = Number(b.getAttribute("data-i")), vp = PS.util.clone(c.obj.pts);
          if (vp.length <= 3) break;
          vp.splice(vi, 1);
          store.set("scene.volumes." + c.ix + ".pts", vp);
          break;
        case "sector": if (T.makeSector) T.makeSector(store, c.id); break;
        case "omni": if (T.makeOmni) T.makeOmni(store, c.id); break;
        case "top": focusField("in-volume-zmax"); break;
        case "type": focusField("in-event-type"); break;
        case "move":
          if (T.moveToGeometry && T.moveToGeometry(store, c.id)) {
            var ev = find(prof(store.get()).events, c.id);
            if (ev) emit("toast", { text: "Moved " + c.id + " to " + PS.units.t(ev.t) + "." });
          }
          break;
        case "split":
          if (ui.t == null) { warn("Set the time cursor to split the group."); break; }
          if (T.splitGroup && T.splitGroup(store, c.id, ui.t) === false) warn("Group " + c.id + " is one cluster at " + PS.units.t(ui.t) + ".");
          break;
        case "merge":
          if (T.mergeGroup) {
            var letters = [c.id];
            ((r.scene && r.scene.paths) || []).forEach(function (p) { if (p.group && letters.indexOf(p.group) < 0) letters.push(p.group); });
            T.mergeGroup(store, letters);
          }
          break;
        case "delgroup":
          if (T.removeGroup) { T.removeGroup(store, c.id); store.dispatch({ type: "sel.clear" }); }
          break;
        case "apply":
          if (c.obj) {
            if (c.obj.cam) store.ui("cam", PS.util.clone(c.obj.cam));
            if (c.obj.layers) store.ui("layers", PS.util.clone(c.obj.layers));
            if (PS.time && PS.time.set) PS.time.set(c.obj.t == null ? null : c.obj.t);
            else store.dispatch({ type: "time.set", t: c.obj.t == null ? null : c.obj.t });
          }
          break;
        case "open": store.ui("cardIx", c.ix); store.ui("mode", "brief"); break;
        case "up": if (T.cardMove) T.cardMove(store, c.ix, -1); break;
        case "down": if (T.cardMove) T.cardMove(store, c.ix, 1); break;
        case "pick": store.dispatch({ type: "sel.set", kind: b.getAttribute("data-k"), id: b.getAttribute("data-id"), i: null }); break;
        case "ac-add":
          var arch0 = catList("ARCHETYPES")[0];
          store.dispatch({ type: "profile.push", path: "scene.aircraft", value: { id: PS.util.uid("A", (r.scene && r.scene.aircraft) || []), arch: arch0 ? arch0.id : "", cruise: null } });
          break;
        case "ac-del": store.dispatch({ type: "profile.remove", path: "scene.aircraft", id: b.getAttribute("data-id") }); break;
        case "line-add":
          var key = b.getAttribute("data-key");
          store.set(key, (r[key] || []).concat([""]));
          var n = (prof(store.get())[key] || []).length - 1;
          focusField("in-" + key + "-" + n);
          break;
        case "line-del":
          var k2 = b.getAttribute("data-key"), li = Number(b.getAttribute("data-i")), arr = (r[k2] || []).slice();
          arr.splice(li, 1);
          store.set(k2, arr);
          break;
        case "db-apply": debriefApply(r); break;
        case "db-clear": debriefClear(r); break;
      }
    }

    function focusField(id) {
      var f = el.querySelector("#" + id);
      if (f) f.focus();
    }

    function selectedDebriefPath(r) {
      var s = el.querySelector("#in-debrief-path");
      return s ? s.value : dbPath || (((r.scene && r.scene.paths) || [])[0] || {}).id;
    }
    function debriefApply(r) {
      var pid = selectedDebriefPath(r), ta = el.querySelector("#in-debrief-tspi");
      var text = ta ? ta.value : "";
      if (!pid) return;
      var res = PS.persist && PS.persist.parseTspi ? PS.persist.parseTspi(text) : { samples: [], errors: ["Each line needs t, x, y, z."] };
      if (!text.trim() || (res.errors && res.errors.length) || !(res.samples && res.samples.length)) {
        dbErr = "Each line needs t, x, y, z." + (res.errors && res.errors.length ? "\n" + res.errors.slice(0, 3).join("\n") : "");
        dbPath = pid;
        render();
        return;
      }
      dbErr = "";
      dbPath = pid;
      if (ta) ta.value = "";
      var db = PS.util.clone(r.debrief || { tspi: {}, events: [] });
      db.tspi = db.tspi || {};
      db.events = db.events || [];
      db.tspi[pid] = res.samples;
      store.set("debrief", db);
    }
    function debriefClear(r) {
      var pid = selectedDebriefPath(r);
      if (!r.debrief || !r.debrief.tspi || !r.debrief.tspi[pid]) return;
      var db = PS.util.clone(r.debrief);
      delete db.tspi[pid];
      db.events = (db.events || []).filter(function (e) { return e.path !== pid; });
      dbErr = "";
      store.set("debrief", db);
    }

    function onClick(e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!b || !el.contains(b) || b.disabled) return;
      act(b.getAttribute("data-act"), b);
    }
    function onKey(e) {
      var t = e.target;
      if (e.key === "Enter" && t && t.tagName === "INPUT" && el.contains(t)) { e.preventDefault(); t.blur(); }
      else if (e.key === "Escape" && t && el.contains(t) && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) { render(); }
    }

    el.addEventListener("change", onChange);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    render();

    return {
      update: function (state, channel) {
        state = store.get();
        if (channel === "panels" && keyOf(state) === lastKey) return;
        render();
      },
      unmount: function () {
        el.removeEventListener("change", onChange);
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKey);
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("inspector", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
