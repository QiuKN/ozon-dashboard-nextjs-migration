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
  let createdTab;
  let createdAlarm;
  const removedTabs = [];
  const chrome = {
    sidePanel: { setPanelBehavior: async behavior => { panelBehavior = behavior; } },
    storage: {
      local: {
        get: async key => ({ [key]: store[key] }),
        set: async values => Object.assign(store, values)
      }
    },
    tabs: {
      create: async options => { createdTab = { id: 44, ...options }; return { id: 44 }; },
      remove: async tabId => { removedTabs.push(tabId); },
      onRemoved: { addListener: callback => { listeners.removed = callback; } }
    },
    alarms: {
      create: (name, options) => { createdAlarm = { name, ...options }; },
      clear: async () => true,
      onAlarm: { addListener: callback => { listeners.alarm = callback; } }
    },
    runtime: {
      onInstalled: { addListener: callback => { listeners.install = callback; } },
      onMessage: { addListener: callback => { listeners.message = callback; } }
    }
  };

  vm.runInNewContext(serviceWorker, { chrome, Promise, Set, String, URL, Date, crypto: require("node:crypto").webcrypto });
  listeners.install();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(panelBehavior)), { openPanelOnActionClick: true });

  const send = (message, sender = {}) => new Promise((resolve, reject) => {
    const keepAlive = listeners.message(message, sender, resolve);
    if (!keepAlive) reject(new Error("The service worker did not keep the message open."));
  });
  const responses = await Promise.all(Array.from({ length: 25 }, (_, index) => send({
    type: "AUTO_CAPTURE",
    record: { productId: String(index + 1), title: "Ozon list item " + index }
  })));
  assert.ok(responses.every(response => response.ok));
  assert.equal(store.ozonCaptureQueue.length, 25);

  const started = await send({ type: "START_BACKGROUND_CAPTURE", url: "https://www.ozon.ru/search/?text=headphones", maxItems: 12 });
  assert.equal(started.ok, true);
  assert.equal(started.job.status, "running");
  assert.equal(createdTab.active, false);
  assert.match(createdTab.url, /ozonCaptureJob=/);
  assert.equal(createdAlarm.name, "ozon-background-capture-timeout");

  const stopped = await send({ type: "STOP_BACKGROUND_CAPTURE" });
  assert.equal(stopped.job.status, "stopped");
  assert.deepEqual(removedTabs, [44]);
});

test("switches to the next category task after the current quota is reached", async () => {
  const listeners = {};
  const store = {};
  let nextTabId = 50;
  const chrome = {
    storage: { local: {
      get: async key => ({ [key]: store[key] }),
      set: async values => Object.assign(store, values)
    } },
    tabs: {
      create: async options => ({ id: nextTabId++, ...options }),
      remove: async () => undefined,
      onRemoved: { addListener: callback => { listeners.removed = callback; } }
    },
    alarms: { create() {}, clear: async () => true, onAlarm: { addListener() {} } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener: callback => { listeners.message = callback; } } }
  };
  vm.runInNewContext(serviceWorker, { chrome, Promise, Set, String, URL, Date, crypto: require("node:crypto").webcrypto });
  const send = (message, sender = {}) => new Promise(resolve => listeners.message(message, sender, resolve));
  const started = await send({
    type: "START_BACKGROUND_CAPTURE",
    tasks: [
      { label: "电子产品", url: "https://www.ozon.ru/search/?text=electronics", maxItems: 2 },
      { label: "服装", url: "https://www.ozon.ru/search/?text=clothing", maxItems: 3 }
    ]
  });
  const next = await send({ type: "FINISH_BACKGROUND_CAPTURE", jobId: started.job.id, status: "completed", reason: "limit" }, { tab: { id: started.job.tabId } });
  assert.equal(next.ok, true);
  assert.equal(store.ozonBackgroundCaptureJob.category, "服装");
  assert.equal(store.ozonBackgroundCaptureJob.maxItems, 3);
  assert.equal(store.ozonBackgroundCaptureJob.status, "running");
});
