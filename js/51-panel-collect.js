(function (PS) {
  "use strict";
  // Library (brief 4.6): grid grouped by collection, search, the New profile split button with the templates,
  // Open, Brief, Duplicate, Export and Delete with an inline confirm per profile, Import and Export for the library.

  var CSS = [
    ".lb-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0}",
    "#lb-search{flex:1 1 280px;min-width:0;max-width:420px}",
    ".lb-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".lb-split{position:relative;display:inline-flex}",
    ".lb-split>#lb-new{border-radius:4px 0 0 4px}",
    ".lb-split>#lb-new-more{border-radius:0 4px 4px 0;margin-left:-1px;padding:0 8px}",
    "#lb-new-menu{position:absolute;top:100%;left:0;margin-top:4px;z-index:25}",
    ".lb-count{margin-left:auto}",
    ".lb-group{margin:8px 0 18px}",
    ".lb-group>h2{margin:0 0 8px}",
    ".lb-n{margin-left:6px}",
    ".lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}",
    ".lb-card{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;background:var(--panel);border:1px solid var(--rule);border-radius:6px}",
    ".lb-card:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    ".lb-card[aria-current=\"true\"]{border-color:var(--accent)}",
    ".lb-thumb{height:150px;background:var(--board);border:1px solid var(--rule);border-radius:3px;overflow:hidden}",
    ".lb-thumb>svg{display:block;width:100%;height:100%}",
    ".lb-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".lb-purpose{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(var(--lh-2) * 2)}",
    ".lb-meta{display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-width:0}",
    ".lb-acts{display:flex;flex-wrap:wrap;gap:4px}",
    ".lb-acts>.mini{padding:0 4px}",
    ".lb-acts>[data-act=del]{margin-left:auto}",
    ".lb-ask{align-self:center}",
    ".lb-empty{padding:24px 0}",
    "@media (max-width:600px){.lb-grid{grid-template-columns:1fr}.lb-count{margin-left:0;flex:1 1 100%}}"
  ].join("");

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  var esc = function (s) { return PS.util.esc(s); };
  function safe(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, "_"); }

  function newProfileId(lib) {
    if (PS.schema && typeof PS.schema.newId === "function") {
      try { var id = PS.schema.newId(lib, "PROF-"); if (id) return id; } catch (e) { /* fall through */ }
    }
    return PS.util.uid("PROF-", lib);
  }

  PS.panels.register("collect", {
    channels: ["lib", "panels"],
    mount: function (el, store) {
      var doc = el.ownerDocument;
      addStyle(doc, "collect", CSS);
      var menuOpen = false, askDel = null, thumbs = {};

      el.innerHTML =
        '<div class="lb-bar">' +
        '<label class="lb-lbl" for="lb-search">Search profiles</label>' +
        '<input id="lb-search" type="search" placeholder="Search purpose, name, collection" autocomplete="off">' +
        '<span class="lb-split"><button type="button" class="btn primary" id="lb-new">New profile</button>' +
        '<button type="button" class="btn primary" id="lb-new-more" aria-label="Pick a template" title="Pick a template" aria-haspopup="true" aria-expanded="false"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="menu" id="lb-new-menu" role="menu" hidden></div></span>' +
        '<button type="button" class="btn" id="lb-import">Import</button>' +
        '<button type="button" class="btn" id="lb-export-lib">Export library</button>' +
        '<span class="lb-count t-sub" id="lb-count"></span>' +
        '</div><div id="lb-groups"></div>';

      var search = el.querySelector("#lb-search"), groupsEl = el.querySelector("#lb-groups");
      var menu = el.querySelector("#lb-new-menu"), more = el.querySelector("#lb-new-more"), countEl = el.querySelector("#lb-count");

      function templates() { return (PS.seed && PS.seed.templates) || []; }

      function renderMenu() {
        menu.hidden = !menuOpen;
        more.setAttribute("aria-expanded", String(menuOpen));
        if (!menuOpen) return;
        menu.innerHTML = templates().map(function (t) {
          return '<button type="button" role="menuitem" id="lb-tpl-' + safe(t.id) + '" data-tpl="' + esc(t.id) + '">' + esc(t.name) + "</button>";
        }).join("");
      }

      function thumb(rec) {
        var c = rec.cards && rec.cards.length ? rec.cards[0] : null;
        var k = rec.id, cached = thumbs[k];
        if (cached && cached.rec === rec && cached.units === PS.units.mode) return cached.svg;
        var svg = "";
        try { svg = PS.render.card(rec, c, { W: 300, H: 160 }, true) || ""; } catch (e) { svg = ""; }
        thumbs[k] = { rec: rec, units: PS.units.mode, svg: svg };
        return svg;
      }

      function cardHtml(rec, active) {
        var id = rec.id, s = safe(id), n = rec.cards ? rec.cards.length : 0;
        var acts = askDel === id
          ? '<span class="lb-ask t-sub t-warn">Delete ' + esc(id) + '?</span>' +
            '<button type="button" class="mini" id="lb-del-' + s + '-yes" data-act="del-yes" data-id="' + esc(id) + '">Yes</button>' +
            '<button type="button" class="mini" id="lb-del-' + s + '-no" data-act="del-no" data-id="' + esc(id) + '">No</button>'
          : [["open", "Open"], ["brief", "Brief"], ["dup", "Duplicate"], ["export", "Export"], ["del", "Delete"]].map(function (a) {
              return '<button type="button" class="mini" id="lb-' + a[0] + "-" + s + '" data-act="' + a[0] + '" data-id="' + esc(id) + '">' + a[1] + "</button>";
            }).join("");
        return '<article class="lb-card" tabindex="0" id="lb-card-' + s + '" data-id="' + esc(id) + '" aria-current="' + active + '" aria-label="' + esc(id + " " + (rec.name || "")) + '">' +
          '<div class="lb-thumb">' + thumb(rec) + '</div>' +
          '<div class="lb-name t-title" title="' + esc(rec.name || id) + '">' + esc(rec.name || id) + '</div>' +
          '<div class="lb-purpose t-sub">' + esc(rec.purpose || "") + '</div>' +
          '<div class="lb-meta"><span><span class="t-mono-id">' + esc(id) + '</span> <span class="t-data t-sec">v' + esc(rec.v) + '</span></span>' +
          '<span class="t-micro">' + n + (n === 1 ? " card" : " cards") + '</span></div>' +
          '<div class="lb-acts">' + acts + '</div></article>';
      }

      function render(state) {
        var ui = state.ui;
        if (doc.activeElement !== search && search.value !== (ui.query || "")) search.value = ui.query || "";
        var groups = PS.sel.library(state);
        var nProf = 0;
        groups.forEach(function (g) { nProf += g.profiles.length; });
        var total = state.lib.length, colls = {};
        state.lib.forEach(function (r) { colls[r.collection || ""] = true; });
        var nColl = Object.keys(colls).length;
        countEl.textContent = ui.query ? nProf + " of " + total + (total === 1 ? " profile" : " profiles")
          : total + (total === 1 ? " profile, " : " profiles, ") + nColl + (nColl === 1 ? " collection" : " collections");
        var focusId = doc.activeElement && groupsEl.contains(doc.activeElement) ? doc.activeElement.id : null;
        if (!nProf) {
          groupsEl.innerHTML = '<p class="lb-empty t-body t-sec">No profile matches. Clear the search.</p>';
        } else {
          groupsEl.innerHTML = groups.filter(function (g) { return g.profiles.length; }).map(function (g) {
            return '<section class="lb-group"><h2 class="t-label">' + esc(g.collection || "No collection") + '<span class="lb-n t-key">' + g.profiles.length + '</span></h2>' +
              '<div class="lb-grid">' + g.profiles.map(function (r) { return cardHtml(r, r.id === state.activeId); }).join("") + '</div></section>';
          }).join("");
        }
        if (focusId) { var f = doc.getElementById(focusId); if (f && el.contains(f)) f.focus(); }
        renderMenu();
      }

      function find(id) {
        var lib = store.get().lib;
        for (var i = 0; i < lib.length; i++) if (lib[i].id === id) return lib[i];
        return null;
      }

      function openIn(id, mode) {
        var st = store.get();
        if (st.activeId !== id) store.dispatch({ type: "lib.activate", id: id });
        store.ui("mode", mode);
      }

      function stamp(rec) {
        var now = new Date().toISOString();
        rec.meta = { created: now, updated: now };
        return rec;
      }

      function newFrom(tplId) {
        var tpl = null;
        templates().forEach(function (t) { if (t.id === tplId) tpl = t; });
        if (!tpl) return;
        var st = store.get(), id = newProfileId(st.lib);
        var rec = stamp(tpl.make(id));
        store.dispatch({ type: "lib.add", record: rec });
        store.dispatch({ type: "lib.activate", id: id });
        store.ui("mode", "build");
        store.ui("paletteGroup", "aircraft");
        store.ui("paletteOpen", true);
        PS.bus.emit("toast", { text: id + " added." });
      }

      function duplicate(id) {
        var src = find(id);
        if (!src) return;
        var st = store.get();
        var rec = PS.util.clone(src);
        rec.id = PS.util.uid(src.id + "-", st.lib);
        rec.name = (src.name || src.id) + " copy";
        rec.v = 1;
        stamp(rec);
        store.dispatch({ type: "lib.add", record: rec });
        PS.bus.emit("toast", { text: rec.id + " added." });
      }

      function remove(id) {
        var st = store.get();
        if (st.lib.length <= 1) {
          PS.bus.emit("toast", { text: "Keep at least one profile." });
          PS.bus.emit("readout", { text: "Keep at least one profile.", level: "warn" });
          return;
        }
        store.dispatch({ type: "lib.remove", id: id });
        if (store.get().lib.length < st.lib.length) PS.bus.emit("toast", { text: "Deleted " + id + "." });
      }

      function onClick(e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !el.contains(b)) {
          if (menuOpen && !(e.target.closest && e.target.closest(".lb-split"))) { menuOpen = false; renderMenu(); }
          return;
        }
        if (b.id === "lb-new" || b.id === "lb-new-more") { menuOpen = !menuOpen; renderMenu(); if (menuOpen) { var fb = menu.querySelector("button"); if (fb) fb.focus(); } return; }
        if (b.hasAttribute("data-tpl")) { menuOpen = false; renderMenu(); newFrom(b.getAttribute("data-tpl")); return; }
        if (menuOpen) { menuOpen = false; renderMenu(); }
        if (b.id === "lb-import") { store.ui("dialog", { kind: "import", id: null }); return; }
        if (b.id === "lb-export-lib") { store.ui("dialog", { kind: "export", id: null }); return; }
        var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
        if (!act) return;
        switch (act) {
          case "open": openIn(id, "build"); break;
          case "brief": openIn(id, "brief"); break;
          case "dup": duplicate(id); break;
          case "export": store.ui("dialog", { kind: "export", id: id }); break;
          case "del": askDel = id; render(store.get()); focusAct("lb-del-" + safe(id) + "-no"); break;
          case "del-no": askDel = null; render(store.get()); focusAct("lb-del-" + safe(id)); break;
          case "del-yes": askDel = null; remove(id); render(store.get()); break;
        }
      }

      function focusAct(elId) { var f = doc.getElementById(elId); if (f) f.focus(); }

      function onInput(e) { if (e.target === search) store.ui("query", search.value); }

      function onKey(e) {
        if (e.key === "Escape" && menuOpen) { menuOpen = false; renderMenu(); more.focus(); e.stopPropagation(); return; }
        if (e.key === "Enter" && e.target.classList && e.target.classList.contains("lb-card")) {
          e.preventDefault();
          openIn(e.target.getAttribute("data-id"), "build");
        }
      }

      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("keydown", onKey);
      render(store.get());

      return {
        update: function (state) { render(state); },
        unmount: function () {
          el.removeEventListener("click", onClick);
          el.removeEventListener("input", onInput);
          el.removeEventListener("keydown", onKey);
          thumbs = {};
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
