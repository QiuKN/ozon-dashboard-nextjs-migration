const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const bridgeScript = fs.readFileSync(path.join(__dirname, "..", "app-bridge.js"), "utf8");

// Verify the website-to-extension controls use extension messages and return job status to the page.
test("forwards website start and stop actions to the extension", async () => {
  const listeners = {};
  const posted = [];
  const sent = [];
  const runtimeListeners = [];
  const window = {
    addEventListener: (_type, callback) => { listeners.message = callback; },
    postMessage: message => { posted.push(message); },
    setInterval() {}
  };
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        sent.push(message);
        if (message.type === "START_BACKGROUND_CAPTURE") callback({ ok: true, job: { id: "job-1" } });
        else if (message.type === "STOP_BACKGROUND_CAPTURE") callback({ ok: true });
        else if (message.type === "GET_BACKGROUND_CAPTURE_JOB") callback({ job: { id: "job-1", status: "running" } });
        else callback({ records: [] });
      },
      onMessage: { addListener: callback => runtimeListeners.push(callback) }
    }
  };

  vm.runInNewContext(bridgeScript, { window, chrome, Promise, setInterval() {} });
  listeners.message({
    source: window,
    data: { source: "ozon-product-capture-page", type: "START_CAPTURE", url: "https://www.ozon.ru/search/?text=tea", maxItems: 10 }
  });
  listeners.message({ source: window, data: { source: "ozon-product-capture-page", type: "STOP_CAPTURE" } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(sent.some(message => message.type === "START_BACKGROUND_CAPTURE" && message.maxItems === 10), true);
  assert.equal(sent.some(message => message.type === "STOP_BACKGROUND_CAPTURE"), true);
  assert.equal(posted.some(message => message.type === "START_CAPTURE_RESULT" && message.response.ok), true);
  assert.equal(posted.some(message => message.type === "STOP_CAPTURE_RESULT" && message.response.ok), true);
});
