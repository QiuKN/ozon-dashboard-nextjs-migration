"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./product-capture.module.css";

// Keep capture data in a separate browser-only database; no API route receives these records.
const DATABASE_NAME = "ozon-product-capture-v1-local";
const STORE_NAME = "products";
const DATABASE_VERSION = 1;

type ProductRecord = {
  id: string;
  source: "ozon";
  productId: string;
  url: string;
  title: string;
  imageUrls: string[];
  priceText: string;
  priceValue: number | null;
  currency: string;
  sellerName: string;
  sellerUrl: string;
  brandName: string;
  ratingText: string;
  ratingValue: number | null;
  reviewCount: number | null;
  salesText: string;
  stockText: string;
  category: string;
  variantsText: string;
  description: string;
  capturedAt: number;
  status: string;
  note: string;
  tags: string;
};

type CapturedProduct = Partial<ProductRecord> & { source?: string };

type CaptureCategory = { label: string; value: string; url?: string };
type BackgroundCaptureJob = { id: string; status: string; maxItems: number; capturedCount: number; taskIndex?: number; tasks?: Array<{ label: string; url: string; maxItems: number }>; category?: string; reason?: string };

declare global {
  interface Window {
    XLSX?: {
      utils: {
        json_to_sheet: (rows: Array<Record<string, unknown>>) => unknown;
        book_new: () => unknown;
        book_append_sheet: (workbook: unknown, sheet: unknown, name: string) => void;
      };
      writeFile: (workbook: unknown, filename: string) => void;
    };
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前浏览器不支持本地选品存储。"));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地选品存储打开失败。"));
  });
}

function readAll(database: IDBDatabase) {
  return new Promise<ProductRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as ProductRecord[]);
    request.onerror = () => reject(request.error || new Error("读取本地选品记录失败。"));
  });
}

function saveOne(database: IDBDatabase, record: ProductRecord) {
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("保存选品记录失败。"));
  });
}

function deleteOne(database: IDBDatabase, id: string) {
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("删除选品记录失败。"));
  });
}

function clearAll(database: IDBDatabase) {
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("清空选品记录失败。"));
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeId(value: unknown, url: string) {
  const productId = text(value);
  if (productId) return productId;
  try {
    return new URL(url).href.replace(/[?#].*$/, "").replace(/\/$/, "");
  } catch {
    return "capture-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }
}

function normalizeRecord(input: CapturedProduct): ProductRecord {
  const url = text(input.url);
  return {
    id: normalizeId(input.productId, url),
    source: "ozon",
    productId: text(input.productId),
    url,
    title: text(input.title),
    imageUrls: Array.isArray(input.imageUrls) ? input.imageUrls.map(text).filter(Boolean).slice(0, 20) : [],
    priceText: text(input.priceText),
    priceValue: numberOrNull(input.priceValue),
    currency: text(input.currency),
    sellerName: text(input.sellerName),
    sellerUrl: text(input.sellerUrl),
    brandName: text(input.brandName),
    ratingText: text(input.ratingText),
    ratingValue: numberOrNull(input.ratingValue),
    reviewCount: numberOrNull(input.reviewCount),
    salesText: text(input.salesText),
    stockText: text(input.stockText),
    category: text(input.category),
    variantsText: text(input.variantsText),
    description: text(input.description).slice(0, 3000),
    capturedAt: Number(input.capturedAt) || Date.now(),
    status: text(input.status) || "success",
    note: text(input.note),
    tags: text(input.tags)
  };
}

function readCaptureFromUrl() {
  const encoded = window.location.hash.startsWith("#capture=") ? window.location.hash.slice("#capture=".length) : "";
  if (!encoded) return null;
  try {
    return JSON.parse(encoded) as CapturedProduct;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(encoded)) as CapturedProduct;
    } catch {
      return null;
    }
  }
}

function ensureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise<NonNullable<Window["XLSX"]>>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/sales-report/vendor/xlsx.full.min.js";
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("Excel 导出组件未加载。"));
    script.onerror = () => reject(new Error("Excel 导出组件加载失败。"));
    document.head.appendChild(script);
  });
}

function exportRows(records: ProductRecord[]) {
  return records.map(record => ({
    来源平台: "Ozon",
    商品ID: record.productId,
    商品链接: record.url,
    商品标题: record.title,
    主图链接: record.imageUrls[0] || "",
    其他图片链接: record.imageUrls.slice(1).join("\n"),
    页面价格: record.priceText,
    解析价格: record.priceValue ?? "",
    币种: record.currency,
    卖家名称: record.sellerName,
    卖家链接: record.sellerUrl,
    品牌: record.brandName,
    评分: record.ratingText,
    评价数: record.reviewCount ?? "",
    销量: record.salesText,
    库存或状态: record.stockText,
    类目: record.category,
    规格: record.variantsText,
    描述摘要: record.description,
    采集时间: new Date(record.capturedAt).toLocaleString("zh-CN"),
    采集状态: record.status,
    备注: record.note,
    标签: record.tags
  }));
}

export default function ProductCaptureWorkspace() {
  const [database, setDatabase] = useState<IDBDatabase | null>(null);
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("正在读取浏览器本地选品记录…");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [captureCategories, setCaptureCategories] = useState<CaptureCategory[]>([]);
  const [captureLimits, setCaptureLimits] = useState<Record<string, number>>({});
  const [captureJob, setCaptureJob] = useState<BackgroundCaptureJob | null>(null);
  const importingQueue = useRef(false);
  const captureStartTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const opened = await openDatabase();
        const existing = await readAll(opened);
        if (!active) return;
        setDatabase(opened);
        setRecords(existing.sort((left, right) => right.capturedAt - left.capturedAt));
        const capture = readCaptureFromUrl();
        if (capture) {
          const incoming = normalizeRecord(capture);
          const previous = existing.find(record => record.id === incoming.id);
          const merged = { ...incoming, note: previous?.note || incoming.note, tags: previous?.tags || incoming.tags };
          await saveOne(opened, merged);
          if (!active) return;
          setRecords(current => [merged, ...current.filter(record => record.id !== merged.id)].sort((left, right) => right.capturedAt - left.capturedAt));
          setNotice(previous ? "已更新同一商品的本地记录。" : "已接收新的 Ozon 商品记录，请检查后再导出。");
          window.history.replaceState({}, "", "/product-capture");
        } else {
          setNotice(existing.length ? "已加载 " + existing.length + " 条本地选品记录。" : "还没有本地选品记录，请从 Ozon 商品页点击采集。");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "本地选品记录读取失败。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function onCategoryMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "ozon-product-capture-extension" || event.data.type !== "CAPTURE_CATEGORIES") return;
      setCaptureCategories(Array.isArray(event.data.categories) ? event.data.categories : []);
    }
    window.addEventListener("message", onCategoryMessage);
    window.postMessage({ source: "ozon-product-capture-page", type: "GET_CAPTURE_CATEGORIES" }, "*");
    return () => window.removeEventListener("message", onCategoryMessage);
  }, []);

  useEffect(() => {
    if (!database) return;
    const activeDatabase = database;

    // The extension bridge delivers queued captures through window messages, keeping them out of server APIs.
    async function importExtensionRecords(rawRecords: unknown[]) {
      if (importingQueue.current || !rawRecords.length) return;
      importingQueue.current = true;
      try {
        const existing = await readAll(activeDatabase);
        const imported: ProductRecord[] = [];
        for (const rawRecord of rawRecords) {
          const incoming = normalizeRecord((rawRecord || {}) as CapturedProduct);
          const previous = existing.find(record => record.id === incoming.id);
          const merged = { ...incoming, note: previous?.note || incoming.note, tags: previous?.tags || incoming.tags };
          await saveOne(activeDatabase, merged);
          imported.push(merged);
        }
        if (!imported.length) return;
        setRecords(current => {
          const mergedById = new Map(current.map(record => [record.id, record]));
          imported.forEach(record => mergedById.set(record.id, record));
          return [...mergedById.values()].sort((left, right) => right.capturedAt - left.capturedAt);
        });
        setNotice("已自动导入 " + imported.length + " 条 Ozon 商品记录。");
        window.postMessage({ source: "ozon-product-capture-page", type: "ACK", ids: imported.map(record => record.id) }, "*");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "自动导入选品记录失败。");
      } finally {
        importingQueue.current = false;
      }
    }

    function onExtensionMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "ozon-product-capture-extension" || event.data.type !== "QUEUE") return;
      void importExtensionRecords(Array.isArray(event.data.records) ? event.data.records : []);
    }

    window.addEventListener("message", onExtensionMessage);
    return () => window.removeEventListener("message", onExtensionMessage);
  }, [database]);

  useEffect(() => {
    function onExtensionCaptureMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "ozon-product-capture-extension") return;
      if (event.data.type === "BACKGROUND_CAPTURE_JOB") setCaptureJob(event.data.job || null);
      if (event.data.type === "START_CAPTURE_RESULT") {
        if (captureStartTimer.current) window.clearTimeout(captureStartTimer.current);
        captureStartTimer.current = null;
        if (event.data.response?.ok) setNotice("后台采集已启动，浏览器会自动读取 Ozon 列表。");
        else setError(event.data.response?.error || "后台采集启动失败。");
      }
      if (event.data.type === "STOP_CAPTURE_RESULT") {
        if (event.data.response?.ok) setNotice("后台采集已停止。");
        else setError(event.data.response?.error || "停止后台采集失败。");
      }
    }
    window.addEventListener("message", onExtensionCaptureMessage);
    return () => window.removeEventListener("message", onExtensionCaptureMessage);
  }, []);

  const filteredRecords = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter(record => [record.title, record.productId, record.sellerName, record.tags, record.note].some(value => value.toLowerCase().includes(keyword)));
  }, [query, records]);

  async function removeRecord(id: string) {
    if (!database || !window.confirm("确认删除这条本地选品记录吗？")) return;
    await deleteOne(database, id);
    setRecords(current => current.filter(record => record.id !== id));
    setSelectedIds(current => current.filter(selectedId => selectedId !== id));
    setNotice("已删除本地选品记录。");
  }

  async function removeSelected() {
    if (!database || !selectedIds.length || !window.confirm("确认删除选中的 " + selectedIds.length + " 条本地记录吗？")) return;
    await Promise.all(selectedIds.map(id => deleteOne(database, id)));
    setRecords(current => current.filter(record => !selectedIds.includes(record.id)));
    setSelectedIds([]);
    setNotice("已删除选中的本地选品记录。");
  }

  async function clearRecords() {
    if (!database || !records.length || !window.confirm("确认清空全部本地选品记录吗？导出的 Excel 文件不会受影响。")) return;
    await clearAll(database);
    setRecords([]);
    setSelectedIds([]);
    setNotice("已清空本地选品记录。");
  }

  async function exportSelected() {
    const target = selectedIds.length ? records.filter(record => selectedIds.includes(record.id)) : records;
    if (!target.length) return;
    try {
      const xlsx = await ensureXlsx();
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(exportRows(target)), "Ozon选品");
      xlsx.writeFile(workbook, "ozon-product-capture-" + new Date().toISOString().slice(0, 10) + ".xlsx");
      setNotice("已导出 " + target.length + " 条记录。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Excel 导出失败。");
    }
  }

  function updateMeta(id: string, field: "note" | "tags", value: string) {
    setRecords(current => current.map(record => record.id === id ? { ...record, [field]: value } : record));
  }

  async function saveMeta(record: ProductRecord) {
    if (!database) return;
    await saveOne(database, record);
    setNotice("备注和标签已保存到浏览器本地。");
  }

  function startBackgroundCapture() {
    const tasks = captureCategories
      .map(category => ({ category, maxItems: Math.min(Math.max(Number(captureLimits[category.value]) || 0, 0), 500) }))
      .filter(item => item.maxItems > 0)
      .map(({ category, maxItems }) => {
        const target = new URL(category.url || "https://www.ozon.ru/search/");
        if (!category.url) target.searchParams.set("text", category.value);
        return { label: category.label, url: target.toString(), maxItems };
      });
    if (!tasks.length) {
      setError("请先为至少一个分类填写采集数量。");
      return;
    }
    window.postMessage({ source: "ozon-product-capture-page", type: "START_CAPTURE", tasks }, "*");
    setError("");
    setNotice("正在请求插件打开后台采集任务…");
    if (captureStartTimer.current) window.clearTimeout(captureStartTimer.current);
    captureStartTimer.current = window.setTimeout(() => {
      setError("插件没有回应。请确认已安装并启用最新版插件，然后刷新此页面。");
    }, 5000);
  }

  function stopBackgroundCapture() {
    window.postMessage({ source: "ozon-product-capture-page", type: "STOP_CAPTURE" }, "*");
  }

  const allVisibleSelected = filteredRecords.length > 0 && filteredRecords.every(record => selectedIds.includes(record.id));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>OZON PRODUCT CAPTURE</p><h1>选品采集</h1><p className={styles.subtitle}>只保存在当前浏览器，可随时导出 Excel，不写入 Neon。</p></div>
        <nav className={styles.nav} aria-label="页面导航"><a className={styles.download} href="/downloads/ozon-product-capture-extension.zip" download>下载浏览器插件</a><a href="/product-capture/guide">插件使用文档</a><a href="/">返回 Ozon 工作台</a><a href="/sales-report">销售报告</a></nav>
      </header>
      <section className={styles.toolbar}>
        <div><strong>{records.length}</strong><span> 条本地记录</span></div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、商品 ID、卖家、标签或备注" aria-label="搜索选品记录" />
        <button type="button" onClick={exportSelected} disabled={!records.length}>{selectedIds.length ? "导出选中 (" + selectedIds.length + ")" : "导出全部 Excel"}</button>
        <button type="button" className={styles.secondary} onClick={removeSelected} disabled={!selectedIds.length}>删除选中</button>
        <button type="button" className={styles.secondary} onClick={clearRecords} disabled={!records.length}>清空本地记录</button>
      </section>
      <section className={styles.capturePanel} aria-label="后台自动采集">
        <div className={styles.captureIntro}><strong>按分类后台采集</strong><span>为要采集的分类填写数量，插件会自动逐个切换分类并滚动采集。</span></div>
        <div className={styles.categoryTasks}>
          {captureCategories.length ? captureCategories.map(category => (
            <label key={category.value} className={styles.categoryTask}>
              <span>{category.label}</span>
              <input type="number" min={0} max={500} value={captureLimits[category.value] || ""} onChange={event => setCaptureLimits(current => ({ ...current, [category.value]: Number(event.target.value) }))} placeholder="采集件数" aria-label={category.label + "采集件数"} />
            </label>
          )) : <p className={styles.captureHint}>请先在插件侧栏打开 Ozon 页面读取分类，或刷新已安装的新版插件。</p>}
        </div>
        <button type="button" onClick={startBackgroundCapture} disabled={captureJob?.status === "running"}>开始采集</button>
        <button type="button" className={styles.secondary} onClick={stopBackgroundCapture} disabled={!captureJob || !["starting", "running"].includes(captureJob.status)}>停止</button>
        <span className={styles.captureStatus}>{captureJob?.status === "running" ? `正在采集 ${captureJob.category || ""}：${captureJob.capturedCount} / ${captureJob.maxItems}` : captureJob?.status === "completed" ? "全部分类采集完成" : captureJob?.status === "stopped" ? `已停止，当前分类已采集 ${captureJob.capturedCount} 件` : "等待开始"}</span>
      </section>
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.empty}>正在读取本地记录…</p> : filteredRecords.length ? (
        <section className={styles.tableCard} aria-label="本地选品记录">
          <div className={styles.tableWrap}><table><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={event => setSelectedIds(event.target.checked ? filteredRecords.map(record => record.id) : [])} aria-label="全选当前记录" /></th><th>商品</th><th>价格</th><th>卖家</th><th>采集时间</th><th>备注 / 标签</th><th>操作</th></tr></thead><tbody>{filteredRecords.map(record => (
            <tr key={record.id}>
              <td><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))} aria-label={"选择 " + (record.title || record.productId || "商品")} /></td>
              <td><div className={styles.productCell}>{record.imageUrls[0] ? <img src={record.imageUrls[0]} alt="" loading="lazy" /> : <span className={styles.imagePlaceholder}>无图</span>}<div><strong>{record.title || "未读取到标题"}</strong><small>{record.productId || "没有商品 ID"}</small><a href={record.url} target="_blank" rel="noreferrer">打开 Ozon 商品页 ↗</a></div></div></td>
              <td>{record.priceText || "—"}<small>{record.currency || "币种未返回"}</small></td>
              <td>{record.sellerName || "—"}<small>{record.brandName || record.ratingText || record.salesText || "暂无品牌、评分或销量"}</small></td>
              <td>{new Date(record.capturedAt).toLocaleString("zh-CN")}<small>{record.status}</small></td>
              <td><input value={record.note} onChange={event => updateMeta(record.id, "note", event.target.value)} placeholder="备注" aria-label="商品备注" /><input value={record.tags} onChange={event => updateMeta(record.id, "tags", event.target.value)} placeholder="标签，例如：高毛利" aria-label="商品标签" /></td>
              <td><button type="button" className={styles.smallButton} onClick={() => void saveMeta(record)}>保存</button><button type="button" className={styles.dangerButton} onClick={() => void removeRecord(record.id)}>删除</button></td>
            </tr>
          ))}</tbody></table></div>
        </section>
      ) : <section className={styles.empty}><strong>{query ? "没有匹配的记录" : "还没有选品记录"}</strong><p>{query ? "换一个关键词试试。" : "请先在 Ozon 商品详情页安装并点击浏览器插件的采集按钮。"}</p></section>}
      <p className={styles.footer}>本页面只使用浏览器本地 IndexedDB。清除网站数据或更换浏览器后，本地记录可能消失，请及时导出 Excel 备份。</p>
    </main>
  );
}
