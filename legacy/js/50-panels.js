(function (PS) {
  "use strict";

  // Panel registry and lifecycle (contract 16).
  var defs = {};
  var live = {};   // name -> { handle, offs, el }

  function noop() {}

  PS.panels = {
    register: function (name, def) {
      if (!name || !def || typeof def.mount !== "function") throw new Error("PS.panels.register needs a name and a mount function.");
      defs[name] = { channels: Array.isArray(def.channels) ? def.channels.slice() : [], mount: def.mount };
      return defs[name];
    },

    mount: function (name, el, store) {
      var def = defs[name];
      if (!def) return null;
      if (live[name]) PS.panels.unmount(name);
      var h = def.mount(el, store) || {};
      var handle = {
        update: typeof h.update === "function" ? h.update.bind(h) : noop,
        unmount: typeof h.unmount === "function" ? h.unmount.bind(h) : noop
      };
      var offs = [];
      if (PS.bus && typeof PS.bus.on === "function") {
        def.channels.forEach(function (ch) {
          offs.push(PS.bus.on(ch, function (payload) {
            handle.update(store && store.get ? store.get() : null, ch, payload);
          }));
        });
      }
      live[name] = { handle: handle, offs: offs, el: el };
      return handle;
    },

    unmount: function (name) {
      var p = live[name];
      if (!p) return;
      delete live[name];
      p.offs.forEach(function (off) { if (typeof off === "function") off(); });
      p.handle.unmount();
    },

    get: function (name) { return live[name] ? live[name].handle : null; }
  };
})(globalThis.PS);
