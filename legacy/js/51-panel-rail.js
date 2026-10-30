(function (PS) {
  "use strict";
  // Rail (contract 16, brief 3.4 and 4.1): scene tree by kind, the Checks group after Events, the card list.

  var CHANNELS = ["profile", "derived", "sel", "hover", "units", "panels"];
  var THUMB = { W: 96, H: 54 };

  var CSS = [
    "#slot-rail{background:var(--panel);color:var(--t1);overflow-y:auto}",
    ".rl{padding:6px 8px 16px}",
    ".rl-head{display:flex;align-items:center;justify-content:space-between;margin:2px 0 6px}",
    ".rl-head h2{margin:0}",
    ".rl-grp{margin:0 0 10px}",
    ".rl-grp>h3{display:flex;align-items:center;gap:6px;margin:8px 0 3px}",
    ".rl-row{--col-data:72px}",
    ".rl-row:hover,.rl-row.rl-hov{background:color-mix(in srgb,var(--select) 8%,transparent)}",
    ".rl-row.rl-sel{background:color-mix(in srgb,var(--select) 16%,transparent);box-shadow:inset 2px 0 0 var(--select)}",
    ".rl-row:focus-visible,.rl-card:focus-visible,.ck-text:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    ".rl-sub2{color:var(--t2)}",
    ".rl-row.rl-warn .rl-sub,.rl-row.rl-warn .rl-id{color:var(--warn)}",
    ".rl-ink-hostile{color:var(--hostile)}.rl-ink-friend{color:var(--friend)}.rl-ink-unknown{color:var(--unknown)}.rl-ink-ew{color:var(--ew)}",
    ".rl-empty{padding:2px 8px;margin:0}",
    ".ck-count{display:inline-block;min-width:16px;padding:0 4px;border-radius:8px;text-align:center;",
    "color:var(--warn);border:1px solid var(--warn)}",
    ".ck-count.ck-zero{color:var(--t3);border-color:var(--rule-strong)}",
    ".ck-row{display:flex;gap:6px;align-items:flex-start;padding:3px 0 3px 6px;border-left:2px solid var(--warn);margin:3px 0}",
    ".ck-row.ck-sel{background:color-mix(in srgb,var(--select) 12%,transparent)}",
    ".ck-text{flex:1;min-width:0;margin:0;padding:0;border:0;background:none;text-align:left;cursor:pointer;color:var(--t1)}",
    ".ck-rng{display:block}",
    ".rl-cards{display:flex;flex-direction:column;gap:4px}",
    ".rl-card{all:unset;box-sizing:border-box;display:flex;gap:8px;align-items:center;padding:3px;border:1px solid var(--rule);border-radius:3px;cursor:pointer}",
    ".rl-card:hover{border-color:var(--rule-strong)}",
    ".rl-thumb{flex:0 0 auto;width:" + THUMB.W + "px;height:" + THUMB.H + "px;background:var(--board);border-radius:2px;overflow:hidden;display:block}",
    ".rl-thumb svg{width:100%;height:100%;display:block}",
    ".rl-cname{color:var(--t1)}.rl-cn{margin-right:4px}"
  ].join("");

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
  function find(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function esc(s) { return PS.util.esc(s); }
  function inkOf(identity) {
    if (identity === "friend") return "rl-ink-friend";
    if (identity === "hostile" || identity === "suspect") return "rl-ink-hostile";
    return "rl-ink-unknown";
  }
  function checksOf(state, d) {
    if (PS.sel && typeof PS.sel.checks === "function") return PS.sel.checks(state) || [];
    return ((d && d.warnings) || []).filter(function (w) { return w.eventId; })
      .sort(function (a, b) { return (a.tA || 0) - (b.tA || 0); });
  }
  function kindShort(k) {
    var l = (PS.catalog && PS.catalog.SYS_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }
  function volShort(k) {
    var l = (PS.catalog && PS.catalog.VOL_KINDS) || [];
    for (var i = 0; i < l.length; i++) if (l[i][0] === k) return l[i][1];
    return k;
  }

  function mount(el, store) {
    var doc = el.ownerDocument;
    addStyle(doc, "rail", CSS);
    var thumbs = new WeakMap();   // record -> { units, list:[svg] }
    var hoverOn = false;

    function thumbFor(r, card, ix) {
      var c = thumbs.get(r);
      if (!c || c.units !== PS.units.mode) { c = { units: PS.units.mode, list: [] }; thumbs.set(r, c); }
      if (c.list[ix] == null) {
        var svg = "";
        try { svg = PS.render && PS.render.card ? PS.render.card(r, card, THUMB, true) : ""; }
        catch (e) { if (typeof console !== "undefined") console.error(e); svg = ""; }
        c.list[ix] = svg || "";
      }
      return c.list[ix];
    }

    function row(kind, id, idText, sub, opts) {
      opts = opts || {};
      var cls = "lr rl-row" + (opts.warn ? " lr-warn rl-warn" : "");
      var hasSub = sub != null && sub !== "";
      return PS.util.S("button", {
        type: "button", "class": cls, id: "rl-" + kind + "-" + id, "data-k": kind, "data-id": id,
        title: opts.title || null
      }, '<span class="lr-id rl-id' + (opts.ink ? " " + opts.ink : "") + '">' + esc(idText) + "</span>" +
        '<span class="lr-name rl-sub2"' + (opts.sub2 ? ' title="' + esc(opts.sub2) + '"' : "") + ">" + (opts.sub2Ink && opts.sub2 ? '<span class="t-mono-id ' + opts.sub2Ink + '">' + esc(opts.sub2) + "</span>" : esc(opts.sub2 || "")) + "</span>" +
        (hasSub ? '<span class="lr-data rl-sub">' + esc(sub) + "</span>" : ""));
    }

    function render() {
      var state = store.get(), r = prof(state), d = der(state), u = PS.units;
      if (!r) { el.innerHTML = '<div class="rl"><p class="rl-empty t-micro">No profile.</p></div>'; return; }
      var sc = r.scene || {}, h = '<div class="rl">';
      h += '<div class="rl-head"><h2 id="rl-title" class="t-label t-strong">Scene</h2>' +
        '<button type="button" class="mini" id="rl-hide" aria-label="Hide the scene list" title="Hide the scene list"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M7.5 3 4.5 6 7.5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';

      // Aircraft
      h += '<section class="rl-grp" aria-label="Aircraft"><h3 class="t-label">Aircraft</h3>';
      if (!(sc.aircraft || []).length) h += '<p class="rl-empty t-micro">Press A to add.</p>';
      (sc.aircraft || []).forEach(function (a) {
        var arch = PS.catalog ? PS.catalog.arch(a.arch) : null;
        h += row("aircraft", a.id, a.id, "", { sub2: arch ? arch.name : a.arch });
      });
      h += "</section>";

      // Paths
      h += '<section class="rl-grp" aria-label="Paths"><h3 class="t-label">Paths</h3>';
      (sc.paths || []).forEach(function (p) {
        var n = (p.pts || []).length, one = n < 2;
        h += row("path", p.id, p.id, n + " wp" + (one ? " ⚠" : ""), {
          ink: inkOf(p.identity), warn: one, sub2: p.group ? "group " + p.group : "",
          title: one ? p.id + " needs two waypoints." : null
        });
      });
      if (!(sc.paths || []).length) h += '<p class="rl-empty t-micro">Add an aircraft to see time.</p>';
      h += "</section>";

      // Groups
      var letters = [];
      (sc.paths || []).forEach(function (p) { if (p.group && letters.indexOf(p.group) < 0) letters.push(p.group); });
      if (letters.length) {
        h += '<section class="rl-grp" aria-label="Groups"><h3 class="t-label">Groups</h3>';
        letters.sort().forEach(function (g) {
          var n = (sc.paths || []).filter(function (p) { return p.group === g; }).length;
          h += row("group", g, "Group " + g, n + (n === 1 ? " path" : " paths"));
        });
        h += "</section>";
      }

      // Sensors and effectors
      h += '<section class="rl-grp" aria-label="Sensors"><h3 class="t-label">Sensors</h3>';
      (sc.systems || []).forEach(function (s) {
        var eff = PS.catalog && PS.catalog.EFFECTOR_KINDS.indexOf(s.kind) >= 0;
        h += row("system", s.id, s.id, s.range > 0 ? u.h(s.range) : kindShort(s.kind), {
          ink: eff ? (s.kind === "ew" ? "rl-ink-ew" : "") : "rl-ink-friend",
          sub2: s.status && s.status !== "active" ? s.status : ""
        });
      });
      if (!(sc.systems || []).length) h += '<p class="rl-empty t-micro">Add a sensor to see detection.</p>';
      h += "</section>";

      // Volumes
      if ((sc.volumes || []).length) {
        h += '<section class="rl-grp" aria-label="Volumes"><h3 class="t-label">Volumes</h3>';
        sc.volumes.forEach(function (v) { h += row("volume", v.id, v.id, "", { sub2: v.label || volShort(v.kind) }); });
        h += "</section>";
      }

      // Planes
      if ((sc.planes || []).length) {
        h += '<section class="rl-grp" aria-label="Planes"><h3 class="t-label">Planes</h3>';
        sc.planes.forEach(function (p) { h += row("plane", p.id, p.id, u.v(p.z || 0)); });
        h += "</section>";
      }

      // Events
      var checks = checksOf(state, d);
      var warned = {};
      checks.forEach(function (w) { warned[w.eventId] = w; });
      h += '<section class="rl-grp" aria-label="Events"><h3 class="t-label">Events</h3>';
      var evs = (r.events || []).slice().sort(function (a, b) { return a.t - b.t; });
      if (!evs.length) h += '<p class="rl-empty t-micro">Press E to add an event on the selected path.</p>';
      evs.forEach(function (e) {
        var letter = (PS.catalog && PS.catalog.EV_TYPES[e.type]) || "?";
        var ep = e.path ? (sc.paths || []).filter(function (p) { return p.id === e.path; })[0] : null;
        h += row("event", e.id, e.id + " " + letter, u.t(e.t), { warn: !!warned[e.id], sub2: e.path || "", sub2Ink: ep ? inkOf(ep.identity) : "" });
      });
      h += "</section>";

      // Checks
      h += '<section class="rl-grp" aria-label="Checks"><h3 class="t-label">Checks <span id="ck-count" class="t-key ck-count' +
        (checks.length ? "" : " ck-zero") + '">' + checks.length + "</span>" +
        (checks.length ? '<span class="ck-tri t-micro t-warn" aria-hidden="true">⚠</span>' : "") + "</h3>";
      if (!checks.length) h += '<p class="rl-empty t-micro">No checks.</p>';
      var sel = (state.ui && state.ui.sel) || {};
      checks.forEach(function (w) {
        var rng = w.rangeAtA != null && isFinite(w.rangeAtA) ? u.h(w.rangeAtA) : "";
        h += '<div class="ck-row' + (sel.kind === "event" && sel.id === w.eventId ? " ck-sel" : "") + '" id="ck-' + esc(w.eventId) + '">' +
          PS.util.S("button", { type: "button", "class": "t-sub ck-text", id: "ck-" + w.eventId + "-text", "data-k": "event", "data-id": w.eventId },
            esc(w.text) + (rng ? '<span class="ck-rng t-sec"><span class="t-sub">Range</span> <span class="t-data">' + esc(rng) + "</span></span>" : "")) +
          PS.util.S("button", { type: "button", "class": "mini", id: "ck-" + w.eventId + "-move", "data-move": w.eventId,
            "aria-label": "Move " + w.eventId + " to geometry", title: "Move to geometry" }, "Move") +
          "</div>";
      });
      h += "</section>";

      // Cards
      h += '<section class="rl-grp" aria-label="Cards"><h3 class="t-label">Cards</h3>';
      var cards = r.cards || [];
      if (!cards.length) h += '<p class="rl-empty t-micro">Press C to save the view as a card.</p>';
      h += '<div class="rl-cards">';
      cards.forEach(function (c, ix) {
        h += PS.util.S("button", {
          type: "button", "class": "rl-card", id: "rl-card-" + ix, "data-card": ix,
          "aria-label": "Card " + (ix + 1) + " " + (c.name || "") + ". Select to apply the view. Double-click to open Brief."
        }, '<span class="rl-thumb" aria-hidden="true">' + thumbFor(r, c, ix) + "</span>" +
          '<span><span class="t-key rl-cn">' + (ix + 1) + "</span>" + '<span class="t-sub rl-cname">' + esc(c.name || c.id) + "</span></span>");
      });
      h += "</div></section></div>";

      var keepScroll = el.scrollTop;
      var focusId = doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement.id : null;
      el.innerHTML = h;
      el.scrollTop = keepScroll;
      if (focusId) { var f = doc.getElementById(focusId); if (f) f.focus(); }
      marks(state);
    }

    // selection and hover classes without a rebuild
    function marks(state) {
      var ui = state.ui || {}, sel = ui.sel || {}, hov = ui.hover || {};
      var rows = el.querySelectorAll(".rl-row");
      for (var i = 0; i < rows.length; i++) {
        var k = rows[i].getAttribute("data-k"), id = rows[i].getAttribute("data-id");
        rows[i].classList.toggle("rl-sel", sel.kind === k && sel.id === id);
        rows[i].classList.toggle("rl-hov", hov.kind === k && hov.id === id);
        rows[i].setAttribute("aria-pressed", sel.kind === k && sel.id === id ? "true" : "false");
      }
    }

    function applyCard(ix) {
      var state = store.get(), r = prof(state), c = r && r.cards ? r.cards[ix] : null;
      if (!c) return;
      if (c.cam) store.ui("cam", PS.util.clone(c.cam));
      if (c.layers) store.ui("layers", PS.util.clone(c.layers));
      if (c.t == null) {
        if (PS.time && PS.time.off) PS.time.off(); else store.dispatch({ type: "time.set", t: null });
      } else if (PS.time && PS.time.set) PS.time.set(c.t);
      else store.dispatch({ type: "time.set", t: c.t });
    }

    function onClick(e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b || !el.contains(b)) return;
      if (b.id === "rl-hide") { store.ui("panels.list", false); return; }
      var mv = b.getAttribute("data-move");
      if (mv) {
        var state = store.get(), w = null;
        checksOf(state, der(state)).forEach(function (x) { if (x.eventId === mv) w = x; });
        var ok = PS.tools && typeof PS.tools.moveToGeometry === "function" ? PS.tools.moveToGeometry(store, mv) : false;
        if (ok && w && PS.bus && PS.bus.emit) PS.bus.emit("toast", { text: "Moved " + mv + " to " + PS.units.t(w.tGeo) + "." });
        return;
      }
      var card = b.getAttribute("data-card");
      if (card != null) { applyCard(Number(card)); return; }
      var k = b.getAttribute("data-k"), id = b.getAttribute("data-id");
      if (k === "aircraft") {
        // aircraft are edited in the profile roster; select the first path that uses it
        var r = prof(store.get()), p = ((r && r.scene && r.scene.paths) || []).filter(function (x) { return x.aircraft === id; })[0];
        if (p) store.dispatch({ type: "sel.set", kind: "path", id: p.id, i: null });
        else store.dispatch({ type: "sel.clear" });
        return;
      }
      if (k) store.dispatch({ type: "sel.set", kind: k, id: id, i: null });
    }

    function onDbl(e) {
      var b = e.target.closest ? e.target.closest(".rl-card") : null;
      if (!b) return;
      var ix = Number(b.getAttribute("data-card"));
      store.ui("cardIx", ix);
      store.ui("mode", "brief");
    }

    function onOver(e) {
      var b = e.target.closest ? e.target.closest("[data-k]") : null;
      var k = b ? b.getAttribute("data-k") : null;
      if (!b || k === "aircraft") {
        if (hoverOn) { hoverOn = false; store.dispatch({ type: "hover.clear" }); }
        return;
      }
      hoverOn = true;
      store.dispatch({ type: "hover.set", kind: k, id: b.getAttribute("data-id"), i: null, cx: e.clientX, cy: e.clientY, text: null, t: null });
    }
    function onLeave() { if (hoverOn) { hoverOn = false; store.dispatch({ type: "hover.clear" }); } }

    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerleave", onLeave);
    render();

    return {
      update: function (state, channel) {
        if (channel === "hover") { marks(store.get()); return; }
        render();
      },
      unmount: function () {
        el.removeEventListener("click", onClick);
        el.removeEventListener("dblclick", onDbl);
        el.removeEventListener("pointerover", onOver);
        el.removeEventListener("pointerleave", onLeave);
        el.innerHTML = "";
      }
    };
  }

  PS.panels.register("rail", { channels: CHANNELS, mount: mount });
})(globalThis.PS);
