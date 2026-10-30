const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const serviceWorker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

// Exercise the extension lifecycle, side panel action, and local capture queue with browser API doubles.
test("opens the side panel from the extension action and stores list captures", async () => {
  const listeners = {};
  const store = {};
  let panelBehavior;
  const chrome = {
    sidePanel: { setPanelBehavior: async behavior => { panelBehavior = behavior; } },
    storage: {
      local: {
        get: async key => ({ [key]: store[key] }),
        set: async values => Object.assign(store, values)
      }
    },
    runtime: {
      onInstalled: { addListener: callback => { listeners.install = callback; } },
      onMessage: { addListener: callback => { listeners.message = callback; } }
    }
  };

  vm.runInNewContext(serviceWorker, { chrome, Promise, Set, String });
  listeners.install();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(panelBehavior)), { openPanelOnActionClick: true });

  let response;
  const keepAlive = listeners.message({
    type: "AUTO_CAPTURE",
    record: { productId: "123456", title: "Ozon list item" }
  }, {}, value => { response = value; });
  assert.equal(keepAlive, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.ok, true);
  assert.equal(store.ozonCaptureQueue[0].title, "Ozon list item");
});
