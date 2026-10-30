(function (PS) {
  "use strict";
  // Brief notes column (brief 4.4): notes and caption with live token previews, card fields, Up, Down and Delete with the
  // inline confirm, and the clip fields #nt-clip-*. Every field change is one undo step through store.set or PS.tools.

  var CSS = [
    ".nt-headrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
    "#slot-notes .sec h2{margin:0 0 8px}",
    "#slot-notes .sec h2:not(:first-child){margin-top:12px}",
    "#slot-notes .nt-headrow h2{margin:0 auto 0 0}",
    ".nt-headrow{margin-bottom:6px}",
    ".nt-prev[hidden]{display:none}",
    ".nt-prev{white-space:pre-wrap;margin:4px 0 0;min-height:var(--lh-2)}",
    ".nt-unk{text-decoration:underline wavy var(--warn);text-underline-offset:3px}",
    ".nt-sec>label{display:block;margin-bottom:4px}",
    ".nt-sec textarea{width:100%;min-height:64px}",
    ".nt-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center}",
    ".nt-chk{display:flex;flex-wrap:wrap;gap:4px 12px}",
    ".nt-chk label{display:inline-flex;align-items:center;gap:4px}",
    ".nt-err{margin:4px 0 0}",
    ".nt-err:empty{display:none}",
    ".nt-btns{display:flex;gap:6px;margin-top:6px}"
  ].join("");

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  var esc = function (s) { return PS.util.esc(s); };
  var CAMS = [["plan", "Plan"], ["elev", "Elevation"], ["axon", "Axonometric"]];
  var BAD_TIME = "Type a time as 2:55 or 175.";

  function layerKeys() {
    return PS.schema && PS.schema.LAYER_KEYS ? PS.schema.LAYER_KEYS : ["reach", "events", "envelopes", "tracks", "telemetry", "labels", "rings", "target"];
  }
  function layerLabel(k) { return PS.schema && PS.schema.LAYER_LABELS ? PS.schema.LAYER_LABELS[k] : k; }

  // seconds as m:ss, with one decimal when the value is not whole (beats such as 180.4)
  function mss(s) {
    if (s == null || !isFinite(s)) return "";
    var whole = Math.abs(s - Math.round(s)) < 0.05;
    var v = whole ? Math.round(s) : Math.round(s * 10) / 10;
    var m = Math.floor(v / 60), r = v - m * 60;
    var rs = whole ? String(Math.round(r)) : r.toFixed(1);
    if (r < 10) rs = "0" + rs;
    return m + ":" + rs;
  }

  // text with live tokens resolved; unknown tokens stay as typed with a warning underline
  function preview(rec, text, t, ref) {
    if (!text) return "";
    var out = "", last = 0, re = /\{[^{}\s]+\}/g, m;
    var paths = (rec.scene && rec.scene.paths || []).map(function (p) { return p.id; });
    var systems = (rec.scene && rec.scene.systems || []).map(function (s) { return s.id; });
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      var tok = m[0], val = PS.derive.tokens(rec, tok, t, ref);
      if (val === tok) {
        var id = tok.slice(1).split(/[.:]/)[0];
        var why = paths.indexOf(id) < 0 && systems.indexOf(id) < 0 ? tok + " has no path " + id + "." : tok + " is not a token.";
        out += '<span class="nt-unk" title="' + esc(why) + '">' + esc(tok) + "</span>";
      } else {
        out += esc(val);
      }
      last = m.index + tok.length;
    }
    return out + esc(text.slice(last));
  }

  // the preview shows only when a token changes the text; plain text is already in the textarea
  function prevDiv(id, rec, text, t, ref) {
    var h = preview(rec, text, t, ref);
    return '<div class="nt-prev t-sub" id="' + id + '"' + (h === esc(text) ? " hidden" : "") + ">" + h + "</div>";
  }
  function setPrev(node, rec, text, t, ref) {
    var h = preview(rec, text, t, ref);
    node.innerHTML = h;
    node.hidden = h === esc(text);
  }

  PS.panels.register("notes", {
    channels: ["profile", "time", "units", "panels"],
    mount: function (el, store) {
      var doc = el.ownerDocument;
      addStyle(doc, "notes", CSS);
      var confirmDel = false, draft = {}, draftCard = null, errs = {};

      function refOf(state) { return PS.sel.originId ? PS.sel.originId(state) : "asset"; }
      function cur(state) {
        var rec = PS.sel.profile(state), cards = (rec && rec.cards) || [];
        var ix = cards.length ? Math.max(0, Math.min(cards.length - 1, state.ui.cardIx || 0)) : -1;
        return { rec: rec, cards: cards, ix: ix, card: ix >= 0 ? cards[ix] : null };
      }

      function clipDefaults(state, rec, card) {
        var ui = state.ui, c = card.clip;
        if (c) return { t0: mss(c.t0), t1: mss(c.t1), rate: c.rate, beats: (c.beats || []).map(mss).join(", ") };
        var tmax = PS.sel.tmax ? PS.sel.tmax(state) : 0;
        var r = ui.range && ui.loop === "range" ? ui.range : { t0: 0, t1: tmax };
        return { t0: mss(r.t0), t1: mss(r.t1), rate: ui.rate || 1, beats: "" };
      }

      function val(id, dflt) { return Object.prototype.hasOwnProperty.call(draft, id) ? draft[id] : dflt; }

      function render(state) {
        var c = cur(state);
        if (!c.rec) { el.innerHTML = ""; return; }
        var t = state.ui.t, ref = refOf(state);
        if (!c.card) {
          el.innerHTML = '<div class="sec"><h2 class="t-label">Notes</h2><p class="hint">No cards yet. Go to Build and press C to save the view as a card.</p></div>';
          return;
        }
        var card = c.card, n = c.ix + 1;
        if (draftCard !== card.id) { draft = {}; errs = {}; draftCard = card.id; confirmDel = false; }

        var a = doc.activeElement, keep = a && el.contains(a) ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;

        var cam = card.cam || {}, layers = card.layers || {}, disp = card.displays || {};
        var cd = clipDefaults(state, c.rec, card);
        var systems = (c.rec.scene && c.rec.scene.systems) || [];
        var refs = [["asset", "Asset"], ["asset-edge", "Asset edge"]].concat(systems.map(function (s) { return [s.id, s.id]; }));

        var head = confirmDel
          ? '<span class="nt-ask t-sub t-warn">Delete card ' + n + '?</span><button type="button" class="mini" id="nt-del-yes">Yes</button><button type="button" class="mini" id="nt-del-no">No</button>'
          : '<button type="button" class="mini" id="nt-up"' + (c.ix <= 0 ? " disabled" : "") + '>Up</button>' +
            '<button type="button" class="mini" id="nt-down"' + (c.ix >= c.cards.length - 1 ? " disabled" : "") + '>Down</button>' +
            '<button type="button" class="mini" id="nt-del">Delete</button>';

        el.innerHTML =
          '<div class="sec nt-sec"><h2 class="t-label">Notes</h2>' +
          '<label class="t-sub" for="nt-notes">Notes text</label>' +
          '<textarea id="nt-notes" rows="4">' + esc(card.notes || "") + '</textarea>' +
          prevDiv("nt-notes-preview", c.rec, card.notes || "", t, ref) + '</div>' +

          '<div class="sec nt-sec"><h2 class="t-label">Caption</h2>' +
          '<label class="t-sub" for="nt-caption">Caption text</label>' +
          '<textarea id="nt-caption" rows="3">' + esc(card.caption || "") + '</textarea>' +
          prevDiv("nt-caption-preview", c.rec, card.caption || "", t, ref) + '</div>' +

          '<div class="sec"><div class="nt-headrow"><h2 class="t-label">Card ' + n + '</h2>' + head + '</div>' +
          '<div class="fld"><label for="nt-name">Name</label><input id="nt-name" type="text" value="' + esc(card.name || "") + '"></div>' +
          '<div class="fld"><label for="nt-cam">Camera</label><select id="nt-cam">' +
          CAMS.map(function (x) { return '<option value="' + x[0] + '"' + (cam.proj === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + '</select></div>' +
          '<div class="fld"><label for="nt-yaw">Yaw</label><input id="nt-yaw" class="mono" type="number" step="1" value="' + esc(cam.yaw == null ? "" : cam.yaw) + '"></div>' +
          '<div class="fld"><label for="nt-pitch">Pitch</label><input id="nt-pitch" class="mono" type="number" step="1" value="' + esc(cam.pitch == null ? "" : cam.pitch) + '"></div>' +
          '<div class="fld"><label for="nt-ref">Ref</label><select id="nt-ref">' +
          refs.map(function (x) { return '<option value="' + esc(x[0]) + '"' + ((cam.ref || "asset") === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + '</select></div>' +
          '<div class="fld"><label for="nt-t">Time</label><input id="nt-t" class="mono" type="text" placeholder="full run" value="' + esc(card.t == null ? "" : mss(card.t)) + '"></div>' +
          '<p class="nt-err t-sub t-warn" id="nt-t-err">' + esc(errs.t || "") + '</p>' +
          '<div class="fld"><label for="nt-focus">Focus</label><input id="nt-focus" type="text" placeholder="T1, e4" value="' + esc((card.focus || []).join(", ")) + '"></div>' +
          '<h2 class="t-label">Layers</h2><div class="nt-chk t-sub">' + layerKeys().map(function (k) {
            return '<label for="nt-layer-' + k + '"><input type="checkbox" id="nt-layer-' + k + '"' + (layers[k] ? " checked" : "") + '>' + esc(layerLabel(k)) + '</label>';
          }).join("") + '</div>' +
          '<h2 class="t-label">Displays</h2><div class="nt-chk t-sub">' +
          [["timeline", "Timeline"], ["chart", "Chart"], ["readout", "Readout (K)"]].map(function (x) {
            return '<label for="nt-disp-' + x[0] + '"><input type="checkbox" id="nt-disp-' + x[0] + '"' + (disp[x[0]] ? " checked" : "") + '>' + x[1] + '</label>';
          }).join("") + '</div></div>' +

          '<div class="sec"><h2 class="t-label">Clip</h2>' +
          '<div class="fld"><label for="nt-clip-t0">Start</label><input id="nt-clip-t0" class="mono" type="text" value="' + esc(val("nt-clip-t0", cd.t0)) + '"></div>' +
          '<div class="fld"><label for="nt-clip-t1">End</label><input id="nt-clip-t1" class="mono" type="text" value="' + esc(val("nt-clip-t1", cd.t1)) + '"></div>' +
          '<div class="fld"><label for="nt-clip-rate">Rate</label><select id="nt-clip-rate">' +
          PS.catalog.RATES.map(function (r) { return '<option value="' + r + '"' + (Number(val("nt-clip-rate", cd.rate)) === r ? " selected" : "") + ">x" + r + "</option>"; }).join("") + '</select></div>' +
          '<div class="fld"><label for="nt-clip-beats">Beats</label><input id="nt-clip-beats" class="mono" type="text" placeholder="2:30, 4:22" value="' + esc(val("nt-clip-beats", cd.beats)) + '"></div>' +
          '<p class="nt-err t-sub t-warn" id="nt-clip-err">' + esc(errs.clip || "") + '</p>' +
          '<div class="nt-btns"><button type="button" class="btn" id="nt-clip-save">Save clip</button>' +
          '<button type="button" class="btn quiet" id="nt-clip-clear"' + (card.clip ? "" : " disabled") + '>Clear clip</button></div>' +
          (card.clip ? '<p class="hint">Right plays to the next beat. Left goes back one beat.</p>' : '<p class="hint">Start and End come from the loop range, else the full run.</p>') +
          '</div>';

        if (keep && keep.id) {
          var f = doc.getElementById(keep.id);
          if (f && el.contains(f)) {
            if ((f.tagName === "TEXTAREA" || f.type === "text") && f.value !== keep.v) f.value = keep.v;
            f.focus();
            try { if (keep.s != null) f.setSelectionRange(keep.s, keep.e); } catch (e) { /* not a text control */ }
          }
        }
      }

      function renderPreviews(state) {
        var c = cur(state);
        if (!c.card) return;
        var t = state.ui.t, ref = refOf(state);
        var np = el.querySelector("#nt-notes-preview"), cp = el.querySelector("#nt-caption-preview");
        var nIn = el.querySelector("#nt-notes"), cIn = el.querySelector("#nt-caption");
        if (np) setPrev(np, c.rec, nIn ? nIn.value : c.card.notes || "", t, ref);
        if (cp) setPrev(cp, c.rec, cIn ? cIn.value : c.card.caption || "", t, ref);
      }

      function setCard(field, value) {
        var c = cur(store.get());
        if (!c.card) return;
        store.set("cards." + c.ix + "." + field, value);
      }

      function onChange(e) {
        var tg = e.target, id = tg.id, st = store.get(), c = cur(st);
        if (!c.card) return;
        var card = c.card, cam = card.cam || {};
        if (id === "nt-name") { if (tg.value !== card.name) setCard("name", tg.value); }
        else if (id === "nt-notes") { if (tg.value !== (card.notes || "")) setCard("notes", tg.value); }
        else if (id === "nt-caption") { if (tg.value !== (card.caption || "")) setCard("caption", tg.value); }
        else if (id === "nt-cam" || id === "nt-yaw" || id === "nt-pitch" || id === "nt-ref") {
          var nc = Object.assign({}, cam);
          if (id === "nt-cam") nc.proj = tg.value;
          if (id === "nt-ref") nc.ref = tg.value;
          if (id === "nt-yaw" || id === "nt-pitch") {
            var num = Number(tg.value);
            if (tg.value === "" || !isFinite(num)) { render(st); return; }
            nc[id === "nt-yaw" ? "yaw" : "pitch"] = num;
          }
          setCard("cam", nc);
          store.ui("cam", nc);
        }
        else if (id === "nt-t") {
          var raw = tg.value.trim();
          var tv = raw === "" ? null : PS.units.parseT(raw, st.ui.t);
          if (raw !== "" && tv == null) { errs.t = BAD_TIME; var te = el.querySelector("#nt-t-err"); if (te) te.textContent = BAD_TIME; return; }
          errs.t = "";
          if (tv !== card.t) setCard("t", tv);
          if (!card.clip) { if (tv == null) PS.time.off(); else PS.time.set(tv); }
        }
        else if (id === "nt-focus") {
          var ids = tg.value.split(/[\s,]+/).filter(Boolean);
          if (ids.join(",") !== (card.focus || []).join(",")) setCard("focus", ids);
        }
        else if (id.indexOf("nt-layer-") === 0) {
          var k = id.slice(9), nl = Object.assign({}, card.layers || {});
          nl[k] = tg.checked;
          setCard("layers", nl);
          store.ui("layers", Object.assign({}, st.ui.layers || {}, nl));
        }
        else if (id.indexOf("nt-disp-") === 0) {
          var dk = id.slice(8), nd = Object.assign({ timeline: true, chart: false, readout: false }, card.displays || {});
          nd[dk] = tg.checked;
          setCard("displays", nd);
          if (dk === "readout") store.ui("panels", Object.assign({}, store.get().ui.panels, { roStrip: tg.checked }));
        }
        else if (id.indexOf("nt-clip-") === 0) { draft[id] = tg.value; }
      }

      function onInput(e) {
        var id = e.target.id;
        if (id === "nt-notes" || id === "nt-caption") renderPreviews(store.get());
        else if (id.indexOf("nt-clip-") === 0) draft[id] = e.target.value;
      }

      function saveClip() {
        var st = store.get(), c = cur(st);
        if (!c.card) return;
        var g = function (id) { return el.querySelector("#" + id).value.trim(); };
        var t0 = PS.units.parseT(g("nt-clip-t0"), st.ui.t), t1 = PS.units.parseT(g("nt-clip-t1"), st.ui.t);
        var beatsTxt = g("nt-clip-beats"), beats = [], bad = false;
        if (beatsTxt) beatsTxt.split(",").forEach(function (b) {
          var v = PS.units.parseT(b.trim(), st.ui.t);
          if (v == null) bad = true; else beats.push(v);
        });
        var errEl = el.querySelector("#nt-clip-err");
        if (t0 == null || t1 == null || bad) { errs.clip = BAD_TIME; errEl.textContent = BAD_TIME; return; }
        if (!(t0 < t1)) { errs.clip = "Set the end after the start."; errEl.textContent = errs.clip; return; }
        errs.clip = "";
        draft = {};
        var rate = Number(g("nt-clip-rate"));
        PS.tools.saveClip(store, c.ix, { t0: t0, t1: t1, rate: rate, beats: beats });
      }

      function onClick(e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !el.contains(b)) return;
        var st = store.get(), c = cur(st);
        if (!c.card) return;
        switch (b.id) {
          case "nt-up":
          case "nt-down": {
            var d = b.id === "nt-up" ? -1 : 1, to = c.ix + d;
            if (to < 0 || to >= c.cards.length) return;
            PS.tools.cardMove(store, c.ix, d);
            store.ui("cardIx", to);
            var nb = el.querySelector("#" + b.id);
            if (nb && !nb.disabled) nb.focus();
            break;
          }
          case "nt-del": confirmDel = true; render(st); var y = el.querySelector("#nt-del-no"); if (y) y.focus(); break;
          case "nt-del-no": confirmDel = false; render(st); break;
          case "nt-del-yes": {
            confirmDel = false;
            var n = c.cards.length;
            PS.tools.cardRemove(store, c.ix);
            draftCard = null;
            if (n > 1) PS.brief.enter(store, Math.min(c.ix, n - 2));
            else { store.ui("cardIx", 0); render(store.get()); }
            break;
          }
          case "nt-clip-save": saveClip(); break;
          case "nt-clip-clear": draft = {}; PS.tools.saveClip(store, c.ix, null); break;
        }
      }

      el.addEventListener("change", onChange);
      el.addEventListener("input", onInput);
      el.addEventListener("click", onClick);
      render(store.get());

      return {
        update: function (state, channel) {
          if (channel === "time") renderPreviews(state);
          else render(state);
        },
        unmount: function () {
          el.removeEventListener("change", onChange);
          el.removeEventListener("input", onInput);
          el.removeEventListener("click", onClick);
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
