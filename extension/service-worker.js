// The toolbar action opens the local-only product capture page without reading page credentials.
importScripts("config.js");

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: globalThis.OZON_CAPTURE_APP_URL });
});
