(() => {
  "use strict";

  // Avoid injecting duplicate controls while Ozon replaces the product view in a single-page navigation.
  if (globalThis.__OZON_CAPTURE_INSTALLED) return;
  globalThis.__OZON_CAPTURE_INSTALLED = true;

  const APP_URL = globalThis.OZON_CAPTURE_APP_URL || "https://ozon-dashboard-nextjs-migration.vercel.app/product-capture";
  const SETTINGS_KEY = "ozonCaptureSettings";
  const CATEGORY_OPTIONS_KEY = "ozonCaptureCategoryOptions";
  const BACKGROUND_JOB_ID = new URLSearchParams(location.hash.slice(1)).get("ozonCaptureJob");
  const BUTTON_ID = "ozon-product-capture-button";
  const PANEL_ID = "ozon-product-capture-panel";
  const DEFAULT_SETTINGS = {
    enabled: true,
    categories: [],
    excludedCategories: [],
    excludedBrands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    fields: { title: true, images: true, price: true, seller: true, rating: true, description: true, category: true }
  };

  let settings = DEFAULT_SETTINGS;
  let lastAutoKey = "";
  let lastUrl = location.href;
  let statusButton = null;
  let queuedListCount = 0;
  let backgroundJob = null;
  let unchangedListSteps = 0;
  let backgroundScrollTimer = null;
  const capturedListKeys = new Set();

  function text(value) {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }

  function numberOrNull(value) {
    const normalized = text(value).replace(/[^0-9,.-]/g, "").replace(/,/g, ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function list(values) {
    return Array.isArray(values) ? values.map(value => text(value).toLowerCase()).filter(Boolean) : [];
  }

  function normalizedSettings(value) {
    return {
      ...DEFAULT_SETTINGS,
      ...(value || {}),
      categories: list(value?.categories),
      excludedCategories: list(value?.excludedCategories),
      excludedBrands: list(value?.excludedBrands),
      fields: { ...DEFAULT_SETTINGS.fields, ...(value?.fields || {}) }
    };
  }

  function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(SETTINGS_KEY).then(result => {
        settings = normalizedSettings(result[SETTINGS_KEY]);
        resolve(settings);
      }).catch(() => resolve(settings));
    });
  }

  function jsonLdProduct() {
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.parse(node.textContent || "null");
        const candidates = Array.isArray(value) ? value : value?.["@graph"] || [value];
        const product = candidates.find(item => item && (item["@type"] === "Product" || item.productID || item.sku));
        if (product) return product;
      } catch {
        // Ignore malformed structured data and continue with visible page fields.
      }
    }
    return {};
  }

  function meta(name) {
    return text(document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]')?.content);
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = text(document.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return "";
  }

  function productIdFromUrl() {
    const match = location.pathname.match(/-(\d+)(?:\/|$)/);
    return match?.[1] || "";
  }

  function breadcrumbText() {
    const values = [...document.querySelectorAll('[data-widget*="breadcrumb"] a, nav[aria-label*="breadcrumb" i] a')].map(node => text(node.textContent)).filter(Boolean);
    return values.join(" / ");
  }

  // Build selectable categories only from labels Ozon actually renders on visited pages.
  function discoverCategories() {
    const labels = new Set(breadcrumbText().split("/").map(text).filter(Boolean));
    for (const anchor of document.querySelectorAll('a[href*="/category/"]')) {
      const label = text(anchor.textContent) || text(anchor.getAttribute("aria-label")) || text(anchor.title);
      if (label && label.length < 100) labels.add(label);
    }
    const options = [...labels].map(label => ({ label, value: label.toLowerCase() }));
    if (options.length) {
      chrome.storage.local.get(CATEGORY_OPTIONS_KEY).then(result => {
        const existing = Array.isArray(result[CATEGORY_OPTIONS_KEY]) ? result[CATEGORY_OPTIONS_KEY] : [];
        const merged = new Map(existing.map(item => [item.value, item]));
        for (const option of options) merged.set(option.value, option);
        const next = [...merged.values()].sort((left, right) => left.label.localeCompare(right.label)).slice(0, 300);
        if (next.length === existing.length && next.every((item, index) => item.value === existing[index]?.value && item.label === existing[index]?.label)) return undefined;
        return chrome.storage.local.set({ [CATEGORY_OPTIONS_KEY]: next });
      }).catch(() => undefined);
    }
    return breadcrumbText();
  }

  function isProductPage() {
    return /\/product\/[^/]+/i.test(location.pathname);
  }

  // Product cards do not have one stable Ozon class, so use the nearest price-and-image container.
  function listingCard(anchor) {
    let candidate = anchor;
    let node = anchor;
    for (let depth = 0; depth < 6 && node.parentElement; depth += 1) {
      node = node.parentElement;
      const content = text(node.innerText || node.textContent);
      if (content.length > 1500) break;
      if (/[₽]|руб\.?|RUB/i.test(content) && node.querySelector("img")) {
        candidate = node;
        break;
      }
    }
    return candidate;
  }

  // Capture only rendered product links; scrolling and Ozon's own lazy loading reveal the next batch.
  function collectListingProducts(category) {
    const records = new Map();
    for (const anchor of document.querySelectorAll('a[href*="/product/"]')) {
      let url;
      try { url = new URL(anchor.href, location.href); } catch { continue; }
      const match = url.pathname.match(/-(\d+)(?:\/|$)/);
      const productId = match?.[1] || "";
      if (!productId || records.has(productId)) continue;
      const card = listingCard(anchor);
      const image = card.querySelector("img");
      const title = text(anchor.getAttribute("aria-label")) || text(anchor.title) || text(image?.alt) || text(anchor.innerText || anchor.textContent).split("\n").map(text).find(value => value.length > 12) || "";
      if (!title) continue;
      const cardText = text(card.innerText || card.textContent);
      const priceMatch = cardText.match(/([\d\s\u00a0.,]+)\s*(₽|руб\.?|RUB)/i);
      const priceText = priceMatch ? priceMatch[0].trim() : "";
      const priceValue = priceMatch ? numberOrNull(priceMatch[1]) : null;
      const ratingNode = card.querySelector('[data-widget*="rating"], [aria-label*="rating" i], [aria-label*="рейтинг" i]');
      const ratingText = text(ratingNode?.getAttribute("aria-label")) || text(ratingNode?.textContent);
      const ratingMatch = ratingText.match(/[0-5](?:[.,]\d+)?/);
      const ratingValue = ratingMatch ? numberOrNull(ratingMatch[0]) : null;
      const reviewsText = ratingMatch ? ratingText.replace(ratingMatch[0], "") : ratingText;
      const reviewsMatch = reviewsText.match(/([\d\s\u00a0]+)\s*(?:review|отзыв|оцен)/i);
      const imageUrls = [...new Set([...card.querySelectorAll("img")].map(item => item.currentSrc || item.src).filter(value => /^https?:\/\//i.test(value)))].slice(0, 12);
      records.set(productId, {
        source: "ozon", productId, url: url.href, title, imageUrls, priceText, priceValue,
        currency: priceText ? "RUB" : "", sellerName: "", sellerUrl: "", brandName: "",
        ratingText: ratingValue == null ? "" : String(ratingValue), ratingValue,
        reviewCount: reviewsMatch ? numberOrNull(reviewsMatch[1]) : null, salesText: "", stockText: "",
        category, variantsText: "", description: "", capturedAt: Date.now(), status: "success"
      });
    }
    return [...records.values()];
  }

  function collectProduct() {
    const structured = jsonLdProduct();
    const offers = Array.isArray(structured.offers) ? structured.offers[0] : structured.offers || {};
    const rating = structured.aggregateRating || {};
    const imageValues = Array.isArray(structured.image) ? structured.image : [structured.image, meta("og:image")];
    const visibleImages = [...document.images].map(image => image.currentSrc || image.src).filter(Boolean).slice(0, 12);
    const imageUrls = [...new Set([...imageValues, ...visibleImages].map(text).filter(value => /^https?:\/\//i.test(value)))].slice(0, 20);
    const title = firstText(["h1", '[data-widget*="webProductHeading"]']) || text(structured.name) || meta("og:title");
    const priceText = firstText(['[data-widget*="webPrice"]', '[data-widget*="price"]']) || text(offers.price) || meta("product:price:amount");
    const priceValue = numberOrNull(offers.price || meta("product:price:amount") || priceText);
    const currency = text(offers.priceCurrency) || meta("product:price:currency");
    const brandName = text(structured.brand?.name) || firstText(['[data-widget*="brand"]', '[data-widget*="webBrand"]']);
    const sellerName = firstText(['[data-widget*="seller"]', '[data-widget*="webSeller"]']);
    const description = text(structured.description) || firstText(['[data-widget*="webDescription"]', '[data-widget*="description"]']).slice(0, 3000);
    const ratingValue = numberOrNull(rating.ratingValue);
    const reviewCount = numberOrNull(rating.reviewCount || rating.ratingCount);
    const category = text(structured.category) || breadcrumbText();
    const productId = text(structured.productID || structured.sku) || productIdFromUrl();

    return {
      source: "ozon",
      productId,
      url: location.href,
      title,
      imageUrls,
      priceText,
      priceValue,
      currency,
      sellerName,
      sellerUrl: "",
      brandName,
      ratingText: ratingValue == null ? "" : String(ratingValue),
      ratingValue,
      reviewCount,
      salesText: firstText(['[data-widget*="sold"]', '[data-widget*="orders"]']),
      stockText: firstText(['[data-widget*="stock"]', '[data-widget*="availability"]']),
      category,
      variantsText: "",
      description,
      capturedAt: Date.now(),
      status: title && (productId || location.href) ? "success" : "partial"
    };
  }

  function containsTerm(value, terms) {
    const candidate = text(value).toLowerCase();
    return terms.some(term => candidate.includes(term));
  }

  function passesFilters(record) {
    if (!settings.enabled) return false;
    if (settings.categories.length && !containsTerm(record.category, settings.categories)) return false;
    if (containsTerm(record.category, settings.excludedCategories)) return false;
    if (containsTerm(record.brandName, settings.excludedBrands)) return false;
    if (settings.minPrice != null && (record.priceValue == null || record.priceValue < settings.minPrice)) return false;
    if (settings.maxPrice != null && (record.priceValue == null || record.priceValue > settings.maxPrice)) return false;
    if (settings.minRating != null && (record.ratingValue == null || record.ratingValue < settings.minRating)) return false;
    return true;
  }

  function applyFieldSelection(record) {
    const fields = settings.fields;
    return {
      ...record,
      title: fields.title ? record.title : "",
      imageUrls: fields.images ? record.imageUrls : [],
      priceText: fields.price ? record.priceText : "",
      priceValue: fields.price ? record.priceValue : null,
      currency: fields.price ? record.currency : "",
      sellerName: fields.seller ? record.sellerName : "",
      sellerUrl: fields.seller ? record.sellerUrl : "",
      brandName: fields.seller ? record.brandName : "",
      ratingText: fields.rating ? record.ratingText : "",
      ratingValue: fields.rating ? record.ratingValue : null,
      reviewCount: fields.rating ? record.reviewCount : null,
      description: fields.description ? record.description : "",
      category: fields.category ? record.category : ""
    };
  }

  function autoCapture() {
    if (!isProductPage()) return;
    void loadSettings().then(() => {
      discoverCategories();
      const record = collectProduct();
      const key = record.productId || record.url;
      if (!key || !record.title || key === lastAutoKey || !passesFilters(record)) return;
      lastAutoKey = key;
      chrome.runtime.sendMessage({ type: "AUTO_CAPTURE", record: applyFieldSelection(record) }).catch(() => undefined);
    });
  }

  // Observe newly rendered cards without paging or making background requests to Ozon.
  function autoCaptureListing() {
    if (BACKGROUND_JOB_ID && !backgroundJob) return;
    discoverCategories();
    void loadSettings().then(() => {
      if (!settings.enabled) {
        if (statusButton) statusButton.textContent = "自动采集已关闭";
        return;
      }
      for (const record of collectListingProducts(breadcrumbText())) {
        const key = record.productId || record.url;
        if (backgroundJob && capturedListKeys.size >= backgroundJob.maxItems) break;
        if (!key || capturedListKeys.has(key) || !passesFilters(record)) continue;
        capturedListKeys.add(key);
        chrome.runtime.sendMessage({ type: "AUTO_CAPTURE", record: applyFieldSelection(record), jobId: backgroundJob?.id }).then(response => {
          if (!response?.ok) {
            capturedListKeys.delete(key);
            return;
          }
          queuedListCount += 1;
          if (statusButton) statusButton.textContent = "列表自动采集 · 已加入 " + queuedListCount + " 件";
          if (backgroundJob && response.capturedCount >= backgroundJob.maxItems) finishBackgroundCapture("completed", "limit");
        }).catch(() => capturedListKeys.delete(key));
      }
    });
  }

  function finishBackgroundCapture(status, reason) {
    if (!backgroundJob) return;
    const job = backgroundJob;
    backgroundJob = null;
    window.clearTimeout(backgroundScrollTimer);
    chrome.runtime.sendMessage({ type: "FINISH_BACKGROUND_CAPTURE", jobId: job.id, status, reason }).catch(() => undefined);
  }

  // Scroll one viewport at a time so Ozon can lazy-load products between steps.
  function scheduleAutoScroll() {
    const shouldScroll = backgroundJob || (!BACKGROUND_JOB_ID && settings.enabled && !isProductPage());
    if (!shouldScroll || backgroundScrollTimer || typeof window.scrollBy !== "function") return;
    backgroundScrollTimer = window.setTimeout(() => {
      backgroundScrollTimer = null;
      const active = backgroundJob || (!BACKGROUND_JOB_ID && settings.enabled && !isProductPage());
      if (!active) return;
      if (unchangedListSteps >= 6) {
        if (backgroundJob) finishBackgroundCapture("completed", "list_exhausted");
        return;
      }
      const before = collectListingProducts(breadcrumbText()).length;
      const beforeHeight = document.documentElement.scrollHeight;
      const viewport = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 600);
      window.scrollBy(0, Math.floor(viewport * 0.8));
      backgroundScrollTimer = window.setTimeout(() => {
        backgroundScrollTimer = null;
        const stillActive = backgroundJob || (!BACKGROUND_JOB_ID && settings.enabled && !isProductPage());
        if (!stillActive) return;
        const after = collectListingProducts(breadcrumbText()).length;
        const heightChanged = document.documentElement.scrollHeight > beforeHeight;
        unchangedListSteps = after > before || heightChanged ? 0 : unchangedListSteps + 1;
        autoCaptureListing();
        scheduleAutoScroll();
      }, 2200);
    }, 1200);
  }

  // The background tab carries a job marker so ordinary Ozon browsing is never scrolled automatically.
  function connectBackgroundJob(attempt = 0) {
    if (!BACKGROUND_JOB_ID) return;
    chrome.runtime.sendMessage({ type: "GET_BACKGROUND_CAPTURE_JOB", jobId: BACKGROUND_JOB_ID }).then(response => {
      if (response?.job?.status === "running") {
        backgroundJob = response.job;
        void loadSettings().then(() => {
          autoCaptureListing();
          scheduleAutoScroll();
        });
        return;
      }
      if (attempt < 30) window.setTimeout(() => connectBackgroundJob(attempt + 1), 500);
    }).catch(() => {
      if (attempt < 30) window.setTimeout(() => connectBackgroundJob(attempt + 1), 500);
    });
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function showPreview(record) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = "position:fixed;right:20px;bottom:76px;z-index:2147483647;width:min(360px,calc(100vw - 40px));padding:16px;border:1px solid #c6d4d8;border-radius:12px;color:#172b4d;background:#fff;box-shadow:0 15px 45px rgba(15,35,45,.2);font:14px/1.5 system-ui,sans-serif;";
      document.body.appendChild(panel);
    }
    panel.innerHTML = "<strong style=\"display:block;margin-bottom:8px\">手动采集当前商品</strong><p style=\"margin:0 0 12px;color:#5e6c84\">" + escapeHtml(record.title || "未读取到标题") + "<br>" + escapeHtml(record.priceText || "价格未返回") + "</p><div style=\"display:flex;gap:8px;justify-content:flex-end\"><button id=\"ozon-capture-cancel\" type=\"button\">取消</button><button id=\"ozon-capture-open\" type=\"button\">打开选品页</button></div>";
    panel.querySelectorAll("button").forEach(button => { button.style.cssText = "padding:7px 10px;border:1px solid #c6d4d8;border-radius:7px;background:#fff;color:#126b5b;cursor:pointer;font:inherit;font-size:12px"; });
    panel.querySelector("#ozon-capture-open").style.background = "#126b5b";
    panel.querySelector("#ozon-capture-open").style.color = "#fff";
    panel.querySelector("#ozon-capture-cancel").addEventListener("click", () => panel.remove(), { once: true });
    panel.querySelector("#ozon-capture-open").addEventListener("click", () => {
      const target = new URL(APP_URL);
      // A URL fragment is not sent in the HTTP request, so the product data stays out of server logs.
      target.hash = "capture=" + encodeURIComponent(JSON.stringify(record));
      window.open(target.toString(), "_blank");
      panel.remove();
    }, { once: true });
  }

  const button = document.createElement("button");
  statusButton = button;
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = isProductPage() ? "手动采集" : "列表自动采集 · 已加入 0 件";
  button.title = isProductPage() ? "自动采集已按插件设置运行；点击此处可手动采集当前商品" : "自动采集当前列表中已加载的商品，滚动页面后会继续读取新商品";
  button.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:10px 14px;border:0;border-radius:9px;color:#fff;background:#126b5b;box-shadow:0 8px 24px rgba(18,107,91,.3);cursor:pointer;font:700 13px system-ui,sans-serif";
  if (isProductPage()) button.addEventListener("click", () => showPreview(collectProduct()));
  else button.addEventListener("click", () => {
    autoCaptureListing();
    button.textContent = "正在读取列表商品";
    window.setTimeout(() => { button.textContent = "列表自动采集 · 已加入 " + queuedListCount + " 件"; }, 1600);
  });
  document.body.appendChild(button);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = normalizedSettings(changes[SETTINGS_KEY].newValue);
    lastAutoKey = "";
    if (isProductPage()) autoCapture();
    else {
      autoCaptureListing();
      scheduleAutoScroll();
    }
  });

  // A short delay lets Ozon finish rendering structured data before the first automatic capture.
  window.setTimeout(() => {
    if (isProductPage()) autoCapture();
    else {
      autoCaptureListing();
      scheduleAutoScroll();
    }
  }, 1800);
  connectBackgroundJob();
  const listObserver = new MutationObserver(() => {
    if (!isProductPage()) {
      window.clearTimeout(listObserver.timer);
      listObserver.timer = window.setTimeout(autoCaptureListing, 650);
    }
  });
  listObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastAutoKey = "";
      capturedListKeys.clear();
      queuedListCount = 0;
      if (!isProductPage()) button.textContent = "列表自动采集 · 已加入 0 件";
      window.setTimeout(() => {
        if (isProductPage()) autoCapture();
        else {
          autoCaptureListing();
          scheduleAutoScroll();
        }
      }, 1200);
    }
  }, 2000);
})();
