// Keep the automatic capture queue in extension-local storage; the Next.js page imports it into IndexedDB.
const QUEUE_KEY = "ozonCaptureQueue";
const SETTINGS_KEY = "ozonCaptureSettings";
const BACKGROUND_JOB_KEY = "ozonBackgroundCaptureJob";
// shortcut: keep at most 500 records to stay below browser extension storage limits; open the selection page for larger batches.
const MAX_QUEUE_SIZE = 500;
const MAX_BACKGROUND_ITEMS = 500;
const BACKGROUND_ALARM = "ozon-background-capture-timeout";
// Seed the website panel with selectable Ozon top-level categories before a page has been visited.
const BUILTIN_CATEGORY_OPTIONS = [
  ["电子产品", "Электроника"], ["服装", "Одежда"], ["鞋类", "Обувь"], ["家居与园艺", "Дом и сад"],
  ["儿童用品", "Детские товары"], ["美容与健康", "Красота и здоровье"], ["家用电器", "Бытовая техника"],
  ["运动与休闲", "Спорт и отдых"], ["建材与装修", "Строительство и ремонт"], ["汽车用品", "Автотовары"],
  ["食品", "Продукты питания"], ["图书", "Книги"], ["文具", "Канцтовары"], ["宠物用品", "Товары для животных"],
  ["珠宝", "Ювелирные изделия"], ["家具", "Мебель"], ["工具", "Инструменты"], ["爱好与手工", "Хобби и творчество"],
  ["旅行与户外", "Туризм"], ["园艺用品", "Сад и огород"], ["家居清洁", "Бытовая химия"], ["成人用品", "Товары для взрослых"]
].map(([translated, ozonName]) => ({ label: translated + "（" + ozonName + "）", value: ozonName.toLowerCase() }));

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
  chrome.storage.local.get([SETTINGS_KEY, "ozonCaptureCategoryOptions"]).then(result => {
    const values = {};
    if (!result[SETTINGS_KEY]) values[SETTINGS_KEY] = DEFAULT_SETTINGS;
    if (!Array.isArray(result.ozonCaptureCategoryOptions) || !result.ozonCaptureCategoryOptions.length) {
      values.ozonCaptureCategoryOptions = BUILTIN_CATEGORY_OPTIONS;
    }
    return Object.keys(values).length ? chrome.storage.local.set(values) : undefined;
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.local.get(BACKGROUND_JOB_KEY).then(result => {
    const job = result[BACKGROUND_JOB_KEY];
    if (job?.tabId !== tabId || job.status !== "running") return;
    return chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: { ...job, status: "stopped", reason: "tab_closed", finishedAt: Date.now() } });
  }).catch(() => undefined);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== BACKGROUND_ALARM) return;
  chrome.storage.local.get(BACKGROUND_JOB_KEY).then(result => {
    const job = result[BACKGROUND_JOB_KEY];
    if (job?.status === "running") return finishBackgroundCapture(job, "stopped", "timeout");
    return undefined;
  }).catch(() => undefined);
});

function recordKey(record) {
  return String(record.productId || record.url || "");
}

let queueWrite = Promise.resolve();

// Serialize storage updates because one Ozon list can send many product records at once.
function enqueueRecord(record, tabId, jobId) {
  const operation = queueWrite.then(async () => {
    const result = await chrome.storage.local.get(QUEUE_KEY);
    const queue = Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [];
    const key = recordKey(record);
    const next = queue.filter(item => recordKey(item) !== key);
    next.unshift(record);
    await chrome.storage.local.set({ [QUEUE_KEY]: next.slice(0, MAX_QUEUE_SIZE) });

    if (!jobId) return { ok: true };
    const jobResult = await chrome.storage.local.get(BACKGROUND_JOB_KEY);
    const job = jobResult[BACKGROUND_JOB_KEY];
    if (!job || job.id !== jobId || job.tabId !== tabId || job.status !== "running") return { ok: true };
    const capturedKeys = Array.isArray(job.capturedKeys) ? job.capturedKeys : [];
    if (!capturedKeys.includes(key)) capturedKeys.push(key);
    const capturedCount = capturedKeys.length;
    const updatedJob = { ...job, capturedKeys, capturedCount, updatedAt: Date.now() };
    await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: updatedJob });
    return { ok: true, capturedCount, maxItems: job.maxItems };
  });
  queueWrite = operation.catch(() => undefined);
  return operation;
}

async function startBackgroundCapture(message, sendResponse) {
  const result = await chrome.storage.local.get(BACKGROUND_JOB_KEY);
  if (result[BACKGROUND_JOB_KEY]?.status === "running" || result[BACKGROUND_JOB_KEY]?.status === "starting") {
    sendResponse({ ok: false, error: "已有后台采集任务正在运行。" });
    return;
  }

  const id = crypto.randomUUID();
  const rawTasks = Array.isArray(message.tasks) && message.tasks.length
    ? message.tasks
    : [{ label: "关键词搜索", url: message.url, maxItems: message.maxItems }];
  const tasks = rawTasks.map(task => {
    let target;
    try { target = new URL(task.url); } catch { return null; }
    if (target.protocol !== "https:" || !/(^|\.)ozon\.(ru|com)$/i.test(target.hostname)) return null;
    return {
      label: String(task.label || "Ozon 分类").slice(0, 120),
      url: target.toString(),
      maxItems: Math.min(Math.max(Number(task.maxItems) || 100, 1), MAX_BACKGROUND_ITEMS)
    };
  }).filter(Boolean);
  if (!tasks.length) {
    sendResponse({ ok: false, error: "没有可用的 Ozon 分类任务。" });
    return;
  }
  const job = {
    id, tasks, taskIndex: 0, category: tasks[0].label, url: tasks[0].url,
    status: "starting", maxItems: tasks[0].maxItems, capturedCount: 0, capturedKeys: [], startedAt: Date.now()
  };
  await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: job });
  try {
    const tab = await openTaskTab(job);
    const latest = await chrome.storage.local.get(BACKGROUND_JOB_KEY);
    if (latest[BACKGROUND_JOB_KEY]?.id !== id || latest[BACKGROUND_JOB_KEY]?.status !== "starting") {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
      sendResponse({ ok: false, error: "后台采集任务已停止。" });
      return;
    }
    const runningJob = { ...latest[BACKGROUND_JOB_KEY], tabId: tab.id, status: "running" };
    await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: runningJob });
    chrome.alarms.create(BACKGROUND_ALARM, { delayInMinutes: 10 });
    sendResponse({ ok: true, job: runningJob });
  } catch (error) {
    const failedJob = { ...job, status: "failed", error: String(error), updatedAt: Date.now() };
    await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: failedJob });
    sendResponse({ ok: false, error: "无法打开 Ozon 后台标签页。" });
  }
}

// Open the current category in a hidden tab and keep the task marker in the URL.
async function openTaskTab(job) {
  const target = new URL(job.url);
  target.hash = "ozonCaptureJob=" + job.id;
  return chrome.tabs.create({ url: target.toString(), active: false });
}

async function finishBackgroundCapture(job, status, reason) {
  await queueWrite;
  const result = await chrome.storage.local.get(BACKGROUND_JOB_KEY);
  const current = result[BACKGROUND_JOB_KEY]?.id === job.id ? result[BACKGROUND_JOB_KEY] : job;
  if (status === "completed" && current.taskIndex + 1 < current.tasks.length) {
    const nextIndex = current.taskIndex + 1;
    const nextTask = current.tasks[nextIndex];
    const nextJob = {
      ...current, taskIndex: nextIndex, category: nextTask.label, url: nextTask.url,
      status: "starting", maxItems: nextTask.maxItems, capturedCount: 0, capturedKeys: [], updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: nextJob });
    if (current.tabId != null) await chrome.tabs.remove(current.tabId).catch(() => undefined);
    const tab = await openTaskTab(nextJob);
    const runningJob = { ...nextJob, tabId: tab.id, status: "running" };
    await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: runningJob });
    chrome.alarms.create(BACKGROUND_ALARM, { delayInMinutes: 10 });
    return runningJob;
  }
  const updated = { ...current, status, reason, finishedAt: Date.now() };
  await chrome.storage.local.set({ [BACKGROUND_JOB_KEY]: updated });
  await chrome.alarms.clear(BACKGROUND_ALARM);
  if (job.tabId != null) {
    await chrome.tabs.remove(job.tabId).catch(() => undefined);
  }
  return updated;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AUTO_CAPTURE") {
    enqueueRecord(message.record, _sender.tab?.id, message.jobId)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "START_BACKGROUND_CAPTURE") {
    void startBackgroundCapture(message, sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "GET_BACKGROUND_CAPTURE_JOB") {
    chrome.storage.local.get(BACKGROUND_JOB_KEY).then(result => {
      const job = result[BACKGROUND_JOB_KEY];
      const tabId = _sender.tab?.id;
      if (message.jobId) {
        sendResponse({ job: job?.id === message.jobId && (job.tabId == null || job.tabId === tabId) ? job : null });
        return;
      }
      sendResponse({ job: tabId == null || job?.tabId === tabId ? job || null : null });
    }).catch(() => sendResponse({ job: null }));
    return true;
  }

  if (message?.type === "FINISH_BACKGROUND_CAPTURE") {
    chrome.storage.local.get(BACKGROUND_JOB_KEY).then(result => {
      const job = result[BACKGROUND_JOB_KEY];
      if (job?.id !== message.jobId || job.tabId !== _sender.tab?.id || job.status !== "running") {
        sendResponse({ ok: false });
        return;
      }
      return finishBackgroundCapture(job, message.status === "completed" ? "completed" : "stopped", message.reason)
        .then(() => sendResponse({ ok: true }));
    }).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "STOP_BACKGROUND_CAPTURE") {
    chrome.storage.local.get(BACKGROUND_JOB_KEY).then(result => {
      const job = result[BACKGROUND_JOB_KEY];
      if (!job || !["starting", "running"].includes(job.status)) {
        sendResponse({ ok: true, job: job || null });
        return;
      }
      return finishBackgroundCapture(job, "stopped", "user").then(updated => sendResponse({ ok: true, job: updated }));
    }).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "GET_QUEUE") {
    queueWrite.then(() => chrome.storage.local.get(QUEUE_KEY)).then(result => {
      sendResponse({ records: Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [] });
    }).catch(error => sendResponse({ records: [], error: String(error) }));
    return true;
  }

  if (message?.type === "ACK_QUEUE") {
    const operation = queueWrite.then(async () => {
      const result = await chrome.storage.local.get(QUEUE_KEY);
      const acknowledged = new Set(Array.isArray(message.ids) ? message.ids.map(String) : []);
      const queue = Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [];
      await chrome.storage.local.set({ [QUEUE_KEY]: queue.filter(record => !acknowledged.has(recordKey(record))) });
    });
    queueWrite = operation.catch(() => undefined);
    operation.then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
