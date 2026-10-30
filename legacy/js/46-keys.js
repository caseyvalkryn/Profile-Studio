(function (PS) {
  "use strict";

  // Key table and dispatcher (contract 18). Uses no PS member above 30.
  var map = [
    { key: "a", when: "build", action: "palette.open", label: "Quick-add palette" },
    { key: "s", when: "build", action: "palette.open", args: { group: "systems", pick: "radar" }, label: "Add a sensor" },
    { key: "v", when: "build", action: "palette.open", args: { group: "volumes", pick: "asset" }, label: "Add a volume" },
    { key: "e", when: "build", action: "palette.open", args: { group: "events" }, label: "Add an event" },
    { key: "f", when: "build", action: "formation.open", label: "Formation" },
    { key: "1|2|3", when: "build|collect", action: "mode.set", label: "Build, Brief, Library" },
    { key: "p|l|x", when: "build|brief", action: "cam.set", label: "Plan, elevation, axonometric" },
    { key: " ", when: "build", action: "time.toggle", label: "Play or pause" },
    { key: ",|.", when: "build|brief", action: "time.step", args: { dt: 1 }, label: "Step 1 s" },
    { key: "Shift+,|Shift+.", when: "build|brief", action: "time.step", args: { dt: 10 }, label: "Step 10 s" },
    { key: "Home|End", when: "build", action: "time.ends", label: "Time to start or end" },
    { key: "t", when: "build|brief", action: "time.onoff", label: "Time cursor on or off" },
    { key: "[|]", when: "build", action: "time.event", label: "Previous or next event or derived time" },
    { key: "u", when: "*", action: "units.toggle", label: "nm ft kt or km m m/s" },
    { key: "g", when: "build", action: "snap.toggle", label: "Grid snap" },
    { key: "m", when: "build", action: "ruler.toggle", label: "Ruler" },
    { key: "r", when: "build", action: "strip.cycle", label: "Timeline, chart, ladder" },
    { key: "Shift+Digit1..8", when: "build|brief", action: "layer.toggle", label: "Layer by chip number" },
    { key: "0", when: "build", action: "view.fit", label: "Fit the board" },
    { key: "=|+|-", when: "build", action: "view.zoom", label: "Zoom" },
    { key: "ArrowUp|ArrowDown|ArrowLeft|ArrowRight", when: "build", action: "sel.nudge", label: "Nudge the selected object" },
    { key: "Shift+Arrow*", when: "build", action: "sel.nudge", args: { steps: 5 } },
    { key: "Tab|Shift+Tab", when: "build", action: "sel.next", label: "Next object of the same kind" },
    { key: "Delete|Backspace", when: "build", action: "sel.remove", label: "Delete" },
    { key: "d", when: "build", action: "sel.duplicate", label: "Duplicate" },
    { key: "c", when: "build", action: "card.save", label: "Save the view as a card" },
    { key: "Mod+z", when: "*", action: "undo" }, { key: "Mod+Shift+z|Ctrl+y", when: "*", action: "redo" },
    { key: "Mod+c", when: "build", action: "clip.copy", label: "Copy the selected object" }, { key: "Mod+v", when: "build", action: "clip.paste", label: "Paste" },
    { key: "i", when: "build", action: "panel.inspector" }, { key: "\\", when: "build", action: "panel.sides" },
    { key: "?", when: "*", action: "help.toggle" },
    { key: "Escape", when: "*", action: "escape" },
    { key: "ArrowRight|PageDown", when: "brief", action: "card.step", args: { d: 1 }, label: "Next beat of the clip, else next card" },
    { key: "ArrowLeft|PageUp", when: "brief", action: "card.step", args: { d: -1 } },
    { key: " ", when: "brief", action: "card.space", label: "Next card, or play when time is on" },
    { key: "Home|End", when: "brief", action: "card.ends" },
    { key: "1..9", when: "brief", action: "card.jump" },
    { key: "f", when: "brief", action: "stage.full" }, { key: "n", when: "brief", action: "panel.notes" }, { key: "b", when: "brief", action: "stage.blank" },
    { key: "k", when: "brief", action: "stage.readout", label: "Live readout strip on or off" },
    { key: "ArrowUp|ArrowDown", when: "brief", action: "focus.cycle" },
    { key: "/", when: "collect", action: "search.focus" }, { key: "n", when: "collect", action: "new.menu" }
  ];

  // cheat sheet labels for the entries that carry none (brief 5.10)
  var FALLBACK = {
    "sel.nudge": "Nudge five snap steps",
    "undo": "Undo",
    "redo": "Redo",
    "panel.inspector": "Inspector open or closed",
    "panel.sides": "Both side panels open or closed",
    "help.toggle": "Cheat sheet",
    "escape": "Cancel, close or go back",
    "card.step": "Back one beat of the clip, else previous card",
    "card.ends": "First card or last card",
    "card.jump": "Jump to card n",
    "stage.full": "Full stage on or off",
    "panel.notes": "Notes panel on or off",
    "stage.blank": "Blank the stage",
    "focus.cycle": "Cycle the highlight through the card focus",
    "search.focus": "Focus the search field",
    "new.menu": "New profile menu"
  };

  // keys whose character needs Shift on common layouts; Shift does not block them
  var SHIFT_FREE = { "?": true, "+": true, "escape": true };

  function isMac() {
    var nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav) return false;
    var p = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || "";
    return /mac|iphone|ipad/i.test(p);
  }

  function modDown(ev) { return isMac() ? !!ev.metaKey : !!ev.ctrlKey; }

  // the alternatives of an entry key: "a|b" splits on "|", but a lone "|" or a key ending in "+|" stays
  function alts(key) {
    if (key === "|") return ["|"];
    return String(key).split("|").filter(function (s) { return s !== ""; });
  }

  function matchAlt(ev, alt) {
    var key = ev.key == null ? "" : String(ev.key);
    var low = key.toLowerCase();
    var code = ev.code == null ? "" : String(ev.code);
    var shift = !!ev.shiftKey, alt_ = !!ev.altKey;
    var mod = modDown(ev), ctrl = !!ev.ctrlKey, meta = !!ev.metaKey;

    var m = /^Shift\+Digit(\d)\.\.(\d)$/.exec(alt);
    if (m) {
      var d = /^Digit(\d)$/.exec(code);
      return shift && !ctrl && !meta && !alt_ && !!d && Number(d[1]) >= Number(m[1]) && Number(d[1]) <= Number(m[2]);
    }
    m = /^(\d)\.\.(\d)$/.exec(alt);
    if (m) {
      return !shift && !ctrl && !meta && !alt_ && /^\d$/.test(key) && Number(key) >= Number(m[1]) && Number(key) <= Number(m[2]);
    }
    if (alt === "Shift+Arrow*") return shift && !ctrl && !meta && !alt_ && /^Arrow/.test(key);

    var parts = alt.length > 1 && alt.indexOf("+") > 0 && alt !== "+" ? alt.split("+") : [alt];
    var base = parts[parts.length - 1];
    if (base === "" && parts.length > 1) base = "+";
    var wantMod = false, wantShift = false, wantCtrl = false;
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "Mod") wantMod = true;
      else if (parts[i] === "Shift") wantShift = true;
      else if (parts[i] === "Ctrl") wantCtrl = true;
    }
    if (wantMod && !mod) return false;
    if (wantCtrl && !ctrl) return false;
    if (!wantMod && !wantCtrl && (ctrl || meta)) return false;
    if (alt_) return false;

    var b = base.toLowerCase();
    if (wantShift) {
      if (!shift) return false;
      if (b === ",") return key === "," || key === "<" || code === "Comma";
      if (b === ".") return key === "." || key === ">" || code === "Period";
      return low === b;
    }
    if (shift && !SHIFT_FREE[b]) return false;
    return low === b;
  }

  function matchWhen(when, mode) {
    if (when === "*") return true;
    return String(when).split("|").indexOf(mode) >= 0;
  }

  function match(ev, entry) {
    if (!ev || !entry) return false;
    var list = alts(entry.key);
    for (var i = 0; i < list.length; i++) if (matchAlt(ev, list[i])) return true;
    return false;
  }

  function matchedAlt(ev, entry) {
    var list = alts(entry.key);
    for (var i = 0; i < list.length; i++) if (matchAlt(ev, list[i])) return list[i];
    return null;
  }

  function inField(doc) {
    var a = doc && doc.activeElement;
    if (!a) return false;
    var tag = String(a.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || !!a.isContentEditable;
  }

  // Tab runs sel.next only when focus is on the page or the board stage; on any other control the browser moves focus
  function tabFree(doc) {
    var a = doc && doc.activeElement;
    return !a || a === doc.body || a === doc.documentElement || a.id === "bd-stage";
  }

  function pretty(alt) {
    if (alt === " ") return "Space";
    if (alt === "Shift+Arrow*") return "Shift+Arrows";
    var m = /^Shift\+Digit(\d)\.\.(\d)$/.exec(alt);
    if (m) return "Shift+" + m[1] + " to " + m[2];
    m = /^(\d)\.\.(\d)$/.exec(alt);
    if (m) return m[1] + " to " + m[2];
    var mod = isMac() ? "Cmd" : "Ctrl";
    return alt.replace(/^Mod\+/, mod + "+").replace(/\+([a-z])$/, function (s, c) { return "+" + c.toUpperCase(); })
      .replace(/^([a-z])$/, function (s, c) { return c.toUpperCase(); })
      .replace(/^Arrow(Up|Down|Left|Right)$/, "$1");
  }

  var attached = null;

  PS.keys = {
    map: map,

    match: match,

    // actions: { [action]: fn(store, args, event) }; args is the entry args plus key, the matched alternative
    attach: function (store, actions) {
      var doc = typeof document !== "undefined" ? document : null;
      if (!doc) return function () {};
      if (attached) attached();
      var fn = function (ev) {
        if (ev.defaultPrevented || ev.isComposing) return;
        if (inField(doc)) {
          if (ev.key === "Escape" && doc.activeElement && doc.activeElement.blur) {
            doc.activeElement.blur();
            ev.preventDefault();
          }
          return;
        }
        var st = store && store.get ? store.get() : null;
        var mode = st && st.ui ? st.ui.mode : "build";
        for (var i = 0; i < map.length; i++) {
          var e = map[i];
          if (!matchWhen(e.when, mode) || !match(ev, e)) continue;
          if (e.action === "sel.next" && !tabFree(doc)) return;
          var h = actions && actions[e.action];
          if (typeof h !== "function") return;
          var args = Object.assign({ key: matchedAlt(ev, e) }, e.args || {});
          ev.preventDefault();
          h(store, args, ev);
          return;
        }
      };
      doc.addEventListener("keydown", fn);
      attached = function () { doc.removeEventListener("keydown", fn); attached = null; };
      return attached;
    },

    sheet: function (mode) {
      var rows = [];
      map.forEach(function (e) {
        if (!matchWhen(e.when, mode)) return;
        var label = e.label || FALLBACK[e.action] || e.action;
        if (e.key === "Shift+Arrow*") label = FALLBACK["sel.nudge"];
        rows.push({ keys: alts(e.key).map(pretty).join(", "), label: label });
      });
      return rows;
    }
  };
})(globalThis.PS);
