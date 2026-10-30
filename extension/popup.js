(() => {
  "use strict";

  // Keep settings small and human-readable because they are stored only in the browser profile.
  const SETTINGS_KEY = "ozonCaptureSettings";
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
  const listValue = id => document.querySelector("#" + id).value.split(/[,，\n]/).map(value => value.trim()).filter(Boolean);
  const numberValue = id => {
    const value = document.querySelector("#" + id).value.trim();
    return value === "" ? null : Number(value);
  };

  function showStatus(message) {
    status.textContent = message;
  }

  function setList(id, values) {
    document.querySelector("#" + id).value = Array.isArray(values) ? values.join(", ") : "";
  }

  chrome.storage.local.get(SETTINGS_KEY).then(result => {
    const settings = { ...defaults, ...(result[SETTINGS_KEY] || {}), fields: { ...defaults.fields, ...(result[SETTINGS_KEY]?.fields || {}) } };
    document.querySelector("#enabled").checked = settings.enabled;
    setList("categories", settings.categories);
    setList("excludedCategories", settings.excludedCategories);
    setList("excludedBrands", settings.excludedBrands);
    document.querySelector("#minPrice").value = settings.minPrice ?? "";
    document.querySelector("#maxPrice").value = settings.maxPrice ?? "";
    document.querySelector("#minRating").value = settings.minRating ?? "";
    document.querySelectorAll("[data-field]").forEach(input => { input.checked = settings.fields[input.dataset.field] !== false; });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const fields = {};
    document.querySelectorAll("[data-field]").forEach(input => { fields[input.dataset.field] = input.checked; });
    const settings = {
      enabled: document.querySelector("#enabled").checked,
      categories: listValue("categories"),
      excludedCategories: listValue("excludedCategories"),
      excludedBrands: listValue("excludedBrands"),
      minPrice: numberValue("minPrice"),
      maxPrice: numberValue("maxPrice"),
      minRating: numberValue("minRating"),
      fields
    };
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }).then(() => showStatus("设置已保存，打开 Ozon 商品页后会自动采集。"));
  });
})();
