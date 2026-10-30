(function (PS) {
  "use strict";
  // Top bar (contract 16.1): brand, mode segment, name, id and version, undo, redo, Export, Import, theme, help.

  var CSS = [
    ".tb-bar{display:flex;align-items:center;gap:10px;min-height:var(--top);padding:6px 0;min-width:0;flex-wrap:nowrap}",
    ".tb-brand{white-space:nowrap}",
    ".tb-prof{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0}",
    ".tb-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    "#tb-name{flex:1 1 auto;min-width:80px;max-width:420px;background:transparent;border-color:transparent}",
    "#tb-name:hover,#tb-name:focus{background:var(--sunken);border-color:var(--rule-strong)}",
    ".tb-acts{display:flex;align-items:center;gap:6px;flex:0 0 auto}",
    "@media (max-width:1100px){.tb-key{display:none}}",
    "@media (max-width:600px){.tb-bar{flex-wrap:wrap;gap:6px}.tb-prof{order:3;flex:1 1 100%}.tb-acts{margin-left:auto}#tb-undo,#tb-redo,#tb-import,#tb-theme{display:none}}"
  ].join("");

  var MODES = [["build", "Build", "1"], ["brief", "Brief", "2"], ["collect", "Library", "3"]];
  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "Theme auto", light: "Theme light", dark: "Theme dark" };

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  PS.panels.register("topbar", {
    channels: ["lib", "profile", "mode", "panels"],
    mount: function (el, store) {
      var doc = el.ownerDocument;
      addStyle(doc, "topbar", CSS);

      el.innerHTML =
        '<div class="tb-bar">' +
        '<span class="tb-brand t-title">Profile Studio</span>' +
        '<div class="seg" id="tb-mode" role="group" aria-label="Mode">' +
        MODES.map(function (m) {
          return '<button type="button" class="btn" data-mode="' + m[0] + '" id="tb-mode-' + m[0] + '" aria-pressed="false">' +
            '<span class="tb-key t-key">' + m[2] + '</span> ' + m[1] + '</button>';
        }).join("") +
        '</div>' +
        '<div class="tb-prof">' +
        '<label class="tb-lbl" for="tb-name">Profile name</label>' +
        '<input id="tb-name" class="t-title" type="text" autocomplete="off" spellcheck="false">' +
        '<span id="tb-id" class="t-mono-id t-sec"></span>' +
        '</div>' +
        '<div class="tb-acts">' +
        '<button type="button" class="btn quiet" id="tb-undo">Undo</button>' +
        '<button type="button" class="btn quiet" id="tb-redo">Redo</button>' +
        '<button type="button" class="btn" id="tb-export">Export</button>' +
        '<button type="button" class="btn" id="tb-import">Import</button>' +
        '<button type="button" class="btn quiet" id="tb-theme"></button>' +
        '<button type="button" class="btn quiet" id="tb-help" aria-label="Help" aria-pressed="false">?</button>' +
        '</div></div>';

      var q = function (id) { return el.querySelector("#" + id); };
      var nameIn = q("tb-name"), idText = q("tb-id"), undoB = q("tb-undo"), redoB = q("tb-redo");
      var themeB = q("tb-theme"), helpB = q("tb-help"), modeSeg = q("tb-mode");

      function rec() { return PS.sel.profile(store.get()); }

      function render(state) {
        var r = PS.sel.profile(state);
        if (r) {
          if (doc.activeElement !== nameIn) nameIn.value = r.name || "";
          idText.textContent = r.id + " v" + r.v;
        } else {
          nameIn.value = "";
          idText.textContent = "";
        }
        var ui = state.ui;
        Array.prototype.forEach.call(modeSeg.querySelectorAll("[data-mode]"), function (b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === ui.mode));
        });
        undoB.disabled = !store.canUndo();
        redoB.disabled = !store.canRedo();
        var ul = store.undoLabel(), rl = store.redoLabel();
        undoB.title = ul ? "Undo: " + ul : "Nothing to undo";
        redoB.title = rl ? "Redo: " + rl : "Nothing to redo";
        var th = THEMES.indexOf(ui.theme) < 0 ? "auto" : ui.theme;
        themeB.textContent = THEME_LABEL[th];
        themeB.setAttribute("data-theme-state", th);
        var help = !!(ui.panels && ui.panels.help);
        helpB.setAttribute("aria-pressed", String(help));
      }

      function onClick(e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !el.contains(b)) return;
        var st = store.get(), ui = st.ui;
        if (b.hasAttribute("data-mode")) {
          var m = b.getAttribute("data-mode");
          if (m !== ui.mode) store.ui("mode", m);
          return;
        }
        switch (b.id) {
          case "tb-undo": {
            var ul = store.undoLabel();
            if (store.undo()) PS.bus.emit("toast", { text: "Undid: " + (ul || "edit") + "." });
            break;
          }
          case "tb-redo": {
            var rl = store.redoLabel();
            if (store.redo()) PS.bus.emit("toast", { text: "Redid: " + (rl || "edit") + "." });
            break;
          }
          case "tb-export":
            store.ui("dialog", { kind: "export", id: st.activeId });
            break;
          case "tb-import":
            store.ui("dialog", { kind: "import", id: null });
            break;
          case "tb-theme": {
            var cur = THEMES.indexOf(ui.theme);
            store.ui("theme", THEMES[(cur + 1) % THEMES.length]);
            break;
          }
          case "tb-help":
            store.ui("panels", Object.assign({}, ui.panels, { help: !(ui.panels && ui.panels.help) }));
            break;
        }
      }

      function onChange(e) {
        if (e.target !== nameIn) return;
        var r = rec();
        var v = nameIn.value.trim();
        if (!r || v === (r.name || "")) return;
        store.set("name", v);
      }

      function onInput(e) {
        if (e.target !== nameIn) return;
        var r = rec();
        if (r) idText.textContent = r.id + " v" + r.v;
      }

      function onKey(e) {
        if (e.target === nameIn && e.key === "Enter") { nameIn.blur(); }
      }

      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("input", onInput);
      el.addEventListener("keydown", onKey);
      render(store.get());

      return {
        update: function (state) { render(state); },
        unmount: function () {
          el.removeEventListener("click", onClick);
          el.removeEventListener("change", onChange);
          el.removeEventListener("input", onInput);
          el.removeEventListener("keydown", onKey);
          el.innerHTML = "";
        }
      };
    }
  });

})(globalThis.PS);
