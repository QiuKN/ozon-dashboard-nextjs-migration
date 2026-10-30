(() => {
  "use strict";

  // Keep settings small and human-readable because they are stored only in the browser profile.
  const SETTINGS_KEY = "ozonCaptureSettings";
  const CATEGORY_OPTIONS_KEY = "ozonCaptureCategoryOptions";
  const defaults = {
    enabled: true,
    categories: [],
    excludedCategories: [],
    excludedBrands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    fields: { title: true, images: true, price: true, seller: true, rating: true, description: true, category: true }
  };

  const form = document.querySelector("#settings-form");
  const status = document.querySelector("#status");
  const selectedValues = id => [...document.querySelector("#" + id).selectedOptions].map(option => option.value);
  const listValue = id => document.querySelector("#" + id).value.split(/[,，\n]/).map(value => value.trim()).filter(Boolean);
  const numberValue = id => {
    const value = document.querySelector("#" + id).value.trim();
    return value === "" ? null : Number(value);
  };

  function showStatus(message) {
    status.textContent = message;
  }

  function setOptions(id, options, selected = []) {
    const select = document.querySelector("#" + id);
    select.replaceChildren();
    const available = new Set(options.map(option => option.value));
    for (const value of selected) {
      if (available.has(value)) continue;
      const legacyOption = document.createElement("option");
      legacyOption.value = value;
      legacyOption.textContent = "旧设置：" + value;
      legacyOption.selected = true;
      select.append(legacyOption);
    }
    if (!options.length) {
      if (!selected.length) {
        const empty = document.createElement("option");
        empty.textContent = "暂无分类，请先打开 Ozon 页面";
        empty.disabled = true;
        select.append(empty);
      }
      return;
    }
    for (const category of options) {
      const option = document.createElement("option");
      option.value = category.value;
      option.textContent = category.label;
      option.selected = selected.includes(category.value);
      select.append(option);
    }
  }

  function applyStoredData(result) {
    const settings = { ...defaults, ...(result[SETTINGS_KEY] || {}), fields: { ...defaults.fields, ...(result[SETTINGS_KEY]?.fields || {}) } };
    document.querySelector("#enabled").checked = settings.enabled;
    const options = Array.isArray(result[CATEGORY_OPTIONS_KEY]) ? result[CATEGORY_OPTIONS_KEY] : [];
    setOptions("categories", options, settings.categories);
    setOptions("excludedCategories", options, settings.excludedCategories);
    setList("excludedBrands", settings.excludedBrands);
    document.querySelector("#minPrice").value = settings.minPrice ?? "";
    document.querySelector("#maxPrice").value = settings.maxPrice ?? "";
    document.querySelector("#minRating").value = settings.minRating ?? "";
    document.querySelectorAll("[data-field]").forEach(input => { input.checked = settings.fields[input.dataset.field] !== false; });
  }

  function setList(id, values) {
    document.querySelector("#" + id).value = Array.isArray(values) ? values.join(", ") : "";
  }

  // Read all current controls once so both save and quick-start keep the selected filters.
  function readSettings(enabled = document.querySelector("#enabled").checked) {
    const fields = {};
    document.querySelectorAll("[data-field]").forEach(input => { fields[input.dataset.field] = input.checked; });
    return {
      enabled,
      categories: selectedValues("categories"),
      excludedCategories: selectedValues("excludedCategories"),
      excludedBrands: listValue("excludedBrands"),
      minPrice: numberValue("minPrice"),
      maxPrice: numberValue("maxPrice"),
      minRating: numberValue("minRating"),
      fields
    };
  }

  // Open Ozon in the active tab so the capture side panel stays beside the page.
  function openOzon(enableCapture, useSearch = true) {
    const search = useSearch ? document.querySelector("#ozonSearch").value.trim() : "";
    const target = new URL("https://www.ozon.ru/");
    if (search) {
      target.pathname = "/search/";
      target.searchParams.set("text", search);
    }
    document.querySelector("#enabled").checked = enableCapture;
    const settings = readSettings(enableCapture);
    return chrome.storage.local.set({ [SETTINGS_KEY]: settings }).then(() => chrome.tabs.query({ active: true, currentWindow: true }))
      .then(tabs => tabs[0]?.id == null
        ? chrome.tabs.create({ url: target.toString() })
        : chrome.tabs.update(tabs[0].id, { url: target.toString() }))
      .then(() => showStatus(enableCapture ? "自动采集已开启，Ozon 已在当前标签页打开。" : "Ozon 首页已打开，自动采集已暂停。"))
      .catch(() => showStatus("打开 Ozon 失败，请检查浏览器扩展权限。"));
  }

  document.querySelector("#openOzon").addEventListener("click", () => openOzon(true));
  document.querySelector("#openOzonHome").addEventListener("click", () => openOzon(false, false));

  chrome.storage.local.get([SETTINGS_KEY, CATEGORY_OPTIONS_KEY]).then(applyStoredData);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CATEGORY_OPTIONS_KEY]) return;
    const currentCategories = selectedValues("categories");
    const currentExcluded = selectedValues("excludedCategories");
    chrome.storage.local.get(SETTINGS_KEY).then(settingsResult => {
      const saved = settingsResult[SETTINGS_KEY] || {};
      applyStoredData({
        ...settingsResult,
        [SETTINGS_KEY]: {
          ...saved,
          categories: currentCategories.length ? currentCategories : saved.categories,
          excludedCategories: currentExcluded.length ? currentExcluded : saved.excludedCategories
        },
        [CATEGORY_OPTIONS_KEY]: changes[CATEGORY_OPTIONS_KEY].newValue
      });
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const settings = readSettings();
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }).then(() => showStatus("设置已保存，打开 Ozon 列表或详情页后会自动采集。"));
  });
})();
