// Keep the automatic capture queue in extension-local storage; the Next.js page imports it into IndexedDB.
const QUEUE_KEY = "ozonCaptureQueue";
const SETTINGS_KEY = "ozonCaptureSettings";
// shortcut: keep at most 500 records to stay below browser extension storage limits; open the selection page for larger batches.
const MAX_QUEUE_SIZE = 500;

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

chrome.runtime.onInstalled.addListener(() => {
  // Keep the Ozon tab visible while the user opens and adjusts capture settings in the side panel.
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  chrome.storage.local.get(SETTINGS_KEY).then(result => {
    if (!result[SETTINGS_KEY]) return chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    return undefined;
  });
});

function recordKey(record) {
  return String(record.productId || record.url || "");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AUTO_CAPTURE") {
    chrome.storage.local.get(QUEUE_KEY).then(result => {
      const queue = Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [];
      const incomingKey = recordKey(message.record);
      const next = queue.filter(record => recordKey(record) !== incomingKey);
      next.unshift(message.record);
      return chrome.storage.local.set({ [QUEUE_KEY]: next.slice(0, MAX_QUEUE_SIZE) }).then(() => {
        sendResponse({ ok: true });
      });
    }).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "GET_QUEUE") {
    chrome.storage.local.get(QUEUE_KEY).then(result => {
      sendResponse({ records: Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [] });
    }).catch(error => sendResponse({ records: [], error: String(error) }));
    return true;
  }

  if (message?.type === "ACK_QUEUE") {
    chrome.storage.local.get(QUEUE_KEY).then(result => {
      const acknowledged = new Set(Array.isArray(message.ids) ? message.ids.map(String) : []);
      const queue = Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [];
      return chrome.storage.local.set({ [QUEUE_KEY]: queue.filter(record => !acknowledged.has(recordKey(record))) });
    }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
