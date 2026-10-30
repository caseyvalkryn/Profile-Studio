(function (PS) {
  "use strict";
  // Brief stage (brief 4.4, 4.5): card render, caption, full stage, blank, key hints, live readout strip #st-readout,
  // presenter aids #st-next and #st-elapsed, phone header and Back and Next row with swipe.

  var CSS = [
    "#slot-stage{display:flex;flex-direction:column}",
    ".st-wrap{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;position:relative}",
    ".st-head{display:flex;align-items:center;gap:12px;padding:8px 12px;min-height:36px;border-bottom:1px solid var(--rule)}",
    "#st-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".st-phone{display:none;gap:6px}",
    ".st-view{position:relative;flex:1 1 auto;min-height:220px;min-width:0;overflow:hidden;background:var(--board);touch-action:pan-y}",
    ".st-view>svg{display:block;width:100%;height:100%}",
    ".st-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:var(--t2)}",
    ".st-blankfill{position:absolute;inset:0;background:var(--board)}",
    "#st-caption{padding:8px 12px;border-top:1px solid var(--rule);min-height:20px}",
    "#st-caption:empty{display:none}",
    ".st-hints{position:absolute;right:12px;bottom:8px;transition:opacity .6s;pointer-events:none}",
    ".st-hints.st-off{opacity:0}",
    "#st-readout{padding:4px 12px;white-space:pre;overflow-x:auto;color:var(--datablock);background:var(--panel);border-top:1px solid var(--rule)}",
    // min-height keeps the thumbnail row height on the last card, so the clock stays clear of the key hints
    ".st-aids{display:flex;align-items:center;gap:12px;padding:6px 12px;border-top:1px solid var(--rule);min-height:67px}",
    "#st-next{display:flex;align-items:center;gap:8px;min-width:0}",
    ".st-thumb{width:96px;height:54px;flex:0 0 auto;border:1px solid var(--rule);background:var(--board);overflow:hidden}",
    ".st-thumb>svg{display:block;width:100%;height:100%}",
    "#st-elapsed{margin-left:auto;white-space:nowrap}",
    ".st-nav{display:none;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--rule)}",
    ".st-dots{display:flex;gap:6px;justify-content:center;flex:1 1 auto}",
    ".st-dot{width:8px;height:8px;border-radius:4px;border:1px solid var(--t3)}",
    ".st-dot.st-on{background:var(--t1);border-color:var(--t1)}",
    // full stage scales type through the --fs-n and --lh-n token scope on #slot-stage.st-full in tokens.css
    "#slot-stage.st-full .st-aids{display:none}",
    "@media (max-width:600px){.st-phone{display:flex}.st-nav{display:flex}.st-aids{display:none}.st-hints{display:none}.st-view{min-height:46vh}}"
  ].join("");

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  var PROJ = { plan: "plan", elev: "elev", axon: "axon" };

  PS.panels.register("stage", {
    channels: ["profile", "derived", "cam", "layers", "time", "units", "panels", "resize"],
    mount: function (el, store) {
      var doc = el.ownerDocument, win = doc.defaultView;
      addStyle(doc, "stage", CSS);

      el.innerHTML =
        '<div class="st-wrap">' +
        '<div class="st-head"><span id="st-title" class="t-title"></span><span id="st-meta" class="t-data t-sec"></span>' +
        '<span class="st-phone"><button type="button" class="mini" id="st-notes" aria-label="Notes">N</button>' +
        '<button type="button" class="mini" id="st-full" aria-label="Full stage">F</button></span></div>' +
        '<div class="st-view" id="st-view" tabindex="0" aria-label="Stage"></div>' +
        '<div id="st-caption" class="t-caption"></div>' +
        '<div id="st-readout" class="t-data" aria-live="polite" hidden></div>' +
        '<div class="st-aids t-sub"><div id="st-next"></div><div id="st-elapsed" class="t-data t-sec"></div></div>' +
        '<div class="st-nav"><button type="button" class="btn" id="st-back">Back</button><span class="st-dots"></span>' +
        '<button type="button" class="btn" id="st-fwd">Next</button></div>' +
        '<div class="st-hints t-micro" id="st-hints">Right next &nbsp; Left back &nbsp; F full stage</div>' +
        '</div>';

      var q = function (id) { return el.querySelector("#" + id); };
      var viewEl = q("st-view"), titleEl = q("st-title"), metaEl = q("st-meta"), capEl = q("st-caption");
      var roEl = q("st-readout"), nextEl = q("st-next"), elapsedEl = q("st-elapsed"), hintsEl = q("st-hints");
      var dotsEl = el.querySelector(".st-dots");
      var hintTimer = null, lastNextKey = null, wasFull = false;

      function refOf(state) { return PS.sel.originId ? PS.sel.originId(state) : (state.ui.cam && state.ui.cam.ref) || "asset"; }

      function renderScene(state, rec, card) {
        var ui = state.ui;
        if (ui.panels && ui.panels.blank) {
          viewEl.innerHTML = '<div class="st-blankfill" aria-label="Blank stage"></div>';
          return;
        }
        if (!card) {
          viewEl.innerHTML = '<div class="st-empty t-body">No cards yet. Go to Build and press C to save the view as a card.</div>';
          return;
        }
        var size = { W: Math.max(200, viewEl.clientWidth || 800), H: Math.max(150, viewEl.clientHeight || 480) };
        var v = PS.brief.view(state, card);
        try {
          var res = PS.render.scene(rec, v, size, { thumb: false, edit: false, derived: PS.sel.derived(state), ghost: null });
          viewEl.innerHTML = res && res.svg ? res.svg : "";
        } catch (e) {
          viewEl.innerHTML = '<div class="st-empty t-body">The stage cannot draw this card.</div>';
          if (win && win.console) win.console.error(e);
        }
      }

      function renderReadout(state, rec, card) {
        var ui = state.ui;
        var on = !!(ui.panels && ui.panels.roStrip) && !!card;
        roEl.hidden = !on;
        if (!on) return;
        var paths = (rec.scene && rec.scene.paths) || [];
        var focus = (ui.focus && ui.focus.length ? ui.focus : card.focus) || [];
        var pid = null;
        for (var i = 0; i < focus.length && !pid; i++) {
          for (var j = 0; j < paths.length; j++) if (paths[j].id === focus[i]) { pid = paths[j].id; break; }
        }
        if (!pid && paths.length) pid = paths[0].id;
        if (!pid) { roEl.textContent = "Add an aircraft to see the track. (K)"; return; }
        if (ui.t == null) { roEl.textContent = pid + "  Time is off. Press T to show the time. (K)"; return; }
        var d = PS.sel.derived(state), a = d && d.at ? d.at(pid, ui.t, refOf(state)) : null;
        if (!a) { roEl.textContent = pid + "  No sample at " + PS.units.t(ui.t) + ". (K)"; return; }
        var site = rec.site || {}, datum = site.datum || "AGL";
        var z = datum === "MSL" ? a.z + (site.elev || 0) : a.z;
        var cov = a.covering && a.covering.length ? a.covering.join(" ") : "no cover";
        roEl.textContent = pid + "  " + PS.units.h(a.r) + "  " + PS.units.v(z, datum) + "  " + PS.units.spd(a.spd) +
          "  closing " + PS.units.spd(a.vc || 0) + "  " + cov + "   (K)";
      }

      function renderAids(state, rec, cards, ix) {
        var nxt = ix + 1 < cards.length ? cards[ix + 1] : null;
        var key = nxt ? [nxt, state.ui.units, ix] : null;
        if (nxt) {
          if (!lastNextKey || lastNextKey[0] !== key[0] || lastNextKey[1] !== key[1] || lastNextKey[2] !== key[2]) {
            var svg = "";
            try { svg = PS.render.card(rec, nxt, { W: 192, H: 108 }, true) || ""; } catch (e) { svg = ""; }
            nextEl.innerHTML = '<span class="st-thumb">' + svg + '</span><span class="t-sub">Next: ' + (ix + 2) + " " + PS.util.esc(nxt.name || "") + "</span>";
            lastNextKey = key;
          }
        } else {
          nextEl.innerHTML = cards.length ? '<span class="t-sub">Last card</span>' : "";
          lastNextKey = null;
        }
      }

      function renderElapsed() {
        elapsedEl.innerHTML = PS.brief.startMs == null ? "" : '<span class="t-sub">Elapsed</span> <span class="t-data">' + PS.util.esc(clock(Date.now() - PS.brief.startMs)) + "</span>";
      }

      function renderHead(state, rec, cards, ix, card) {
        var ui = state.ui;
        if (!card) { titleEl.textContent = rec ? rec.name || rec.id : ""; metaEl.textContent = ""; }
        else {
          titleEl.textContent = (ix + 1) + ". " + (card.name || "Card " + (ix + 1));
          var proj = PROJ[(ui.cam && ui.cam.proj) || (card.cam && card.cam.proj)] || "plan";
          // numbers and times stay mono; the words (camera, "full run") are ui
          var E = PS.util.esc, tt = ui.t == null ? null : PS.units.t(ui.t);
          metaEl.innerHTML = E((ix + 1) + " of " + cards.length) + '  <span class="t-sub">' + E(proj) + "</span>  " +
            (tt == null ? '<span class="t-sub">' + E(PS.units.t(null)) + "</span>" : E(tt));
        }
        var dots = "";
        for (var i = 0; i < cards.length; i++) dots += '<span class="st-dot' + (i === ix ? " st-on" : "") + '"></span>';
        dotsEl.innerHTML = dots;
        q("st-back").disabled = ix <= 0;
        q("st-fwd").disabled = ix < 0 || ix >= cards.length - 1;
      }

      function renderCaption(state, rec, card) {
        if (!card || (state.ui.panels && state.ui.panels.blank)) { capEl.textContent = ""; return; }
        var txt = card.caption || "";
        capEl.textContent = txt ? PS.derive.tokens(rec, txt, state.ui.t, refOf(state)) : "";
      }

      function setFull(full) {
        el.classList.toggle("st-full", !!full);
        if (full && !wasFull) showHints();
        if (!full) { clearTimeout(hintTimer); hintsEl.classList.remove("st-off"); }
        wasFull = !!full;
      }

      function showHints() {
        hintsEl.classList.remove("st-off");
        clearTimeout(hintTimer);
        if (!el.classList.contains("st-full")) return;
        hintTimer = setTimeout(function () { hintsEl.classList.add("st-off"); }, 3000);
      }

      function render(state, channel) {
        var rec = PS.sel.profile(state);
        if (!rec) return;
        var cards = rec.cards || [];
        var ix = cards.length ? Math.max(0, Math.min(cards.length - 1, state.ui.cardIx || 0)) : -1;
        var card = ix >= 0 ? cards[ix] : null;
        setFull(state.ui.panels && state.ui.panels.fullStage);
        renderHead(state, rec, cards, ix, card);
        renderScene(state, rec, card);
        renderCaption(state, rec, card);
        renderReadout(state, rec, card);
        if (channel !== "time") renderAids(state, rec, cards, ix);
        renderElapsed();
      }

      function onClick(e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !el.contains(b)) return;
        var st = store.get(), ui = st.ui;
        if (b.id === "st-back") PS.brief.enter(store, (ui.cardIx || 0) - 1);
        else if (b.id === "st-fwd") PS.brief.enter(store, (ui.cardIx || 0) + 1);
        else if (b.id === "st-notes") store.ui("sheet", ui.sheet === "notes" ? null : "notes");
        else if (b.id === "st-full") store.ui("panels", Object.assign({}, ui.panels, { fullStage: !(ui.panels && ui.panels.fullStage) }));
      }

      var swipe = null;
      function onDown(e) { swipe = { x: e.clientX, y: e.clientY }; }
      function onUp(e) {
        if (!swipe) return;
        var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        var ix = store.get().ui.cardIx || 0;
        PS.brief.enter(store, dx < 0 ? ix + 1 : ix - 1);
      }
      function onKey() { if (el.classList.contains("st-full")) showHints(); }

      el.addEventListener("click", onClick);
      viewEl.addEventListener("pointerdown", onDown);
      viewEl.addEventListener("pointerup", onUp);
      viewEl.addEventListener("pointercancel", function () { swipe = null; });
      doc.addEventListener("keydown", onKey);
      var tick = setInterval(renderElapsed, 1000);

      render(store.get());
      // the first layout pass gives the view its size
      var raf = win && win.requestAnimationFrame ? win.requestAnimationFrame(function () { render(store.get()); }) : null;

      return {
        update: function (state, channel) { render(state, channel); },
        unmount: function () {
          clearInterval(tick);
          clearTimeout(hintTimer);
          if (raf != null && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
          el.removeEventListener("click", onClick);
          viewEl.removeEventListener("pointerdown", onDown);
          viewEl.removeEventListener("pointerup", onUp);
          doc.removeEventListener("keydown", onKey);
          el.classList.remove("st-full");
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
