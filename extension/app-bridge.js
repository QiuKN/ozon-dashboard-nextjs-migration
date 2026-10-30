(() => {
  "use strict";

  // The bridge lets the local-only Next.js page import queued records without a server API.
  function requestQueue() {
    chrome.runtime.sendMessage({ type: "GET_QUEUE" }, response => {
      if (chrome.runtime.lastError || !response?.records?.length) return;
      window.postMessage({ source: "ozon-product-capture-extension", type: "QUEUE", records: response.records }, "*");
    });
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== "ozon-product-capture-page") return;
    if (event.data.type === "ACK") {
      chrome.runtime.sendMessage({ type: "ACK_QUEUE", ids: event.data.ids || [] });
      return;
    }
    if (event.data.type === "START_CAPTURE") {
      chrome.runtime.sendMessage({
        type: "START_BACKGROUND_CAPTURE",
        url: event.data.url,
        maxItems: event.data.maxItems
      }, response => {
        window.postMessage({ source: "ozon-product-capture-extension", type: "START_CAPTURE_RESULT", response }, "*");
      });
      return;
    }
    if (event.data.type === "STOP_CAPTURE") {
      chrome.runtime.sendMessage({ type: "STOP_BACKGROUND_CAPTURE" }, response => {
        window.postMessage({ source: "ozon-product-capture-extension", type: "STOP_CAPTURE_RESULT", response }, "*");
      });
    }
  });

  function requestBackgroundJob() {
    chrome.runtime.sendMessage({ type: "GET_BACKGROUND_CAPTURE_JOB" }, response => {
      if (chrome.runtime.lastError) return;
      window.postMessage({ source: "ozon-product-capture-extension", type: "BACKGROUND_CAPTURE_JOB", job: response?.job || null }, "*");
    });
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "QUEUE_UPDATED") requestQueue();
  });

  requestQueue();
  window.setInterval(() => {
    requestQueue();
    requestBackgroundJob();
  }, 1200);
  requestBackgroundJob();
})();
