(function (PS) {
  "use strict";
  // Context menu (brief 4.7, 5.6): the actions of the selected kind plus Copy and Paste.
  // Opens while ui.menu is set: { x, y, kind, id, i } in client pixels.

  var CSS = [
    ".mn-pop{position:fixed;z-index:46;max-height:calc(100vh - 16px);overflow-y:auto}",
    ".mn-pop > button[disabled]{color:var(--t3);cursor:default;background:none}",
    ".mn-sep{height:1px;margin:4px 0;background:var(--rule)}",
    ".mn-head{padding:6px 12px 2px}",
    "@media (max-width:600px){.mn-pop > button{min-height:var(--row)}}"
  ].join("");

  var LISTS = { path: "scene.paths", system: "scene.systems", volume: "scene.volumes", plane: "scene.planes", event: "events" };
  var COPYABLE = { path: 1, system: 1, volume: 1, plane: 1 };

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }
  function byId(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function idx(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }

  PS.panels.register("menu", {
    channels: ["panels", "sel"],
    mount: function (el, store) {
      var doc = el.ownerDocument, win = doc.defaultView;
      addStyle(doc, "menu", CSS);
      el.innerHTML = '<div class="menu mn-pop hidden" id="mn" role="menu" aria-label="Actions"></div>';
      var pop = el.querySelector("#mn");
      var items = [], openKey = null, alive = true, timers = [];

      function st() { return store.get(); }
      function rec() { return PS.sel.profile(st()); }
      function emit(ch, p) { if (PS.bus && PS.bus.emit) PS.bus.emit(ch, p); }
      function warn(text) { store.ui("readout", { text: text, level: "warn" }); }
      function later(fn, ms) { var id = setTimeout(function () { if (alive) fn(); }, ms || 0); timers.push(id); }
      function focusField(id) { later(function () { var f = doc.getElementById(id); if (f && f.focus) f.focus(); }, 30); }
      function close() { if (st().ui.menu) store.ui("menu", null); }

      function pathMidT(pid) {
        var d = PS.derive.all(rec()), tm = d && d.timed ? d.timed[pid] : null;
        if (!tm || !tm.length) return 0;
        return Math.round(tm[tm.length - 1].t1 / 2 * 10) / 10;
      }
      function remove(kind, id) {
        var r0 = rec();
        store.dispatch({ type: "profile.remove", path: LISTS[kind], id: id });
        var r1 = rec();
        if (r1 !== r0 && !byId(PS.util.getPath(r1, LISTS[kind]), id)) {
          store.dispatch({ type: "sel.clear" });
          emit("toast", { text: "Deleted " + id + "." });
        }
      }
      function warningOf(eventId) {
        var d = PS.derive.all(rec()), w = null;
        ((d && d.warnings) || []).forEach(function (x) { if (!w && x.eventId === eventId) w = x; });
        return w;
      }
      function lettersFirst(letter) {
        var out = [letter];
        rec().scene.paths.forEach(function (p) { if (p.group && out.indexOf(p.group) < 0) out.push(p.group); });
        return out;
      }

      // [act, label, enabled]
      function actionsFor(m) {
        var r = rec(), u = st().ui, T = PS.tools, out = [], sel = u.sel || {};
        if (!r) return out;
        var k = m.kind, id = m.id;
        if (k === "path") {
          out.push(["event", "Add event here", true], ["formation", "Formation", true], ["reverse", "Reverse", true],
            ["duplicate", "Duplicate", true], ["delete", "Delete", true]);
        } else if (k === "wp") {
          var p = byId(r.scene.paths, id);
          var hasNext = p && m.i != null && m.i < p.pts.length - 1;
          out.push(["hold", "Hold +30 s", !!p], ["insert", "Insert after", !!hasNext], ["wp-delete", "Delete", !!(p && p.pts.length > 1)]);
        } else if (k === "system") {
          var s = byId(r.scene.systems, id);
          out.push(s && s.fov >= 360 ? ["sector", "Make a sector", true] : ["omni", "Make omni", true]);
          out.push(["duplicate", "Duplicate", true], ["delete", "Delete", true]);
        } else if (k === "volume" || k === "vertex") {
          out.push(["top", "Set top", true], ["duplicate", "Duplicate", true], ["delete", "Delete", true]);
        } else if (k === "plane") {
          out.push(["delete", "Delete", true]);
        } else if (k === "event") {
          out.push(["type", "Change type", true]);
          if (warningOf(id)) out.push(["move", "Move to geometry", true]);
          out.push(["delete", "Delete", true]);
        } else if (k === "group") {
          out.push(["split", "Split here", u.t != null], ["merge", "Merge", lettersFirst(id).length > 1], ["delgroup", "Delete group", true]);
        } else if (k === "card") {
          var cards = r.cards || [], ix = idx(cards, id);
          out.push(["apply", "Apply view", ix >= 0], ["open", "Open in Brief", ix >= 0], ["up", "Up", ix > 0], ["down", "Down", ix >= 0 && ix < cards.length - 1], ["delete", "Delete", ix >= 0]);
        } else {
          out.push(["add", "Add", true], ["card", "Save card", true]);
        }
        out.push(["sep"]);
        var copyKind = k === "wp" ? "path" : k === "vertex" ? "volume" : k;
        out.push(["copy", "Copy", !!(COPYABLE[copyKind] && sel.id != null)], ["paste", "Paste", true]);
        return out;
      }

      function run(act) {
        var m = st().ui.menu, u = st().ui, r = rec(), T = PS.tools;
        if (!m || !r) return;
        close();
        var id = m.id, k = m.kind;
        switch (act) {
          case "event":
            store.dispatch({ type: "sel.set", kind: "path", id: id, i: null });
            if (u.t == null) store.dispatch({ type: "time.set", t: pathMidT(id) });
            store.ui("paletteGroup", "events");
            store.ui("paletteOpen", true);
            break;
          case "formation": T.startFormation(store, id); break;
          case "reverse": T.reverse(store, id); break;
          case "duplicate": T.duplicate(store, k === "vertex" ? "volume" : k, id); break;
          case "delete":
            if (k === "card") { T.cardRemove(store, idx(r.cards, id)); store.dispatch({ type: "sel.clear" }); }
            else remove(k === "vertex" ? "volume" : k, id);
            break;
          case "hold":
            var pi = idx(r.scene.paths, id), pt = pi >= 0 ? r.scene.paths[pi].pts[m.i] : null;
            if (pt) store.set("scene.paths." + pi + ".pts." + m.i + ".hold", (pt.hold || 0) + 30);
            break;
          case "insert":
            var qi = idx(r.scene.paths, id), path = r.scene.paths[qi];
            if (!path || m.i == null || !path.pts[m.i + 1]) { warn("Select a waypoint that has a next segment."); break; }
            var pts = PS.util.clone(path.pts), a = pts[m.i], b = pts[m.i + 1];
            pts.splice(m.i + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), z: Math.round(((a.z || 0) + (b.z || 0)) / 2), hold: 0 });
            store.set("scene.paths." + qi + ".pts", pts);
            store.dispatch({ type: "sel.set", kind: "path", id: id, i: m.i + 1 });
            break;
          case "wp-delete": T.removeWaypoint(store, id, m.i); break;
          case "sector": T.makeSector(store, id); break;
          case "omni": T.makeOmni(store, id); break;
          case "top": store.dispatch({ type: "sel.set", kind: "volume", id: id, i: null }); focusField("in-volume-zmax"); break;
          case "type": store.dispatch({ type: "sel.set", kind: "event", id: id, i: null }); focusField("in-event-type"); break;
          case "move":
            if (T.moveToGeometry(store, id)) {
              var ev = byId(rec().events, id);
              if (ev) emit("toast", { text: "Moved " + id + " to " + PS.units.t(ev.t) + "." });
            }
            break;
          case "split":
            if (u.t == null) { warn("Set the time cursor to split the group."); break; }
            if (!T.splitGroup(store, id, u.t)) warn("Group " + id + " is one cluster at " + PS.units.t(u.t) + ".");
            break;
          case "merge": T.mergeGroup(store, lettersFirst(id)); break;
          case "delgroup": T.removeGroup(store, id); store.dispatch({ type: "sel.clear" }); break;
          case "apply":
            var cd = byId(r.cards, id);
            if (cd) {
              if (cd.cam) store.ui("cam", PS.util.clone(cd.cam));
              if (cd.layers) store.ui("layers", PS.util.clone(cd.layers));
              store.dispatch({ type: "time.set", t: cd.t == null ? null : cd.t });
            }
            break;
          case "open": store.ui("cardIx", Math.max(0, idx(r.cards, id))); store.ui("mode", "brief"); break;
          case "up": T.cardMove(store, idx(r.cards, id), -1); break;
          case "down": T.cardMove(store, idx(r.cards, id), 1); break;
          case "add": store.ui("paletteGroup", null); store.ui("paletteOpen", true); break;
          case "card": T.saveCard(store, { cam: u.cam, layers: u.layers, t: u.t, sel: u.sel }); break;
          case "copy": T.copy(store); break;
          case "paste": T.paste(store); break;
        }
      }

      // the kind of the head id, for the first item's title: "EW-1, RF effector"
      function kindTitle(m) {
        var r = rec(), C = PS.catalog, k = m.kind, name = null;
        if (k === "system") {
          var s = r ? byId(r.scene.systems, m.id) : null;
          (C.SYS_KINDS || []).forEach(function (x) { if (s && x[0] === s.kind) name = x[1]; });
        } else if (k === "volume" || k === "vertex") {
          var v = r ? byId(r.scene.volumes, m.id) : null;
          (C.VOL_KINDS || []).forEach(function (x) { if (v && x[0] === v.kind) name = x[1]; });
        } else if (k === "event") {
          var e = r ? byId(r.events, m.id) : null;
          name = e && C.EV_NAMES ? C.EV_NAMES[e.type] : null;
        }
        var NAMES = { path: "Path", wp: "Waypoint", plane: "Height plane", group: "Group", card: "Card", system: "System", volume: "Volume", vertex: "Volume", event: "Event" };
        return m.id + ", " + (name || NAMES[k] || k);
      }

      function build(m) {
        items = actionsFor(m);
        var head = m.id != null ? '<div class="mn-head t-label" role="presentation">' + PS.util.esc(m.kind === "wp" ? m.id + " point " + (Number(m.i) + 1) : m.id) + "</div>" : "";
        var kt = m.id != null ? kindTitle(m) : "", first = true;
        pop.innerHTML = head + items.map(function (a) {
          if (a[0] === "sep") return '<div class="mn-sep" role="separator"></div>';
          var tt = first && kt ? ' title="' + PS.util.esc(kt) + '"' : "";
          first = false;
          return '<button type="button" role="menuitem" id="mn-' + a[0] + '" data-act="' + a[0] + '"' + tt + (a[2] ? "" : " disabled") + ">" + PS.util.esc(a[1]) + "</button>";
        }).join("");
        pop.classList.remove("hidden");
        var vw = win ? win.innerWidth : 1024, vh = win ? win.innerHeight : 768;
        var w = pop.offsetWidth || 180, h = pop.offsetHeight || 200;
        pop.style.left = Math.round(Math.max(8, Math.min(m.x, vw - w - 8))) + "px";
        pop.style.top = Math.round(Math.max(8, Math.min(m.y, vh - h - 8))) + "px";
        later(function () { var f = pop.querySelector("button:not([disabled])"); if (f) f.focus(); });
      }

      function sync() {
        var m = st().ui.menu;
        var key = m ? [m.x, m.y, m.kind, m.id, m.i].join("|") : null;
        if (!m || st().ui.mode !== "build") {
          if (openKey) { openKey = null; pop.classList.add("hidden"); pop.innerHTML = ""; }
          return;
        }
        if (key !== openKey) { openKey = key; build(m); }
      }

      function onClick(ev) {
        var b = ev.target.closest("button[data-act]");
        if (!b || b.disabled) return;
        run(b.getAttribute("data-act"));
      }
      function onKey(ev) {
        var list = Array.prototype.slice.call(pop.querySelectorAll("button:not([disabled])"));
        var at = list.indexOf(doc.activeElement);
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (!list.length) return;
          var n = at < 0 ? 0 : (at + (ev.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
          list[n].focus();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          close();
          var stg = doc.getElementById("bd-stage");
          if (stg && stg.focus) stg.focus({ preventScroll: true });
        } else if (ev.key === "Tab") {
          ev.preventDefault();
          close();
        }
      }
      function onDocDown(ev) {
        if (!openKey) return;
        if (pop.contains(ev.target)) return;
        close();
      }

      pop.addEventListener("click", onClick);
      pop.addEventListener("keydown", onKey);
      doc.addEventListener("pointerdown", onDocDown, true);
      sync();

      return {
        update: function () { sync(); },
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
