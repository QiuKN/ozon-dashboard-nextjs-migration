const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const popupScript = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");

// Model only the native select behavior the popup uses so category choices can be verified without a browser.
function makeSelect() {
  const select = {
    options: [],
    replaceChildren() { this.options = []; },
    append(option) { this.options.push(option); }
  };
  Object.defineProperty(select, "selectedOptions", { get: () => select.options.filter(option => option.selected) });
  Object.defineProperty(select, "value", {
    get: () => select.selectedOptions[0]?.value || "",
    set: value => { select.options.forEach(option => { option.selected = option.value === value; }); }
  });
  return select;
}

test("shows discovered Ozon categories as choices and saves selected values", async () => {
  const settingsKey = "ozonCaptureSettings";
  const optionsKey = "ozonCaptureCategoryOptions";
  let saved;
  let submit;
  let openedUrl;
  const listeners = {};
  const elements = {
    "#settings-form": { addEventListener: (_type, callback) => { submit = callback; } },
    "#status": { textContent: "" },
    "#ozonSearch": { value: "wireless earbuds" },
    "#openOzon": { addEventListener: (_type, callback) => { listeners.open = callback; } },
    "#openOzonHome": { addEventListener: (_type, callback) => { listeners.home = callback; } },
    "#enabled": { checked: false },
    "#categories": makeSelect(),
    "#excludedCategories": makeSelect(),
    "#excludedBrands": { value: "" },
    "#minPrice": { value: "" },
    "#maxPrice": { value: "" },
    "#minRating": { value: "" }
  };
  const document = {
    querySelector: selector => elements[selector],
    querySelectorAll: () => [],
    createElement: () => ({})
  };
  const chrome = {
    storage: {
      local: {
        get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, key === optionsKey ? [
          { label: "Electronics", value: "electronics" },
          { label: "Home", value: "home" }
        ] : undefined]).filter(([, value]) => value !== undefined)),
        set: async values => { saved = values[settingsKey]; }
      },
      onChanged: { addListener() {} }
    },
    tabs: {
      query: async () => [{ id: 7 }],
      update: async (_id, { url }) => { openedUrl = url; },
      create: async ({ url }) => { openedUrl = url; }
    }
  };

  vm.runInNewContext(popupScript, { document, chrome, Promise, URL });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(elements["#categories"].options.map(option => option.textContent), ["Electronics", "Home"]);

  elements["#categories"].options[1].selected = true;
  elements["#excludedCategories"].options[0].selected = true;
  submit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(JSON.parse(JSON.stringify(saved.categories)), ["home"]);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.excludedCategories)), ["electronics"]);

  await listeners.open();
  assert.equal(saved.enabled, true);
  assert.equal(new URL(openedUrl).searchParams.get("text"), "wireless earbuds");

  await listeners.home();
  assert.equal(saved.enabled, false);
  assert.equal(elements["#enabled"].checked, false);
  assert.equal(openedUrl, "https://www.ozon.ru/");
});
