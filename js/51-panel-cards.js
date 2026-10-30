(function (PS) {
  "use strict";
  // Brief card strip and Add card (brief 4.4). This file also holds PS.brief, the card navigation that the
  // cards, stage and notes panels and the PS.app key actions share: card entry, clip beats, the Brief view.

  function clampIx(ix, n) { return Math.max(0, Math.min(n - 1, ix | 0)); }

  function cardsOf(state) {
    var r = PS.sel.profile(state);
    return (r && r.cards) || [];
  }

  function currentCard(state) {
    var cards = cardsOf(state);
    if (!cards.length) return null;
    return cards[clampIx(state.ui.cardIx || 0, cards.length)];
  }

  function defaultLayers() {
    return PS.schema && PS.schema.defaultLayers ? PS.schema.defaultLayers()
      : { reach: true, events: true, envelopes: true, tracks: true, telemetry: false, labels: true, rings: false, target: true };
  }

  var brief = PS.brief = {
    stash: null,      // Build view state kept while Brief runs: { cam, layers, rate }
    startMs: null,    // elapsed clock start (presenter aid)

    card: currentCard,
    cards: cardsOf,

    // the view object the stage renders and Add card saves: the card view with the Brief overrides of ui.cam, ui.layers, ui.t, ui.focus
    view: function (state, card) {
      var ui = state.ui;
      var base = PS.sel.cardView ? PS.sel.cardView(state, card) : {};
      var v = Object.assign({}, base);
      var cam = ui.cam || (card && card.cam) || { proj: "plan", yaw: -35, pitch: 55, ref: "asset" };
      v.proj = cam.proj; v.yaw = cam.yaw; v.pitch = cam.pitch; v.ref = cam.ref || "asset";
      v.layers = ui.layers || (card && card.layers) || defaultLayers();
      v.t = ui.t;
      v.focus = ui.focus && ui.focus.length ? ui.focus.slice() : ((card && card.focus) || []).slice();
      v.zoom = 1; v.px = 0; v.py = 0;
      v.units = ui.units;
      return v;
    },

    // called by PS.app on entry to Brief
    begin: function (store) {
      var ui = store.get().ui;
      brief.stash = { cam: ui.cam, layers: ui.layers, rate: ui.rate };
      brief.startMs = Date.now();
      brief.enter(store, ui.cardIx || 0);
    },

    // called by PS.app before it leaves Brief
    end: function (store) {
      var ui = store.get().ui, s = brief.stash;
      brief.stash = null;
      brief.startMs = null;
      if (ui.panels && (ui.panels.fullStage || ui.panels.blank)) {
        store.ui("panels", Object.assign({}, ui.panels, { fullStage: false, blank: false }));
      }
      if (ui.focus && ui.focus.length) store.ui("focus", []);
      if (s) {
        if (s.cam) store.ui("cam", s.cam);
        if (s.layers) store.ui("layers", s.layers);
        if (s.rate != null && PS.time && PS.time.rate) PS.time.rate(s.rate);
      }
    },

    enter: function (store, ix) {
      var st = store.get(), cards = cardsOf(st);
      if (!cards.length) {
        if (st.ui.cardIx !== 0) store.ui("cardIx", 0);
        return;
      }
      ix = clampIx(ix, cards.length);
      var card = cards[ix];
      if (st.ui.cardIx !== ix) store.ui("cardIx", ix);
      if (st.ui.focus && st.ui.focus.length) store.ui("focus", []);
      var cam = Object.assign({ proj: "plan", yaw: -35, pitch: 55, ref: "asset" }, card.cam || {});
      store.ui("cam", cam);
      store.ui("layers", Object.assign(defaultLayers(), card.layers || {}));
      var ro = !!(card.displays && card.displays.readout);
      var panels = store.get().ui.panels || {};
      if (!!panels.roStrip !== ro) store.ui("panels", Object.assign({}, panels, { roStrip: ro }));
      var T = PS.time;
      if (!T) return;
      T.pause();
      if (card.clip) {
        if (card.clip.rate != null) T.rate(card.clip.rate);
        T.set(card.clip.t0);
      } else if (card.t == null) {
        T.off();
      } else {
        T.set(card.t);
      }
    },

    // Right (d 1) plays to the next beat, else the next card; Left (d -1) goes back one beat, else the previous card
    step: function (store, d) {
      var st = store.get(), cards = cardsOf(st);
      if (!cards.length) return;
      var ix = clampIx(st.ui.cardIx || 0, cards.length), card = cards[ix];
      var clip = card.clip, T = PS.time;
      if (clip && T) {
        var beats = (clip.beats || []).slice().sort(function (a, b) { return a - b; });
        var t = st.ui.t == null ? clip.t0 : st.ui.t;
        if (d > 0) {
          var next = null;
          for (var i = 0; i < beats.length; i++) if (beats[i] > t + 0.05) { next = beats[i]; break; }
          if (next != null) {
            if (st.ui.t == null) T.set(clip.t0);
            if (clip.rate != null && st.ui.rate !== clip.rate) T.rate(clip.rate);
            T.playTo(next);
            return;
          }
        } else {
          var prev = null;
          for (var j = beats.length - 1; j >= 0; j--) if (beats[j] < t - 0.05) { prev = beats[j]; break; }
          if (prev != null) { T.pause(); T.set(prev); return; }
          if (t > clip.t0 + 0.05) { T.pause(); T.set(clip.t0); return; }
        }
      }
      var to = ix + (d > 0 ? 1 : -1);
      if (to >= 0 && to < cards.length) brief.enter(store, to);
    }
  };

  // ---------------------------------------------------------------- panel

  var CSS = [
    ".cd-sec{border-bottom:0}",
    ".cd-sec>h2{margin:0 0 8px}",
    ".cd-list{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px}",
    ".cd-card{display:flex;flex-direction:column;gap:6px;align-items:stretch;width:100%;text-align:left;padding:8px;color:var(--t1);background:var(--raised);border:1px solid var(--rule);border-radius:4px;cursor:pointer}",
    ".cd-card:hover{border-color:var(--rule-strong)}",
    ".cd-card[aria-current=\"true\"]{border:2px solid var(--accent);padding:7px}",
    ".cd-thumb{display:block;width:100%;aspect-ratio:16/9;background:var(--board);border-radius:2px;overflow:hidden}",
    ".cd-thumb svg{width:100%;height:100%;display:block}",
    ".cd-row{display:flex;gap:8px;align-items:flex-start;min-width:0}",
    ".cd-n{min-width:14px}",
    ".cd-txt{display:flex;flex-direction:column;min-width:0}",
    "#cd-add{width:100%}"
  ].join("");

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  var THUMB = { W: 160, H: 90 };

  PS.panels.register("cards", {
    channels: ["profile", "panels"],
    mount: function (el, store) {
      var doc = el.ownerDocument;
      addStyle(doc, "cards", CSS);
      var esc = PS.util.esc;
      var thumbs = new WeakMap();   // record -> { units, list:[svg] }

      // the same card render the rail uses, cached per record and units mode
      function thumbFor(r, card, ix) {
        if (!r) return "";
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

      function render(state) {
        var cards = cardsOf(state), rec = PS.sel.profile(state);
        var cur = cards.length ? clampIx(state.ui.cardIx || 0, cards.length) : -1;
        var focusId = doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement.id : null;
        el.innerHTML =
          '<div class="sec cd-sec"><h2 class="t-label">Cards</h2>' +
          (cards.length ? '<ol class="cd-list">' + cards.map(function (c, i) {
            return '<li><button type="button" class="cd-card" id="cd-card-' + (i + 1) + '" data-ix="' + i + '" aria-current="' + (i === cur) + '">' +
              '<span class="cd-thumb" aria-hidden="true">' + thumbFor(rec, c, i) + '</span>' +
              '<span class="cd-row"><span class="cd-n t-key">' + (i + 1) + '</span><span class="cd-txt">' +
              '<span class="cd-name t-name" title="' + esc(c.name || "Card " + (i + 1)) + '">' + esc(c.name || "Card " + (i + 1)) + '</span>' +
              (c.clip ? '<span class="cd-clip t-micro">Clip, ' + (c.clip.beats ? c.clip.beats.length : 0) + ' beats</span>' : "") +
              '</span></span></button></li>';
          }).join("") + '</ol>' : '<p class="hint">No cards yet.</p>') +
          '<button type="button" class="btn" id="cd-add">Add card</button></div>';
        if (focusId) { var f = doc.getElementById(focusId); if (f && el.contains(f)) f.focus(); }
      }

      function onClick(e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !el.contains(b)) return;
        if (b.id === "cd-add") {
          var st = store.get(), ui = st.ui, n = cardsOf(st).length;
          var ix = n ? clampIx(ui.cardIx || 0, n) + 1 : 0;
          PS.tools.saveCard(store, { cam: ui.cam, layers: ui.layers, t: ui.t, sel: ui.sel }, ix);
          if (cardsOf(store.get()).length > n) brief.enter(store, ix);
          return;
        }
        if (b.hasAttribute("data-ix")) brief.enter(store, Number(b.getAttribute("data-ix")));
      }

      el.addEventListener("click", onClick);
      render(store.get());
      return {
        update: function (state) { render(state); },
        unmount: function () { el.removeEventListener("click", onClick); el.innerHTML = ""; }
      };
    }
  });
})(globalThis.PS);
