(function (PS) {
  "use strict";
  // PS.app (contract 19): boot, mode switch with the #strip reparent rule, slot map, resize channel, phone detection and
  // bottom sheets, theme, reduced motion, the localStorage wrapper, autosave, the default rate, and the key action table.

  var SLOTS = {
    topbar: "slot-topbar", rail: "slot-rail", board: "slot-board", palette: "slot-palette", menu: "slot-menu", tip: "slot-tip",
    timeline: "slot-timeline", chart: "slot-chart", ladder: "slot-ladder", readout: "slot-readout", inspector: "slot-inspector",
    cards: "slot-cards", stage: "slot-stage", notes: "slot-notes", collect: "slot-collect", dialog: "slot-dialog", help: "slot-help"
  };
  var MODE_PANELS = {
    build: ["rail", "board", "palette", "menu", "readout", "inspector"],
    brief: ["cards", "stage", "notes"],
    collect: ["collect"]
  };
  var BOOT_PANELS = ["topbar", "timeline", "chart", "ladder", "tip", "help", "dialog"];
  var SHEETS = { scene: "slot-rail", inspect: "slot-inspector", chart: "slot-chart", chain: "slot-ladder", notes: "slot-notes" };
  var SHEET_TABS = [["scene", "Scene", "build"], ["inspect", "Inspect", "build"], ["chart", "Chart", "build"], ["chain", "Chain", "build"], ["notes", "Notes", "brief"]];
  var STRIP_HOST = { build: "strip-host-build", brief: "strip-host-brief" };
  var MODE_BOX = { build: "mode-build", brief: "mode-brief", collect: "mode-collect" };
  var THEMES = ["auto", "light", "dark"];
  var STRIP_TABS = [["timeline", "Timeline"], ["chart", "Chart"], ["ladder", "Ladder"]];
  var STORAGE_TEXT = "This browser does not save. Export to keep your work.";
  var SAVE_MS = 500;

  var ctx = {
    doc: null, win: null, store: null, mode: null, activeId: null, sheet: null, storage: null,
    saveTimer: null, range: null, resizeRaf: null, appEl: null, debug: { mounts: 0, unmounts: 0 }
  };

  // ---------------------------------------------------------------- helpers
  function $(id) { return ctx.doc ? ctx.doc.getElementById(id) : null; }
  function uiOf(store) { return store.get().ui; }
  function setPanels(store, patch) { store.ui("panels", Object.assign({}, uiOf(store).panels, patch)); }
  function profile(store) { return PS.sel.profile(store.get()); }
  function warn(text) { PS.bus.emit("readout", { text: text, level: "warn" }); }
  function toast(text) { PS.bus.emit("toast", { text: text }); }
  function keyOf(e) { return (e && e.key) || ""; }
  function has(o, k) { return o && typeof o[k] === "function"; }

  function widthRange(win) {
    var w = win && win.innerWidth ? win.innerWidth : 1440;
    if (isPhone()) return "phone";
    return w >= 1280 ? "wide" : "mid";
  }

  // ---------------------------------------------------------------- storage wrapper
  function wrapStorage(raw) {
    var w = {
      available: false,
      getItem: function (k) { try { return raw ? raw.getItem(k) : null; } catch (e) { return null; } },
      setItem: function (k, v) {
        try { if (!raw) return false; raw.setItem(k, v); return true; } catch (e) { w.available = false; return false; }
      },
      removeItem: function (k) { try { if (raw && raw.removeItem) raw.removeItem(k); } catch (e) { /* storage blocked */ } }
    };
    try {
      if (raw) {
        var probe = "profileStudio.probe";
        raw.setItem(probe, "1");
        w.available = raw.getItem(probe) === "1";
        if (raw.removeItem) raw.removeItem(probe);
      }
    } catch (e) { w.available = false; }
    return w;
  }

  function scheduleSave() {
    if (!ctx.storage || !ctx.storage.available) return;
    clearTimeout(ctx.saveTimer);
    ctx.saveTimer = setTimeout(saveNow, SAVE_MS);
  }
  function saveNow() {
    clearTimeout(ctx.saveTimer);
    ctx.saveTimer = null;
    if (!ctx.store || !ctx.storage || !ctx.storage.available) return;
    var ok = false;
    try { ok = PS.persist.save(ctx.storage, ctx.store.get()) !== false; } catch (e) { ok = false; }
    if (!ok) { ctx.storage.available = false; showStorageBar(); }
  }
  function showStorageBar() {
    var bar = $("storage-bar");
    if (bar) { bar.textContent = STORAGE_TEXT; bar.hidden = false; }
    if (ctx.appEl) ctx.appEl.setAttribute("data-storage", "0");
  }

  // ---------------------------------------------------------------- initial state (contract 8.1)
  function initialState(loaded, phone) {
    var lib, activeId, saved = {};
    if (loaded && loaded.lib && loaded.lib.length) {
      lib = loaded.lib;
      activeId = lib.some(function (r) { return r.id === loaded.activeId; }) ? loaded.activeId : lib[0].id;
      saved = loaded.ui || {};
    } else {
      lib = PS.seed.load();
      activeId = lib[0].id;
    }
    var rec = null;
    lib.forEach(function (r) { if (r.id === activeId) rec = r; });
    var panels = Object.assign({ list: true, inspector: true, notes: true, fullStage: false, blank: false, roStrip: false, help: false },
      saved.panels || {}, { fullStage: false, blank: false, help: false });
    var layers = Object.assign(PS.schema.defaultLayers(), saved.layers || {});
    var units = saved.units === "si" || saved.units === "nav" ? saved.units : (rec && rec.units) || "nav";
    var tabs = ["timeline", "chart", "ladder"];
    return {
      lib: lib, activeId: activeId, dirty: {},
      ui: {
        mode: loaded && loaded.lib && loaded.lib.length ? "build" : "collect",
        cam: { proj: "plan", yaw: -35, pitch: 55, ref: "asset" },
        view: { zoom: 1, px: 0, py: 0 },
        tview: null,
        layers: layers,
        units: units,
        t: null, playing: false, rate: 1,
        loop: "off", range: null,
        sel: { kind: null, id: null, i: null },
        hover: { kind: null, id: null, i: null, cx: 0, cy: 0, text: null, t: null },
        ghost: null, baseline: null,
        ladderSort: { key: "path", dir: 1 },
        readout: null,
        theme: THEMES.indexOf(saved.theme) >= 0 ? saved.theme : "auto",
        focus: [], placing: null, ruler: null,
        snap: saved.snap !== false,
        panels: panels,
        stripTab: tabs.indexOf(saved.stripTab) >= 0 ? saved.stripTab : "timeline",
        sheet: null, phone: !!phone,
        cardIx: 0, query: "", paletteOpen: false, paletteGroup: null, menu: null, dialog: null
      }
    };
  }

  // ---------------------------------------------------------------- panels and modes
  function mountPanel(name) {
    var el = $(SLOTS[name]);
    if (!el || !ctx.store) return null;
    ctx.debug.mounts++;
    return PS.panels.mount(name, el, ctx.store);
  }
  function unmountPanel(name) {
    if (PS.panels.get(name)) ctx.debug.unmounts++;
    PS.panels.unmount(name);
  }

  function moveStrip(mode) {
    var strip = $("strip");
    if (!strip) return;
    var host = STRIP_HOST[mode] ? $(STRIP_HOST[mode]) : null;
    if (host) {
      if (strip.parentNode !== host) host.appendChild(strip);
      strip.hidden = false;
    } else {
      var root = $("root");
      if (root && strip.parentNode !== root) root.appendChild(strip);
      strip.hidden = true;
    }
  }

  function showBox(mode) {
    Object.keys(MODE_BOX).forEach(function (m) {
      var box = $(MODE_BOX[m]);
      if (box) box.hidden = m !== mode;
    });
  }

  function buildRight() {
    var box = $("mode-build");
    return box ? box.querySelector(".right") : null;
  }

  // phone readout: #slot-readout sits in the board's #bd-readout-host in Build on a phone (contract 19)
  function placeReadout() {
    var ro = $("slot-readout");
    if (!ro || !ctx.store) return;
    var ui = uiOf(ctx.store);
    var host = $("bd-readout-host");
    if (ctx.mode === "build" && ui.phone && host) {
      if (ro.parentNode !== host) host.appendChild(ro);
    } else {
      restoreReadout();
    }
  }
  function restoreReadout() {
    var ro = $("slot-readout"), right = buildRight();
    if (ro && right && ro.parentNode !== right) right.insertBefore(ro, right.firstChild);
  }

  function switchMode(to) {
    var from = ctx.mode;
    if (from === to || !MODE_PANELS[to]) return;
    var store = ctx.store;
    ctx.mode = to;   // set first: the dispatches below re-enter onState
    if (from) store.dispatch({ type: "lib.bump" });
    closeSheetDom();
    if (uiOf(store).sheet) store.ui("sheet", null);
    if (from === "build") restoreReadout();
    if (from) MODE_PANELS[from].forEach(unmountPanel);
    if (from === "brief" && PS.brief) PS.brief.end(store);
    if (from === "build") {
      var u = uiOf(store);
      if (u.placing && PS.tools && has(PS.tools, "cancelPlacing")) PS.tools.cancelPlacing(store);
      if (u.paletteOpen) store.ui("paletteOpen", false);
      if (u.menu) store.ui("menu", null);
    }
    moveStrip(to);
    showBox(to);
    if (uiOf(store).mode !== to) store.ui("mode", to);
    MODE_PANELS[to].forEach(mountPanel);
    if (to === "build") placeReadout();
    if (to === "brief" && PS.brief) PS.brief.begin(store);
    applyAttrs(store.get());
    renderStripTabs(store.get());
  }

  // ---------------------------------------------------------------- sheets
  function openSheetDom(name) {
    var id = SHEETS[name], sheet = $("sheet");
    if (!id || !sheet) return;
    if (ctx.sheet && ctx.sheet.name === name) return;
    closeSheetDom();
    var el = $(id);
    if (!el) return;
    ctx.sheet = { name: name, el: el, parent: el.parentNode, next: el.nextSibling };
    sheet.appendChild(el);
    sheet.classList.add("open");
    sheet.classList.remove("full");
    if (ctx.appEl) { ctx.appEl.setAttribute("data-sheet", name); ctx.appEl.removeAttribute("data-sheet-full"); }
    renderTabs();
    PS.bus.emit("resize", sizeOf());
  }
  function closeSheetDom() {
    var s = ctx.sheet, sheet = $("sheet");
    if (s) {
      if (s.next && s.next.parentNode === s.parent) s.parent.insertBefore(s.el, s.next);
      else if (s.parent) s.parent.appendChild(s.el);
      ctx.sheet = null;
    }
    if (sheet) sheet.classList.remove("open", "full");
    if (ctx.appEl) { ctx.appEl.removeAttribute("data-sheet"); ctx.appEl.removeAttribute("data-sheet-full"); }
    renderTabs();
    if (s) PS.bus.emit("resize", sizeOf());
  }
  function syncSheet(state) {
    var want = state.ui.sheet, have = ctx.sheet ? ctx.sheet.name : null;
    if (want === have) return;
    if (want) openSheetDom(want); else closeSheetDom();
  }

  function buildChrome() {
    var doc = ctx.doc, app = ctx.appEl;
    var sheet = $("sheet");
    if (sheet && !sheet.querySelector(".app-sheet-handle")) {
      var h = doc.createElement("button");
      h.type = "button";
      h.className = "app-sheet-handle";
      h.id = "app-sheet-handle";
      h.setAttribute("aria-label", "Sheet handle. Drag up for full height. Drag down to close.");
      sheet.insertBefore(h, sheet.firstChild);
      var y0 = null, moved = false;
      h.addEventListener("pointerdown", function (e) { y0 = e.clientY; moved = false; if (h.setPointerCapture) h.setPointerCapture(e.pointerId); });
      h.addEventListener("pointermove", function (e) { if (y0 != null && Math.abs(e.clientY - y0) > 8) moved = true; });
      h.addEventListener("pointerup", function (e) {
        if (y0 == null) return;
        var dy = e.clientY - y0;
        y0 = null;
        if (moved && dy < -40) setSheetFull(true);
        else if (moved && dy > 40) { if (sheet.classList.contains("full")) setSheetFull(false); else PS.app.closeSheet(); }
        else if (!moved) setSheetFull(!sheet.classList.contains("full"));
      });
    }
    if (app && !doc.getElementById("app-tabs")) {
      var nav = doc.createElement("nav");
      nav.className = "app-tabs";
      nav.id = "app-tabs";
      nav.setAttribute("aria-label", "Sheets");
      nav.innerHTML = SHEET_TABS.map(function (t) {
        return '<button type="button" class="btn" id="app-tab-' + t[0] + '" data-sheet="' + t[0] + '" data-when="' + t[2] + '" aria-pressed="false">' + t[1] + "</button>";
      }).join("");
      nav.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-sheet]") : null;
        if (!b) return;
        var name = b.getAttribute("data-sheet");
        if (uiOf(ctx.store).sheet === name) PS.app.closeSheet(); else PS.app.openSheet(name);
      });
      app.appendChild(nav);
    }
    var tabs = $("strip") ? $("strip").querySelector(".strip-tabs") : null;
    if (tabs && !tabs.childNodes.length) {
      tabs.innerHTML = '<div class="seg" role="group" aria-label="Strip view">' + STRIP_TABS.map(function (t) {
        return '<button type="button" class="btn" id="strip-tab-' + t[0] + '" data-tab="' + t[0] + '" aria-pressed="false">' + t[1] + "</button>";
      }).join("") + "</div>";
      tabs.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-tab]") : null;
        if (b) ctx.store.ui("stripTab", b.getAttribute("data-tab"));
      });
    }
  }

  function setSheetFull(full) {
    var sheet = $("sheet");
    if (!sheet) return;
    sheet.classList.toggle("full", !!full);
    if (ctx.appEl) { if (full) ctx.appEl.setAttribute("data-sheet-full", "1"); else ctx.appEl.removeAttribute("data-sheet-full"); }
    PS.bus.emit("resize", sizeOf());
  }

  function renderTabs() {
    var nav = $("app-tabs");
    if (!nav) return;
    var cur = ctx.sheet ? ctx.sheet.name : null;
    Array.prototype.forEach.call(nav.querySelectorAll("[data-sheet]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-sheet") === cur));
    });
  }

  function renderStripTabs(state) {
    var strip = $("strip");
    if (!strip) return;
    Array.prototype.forEach.call(strip.querySelectorAll(".strip-tabs [data-tab]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-tab") === state.ui.stripTab));
    });
  }

  // ---------------------------------------------------------------- root attributes
  function applyAttrs(state) {
    var app = ctx.appEl, ui = state.ui, p = ui.panels || {};
    if (!app) return;
    app.setAttribute("data-mode", ui.mode);
    app.setAttribute("data-list", p.list ? "1" : "0");
    app.setAttribute("data-inspector", p.inspector ? "1" : "0");
    app.setAttribute("data-notes", p.notes ? "1" : "0");
    app.setAttribute("data-fullstage", ui.mode === "brief" && p.fullStage ? "1" : "0");
    app.setAttribute("data-phone", ui.phone ? "1" : "0");
    var root = ctx.doc.documentElement;
    var th = THEMES.indexOf(ui.theme) >= 0 ? ui.theme : "auto";
    if (th === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", th);
  }

  // ---------------------------------------------------------------- state sync
  function onState(state, action, prev) {
    if (!prev) prev = state;
    var ui = state.ui, pu = prev.ui || {};
    if (ui.mode !== ctx.mode) switchMode(ui.mode);
    if (ui.panels !== pu.panels || ui.theme !== pu.theme || ui.phone !== pu.phone || ui.mode !== pu.mode) applyAttrs(ctx.store.get());
    if (ui.stripTab !== pu.stripTab) renderStripTabs(state);
    if (ui.sheet !== pu.sheet) syncSheet(ctx.store.get());
    if (ui.phone !== pu.phone) {
      placeReadout();
      if (!ui.phone && ctx.store.get().ui.sheet) PS.app.closeSheet();
    }
    if (state.lib !== prev.lib || state.activeId !== prev.activeId || ui.units !== pu.units || ui.layers !== pu.layers ||
        ui.panels !== pu.panels || ui.snap !== pu.snap || ui.stripTab !== pu.stripTab || ui.theme !== pu.theme) scheduleSave();
  }

  // the lib channel: a new active profile starts at its default rate (contract 19)
  function onLib() {
    var store = ctx.store, st = store.get();
    if (st.activeId === ctx.activeId) return;
    ctx.activeId = st.activeId;
    if (st.ui.cardIx !== 0) store.ui("cardIx", 0);
    if (st.ui.sel && st.ui.sel.kind) store.dispatch({ type: "sel.clear" });
    setDefaultRate(store);
    if (ctx.mode === "brief" && PS.brief) PS.brief.enter(store, 0);
  }

  function setDefaultRate(store) {
    if (!PS.time || !has(PS.time, "defaultRate")) return;
    var rate = PS.time.defaultRate(PS.sel.tmax(store.get()));
    if (rate != null) store.dispatch({ type: "time.rate", rate: rate });
  }

  // ---------------------------------------------------------------- resize
  function sizeOf() {
    var w = ctx.win;
    return { W: w && w.innerWidth || 0, H: w && w.innerHeight || 0 };
  }
  function onResize() {
    if (ctx.resizeRaf != null) return;
    var raf = ctx.win && ctx.win.requestAnimationFrame ? ctx.win.requestAnimationFrame.bind(ctx.win) : function (f) { return setTimeout(f, 16); };
    ctx.resizeRaf = raf(function () {
      ctx.resizeRaf = null;
      var store = ctx.store;
      if (!store) return;
      var phone = isPhone();
      if (uiOf(store).phone !== phone) store.ui("phone", phone);
      var r = widthRange(ctx.win);
      if (r !== ctx.range) {
        var was = ctx.range;
        ctx.range = r;
        // the scene list is closed by default from 601 to 1279 px (brief 4.2) and open at 1280 px and wider
        if (r === "mid" && uiOf(store).panels.list) setPanels(store, { list: false });
        else if (r === "wide" && was === "mid" && !uiOf(store).panels.list) setPanels(store, { list: true });
      }
      PS.bus.emit("resize", sizeOf());
    });
  }

  // ---------------------------------------------------------------- key actions (contract 18, every action name)
  var CAM_KEYS = { p: "plan", l: "elev", x: "axon" };
  var MODE_KEYS = { "1": "build", "2": "brief", "3": "collect" };
  var NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  var SCENE_LISTS = { path: "paths", system: "systems", volume: "volumes", plane: "planes" };

  function ensureTime() { if (uiOf(ctx.store || { get: function () { return { ui: {} }; } }).t == null) PS.time.on(); }

  function listOf(rec, kind) {
    if (!rec) return [];
    if (kind === "event") return rec.events || [];
    var k = SCENE_LISTS[kind];
    return k && rec.scene ? rec.scene[k] || [] : [];
  }

  function briefCards(store) { return PS.brief ? PS.brief.cards(store.get()) : []; }

  var actions = {
    "palette.open": function (store, args) {
      args = args || {};
      if (args.pick && PS.tools && PS.tools.startPlacing) {
        store.ui("paletteOpen", false);
        if (PS.tools.startPlacing(store, { group: args.group, id: args.pick })) return;
      }
      store.ui("paletteGroup", args.group || null);
      store.ui("paletteOpen", true);
    },
    "formation.open": function (store) {
      PS.tools.startFormation(store);
    },
    "mode.set": function (store, args, e) {
      var m = (args && args.mode) || MODE_KEYS[keyOf(e)];
      if (m) PS.app.setMode(m);
    },
    "cam.set": function (store, args, e) {
      var proj = (args && args.proj) || CAM_KEYS[keyOf(e).toLowerCase()];
      if (!proj) return;
      var cam = uiOf(store).cam || {};
      if (cam.proj !== proj) store.ui("cam", Object.assign({}, cam, { proj: proj }));
    },
    "time.toggle": function () { ensureTime(); PS.time.toggle(); },
    "time.step": function (store, args, e) {
      var dt = (args && args.dt) || 1;
      var k = keyOf(e), code = (e && e.code) || "";
      var back = k === "," || k === "<" || code === "Comma";
      ensureTime();
      PS.time.step(back ? -dt : dt);
    },
    "time.ends": function (store, args, e) {
      if (keyOf(e) === "End") PS.time.set(PS.sel.tmax(store.get())); else PS.time.set(0);
    },
    "time.onoff": function (store) { if (uiOf(store).t == null) PS.time.on(); else PS.time.off(); },
    "time.event": function (store, args, e) { if (keyOf(e) === "[") PS.time.prevEvent(); else PS.time.nextEvent(); },
    "units.toggle": function (store) { store.ui("units", uiOf(store).units === "si" ? "nav" : "si"); },
    "snap.toggle": function (store) { store.ui("snap", !uiOf(store).snap); },
    "ruler.toggle": function (store) {
      if (uiOf(store).ruler) {
        if (PS.tools && PS.tools.ruler && has(PS.tools.ruler, "clear")) PS.tools.ruler.clear(store); else store.ui("ruler", null);
      } else {
        store.ui("ruler", { a: null, b: null, done: false });
      }
    },
    "strip.cycle": function (store) {
      var tabs = widthRange(ctx.win) === "wide" ? ["timeline", "chart"] : ["timeline", "chart", "ladder"];
      var i = tabs.indexOf(uiOf(store).stripTab);
      store.ui("stripTab", tabs[(i + 1) % tabs.length]);
    },
    "layer.toggle": function (store, args, e) {
      var n = args && args.n ? args.n : Number((/Digit(\d)/.exec((e && e.code) || "") || [])[1]);
      var keys = PS.schema.LAYER_KEYS, k = keys[n - 1];
      if (!k) return;
      var layers = Object.assign({}, uiOf(store).layers);
      layers[k] = !layers[k];
      store.ui("layers", layers);
    },
    "view.fit": function (store) {
      if (PS.tools && has(PS.tools, "fit")) PS.tools.fit(store); else store.dispatch({ type: "view.fit" });
    },
    "view.zoom": function (store, args, e) {
      var f = keyOf(e) === "-" ? 1 / 1.25 : 1.25;
      var v = uiOf(store).view || { zoom: 1, px: 0, py: 0 };
      var z = PS.util.clamp(v.zoom * f, 0.5, 8), g = z / v.zoom;
      store.dispatch({ type: "view.set", zoom: z, px: v.px * g, py: v.py * g });
    },
    "sel.nudge": function (store, args, e) {
      var d = NUDGE[keyOf(e)];
      if (!d) return;
      var steps = (args && args.steps) || 1;
      PS.tools.nudge(store, d[0] * steps, d[1] * steps);
    },
    "sel.next": function (store, args, e) {
      var st = store.get(), s = st.ui.sel || {}, rec = PS.sel.profile(st);
      var kind = s.kind && (SCENE_LISTS[s.kind] || s.kind === "event") ? s.kind : "path";
      var list = listOf(rec, kind);
      if (!list.length) return;
      var i = -1;
      for (var j = 0; j < list.length; j++) if (list[j].id === s.id) { i = j; break; }
      var d = e && e.shiftKey ? -1 : 1;
      var next = i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length;
      store.dispatch({ type: "sel.set", kind: kind, id: list[next].id, i: null });
    },
    "sel.remove": function (store) {
      var st = store.get(), sel = PS.sel.selected(st), s = st.ui.sel;
      if (!sel) return;
      var before = PS.sel.profile(st), label = s.id;
      if (sel.kind === "wp") { PS.tools.removeWaypoint(store, sel.parent.id, s.i); label = sel.parent.id + " point " + (s.i + 1); }
      else if (sel.kind === "vertex") {
        var vols = before.scene.volumes, vi = -1;
        for (var k = 0; k < vols.length; k++) if (vols[k].id === sel.parent.id) vi = k;
        if (vi < 0) return;
        if (vols[vi].pts.length <= 3) { warn("A volume needs three points."); return; }
        store.set("scene.volumes." + vi + ".pts", vols[vi].pts.filter(function (p, n) { return n !== s.i; }));
        label = sel.parent.id + " point " + (s.i + 1);
      }
      else if (sel.kind === "group") PS.tools.removeGroup(store, s.id);
      else if (sel.kind === "card") {
        var cards = before.cards || [];
        for (var c = 0; c < cards.length; c++) if (cards[c].id === s.id) { PS.tools.cardRemove(store, c); break; }
      }
      else if (sel.kind === "event") store.dispatch({ type: "profile.remove", path: "events", id: s.id });
      else if (SCENE_LISTS[sel.kind]) store.dispatch({ type: "profile.remove", path: "scene." + SCENE_LISTS[sel.kind], id: s.id });
      else return;
      if (PS.sel.profile(store.get()) !== before) {
        if (sel.kind !== "wp" && sel.kind !== "vertex") store.dispatch({ type: "sel.clear" });
        else store.dispatch({ type: "sel.set", kind: s.kind, id: s.id, i: null });
        toast("Deleted " + label + ".");
      }
    },
    "sel.duplicate": function (store) {
      var s = uiOf(store).sel;
      if (s && SCENE_LISTS[s.kind]) PS.tools.duplicate(store, s.kind, s.id);
    },
    "card.save": function (store) {
      var ui = uiOf(store);
      PS.tools.saveCard(store, { cam: ui.cam, layers: ui.layers, t: ui.t, sel: ui.sel });
    },
    "undo": function (store) {
      var l = store.undoLabel();
      if (store.undo()) toast("Undid: " + (l || "edit") + ".");
    },
    "redo": function (store) {
      var l = store.redoLabel();
      if (store.redo()) toast("Redid: " + (l || "edit") + ".");
    },
    "clip.copy": function (store) { PS.tools.copy(store); },
    "clip.paste": function (store) { PS.tools.paste(store); },
    "panel.inspector": function (store) {
      var ui = uiOf(store);
      if (ui.phone) { if (ui.sheet === "inspect") PS.app.closeSheet(); else PS.app.openSheet("inspect"); return; }
      setPanels(store, { inspector: !ui.panels.inspector });
    },
    "panel.sides": function (store) {
      var p = uiOf(store).panels, open = p.list || p.inspector;
      setPanels(store, { list: !open, inspector: !open });
    },
    "help.toggle": function (store) { setPanels(store, { help: !uiOf(store).panels.help }); },
    "escape": function (store) {
      var ui = uiOf(store);
      if (ui.dialog) { store.ui("dialog", null); return; }
      if (ui.panels.help) { setPanels(store, { help: false }); return; }
      if (ui.sheet) { PS.app.closeSheet(); return; }
      if (ui.mode === "build") {
        if (ui.placing) { if (PS.tools && has(PS.tools, "cancelPlacing")) PS.tools.cancelPlacing(store); else store.ui("placing", null); }
        else if (ui.ruler) { if (PS.tools && PS.tools.ruler && has(PS.tools.ruler, "clear")) PS.tools.ruler.clear(store); else store.ui("ruler", null); }
        else if (ui.paletteOpen || ui.menu) { if (ui.paletteOpen) store.ui("paletteOpen", false); if (ui.menu) store.ui("menu", null); }
        else if (ui.sel && ui.sel.kind) store.dispatch({ type: "sel.clear" });
      } else if (ui.mode === "brief") {
        if (ui.panels.fullStage) setPanels(store, { fullStage: false });
        else if (ui.panels.blank) setPanels(store, { blank: false });
        else PS.app.setMode("build");
      }
    },
    "card.step": function (store, args) { PS.brief.step(store, args && args.d < 0 ? -1 : 1); },
    "card.space": function (store) {
      var ui = uiOf(store);
      if (ui.t == null) PS.brief.enter(store, (ui.cardIx || 0) + 1);
      else PS.time.toggle();
    },
    "card.ends": function (store, args, e) {
      var n = briefCards(store).length;
      if (n) PS.brief.enter(store, keyOf(e) === "End" ? n - 1 : 0);
    },
    "card.jump": function (store, args, e) {
      var n = (args && args.n) || Number(keyOf(e));
      if (n >= 1 && n <= briefCards(store).length) PS.brief.enter(store, n - 1);
    },
    "stage.full": function (store) { setPanels(store, { fullStage: !uiOf(store).panels.fullStage }); },
    "panel.notes": function (store) {
      var ui = uiOf(store);
      if (ui.phone) { if (ui.sheet === "notes") PS.app.closeSheet(); else PS.app.openSheet("notes"); return; }
      setPanels(store, { notes: !ui.panels.notes });
    },
    "stage.blank": function (store) { setPanels(store, { blank: !uiOf(store).panels.blank }); },
    "stage.readout": function (store) { setPanels(store, { roStrip: !uiOf(store).panels.roStrip }); },
    "focus.cycle": function (store, args, e) {
      var st = store.get(), card = PS.brief.card(st);
      var F = (card && card.focus) || [];
      if (!F.length) return;
      var cur = st.ui.focus && st.ui.focus.length === 1 ? F.indexOf(st.ui.focus[0]) : -1;
      var next;
      if (keyOf(e) === "ArrowUp") next = cur < 0 ? F.length - 1 : cur - 1;
      else next = cur + 1;
      store.ui("focus", next < 0 || next >= F.length ? [] : [F[next]]);
    },
    "search.focus": function (store, args, e) {
      var f = $("lb-search");
      if (!f) return;
      if (e && e.preventDefault) e.preventDefault();
      f.focus();
      if (f.select) f.select();
    },
    "new.menu": function (store, args, e) {
      var b = $("lb-new-more");
      if (!b) return;
      if (e && e.preventDefault) e.preventDefault();
      b.click();
    }
  };

  // ---------------------------------------------------------------- public API
  function isPhone() {
    var w = ctx.win || (typeof globalThis !== "undefined" && globalThis.matchMedia ? globalThis : null);
    if (!w) return false;
    if (typeof w.matchMedia === "function") return !!w.matchMedia("(max-width: 600px)").matches;
    return !!(w.innerWidth && w.innerWidth <= 600);
  }

  function readReducedMotion(win) {
    try { return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }

  PS.app = {
    SLOTS: SLOTS,
    MODE_PANELS: MODE_PANELS,
    BOOT_PANELS: BOOT_PANELS,
    SHEETS: SHEETS,
    actions: actions,
    debug: ctx.debug,

    boot: function (doc, storage, win) {
      if (ctx.store) return ctx.store;
      ctx.doc = doc;
      ctx.win = win || doc.defaultView;
      ctx.appEl = doc.getElementById("app") || doc.body;
      ctx.storage = wrapStorage(storage);

      var loaded = null;
      if (ctx.storage.available) {
        try { loaded = PS.persist.load(ctx.storage); } catch (e) { loaded = null; }
      }
      var store = PS.store.create(initialState(loaded, isPhone()));
      ctx.store = store;
      ctx.activeId = store.get().activeId;
      ctx.range = widthRange(ctx.win);
      if (ctx.range === "mid" && store.get().ui.panels.list) store.ui("panels", Object.assign({}, store.get().ui.panels, { list: false }));

      PS.units.set(store.get().ui.units);
      PS.bus.wire(store);
      var rm = readReducedMotion(ctx.win);
      if (rm && ctx.appEl) ctx.appEl.setAttribute("data-motion", "reduce");
      if (PS.time && has(PS.time, "attach")) {
        var raf = ctx.win && ctx.win.requestAnimationFrame ? ctx.win.requestAnimationFrame.bind(ctx.win) : undefined;
        PS.time.attach(store, raf);
        if (typeof PS.time.reducedMotion !== "boolean") PS.time.reducedMotion = rm;
      }
      if (PS.keys && has(PS.keys, "attach")) PS.keys.attach(store, actions);

      if (!ctx.storage.available) showStorageBar();
      buildChrome();
      setDefaultRate(store);
      applyAttrs(store.get());

      BOOT_PANELS.forEach(mountPanel);
      store.subscribe(onState);
      PS.bus.on("lib", onLib);
      switchMode(store.get().ui.mode);
      PS.app.setTheme(store.get().ui.theme);
      renderStripTabs(store.get());

      if (ctx.win && ctx.win.addEventListener) {
        ctx.win.addEventListener("resize", onResize);
        ctx.win.addEventListener("pagehide", saveNow);
        if (typeof ctx.win.matchMedia === "function") {
          var mq = ctx.win.matchMedia("(max-width: 600px)");
          if (mq && mq.addEventListener) mq.addEventListener("change", onResize);
        }
        if (typeof ctx.win.ResizeObserver === "function" && $("root")) {
          new ctx.win.ResizeObserver(onResize).observe($("root"));
        }
      }
      return store;
    },

    setMode: function (mode) {
      var store = ctx.store;
      if (!store || !MODE_PANELS[mode]) return;
      if (uiOf(store).mode !== mode) store.ui("mode", mode);
      if (ctx.mode !== mode) switchMode(mode);
    },

    setTheme: function (theme) {
      var th = THEMES.indexOf(theme) >= 0 ? theme : "auto";
      if (ctx.doc) {
        var root = ctx.doc.documentElement;
        if (th === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", th);
      }
      if (ctx.store && uiOf(ctx.store).theme !== th) ctx.store.ui("theme", th);
    },

    isPhone: isPhone,

    openSheet: function (name) {
      if (!SHEETS[name] || !ctx.store) return;
      if (uiOf(ctx.store).sheet !== name) ctx.store.ui("sheet", name);
      openSheetDom(name);
    },

    closeSheet: function () {
      if (!ctx.store) return;
      closeSheetDom();
      if (uiOf(ctx.store).sheet) ctx.store.ui("sheet", null);
    },

    save: saveNow
  };
})(globalThis.PS);
