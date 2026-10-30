(() => {
  "use strict";

  // Avoid injecting a second button when Ozon replaces the product view in a single-page navigation.
  if (globalThis.__OZON_CAPTURE_INSTALLED) return;
  globalThis.__OZON_CAPTURE_INSTALLED = true;

  const APP_URL = globalThis.OZON_CAPTURE_APP_URL || "http://localhost:3000/product-capture";
  const BUTTON_ID = "ozon-product-capture-button";
  const PANEL_ID = "ozon-product-capture-panel";

  function text(value) {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }

  function numberOrNull(value) {
    const normalized = text(value).replace(/[^0-9,.-]/g, "").replace(/,/g, ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
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
    const sellerName = text(structured.brand?.name) || firstText(['[data-widget*="seller"]', '[data-widget*="webSeller"]']);
    const description = text(structured.description) || firstText(['[data-widget*="webDescription"]', '[data-widget*="description"]']).slice(0, 3000);
    const ratingValue = numberOrNull(rating.ratingValue);
    const reviewCount = numberOrNull(rating.reviewCount || rating.ratingCount);
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
      ratingText: ratingValue == null ? "" : String(ratingValue),
      ratingValue,
      reviewCount,
      salesText: firstText(['[data-widget*="sold"]', '[data-widget*="orders"]']),
      stockText: firstText(['[data-widget*="stock"]', '[data-widget*="availability"]']),
      category: "",
      variantsText: "",
      description,
      capturedAt: Date.now(),
      status: title && (productId || location.href) ? "success" : "partial"
    };
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
    panel.innerHTML = "<strong style=\"display:block;margin-bottom:8px\">采集当前商品</strong><p style=\"margin:0 0 12px;color:#5e6c84\">" + escapeHtml(record.title || "未读取到标题") + "<br>" + escapeHtml(record.priceText || "价格未返回") + "</p><div style=\"display:flex;gap:8px;justify-content:flex-end\"><button id=\"ozon-capture-cancel\" type=\"button\">取消</button><button id=\"ozon-capture-open\" type=\"button\">打开选品页</button></div>";
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
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "采集当前商品";
  button.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:10px 14px;border:0;border-radius:9px;color:#fff;background:#126b5b;box-shadow:0 8px 24px rgba(18,107,91,.3);cursor:pointer;font:700 13px system-ui,sans-serif";
  button.addEventListener("click", () => showPreview(collectProduct()));
  document.body.appendChild(button);
})();
