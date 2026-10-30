const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const contentScript = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

// Run the real extension script against a small page fixture without adding a DOM dependency.
function runListing(settings, backgroundJob = null) {
  const sent = [];
  const stored = { ozonCaptureSettings: settings };
  const timers = [];
  const card = {
    innerText: "Sample electric kettle\n2 499 ₽\n4.7 120 отзывов",
    textContent: "Sample electric kettle 2 499 ₽ 4.7 120 отзывов",
    parentElement: null,
    querySelector: selector => selector === "img"
      ? { alt: "Sample electric kettle", currentSrc: "https://cdn.ozon.ru/kettle.jpg", src: "https://cdn.ozon.ru/kettle.jpg" }
      : selector.includes("rating") || selector.includes("рейтинг") ? { getAttribute: () => "4.7 120 отзывов", textContent: "" } : null,
    querySelectorAll: () => [{ currentSrc: "https://cdn.ozon.ru/kettle.jpg", src: "https://cdn.ozon.ru/kettle.jpg" }]
  };
  const productLink = {
    href: "https://www.ozon.ru/product/sample-kettle-123456/",
    title: "",
    parentElement: card,
    innerText: "",
    textContent: "",
    getAttribute: () => ""
  };
  const categoryLink = { textContent: "Electronics", getAttribute: () => "", title: "" };
  const button = { style: {}, addEventListener() {} };
  const document = {
    documentElement: {},
    body: { appendChild() {} },
    createElement: () => button,
    querySelectorAll(selector) {
      if (selector.includes("breadcrumb")) return [categoryLink];
      if (selector.includes("/category/")) return [categoryLink];
      if (selector.includes("/product/")) return [productLink];
      return [];
    }
  };
  const chrome = {
    storage: {
      local: {
        get: async keys => {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter(name => name in stored).map(name => [name, stored[name]]));
        },
        set: async values => Object.assign(stored, values)
      },
      onChanged: { addListener() {} }
    },
    runtime: {
      sendMessage: async message => {
        sent.push(message);
        if (message.type === "GET_BACKGROUND_CAPTURE_JOB") return { job: backgroundJob };
        if (message.type === "AUTO_CAPTURE" && backgroundJob) {
          backgroundJob.capturedCount += 1;
          return { ok: true, capturedCount: backgroundJob.capturedCount, maxItems: backgroundJob.maxItems };
        }
        return { ok: true };
      }
    }
  };
  class MutationObserver {
    observe() {}
  }
  const window = {
    setTimeout: callback => timers.push(callback),
    clearTimeout() {},
    setInterval() {}
  };
  const context = {
    chrome, document, window, MutationObserver, URL, URLSearchParams, Date, Set, Map, Promise,
    location: {
      href: "https://www.ozon.ru/category/electronics-123/" + (backgroundJob ? "#ozonCaptureJob=" + backgroundJob.id : ""),
      pathname: "/category/electronics-123/",
      hash: backgroundJob ? "#ozonCaptureJob=" + backgroundJob.id : ""
    },
    setTimeout: callback => timers.push(callback)
  };
  vm.runInNewContext(contentScript, context);
  return { sent, stored, timers };
}

test("captures visible list items once and discovers the Ozon category", async () => {
  const run = runListing({
    enabled: true,
    categories: ["electronics"],
    excludedCategories: [],
    excludedBrands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    fields: { title: true, images: true, price: true, seller: true, rating: true, description: true, category: true }
  });

  for (const timer of run.timers) timer();
  await new Promise(resolve => setImmediate(resolve));
  for (const timer of run.timers) timer();
  await new Promise(resolve => setImmediate(resolve));

  const captures = run.sent.filter(message => message.type === "AUTO_CAPTURE");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].record.productId, "123456");
  assert.equal(captures[0].record.title, "Sample electric kettle");
  assert.equal(captures[0].record.priceValue, 2499);
  assert.equal(captures[0].record.ratingValue, 4.7);
  assert.equal(captures[0].record.reviewCount, 120);
  assert.equal(captures[0].record.category, "Electronics");
  assert.deepEqual(JSON.parse(JSON.stringify(run.stored.ozonCaptureCategoryOptions)), [{ label: "Electronics", value: "electronics" }]);
});

test("skips list items that do not match the selected category", async () => {
  const run = runListing({
    enabled: true,
    categories: ["clothing"],
    excludedCategories: [],
    excludedBrands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    fields: { title: true, images: true, price: true, seller: true, rating: true, description: true, category: true }
  });

  for (const timer of run.timers) timer();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.sent.filter(message => message.type === "AUTO_CAPTURE").length, 0);
});

test("captures a background job and finishes after reaching its requested count", async () => {
  const run = runListing({
    enabled: true,
    categories: [],
    excludedCategories: [],
    excludedBrands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    fields: { title: true, images: true, price: true, seller: true, rating: true, description: true, category: true }
  }, { id: "job-1", status: "running", maxItems: 1, capturedCount: 0 });

  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  const capture = run.sent.find(message => message.type === "AUTO_CAPTURE");
  assert.equal(capture.jobId, "job-1");
  assert.equal(run.sent.some(message => message.type === "FINISH_BACKGROUND_CAPTURE" && message.reason === "limit"), true);
});
