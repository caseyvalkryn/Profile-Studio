(function (PS) {
  "use strict";
  // Quick-add palette and formation popover (contract 16.3, brief 4.7, 5.2).

  var CSS = [
    ".pal-pop,.fm-pop{position:fixed;width:280px;max-width:calc(100vw - 16px);z-index:45;background:var(--raised);color:var(--t1);",
    "border:1px solid var(--rule-strong);border-radius:6px;box-shadow:var(--elev);display:flex;flex-direction:column;min-height:0}",
    ".pal-pop{width:360px;max-height:min(560px,calc(100vh - 80px))}",
    ".pal-head{padding:8px 8px 6px;border-bottom:1px solid var(--rule);display:flex;gap:6px;align-items:center}",
    ".pal-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    "#pal-search{flex:1 1 auto;min-width:0}",
    ".pal-list{overflow-y:auto;padding:4px 0 8px;min-height:0;flex:1 1 auto}",
    ".pal-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;padding:10px 10px 2px}",
    ".pal-band{display:flex;flex-direction:column;padding:8px 10px 2px}",
    ".pal-band+.pal-band,.pal-h+.pal-band{padding-top:6px}",
    ".pal-row{--col-data:124px;padding:0 10px 0 14px}",
    // the key hint sits right after the name as its shortcut; the data column takes the free space
    ".pal-row{column-gap:0}.pal-row .lr-name{flex:0 1 auto}",
    ".pal-row .lr-key{flex:0 0 auto;margin-left:6px}",
    ".pal-row .lr-data{margin-left:auto;padding-left:8px}",
    ".pal-row:hover{background:var(--sunken)}",
    ".pal-row.pal-on{background:var(--sunken);box-shadow:inset 2px 0 0 var(--select)}",
    ".pal-empty{padding:10px;margin:0}",
    ".fm-pop{padding:10px 12px;gap:4px}",
    ".fm-pop h2{margin:0 0 4px}",
    ".fm-acts{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}",
    ".pal-sheet{left:0 !important;right:0;bottom:0;top:auto !important;width:auto;max-width:none;border-radius:8px 8px 0 0;max-height:60vh}"
  ].join("");

  var GROUP_TITLE = { aircraft: "Aircraft", systems: "Sensors and effectors", volumes: "Volumes", events: "Events", reference: "Reference" };
  var GROUP_ORDER = ["aircraft", "systems", "volumes", "events", "reference"];
  var KEY_HINT = { "systems:radar": "S", "volumes:asset": "V" };

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }
  function esc(s) { return PS.util.esc(s); }

  // a height without its datum; the datum goes to the row title
  function vBare(m) { return PS.units.v(m, "AGL").replace(/\s+AGL$/, ""); }
  // data: the short mono column, two facts split by two spaces; full: the same facts for the row title
  function rowData(r) {
    var C = PS.catalog, U = PS.units;
    if (r.group === "aircraft") {
      var a = C.arch(r.id), z = C.cruiseHeight(a);
      return { data: U.spd(a.cruise) + "  " + vBare(z), full: U.spd(a.cruise) + ", " + U.v(z, "AGL") };
    }
    if (r.group === "systems") {
      var d = C.SYS_DEFAULTS[r.id] || {};
      if (!(d.range > 0)) return { data: "", full: r.sub };
      var sector = d.fov != null && d.fov < 360;
      return { data: U.h(d.range) + (sector ? "  " + d.fov + "°" : ""), full: "range " + U.h(d.range) + (sector ? ", " + d.fov + "° sector" : "") };
    }
    if (r.group === "volumes") {
      var v = C.VOL_DEFAULTS[r.id] || {};
      return v.zmax > 0 ? { data: vBare(v.zmax), full: "top " + U.v(v.zmax, "AGL") } : { data: "", full: "on the ground" };
    }
    if (r.group === "reference") return { data: vBare(120), full: U.v(120, "AGL") };
    return { data: "", full: "" };
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function band(g) {
    var b = PS.catalog.GROUPS && PS.catalog.GROUPS[g];
    return { id: "Group " + g, limits: b ? cap(b.w) + ", " + b.alt + ", " + b.spd : "" };
  }

  PS.panels.register("palette", {
    channels: ["panels", "placing", "sel", "time", "units"],
    mount: function (el, store) {
      var doc = el.ownerDocument, win = doc.defaultView;
      addStyle(doc, "palette", CSS);

      el.innerHTML =
        '<div class="pal-pop hidden" id="pal" role="dialog" aria-label="Quick add">' +
        '<div class="pal-head"><label class="pal-lbl" for="pal-search">Search things to add</label>' +
        '<input id="pal-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list">' +
        '<button type="button" class="btn quiet" id="pal-all" hidden>All</button></div>' +
        '<div class="pal-list" id="pal-list" role="listbox" aria-label="Things to add"></div></div>' +
        '<div class="fm-pop hidden" id="fm" role="dialog" aria-label="Formation">' +
        '<h2 id="fm-title" class="t-title">Formation</h2>' +
        '<div class="fld"><label for="fm-n">Count</label><input id="fm-n" type="number" min="2" max="12" step="1" inputmode="numeric"></div>' +
        '<div class="fld"><label for="fm-spacing" id="fm-spacing-lbl">Spacing</label><input id="fm-spacing" type="text" inputmode="decimal" autocomplete="off"></div>' +
        '<div class="fld"><label for="fm-group">Group</label><input id="fm-group" type="text" maxlength="1" autocomplete="off"></div>' +
        '<p class="hint" id="fm-msg"></p>' +
        '<div class="fm-acts"><button type="button" class="btn quiet" id="fm-cancel">Cancel</button><button type="button" class="btn primary" id="fm-create">Create</button></div>' +
        '</div>';

      var q = function (id) { return el.querySelector("#" + id); };
      var pop = q("pal"), list = q("pal-list"), search = q("pal-search"), allBtn = q("pal-all");
      var fm = q("fm"), fmN = q("fm-n"), fmSp = q("fm-spacing"), fmG = q("fm-group"), fmMsg = q("fm-msg");
      var open = false, fmOpen = false, query = "", group = null, rows = [], hi = 0, alive = true, timers = [];

      function st() { return store.get(); }
      function later(fn, ms) { var id = setTimeout(function () { if (alive) fn(); }, ms || 0); timers.push(id); }
      function phone() { var u = st().ui; return !!u.phone || (win && win.innerWidth <= 600); }

      function anchor(node, w) {
        var b = doc.getElementById("bd-add");
        node.classList.toggle("pal-sheet", phone());
        if (phone()) { node.style.left = ""; node.style.top = ""; return; }
        var vw = win ? win.innerWidth : 1024;
        var r = b ? b.getBoundingClientRect() : { left: 16, bottom: 96 };
        node.style.left = Math.round(Math.max(8, Math.min(r.left, vw - w - 8))) + "px";
        node.style.top = Math.round(r.bottom + 4) + "px";
      }

      // ---------------------------------------------------------- list
      function visibleRows() {
        var all = PS.catalog.search(query);
        if (!query && group) all = all.filter(function (r) { return r.group === group; });
        return all;
      }
      function buildList() {
        var s = st(), rec = PS.sel.profile(s), noPath = !rec || !rec.scene.paths.length;
        rows = visibleRows();
        if (hi >= rows.length) hi = Math.max(0, rows.length - 1);
        allBtn.hidden = !(group && !query);
        var html = "", lastG = null, lastBand = null;
        rows.forEach(function (r, k) {
          if (r.group !== lastG) {
            lastG = r.group; lastBand = null;
            var right = r.group === "events" ? (noPath ? '<span class="t-micro">Needs a path</span>' : '<span class="t-key pal-key">E</span>') : "";
            html += '<div class="pal-h" role="presentation"><span class="t-label">' + esc(GROUP_TITLE[r.group] || r.group) + "</span>" + right + "</div>";
          }
          if (r.group === "aircraft") {
            var g = PS.catalog.arch(r.id).group;
            if (g !== lastBand) {
              lastBand = g;
              var bd = band(g);
              html += '<div class="pal-band" role="presentation"' + (bd.limits ? ' title="' + esc(bd.id + ": " + bd.limits.charAt(0).toLowerCase() + bd.limits.slice(1)) + '"' : "") + ">" +
                '<span class="t-label t-strong">' + esc(bd.id) + "</span>" +
                (bd.limits ? '<span class="lr-sub">' + esc(bd.limits) + "</span>" : "") + "</div>";
            }
          }
          var key = KEY_HINT[r.group + ":" + r.id], rd = rowData(r);
          html += '<button type="button" role="option" class="lr pal-row' + (k === hi ? " pal-on" : "") + '" id="pal-r-' + esc(r.group + "-" + r.id) +
            '" data-pick="' + esc(r.id) + '" data-group="' + esc(r.group) + '" data-n="' + k + '" aria-selected="' + (k === hi) + '"' +
            ' title="' + esc(r.label + (rd.full ? ", " + rd.full : "")) + '">' +
            '<span class="lr-name" title="' + esc(r.label) + '">' + esc(r.label) + "</span>" +
            (key ? '<span class="lr-key pal-key">' + key + "</span>" : "") +
            '<span class="lr-data pal-sub">' + esc(rd.data) + "</span></button>";
        });
        if (!rows.length) html = '<p class="pal-empty t-sub">Nothing matches. Clear the search.</p>';
        list.innerHTML = html;
        syncHi();
      }
      function syncHi() {
        var on = null;
        Array.prototype.forEach.call(list.querySelectorAll(".pal-row"), function (b) {
          var me = Number(b.getAttribute("data-n")) === hi;
          b.classList.toggle("pal-on", me);
          b.setAttribute("aria-selected", String(me));
          if (me) on = b;
        });
        if (on) { search.setAttribute("aria-activedescendant", on.id); if (on.scrollIntoView) on.scrollIntoView({ block: "nearest" }); }
        else search.removeAttribute("aria-activedescendant");
      }

      function close() { if (st().ui.paletteOpen) store.ui("paletteOpen", false); }

      function pick(r) {
        if (!r) return;
        var s = st(), u = s.ui, sel = u.sel || {};
        close();
        if (r.group === "events" && sel.kind === "path" && u.t != null) {
          PS.tools.addEventAt(store, sel.id, u.t, r.id, null);
          return;
        }
        var ok = PS.tools.startPlacing(store, { group: r.group, id: r.id });
        if (ok && r.group === "reference") later(function () { var f = doc.getElementById("in-plane-z"); if (f) f.focus(); }, 30);
        if (ok) { var stg = doc.getElementById("bd-stage"); if (stg && stg.focus) stg.focus({ preventScroll: true }); }
      }

      function showPalette() {
        var u = st().ui;
        if (!open) { query = ""; search.value = ""; hi = 0; }
        group = u.paletteGroup || null;
        open = true;
        pop.classList.remove("hidden");
        anchor(pop, 360);
        buildList();
        later(function () { if (open) search.focus(); });
      }
      function hidePalette() {
        if (!open) return;
        open = false;
        pop.classList.add("hidden");
        if (doc.activeElement === search) search.blur();
      }

      // ---------------------------------------------------------- formation
      function unitLabel() { return PS.units.mode === "si" ? "km" : "nm"; }
      function unitM() { return PS.units.mode === "si" ? 1000 : PS.units.NM || 1852; }
      function syncFormation() {
        var p = st().ui.placing;
        var want = !!(p && p.kind === "formation");
        if (!want) { if (fmOpen) { fmOpen = false; fm.classList.add("hidden"); } return; }
        q("fm-title").textContent = "Formation from " + p.pathId;
        q("fm-spacing-lbl").textContent = "Spacing " + unitLabel();
        if (doc.activeElement !== fmN) fmN.value = String(p.n == null ? 3 : p.n);
        if (doc.activeElement !== fmSp) fmSp.value = String(Math.round((p.spacing == null ? 120 : p.spacing) / unitM() * 1000) / 1000);
        if (doc.activeElement !== fmG) fmG.value = p.group || "A";
        if (!fmOpen) {
          fmOpen = true;
          fmMsg.textContent = "The ghost shows the members. Press Enter to create. Press Escape to cancel.";
          fm.classList.remove("hidden");
          anchor(fm, 280);
          later(function () { if (fmOpen) { fmN.focus(); fmN.select && fmN.select(); } });
        }
      }
      function readFormation() {
        var n = Math.round(Number(fmN.value));
        var sp = PS.units.toM(fmSp.value, "h");
        var g = String(fmG.value || "").trim().toUpperCase();
        var err = null;
        if (!(n >= 2 && n <= 12)) err = "Count is 2 to 12.";
        else if (!(sp > 0)) err = "Type a spacing above 0, for example 0.065.";
        else if (!/^[A-Z]$/.test(g)) err = "Type one letter for the group.";
        return { n: n, spacing: sp, group: g, err: err };
      }
      function onFmInput() {
        var p = st().ui.placing;
        if (!p || p.kind !== "formation") return;
        var v = readFormation();
        fmMsg.textContent = v.err || "The ghost shows the members. Press Enter to create. Press Escape to cancel.";
        fmMsg.classList.toggle("warn", !!v.err);
        if (v.err) return;
        if (v.n !== p.n || v.spacing !== p.spacing || v.group !== p.group) {
          store.ui("placing", Object.assign({}, p, { n: v.n, spacing: v.spacing, group: v.group }));
        }
      }
      function createFormation() {
        var p = st().ui.placing;
        if (!p || p.kind !== "formation") return;
        var v = readFormation();
        if (v.err) { fmMsg.textContent = v.err; fmMsg.classList.add("warn"); return; }
        PS.tools.formation(store, p.pathId, v.n, v.spacing, v.group);
      }
      function cancelFormation() { var p = st().ui.placing; if (p && p.kind === "formation") store.ui("placing", null); }

      // ---------------------------------------------------------- events
      function onSearchInput() { query = search.value; hi = 0; buildList(); }
      function onSearchKey(ev) {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (!rows.length) return;
          hi = (hi + (ev.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
          syncHi();
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          pick(rows[hi] || rows[0]);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          close();
        }
      }
      function onListClick(ev) {
        var b = ev.target.closest("[data-pick]");
        if (!b) return;
        pick(rows[Number(b.getAttribute("data-n"))]);
      }
      function onAll() { group = null; hi = 0; buildList(); search.focus(); }
      function onFmKey(ev) {
        if (ev.key === "Enter") { ev.preventDefault(); createFormation(); }
        else if (ev.key === "Escape") { ev.preventDefault(); cancelFormation(); }
      }
      function onDocDown(ev) {
        if (!open) return;
        var t = ev.target;
        if (pop.contains(t)) return;
        var add = doc.getElementById("bd-add");
        if (add && add.contains(t)) return;
        close();
      }

      search.addEventListener("input", onSearchInput);
      search.addEventListener("keydown", onSearchKey);
      list.addEventListener("click", onListClick);
      allBtn.addEventListener("click", onAll);
      fm.addEventListener("input", onFmInput);
      fm.addEventListener("keydown", onFmKey);
      q("fm-create").addEventListener("click", createFormation);
      q("fm-cancel").addEventListener("click", cancelFormation);
      doc.addEventListener("pointerdown", onDocDown, true);

      function sync(ch) {
        var u = st().ui;
        if (u.paletteOpen) {
          if (!open) showPalette();
          else if (ch === "units" || ch === "sel") buildList();
          else if (ch === "panels" && (u.paletteGroup || null) !== group && !query) { group = u.paletteGroup || null; hi = 0; buildList(); }
        } else hidePalette();
        syncFormation();
      }
      sync(null);

      return {
        update: function (state, ch) { sync(ch); },
        unmount: function () {
          alive = false;
          timers.forEach(clearTimeout);
          doc.removeEventListener("pointerdown", onDocDown, true);
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
