(() => {
  "use strict";

  // Keep settings small and human-readable because they are stored only in the browser profile.
  const SETTINGS_KEY = "ozonCaptureSettings";
  const CATEGORY_OPTIONS_KEY = "ozonCaptureCategoryOptions";
  // Seed common Ozon top-level categories; page discovery adds the exact subcategories available to the shop.
  const builtInCategoryOptions = [
    ["电子产品", "Электроника"],
    ["服装", "Одежда"],
    ["鞋类", "Обувь"],
    ["家居与园艺", "Дом и сад"],
    ["儿童用品", "Детские товары"],
    ["美容与健康", "Красота и здоровье"],
    ["家用电器", "Бытовая техника"],
    ["运动与休闲", "Спорт и отдых"],
    ["建材与装修", "Строительство и ремонт"],
    ["汽车用品", "Автотовары"],
    ["食品", "Продукты питания"],
    ["图书", "Книги"],
    ["文具", "Канцтовары"],
    ["宠物用品", "Товары для животных"],
    ["珠宝", "Ювелирные изделия"],
    ["家具", "Мебель"],
    ["工具", "Инструменты"],
    ["爱好与手工", "Хобби и творчество"],
    ["旅行与户外", "Туризм"],
    ["园艺用品", "Сад и огород"],
    ["家居清洁", "Бытовая химия"],
    ["成人用品", "Товары для взрослых"]
  ].map(([translated, ozonName]) => ({ label: translated + "（" + ozonName + "）", value: ozonName.toLowerCase() }));
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
  const backgroundStatus = document.querySelector("#backgroundStatus");
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
    const discovered = Array.isArray(result[CATEGORY_OPTIONS_KEY]) ? result[CATEGORY_OPTIONS_KEY] : [];
    const options = [...new Map([...builtInCategoryOptions, ...discovered].map(option => [option.value, option])).values()];
    // Persist the visible choices so the website panel can use the same category list.
    chrome.storage.local.set({ [CATEGORY_OPTIONS_KEY]: options }).catch(() => undefined);
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

  function showBackgroundJob(job) {
    if (!job) {
      backgroundStatus.textContent = "尚未开始。";
      return;
    }
    const count = Number(job.capturedCount) || 0;
    if (job.status === "starting" || job.status === "running") backgroundStatus.textContent = "正在后台采集：" + count + " / " + job.maxItems + " 件";
    else if (job.status === "completed") backgroundStatus.textContent = "采集完成：" + count + " 件" + (job.reason === "list_exhausted" ? "，当前列表已加载完。" : "。");
    else if (job.status === "stopped") backgroundStatus.textContent = "采集已停止：" + count + " 件。";
    else backgroundStatus.textContent = "后台采集启动失败。";
  }

  function refreshBackgroundJob() {
    chrome.runtime.sendMessage({ type: "GET_BACKGROUND_CAPTURE_JOB" })
      .then(response => showBackgroundJob(response?.job))
      .catch(() => undefined);
  }

  function startBackgroundCapture() {
    const search = document.querySelector("#ozonSearch").value.trim();
    if (!search) {
      backgroundStatus.textContent = "请先输入商品关键词。";
      return;
    }
    const target = new URL("https://www.ozon.ru/search/");
    target.searchParams.set("text", search);
    const maxItems = Math.min(Math.max(Number(document.querySelector("#backgroundLimit").value) || 100, 1), 500);
    document.querySelector("#enabled").checked = true;
    const settings = readSettings(true);
    backgroundStatus.textContent = "正在打开后台采集页面…";
    chrome.storage.local.set({ [SETTINGS_KEY]: settings })
      .then(() => chrome.runtime.sendMessage({ type: "START_BACKGROUND_CAPTURE", url: target.toString(), maxItems }))
      .then(response => {
        if (!response?.ok) {
          backgroundStatus.textContent = response?.error || "后台任务未能启动。";
          return;
        }
        showBackgroundJob(response.job);
      })
      .catch(() => { backgroundStatus.textContent = "后台任务未能启动，请重新加载插件后重试。"; });
  }

  function stopBackgroundCapture() {
    chrome.runtime.sendMessage({ type: "STOP_BACKGROUND_CAPTURE" })
      .then(response => showBackgroundJob(response?.job))
      .catch(() => { backgroundStatus.textContent = "停止任务失败，请重试。"; });
  }

  document.querySelector("#openOzon").addEventListener("click", () => openOzon(true));
  document.querySelector("#openOzonHome").addEventListener("click", () => openOzon(false, false));
  document.querySelector("#startBackground").addEventListener("click", startBackgroundCapture);
  document.querySelector("#stopBackground").addEventListener("click", stopBackgroundCapture);

  chrome.storage.local.get([SETTINGS_KEY, CATEGORY_OPTIONS_KEY]).then(applyStoredData);
  refreshBackgroundJob();
  window.setInterval(refreshBackgroundJob, 1500);
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
