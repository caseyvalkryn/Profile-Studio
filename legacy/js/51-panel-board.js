(function (PS) {
  "use strict";
  // Board panel (contract 16, brief 4.1, 5): toolbar, layer chips, readout host, the SVG stage and every
  // pointer gesture on it. Record changes go through PS.tools; view changes go through store.ui.

  var CSS = [
    ".bd-wrap{position:absolute;inset:0;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--panel)}",
    ".bd-bar,.bd-layers{display:flex;align-items:center;gap:6px;padding:6px 8px;min-width:0;border-bottom:1px solid var(--rule)}",
    ".bd-bar{flex-wrap:wrap}",
    ".bd-layers{flex-wrap:nowrap;overflow-x:auto;padding-top:4px;padding-bottom:4px}",
    ".bd-lyr{flex:0 0 auto}",
    ".btn.primary .bd-key{color:inherit;opacity:.8}",
    ".bd-ref{display:inline-flex;align-items:center;gap:6px}",
    ".bd-gap{flex:1 1 auto}",
    "#bd-readout-host:empty{display:none}",
    ".bd-stagewrap{position:relative;flex:1 1 auto;min-height:220px;min-width:0;overflow:hidden;background:var(--board)}",
    "#bd-stage{position:absolute;inset:0;touch-action:none;outline:none;user-select:none;-webkit-user-select:none}",
    "#bd-stage:focus-visible{box-shadow:inset 0 0 0 2px var(--select)}",
    "#bd-stage svg{display:block;width:100%;height:100%}",
    "#bd-stage.bd-place{cursor:crosshair}",
    "#bd-stage.bd-pan{cursor:grab}",
    "#bd-stage.bd-rot{cursor:move}",
    "#bd-cursor{position:absolute;right:8px;bottom:6px;pointer-events:none;white-space:pre}",
    "#bd-msg{position:absolute;left:8px;top:6px;right:8px;pointer-events:none}",
    "#bd-label{position:absolute;left:0;top:0;pointer-events:none;color:var(--t1);background:var(--raised);",
    "border:1px solid var(--rule-strong);border-radius:3px;padding:2px 6px;white-space:pre-line;z-index:2}",
    "@media (max-width:600px){#bd-ref-wrap,#bd-snap,#bd-fit{display:none}#bd-add{min-height:44px;min-width:44px}.bd-bar{gap:4px}}"
  ].join("");

  var CAMS = [["plan", "Plan", "P"], ["elev", "Elev", "L"], ["axon", "Axon", "X"]];

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  function esc(s) { return PS.util.esc(s); }
  function profileOf(state) { return state && PS.sel ? PS.sel.profile(state) : null; }
  function normHit(h) {
    if (!h) return null;
    var kind = h.kind === "wp" ? "path" : h.kind === "vertex" ? "volume" : h.kind;
    var i = h.i == null || h.i === "" ? null : Number(h.i);
    return { kind: kind, id: h.id, i: isNaN(i) ? null : i, role: h.role || null, handle: !!h.handle, raw: h.kind };
  }
  function sameHit(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.kind === b.kind && a.id === b.id && a.i === b.i;
  }

  PS.panels.register("board", {
    channels: ["profile", "derived", "cam", "layers", "units", "time", "sel", "hover", "baseline", "placing", "panels", "resize"],
    mount: function (el, store) {
      var doc = el.ownerDocument, win = doc.defaultView;
      addStyle(doc, "board", CSS);

      el.innerHTML =
        '<div class="bd-wrap">' +
        '<div class="bd-bar" role="toolbar" aria-label="Board tools">' +
        '<div class="seg" id="bd-cam" role="group" aria-label="Camera">' +
        CAMS.map(function (c) {
          return '<button type="button" class="btn" id="bd-cam-' + c[0] + '" data-proj="' + c[0] + '" aria-pressed="false">' +
            '<span class="bd-key t-key">' + c[2] + '</span> ' + c[1] + '</button>';
        }).join("") + '</div>' +
        '<span class="bd-ref t-sub" id="bd-ref-wrap"><label for="bd-ref">Ref</label><select id="bd-ref"></select></span>' +
        '<button type="button" class="btn primary" id="bd-add" aria-haspopup="dialog" aria-expanded="false">+ Add <span class="bd-key t-key">A</span></button>' +
        '<button type="button" class="btn quiet" id="bd-snap" aria-pressed="true">Snap <span class="bd-key t-key">G</span></button>' +
        '<button type="button" class="btn quiet" id="bd-ruler" aria-pressed="false">Ruler <span class="bd-key t-key">M</span></button>' +
        '<button type="button" class="btn quiet" id="bd-fit">Fit <span class="bd-key t-key">0</span></button>' +
        '<span class="bd-gap"></span>' +
        '<button type="button" class="btn quiet" id="bd-units"></button>' +
        '</div>' +
        '<div class="bd-layers" id="bd-layers" role="group" aria-label="Layers"><span class="bd-lyr t-label">Layers</span></div>' +
        '<div id="bd-readout-host"></div>' +
        '<div class="bd-stagewrap">' +
        '<div id="bd-stage" tabindex="0" role="application" aria-label="Board"></div>' +
        '<div id="bd-msg" class="t-sub"></div>' +
        '<div id="bd-cursor" class="t-data t-sec"></div>' +
        '<div id="bd-label" class="t-data hidden"></div>' +
        '</div></div>';

      var q = function (id) { return el.querySelector("#" + id); };
      var stage = q("bd-stage"), labelEl = q("bd-label"), cursorEl = q("bd-cursor"), msgEl = q("bd-msg");
      var refSel = q("bd-ref"), layersEl = q("bd-layers");

      // layer chips, built once
      var defs = PS.sel && typeof PS.sel.layerDefs === "function" ? PS.sel.layerDefs() : [];
      defs.forEach(function (d) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.id = "bd-chip-" + d.key;
        b.setAttribute("data-layer", d.key);
        b.setAttribute("aria-pressed", "false");
        b.title = "Shift+" + d.n;
        b.textContent = d.n + " " + d.label;
        layersEl.appendChild(b);
      });

      var last = null;          // { svg, cam, hits, W, H }
      var raf = 0, alive = true, refKey = "";
      var pend = null;          // pointer gesture in progress
      var drag = null;          // tools drag handle
      var pointers = {};        // pointerId -> { x, y } for pinch
      var pinch = null;
      var longTimer = 0;
      var moveQ = null, moveRaf = 0;
      var hoverHit = null, tapHover = false, spaceDown = false, overStage = false, lastP = null;

      function st() { return store.get(); }
      function ui() { return st().ui; }
      function rAF(fn) { return win && win.requestAnimationFrame ? win.requestAnimationFrame(fn) : setTimeout(fn, 16); }
      function cAF(id) { if (win && win.cancelAnimationFrame) win.cancelAnimationFrame(id); else clearTimeout(id); }

      // ---------------------------------------------------------- render
      function size() {
        var W = Math.max(200, Math.round(stage.clientWidth || 900));
        var H = Math.max(160, Math.round(stage.clientHeight || 600));
        return { W: W, H: H };
      }
      function render() {
        raf = 0;
        if (!alive) return;
        var s = st(), rec = profileOf(s);
        syncBar(s, rec);
        if (!rec || !PS.render || typeof PS.render.scene !== "function") { stage.innerHTML = ""; last = null; return; }
        var sz = size();
        var view = PS.sel.buildView(s);
        var out;
        try {
          out = PS.render.scene(rec, view, sz, {
            edit: PS.sel.canEdit(s), derived: PS.derive.all(rec), ghost: s.ui.ghost ? s.ui.ghost.before : null
          });
        } catch (e) {
          stage.innerHTML = "";
          msgEl.textContent = "The board cannot draw this profile. Undo the last change.";
          last = null;
          return;
        }
        stage.innerHTML = out.svg;
        last = { cam: out.cam, hits: out.hits || [], W: sz.W, H: sz.H };
        stage.classList.toggle("bd-place", !!s.ui.placing || !!s.ui.ruler);
        stage.classList.toggle("bd-rot", out.cam && out.cam.kind === "axon" && !s.ui.placing);
        syncMsg(s, rec);
      }
      function schedule() { if (!raf && alive) raf = rAF(render); }

      function syncBar(s, rec) {
        var u = s.ui, cam = u.cam || {};
        CAMS.forEach(function (c) { q("bd-cam-" + c[0]).setAttribute("aria-pressed", String(cam.proj === c[0])); });
        q("bd-snap").setAttribute("aria-pressed", String(u.snap !== false));
        q("bd-ruler").setAttribute("aria-pressed", String(!!u.ruler));
        q("bd-add").setAttribute("aria-expanded", String(!!u.paletteOpen));
        q("bd-units").innerHTML = (u.units === "si" ? "km m m/s" : "nm ft kt") + ' <span class="bd-key t-key">U</span>';
        defs.forEach(function (d) {
          var on = u.layers && u.layers[d.key];
          q("bd-chip-" + d.key).setAttribute("aria-pressed", String(!!on));
        });
        var sys = rec ? rec.scene.systems.map(function (x) { return x.id; }) : [];
        var key = sys.join(",");
        if (key !== refKey) {
          refKey = key;
          refSel.innerHTML = '<option value="asset">Asset</option><option value="asset-edge">Asset edge</option>' +
            sys.map(function (id) { return '<option value="' + esc(id) + '">' + esc(id) + "</option>"; }).join("");
        }
        var ref = PS.sel.originId(s);
        if (doc.activeElement !== refSel && refSel.value !== ref) refSel.value = ref;
      }

      function syncMsg(s, rec) {
        var p = s.ui.placing, cam = last && last.cam, txt = "";
        if (p && p.kind !== "formation") {
          if (p.kind !== "event" && cam && cam.kind !== "plan") txt = "Press P to add in Plan.";
          else if (p.kind === "aircraft") txt = (p.pts && p.pts.length ? "Pick a point to add a waypoint. Double-click or press Enter to end the route." : "Pick a point to place the start waypoint.") + " Press Escape to cancel.";
          else if (p.kind === "volume") txt = "Pick a point to place a vertex. Double-click or press Enter to close the volume. Or drag a rectangle. Press Escape to cancel.";
          else if (p.kind === "system") txt = "Pick a point to place it. Press Escape to cancel.";
          else if (p.kind === "event") txt = "Pick a point on a path to place the event. Press Escape to cancel.";
        } else if (s.ui.ruler) {
          txt = cam && cam.kind !== "plan" ? "Press P to use the ruler." : "Drag, or click two points, to measure. Press M to close the ruler.";
        }
        if (msgEl.textContent !== txt) msgEl.textContent = txt;
      }

      // ---------------------------------------------------------- pointer helpers
      function local(ev) {
        var r = stage.getBoundingClientRect();
        var W = last ? last.W : r.width, H = last ? last.H : r.height;
        return {
          sx: (ev.clientX - r.left) * (r.width ? W / r.width : 1),
          sy: (ev.clientY - r.top) * (r.height ? H / r.height : 1),
          lx: ev.clientX - r.left, ly: ev.clientY - r.top
        };
      }
      function worldAt(p) {
        var cam = last && last.cam;
        if (!cam || typeof cam.unproject !== "function") return null;
        return cam.unproject(p.sx, p.sy);
      }
      function isTouch(ev) { return ev.pointerType === "touch" || ev.pointerType === "pen"; }
      function hitAt(p, ev, touch) {
        var tol = touch ? 14 : 7, h = null;
        if (last && PS.render && typeof PS.render.hitTest === "function") h = PS.render.hitTest(last.hits, p.sx, p.sy, tol);
        if (!h && ev && ev.target && ev.target.closest) {
          var n = ev.target.closest("[data-k]");
          if (n && stage.contains(n)) h = { kind: n.getAttribute("data-k"), id: n.getAttribute("data-id"), i: n.getAttribute("data-i"), role: n.getAttribute("data-role") };
        }
        return normHit(h);
      }
      function mods(ev, p) { return { alt: !!ev.altKey, shift: !!ev.shiftKey, sx: p.sx, sy: p.sy }; }
      // sub: an optional second line in muted ink (the largest downstream change during a drag)
      function showLabel(text, p, sub) {
        if (!text && !sub) { labelEl.classList.add("hidden"); return; }
        labelEl.textContent = text || "";
        if (sub) {
          var sp = labelEl.ownerDocument.createElement("span");
          sp.className = "t-muted";
          sp.textContent = (text ? "\n" : "") + sub;
          labelEl.appendChild(sp);
        }
        labelEl.classList.remove("hidden");
        var wrap = stage.parentNode, mw = wrap.clientWidth || 600, mh = wrap.clientHeight || 400;
        var x = Math.min(p.lx + 14, Math.max(0, mw - labelEl.offsetWidth - 4));
        var y = Math.min(p.ly + 14, Math.max(0, mh - labelEl.offsetHeight - 4));
        labelEl.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
      }
      function refName(s) {
        var id = PS.sel.originId(s);
        return id === "asset" ? "asset" : id === "asset-edge" ? "asset edge" : id;
      }
      // returns HTML: the values stay in the t-data box, two spaces apart; the reference words are ui (t-sub)
      function cursorText(s, w) {
        var U = PS.units, E = PS.util.esc;
        if (!w) return "";
        var id = PS.sel.originId(s), name = refName(s);
        var from = id === "asset" || id === "asset-edge" ? '<span class="t-sub">from ' + E(name) + "</span>"
          : '<span class="t-sub">from</span> <span class="t-mono-id t-sec">' + E(name) + "</span>";
        if (w.x == null) return E(U.h(Math.abs(w.r)) + "  " + U.v(Math.max(0, w.z), "AGL")) + "  " + from;
        var o = PS.sel.origin(s, s.ui.t);
        var r = Math.hypot(w.x - o.x, w.y - o.y);
        var b = PS.geo.bearingTo(o, w);
        return E(U.h(r) + "  " + U.brg(b)) + "  " + from;
      }
      function select(h) {
        if (!h) { store.dispatch({ type: "sel.clear" }); return; }
        store.dispatch({ type: "sel.set", kind: h.kind, id: h.id, i: h.kind === "path" || h.kind === "volume" ? h.i : null });
      }
      function isWaypoint(h) { return h && h.kind === "path" && h.i != null && (h.role == null || h.role === "centre" || h.raw === "wp"); }
      function draggable(h, s, cam) {
        if (!h) return false;
        if (h.role === "insert" || h.role === "edge" || h.role === "bead" || h.role === "hold") return true;
        if (h.kind === "system") return h.role != null;
        if (h.kind === "event") return true;
        if (h.kind === "path") return h.i != null;
        var sel = s.ui.sel || {};
        if (h.kind === "volume") return h.i != null || h.role === "top" || (sel.kind === "volume" && sel.id === h.id);
        if (h.kind === "plane") return cam && cam.kind === "elev";
        return false;
      }
      function clearLong() { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } }
      function openMenu(h, ev) {
        if (h) select(h);
        store.ui("menu", { x: ev.clientX, y: ev.clientY, kind: h ? (h.kind === "path" && h.i != null ? "wp" : h.kind === "volume" && h.i != null ? "vertex" : h.kind) : null, id: h ? h.id : null, i: h ? h.i : null });
      }

      // ---------------------------------------------------------- placement ghost
      function placingCursor(s, w, ev) {
        var p = s.ui.placing;
        if (!p || p.kind === "formation" || p.kind === "event" || !w || w.x == null) return null;
        var pt = w, label = null;
        if (s.ui.snap !== false && !ev.altKey) {
          var rec = profileOf(s), from = p.pts && p.pts.length ? p.pts[p.pts.length - 1] : null;
          pt = PS.tools.snap(w, { derived: PS.derive.all(rec), scene: rec.scene, cam: last.cam, modifiers: { alt: !!ev.altKey, shift: !!ev.shiftKey }, from: from, kind: p.kind });
          label = pt.label || null;
        }
        return { x: Math.round(pt.x), y: Math.round(pt.y), label: label, leg: PS.tools.legText(p, pt) };
      }

      // ---------------------------------------------------------- pointer events
      function onDown(ev) {
        if (ev.button === 2) return;
        var s = st(), touch = isTouch(ev), p = local(ev);
        stage.focus && stage.focus({ preventScroll: true });
        pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          clearLong();
          if (drag) { drag.cancel(); drag = null; }
          pend = null;
          var a = pointers[ids[0]], b = pointers[ids[1]];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
          return;
        }
        if (ids.length > 2) return;
        try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* capture is optional */ }
        var cam = last && last.cam, w = worldAt(p), u = s.ui;
        var base = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, p0: p, w0: w, moved: false, touch: touch };

        if (ev.button === 1 || spaceDown) { ev.preventDefault(); pend = Object.assign(base, { type: "pan" }); return; }
        if (tapHover) { store.dispatch({ type: "hover.clear" }); tapHover = false; }
        if (u.menu) store.ui("menu", null);

        if (u.placing && u.placing.kind !== "formation") {
          if (u.placing.kind !== "event" && (!cam || cam.kind !== "plan")) { pend = Object.assign(base, { type: "none" }); return; }
          pend = Object.assign(base, { type: "place", rectOk: u.placing.kind === "volume" && !(u.placing.pts && u.placing.pts.length) });
          return;
        }
        if (u.ruler) {
          if (!w || w.x == null) { pend = Object.assign(base, { type: "none" }); return; }
          PS.tools.ruler.start(store, w, cam);
          pend = Object.assign(base, { type: "ruler" });
          return;
        }
        var h = hitAt(p, ev, touch);
        if (cam && cam.kind === "axon") {
          pend = Object.assign(base, { type: "rotate", hit: h, yaw: (u.cam || {}).yaw, pitch: (u.cam || {}).pitch });
          return;
        }
        pend = Object.assign(base, { type: h ? "obj" : "empty", hit: h });
        if (touch) {
          longTimer = setTimeout(function () {
            longTimer = 0;
            if (!pend || pend.moved) return;
            var hh = pend.hit;
            pend = null;
            openMenu(hh, { clientX: base.x0, clientY: base.y0 });
          }, 500);
        }
      }

      function startGesture(ev, p) {
        var s = st();
        if (pend.type === "obj") {
          if (PS.sel.canEdit(s) && draggable(pend.hit, s, last && last.cam) && pend.w0) {
            if (pend.hit.role !== "insert" && pend.hit.role !== "edge") select(pend.hit);
            var hit = Object.assign({}, pend.hit, { kind: pend.hit.raw === "vertex" ? "vertex" : pend.hit.raw === "wp" ? "wp" : pend.hit.kind });
            drag = PS.tools.beginDrag(store, hit, pend.w0, last.cam);
            pend.type = drag ? "drag" : (pend.touch ? "pan" : "none");
          } else {
            pend.type = pend.touch ? "pan" : "none";
          }
        } else if (pend.type === "empty") {
          pend.type = pend.touch ? "pan" : "none";
        } else if (pend.type === "place" && pend.rectOk) {
          pend.type = "rect";
        }
        if (pend.type === "pan") pend.view = Object.assign({}, ui().view);
      }

      function processMove() {
        moveRaf = 0;
        var m = moveQ;
        moveQ = null;
        if (!m || !alive) return;
        var ev = m.ev, p = m.p, s = st(), w = worldAt(p);
        lastP = p;
        cursorEl.innerHTML = last && last.cam && last.cam.kind !== "axon" ? cursorText(s, w) : "";

        if (pinch) {
          var ids = Object.keys(pointers);
          if (ids.length < 2) return;
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          var r = stage.getBoundingClientRect(), k = last ? last.W / (r.width || 1) : 1;
          PS.tools.pan(store, (mx - pinch.mx) * k, (my - pinch.my) * k);
          PS.tools.zoom(store, d / pinch.d, (mx - r.left) * k, (my - r.top) * k, last && last.cam);
          pinch = { d: d, mx: mx, my: my };
          return;
        }

        if (!pend) {
          // hover and placement ghost, no button down
          var u = s.ui;
          if (u.placing && u.placing.kind !== "formation" && u.placing.kind !== "event") {
            var cur = placingCursor(s, w, ev);
            var prev = u.placing.cur;
            if (cur && (!prev || prev.x !== cur.x || prev.y !== cur.y || prev.label !== cur.label)) {
              store.ui("placing", Object.assign({}, u.placing, { cur: cur }));
            }
            showLabel(cur ? [cur.leg, cur.label].filter(Boolean).join("  ") : "", p);
            return;
          }
          if (!labelEl.classList.contains("hidden")) showLabel("", p);
          // two-click ruler: the free end follows the pointer until the second click
          if (u.ruler && u.ruler.a && !u.ruler.done && w && w.x != null && last && last.cam && last.cam.kind === "plan") { PS.tools.ruler.move(store, w, last.cam); return; }
          if (ev.pointerType === "mouse") {
            var h = hitAt(p, ev, false);
            if (!sameHit(h, hoverHit)) {
              hoverHit = h;
              if (h) store.dispatch({ type: "hover.set", kind: h.kind, id: h.id, i: h.i, cx: ev.clientX, cy: ev.clientY, text: null, t: null });
              else store.dispatch({ type: "hover.clear" });
            }
          }
          return;
        }

        if (!pend.moved && Math.hypot(ev.clientX - pend.x0, ev.clientY - pend.y0) > 3) {
          pend.moved = true;
          clearLong();
          startGesture(ev, p);
        }
        if (!pend.moved) return;
        if (pend.type === "drag" && drag) {
          var res = drag.move(w, mods(ev, p)) || {};
          showLabel(res.label || "", p, res.largest || "");
        } else if (pend.type === "pan") {
          var rr = stage.getBoundingClientRect(), kk = last ? last.W / (rr.width || 1) : 1;
          store.dispatch({ type: "view.set", zoom: pend.view.zoom, px: pend.view.px + (ev.clientX - pend.x0) * kk, py: pend.view.py + (ev.clientY - pend.y0) * kk });
        } else if (pend.type === "rotate") {
          var cam = ui().cam || {};
          var yaw = (pend.yaw == null ? -35 : pend.yaw) + (ev.clientX - pend.x0) * 0.45;
          var pitch = PS.util.clamp((pend.pitch == null ? 55 : pend.pitch) + (ev.clientY - pend.y0) * 0.35, 8, 86);
          store.ui("cam", Object.assign({}, cam, { yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10 }));
        } else if (pend.type === "ruler") {
          if (w && w.x != null) PS.tools.ruler.move(store, w, last.cam);
        } else if (pend.type === "rect") {
          var a0 = pend.w0;
          if (a0 && w && w.x != null) showLabel(PS.units.h(Math.abs(w.x - a0.x)) + " x " + PS.units.h(Math.abs(w.y - a0.y)), p);
        }
      }

      function onMove(ev) {
        if (pointers[ev.pointerId]) pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        overStage = true;
        moveQ = { ev: { clientX: ev.clientX, clientY: ev.clientY, altKey: ev.altKey, shiftKey: ev.shiftKey, pointerType: ev.pointerType, target: ev.target }, p: local(ev) };
        if (!moveRaf) moveRaf = rAF(processMove);
      }

      function snapPlace(s, w, ev) {
        var p = s.ui.placing;
        if (!w || w.x == null || s.ui.snap === false || ev.altKey || p.kind === "event") return w;
        var rec = profileOf(s), from = p.pts && p.pts.length ? p.pts[p.pts.length - 1] : null;
        var sp = PS.tools.snap(w, { derived: PS.derive.all(rec), scene: rec.scene, cam: last.cam, modifiers: { alt: false, shift: !!ev.shiftKey }, from: from, kind: p.kind });
        return { x: sp.x, y: sp.y };
      }

      function onUp(ev) {
        delete pointers[ev.pointerId];
        clearLong();
        try { stage.releasePointerCapture(ev.pointerId); } catch (e) { /* capture is optional */ }
        if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
        if (moveRaf) { cAF(moveRaf); moveRaf = 0; processMove(); }
        var g = pend;
        pend = null;
        if (!g || g.id !== ev.pointerId) return;
        var s = st(), p = local(ev), w = worldAt(p);
        if (g.type === "drag" && drag) { drag.end(); drag = null; showLabel("", p); return; }
        if (g.type === "ruler") { PS.tools.ruler.end(store, w && w.x != null ? w : null, last && last.cam); return; }
        if (g.type === "rect") {
          showLabel("", p);
          if (g.w0 && w && w.x != null) PS.tools.placeAt(store, w, { rect: { a: snapPlace(s, g.w0, ev), b: snapPlace(s, w, ev) }, cam: last.cam });
          return;
        }
        if (g.moved) return;
        if (g.type === "place") {
          if (s.ui.placing.kind === "event") {
            if (!w) { store.ui("readout", { text: "Edit in Plan or Elevation.", level: "info" }); return; }
            PS.tools.placeAt(store, w, { cam: last.cam });
          } else {
            PS.tools.placeAt(store, snapPlace(s, w, ev), { cam: last.cam });
          }
          return;
        }
        if (g.type === "rotate") {
          if (g.hit) {
            select(g.hit);
            if (g.hit.handle || g.hit.role) store.ui("readout", { text: "Edit in Plan or Elevation.", level: "info" });
          } else if ((s.ui.sel || {}).kind) store.dispatch({ type: "sel.clear" });
          return;
        }
        if (g.type === "obj") {
          var h = g.hit;
          if (h.role === "insert" || h.role === "edge") return;
          select(h);
          if (g.touch && !h.handle && !h.role) {
            store.dispatch({ type: "hover.set", kind: h.kind, id: h.id, i: h.i, cx: ev.clientX, cy: ev.clientY, text: null, t: null });
            tapHover = true;
          }
          return;
        }
        if (g.type === "empty" && (s.ui.sel || {}).kind) store.dispatch({ type: "sel.clear" });
      }

      function onCancel(ev) {
        delete pointers[ev.pointerId];
        clearLong();
        if (Object.keys(pointers).length < 2) pinch = null;
        if (drag) { drag.cancel(); drag = null; }
        pend = null;
        labelEl.classList.add("hidden");
      }

      function onLeave() {
        overStage = false;
        lastP = null;
        if (!pend) {
          cursorEl.textContent = "";
          labelEl.classList.add("hidden");
          if (hoverHit) { hoverHit = null; store.dispatch({ type: "hover.clear" }); }
        }
      }

      function onDbl(ev) {
        var s = st(), u = s.ui;
        ev.preventDefault();
        if (u.placing && (u.placing.kind === "aircraft" || u.placing.kind === "volume")) { PS.tools.finishPlacing(store); return; }
        if (u.placing || u.ruler || !PS.sel.canEdit(s)) return;
        var h = hitAt(local(ev), ev, isTouch(ev));
        if (isWaypoint(h)) PS.tools.removeWaypoint(store, h.id, h.i);
      }

      function onWheel(ev) {
        ev.preventDefault();
        var p = local(ev), dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
        PS.tools.zoom(store, Math.exp(-dy * 0.0015), p.sx, p.sy, last && last.cam);
      }

      function onContext(ev) {
        ev.preventDefault();
        if (!PS.sel.canEdit(st()) || st().ui.placing) return;
        openMenu(hitAt(local(ev), ev, false), ev);
      }

      // keys the board owns: Enter during placement, Escape during a drag or placement, Space for pan
      function onKey(ev) {
        var a = doc.activeElement, tag = a ? String(a.tagName || "").toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || (a && a.isContentEditable)) return;
        if (ev.key === " ") {
          spaceDown = ev.type === "keydown";
          // Space over the board is pan: consume it so the play toggle in PS.keys does not run
          if (overStage && ev.type === "keydown" && !ev.metaKey && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); return; }
        }
        if (ev.type !== "keydown") return;
        var u = ui();
        if (ev.key === "Escape" && drag) {
          drag.cancel(); drag = null; pend = null; labelEl.classList.add("hidden"); ev.preventDefault(); return;
        }
        if (ev.key === "Escape" && u.placing) { PS.tools.cancelPlacing(store); labelEl.classList.add("hidden"); ev.preventDefault(); return; }
        if (ev.key === "Escape" && u.ruler && !u.menu && !u.paletteOpen) { PS.tools.ruler.clear(store); ev.preventDefault(); return; }
        if (ev.key === "Enter" && u.placing && (u.placing.kind === "aircraft" || u.placing.kind === "volume")) {
          PS.tools.finishPlacing(store); labelEl.classList.add("hidden"); ev.preventDefault();
        }
      }

      // ---------------------------------------------------------- toolbar events
      function onBar(ev) {
        var b = ev.target.closest("button");
        if (!b || !el.contains(b)) return;
        var u = ui();
        if (b.hasAttribute("data-proj")) { store.ui("cam", Object.assign({}, u.cam, { proj: b.getAttribute("data-proj") })); return; }
        if (b.hasAttribute("data-layer")) { var k = b.getAttribute("data-layer"); store.ui("layers." + k, !(u.layers && u.layers[k])); return; }
        switch (b.id) {
          case "bd-add":
            if (u.paletteOpen) { store.ui("paletteOpen", false); return; }
            store.ui("paletteGroup", null);
            store.ui("paletteOpen", true);
            return;
          case "bd-snap": store.ui("snap", u.snap === false); return;
          case "bd-ruler": PS.tools.ruler.toggle(store); return;
          case "bd-fit": PS.tools.fit(store); return;
          case "bd-units": store.ui("units", u.units === "si" ? "nav" : "si"); return;
        }
      }
      function onRef() { store.ui("cam", Object.assign({}, ui().cam, { ref: refSel.value })); }

      el.addEventListener("click", onBar);
      refSel.addEventListener("change", onRef);
      stage.addEventListener("pointerdown", onDown);
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerup", onUp);
      stage.addEventListener("pointercancel", onCancel);
      stage.addEventListener("pointerleave", onLeave);
      stage.addEventListener("dblclick", onDbl);
      stage.addEventListener("wheel", onWheel, { passive: false });
      stage.addEventListener("contextmenu", onContext);
      doc.addEventListener("keydown", onKey, true);
      doc.addEventListener("keyup", onKey, true);
      var ro = null;
      if (win && typeof win.ResizeObserver === "function") { ro = new win.ResizeObserver(schedule); ro.observe(stage); }

      render();

      return {
        update: function (state, channel) {
          schedule();
          // the cursor readout follows a units change without a pointer move
          if (channel === "units" && lastP && last && last.cam && last.cam.kind !== "axon") cursorEl.innerHTML = cursorText(st(), worldAt(lastP));
        },
        unmount: function () {
          alive = false;
          if (raf) cAF(raf);
          if (moveRaf) cAF(moveRaf);
          clearLong();
          if (drag) { drag.cancel(); drag = null; }
          if (ro) ro.disconnect();
          el.removeEventListener("click", onBar);
          refSel.removeEventListener("change", onRef);
          doc.removeEventListener("keydown", onKey, true);
          doc.removeEventListener("keyup", onKey, true);
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
