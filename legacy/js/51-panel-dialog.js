(function (PS) {
  "use strict";
  // Dialog panel (brief 4.7): one modal opened by ui.dialog {kind, id}, with a focus trap; the export text with Copy JSON
  // and Copy whole library (select fallback); import from a file or a paste box with the error table; and the toast.

  var CSS = [
    ".dl-back{position:fixed;inset:0;background:var(--t1);opacity:.28;z-index:60}",
    ".dl-box{position:fixed;z-index:61;left:50%;top:8vh;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));max-height:84vh;display:flex;flex-direction:column;background:var(--raised);color:var(--t1);border:1px solid var(--rule);border-radius:6px;box-shadow:var(--elev)}",
    ".dl-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--rule)}",
    ".dl-head h2{margin:0;flex:1 1 auto}",
    ".dl-body{padding:12px 16px;overflow:auto;display:flex;flex-direction:column;gap:8px}",
    ".dl-body textarea{width:100%;white-space:pre-wrap}",
    ".dl-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--rule)}",
    ".dl-errs{width:100%;border-collapse:collapse}",
    ".dl-errs th,.dl-errs td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--rule);vertical-align:top}",
    ".dl-errs td{color:var(--warn)}",
    ".dl-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:70;max-width:calc(100vw - 32px);padding:8px 14px;background:var(--raised);border:1px solid var(--rule);border-radius:4px;box-shadow:var(--elev);pointer-events:none;transition:opacity .2s}",
    ".dl-toast[hidden]{display:block;opacity:0;visibility:hidden}",
    "@media (max-width:600px){.dl-box{top:16px;max-height:calc(100vh - 32px)}.dl-toast{bottom:64px}}"
  ].join("");

  function addStyle(doc, name, css) {
    if (doc.head.querySelector('style[data-panel="' + name + '"]')) return;
    var s = doc.createElement("style");
    s.setAttribute("data-panel", name);
    s.textContent = css;
    doc.head.appendChild(s);
  }

  var esc = function (s) { return PS.util.esc(s); };
  var NOT_RECORD = "This is not a profile record. Check the JSON.";
  var FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  PS.panels.register("dialog", {
    channels: ["lib", "panels", "toast"],
    mount: function (el, store) {
      var doc = el.ownerDocument, win = doc.defaultView;
      addStyle(doc, "dialog", CSS);
      var isMac = !!(win && win.navigator && /Mac|iPhone|iPad/.test(win.navigator.platform || win.navigator.userAgent || ""));

      el.innerHTML = '<div id="dl-modal"></div><div class="dl-toast t-body" id="dl-toast" role="status" aria-live="polite" hidden></div>';
      var modal = el.querySelector("#dl-modal"), toastEl = el.querySelector("#dl-toast");
      var openKey = null, prevFocus = null, toastTimer = null;

      function find(id) {
        var lib = store.get().lib;
        for (var i = 0; i < lib.length; i++) if (lib[i].id === id) return lib[i];
        return null;
      }

      function exportOne(id) {
        var rec = find(id);
        return rec ? PS.persist.exportText(rec, PS.derive.all(rec)) : "";
      }
      function exportLib() { return PS.persist.exportLibrary(store.get().lib); }

      // titleHtml is markup; callers escape their text
      function box(titleHtml, body, foot) {
        return '<div class="dl-back" data-close="1"></div>' +
          '<div class="dl-box" role="dialog" aria-modal="true" aria-labelledby="dl-title">' +
          '<div class="dl-head"><h2 id="dl-title" class="t-title">' + titleHtml + '</h2></div>' +
          '<div class="dl-body">' + body + '</div>' +
          '<div class="dl-foot">' + foot + '</div></div>';
      }

      function renderExport(dlg) {
        var st = store.get(), id = dlg.id;
        // the record version bumps once per export when the record is dirty (brief 5.7)
        if (id && id === st.activeId && st.dirty && st.dirty[id]) store.dispatch({ type: "lib.bump" });
        var rec = id ? find(id) : null;
        var text = id ? exportOne(id) : exportLib();
        // the id in mono, the version in secondary data, as in the top bar
        var title = id ? "Export " + '<span class="t-mono-id">' + esc(id) + "</span>" + (rec ? ' <span class="t-data t-sec">v' + esc(rec.v) + "</span>" : "") : "Export library";
        modal.innerHTML = box(title,
          '<label class="dl-lbl t-sub" for="dl-export-text">' + (id ? "Profile JSON, version 4" : "Library JSON, version 4") + '</label>' +
          '<textarea id="dl-export-text" class="t-data" rows="16" readonly spellcheck="false">' + esc(text) + '</textarea>' +
          '<p class="hint" id="dl-copy-hint"></p>',
          '<button type="button" class="btn primary" id="dl-copy">Copy JSON</button>' +
          (id ? '<button type="button" class="btn" id="dl-copy-lib">Copy whole library</button>' : "") +
          '<button type="button" class="btn" id="dl-close">Close</button>');
      }

      function renderImport() {
        modal.innerHTML = box(esc("Import profiles"),
          '<label class="dl-lbl t-sub" for="dl-file">File</label>' +
          '<input type="file" id="dl-file" accept=".json,application/json,text/plain">' +
          '<label class="dl-lbl t-sub" for="dl-paste">Paste JSON</label>' +
          '<textarea id="dl-paste" class="t-data" rows="10" spellcheck="false" placeholder="Paste a profile or a library export"></textarea>' +
          '<p class="hint">A profile with the same id replaces the one in the library. Other profiles are added.</p>' +
          '<div id="dl-errors"></div>',
          '<button type="button" class="btn primary" id="dl-import">Import</button>' +
          '<button type="button" class="btn" id="dl-close">Close</button>');
      }

      function showErrors(list) {
        var host = modal.querySelector("#dl-errors");
        if (!host) return;
        host.innerHTML = list.length
          ? '<table class="dl-errs"><thead><tr><th class="t-label">Item</th><th class="t-label">Problem</th></tr></thead><tbody>' +
            list.map(function (e, i) { return '<tr><th class="t-data">' + (i + 1) + '</th><td class="t-sub">' + esc(e) + "</td></tr>"; }).join("") + "</tbody></table>"
          : "";
      }

      function sync(state) {
        var dlg = state.ui.dialog;
        var key = dlg ? dlg.kind + "|" + (dlg.id == null ? "" : dlg.id) : null;
        if (key === openKey) return;
        var wasOpen = openKey != null;
        openKey = key;
        if (!dlg) {
          modal.innerHTML = "";
          if (wasOpen && prevFocus && doc.contains(prevFocus) && prevFocus.focus) prevFocus.focus();
          prevFocus = null;
          return;
        }
        if (!wasOpen) prevFocus = doc.activeElement;
        if (dlg.kind === "export") renderExport(dlg);
        else if (dlg.kind === "import") renderImport();
        else { modal.innerHTML = ""; return; }
        var first = modal.querySelector(dlg.kind === "export" ? "#dl-copy" : "#dl-paste");
        if (first) first.focus();
      }

      function close() { store.ui("dialog", null); }

      function copyText(text, ta) {
        var hint = modal.querySelector("#dl-copy-hint");
        function fallback() {
          if (ta) { ta.value = text; ta.focus(); ta.select(); }
          if (hint) hint.textContent = "The text is selected. Press " + (isMac ? "Cmd" : "Ctrl") + "+C to copy it.";
        }
        var clip = win && win.navigator && win.navigator.clipboard;
        if (clip && typeof clip.writeText === "function") {
          clip.writeText(text).then(function () {
            if (hint) hint.textContent = "";
            PS.bus.emit("toast", { text: "Copied." });
          }, fallback);
        } else {
          fallback();
        }
      }

      function doImport() {
        var ta = modal.querySelector("#dl-paste");
        var text = ta ? ta.value.trim() : "";
        if (!text) { showErrors(["Paste a profile, or pick a file."]); return; }
        var res;
        try { res = PS.persist.parse(text); } catch (e) { res = { records: [], errors: [NOT_RECORD] }; }
        var records = (res && res.records) || [], errors = (res && res.errors) || [];
        if (records.length) {
          var have = {};
          store.get().lib.forEach(function (r) { have[r.id] = true; });
          var seen = {}, replaced = 0, added = 0;
          records.forEach(function (r) {
            if (seen[r.id]) return;
            seen[r.id] = true;
            if (have[r.id]) replaced++; else added++;
          });
          store.dispatch({ type: "lib.replace", records: records, replaced: replaced, added: added });
          PS.bus.emit("toast", { text: "Imported " + plural(records.length, "profile") + (replaced ? ", " + replaced + " replaced." : ".") });
        }
        if (errors.length) showErrors(errors);
        else close();
      }

      function onClick(e) {
        var t = e.target;
        if (t.getAttribute && t.getAttribute("data-close")) { close(); return; }
        var b = t.closest ? t.closest("button") : null;
        if (!b || !modal.contains(b)) return;
        var ta = modal.querySelector("#dl-export-text");
        var dlg = store.get().ui.dialog;
        switch (b.id) {
          case "dl-close": close(); break;
          case "dl-copy": copyText(dlg && dlg.id ? exportOne(dlg.id) : exportLib(), ta); break;
          case "dl-copy-lib": copyText(exportLib(), ta); break;
          case "dl-import": doImport(); break;
        }
      }

      function onFile(e) {
        if (e.target.id !== "dl-file") return;
        var f = e.target.files && e.target.files[0];
        if (!f || !win.FileReader) return;
        var rd = new win.FileReader();
        rd.onload = function () {
          var ta = modal.querySelector("#dl-paste");
          if (ta) ta.value = String(rd.result || "");
          showErrors([]);
        };
        rd.onerror = function () { showErrors(["The file cannot be read."]); };
        rd.readAsText(f);
      }

      function onKey(e) {
        if (openKey == null) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
        if (e.key !== "Tab") return;
        var bx = modal.querySelector(".dl-box");
        if (!bx) return;
        var items = Array.prototype.filter.call(bx.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === doc.activeElement; });
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (doc.activeElement === first || !bx.contains(doc.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (doc.activeElement === last || !bx.contains(doc.activeElement))) { e.preventDefault(); first.focus(); }
      }

      // the focus trap also catches focus that leaves the modal by pointer
      function onFocusIn(e) {
        if (openKey == null) return;
        var bx = modal.querySelector(".dl-box");
        if (bx && !bx.contains(e.target) && !toastEl.contains(e.target)) {
          var f = bx.querySelector(FOCUSABLE);
          if (f) f.focus();
        }
      }

      function toast(text) {
        if (!text) return;
        toastEl.textContent = text;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
      }

      modal.addEventListener("click", onClick);
      modal.addEventListener("change", onFile);
      doc.addEventListener("keydown", onKey, true);
      doc.addEventListener("focusin", onFocusIn);
      sync(store.get());

      return {
        update: function (state, channel, payload) {
          if (channel === "toast") { toast(payload && payload.text); return; }
          sync(state);
        },
        unmount: function () {
          clearTimeout(toastTimer);
          modal.removeEventListener("click", onClick);
          modal.removeEventListener("change", onFile);
          doc.removeEventListener("keydown", onKey, true);
          doc.removeEventListener("focusin", onFocusIn);
          el.innerHTML = "";
        }
      };
    }
  });
})(globalThis.PS);
