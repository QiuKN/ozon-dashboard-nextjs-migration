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
    if (event.source !== window || event.data?.source !== "ozon-product-capture-page" || event.data.type !== "ACK") return;
    chrome.runtime.sendMessage({ type: "ACK_QUEUE", ids: event.data.ids || [] });
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "QUEUE_UPDATED") requestQueue();
  });

  requestQueue();
  window.setInterval(requestQueue, 2000);
})();
