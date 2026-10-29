const $ = selector => document.querySelector(selector);
const AUTO_REFRESH_STORAGE_KEY = 'ozon-dashboard-auto-refresh-v2';
const DEFAULT_AUTO_REFRESH_INTERVAL = 1800000;
const autoRefreshStorage = (() => {
  try {
    const current = JSON.parse(localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) || 'null');
    if (current) return current;
    const previous = JSON.parse(localStorage.getItem('ozon-dashboard-auto-refresh') || '{}');
    return { enabled: previous.enabled };
  } catch { return {}; }
})();
const storedRefreshInterval = Number(autoRefreshStorage.interval);
const STORE_SELECTION_STORAGE_KEY = 'ozon-dashboard-shop-id';
const STORE_RETURN_VIEW_KEY = 'ozon-dashboard-return-view';
const BALANCE_ALERT_THRESHOLD_CNY = 6500;
const state = { shops: [], activeShopId: '', shopSwitchPending: false, products: [], analytics: null, configured: false, keyHint: '', orders: null, ordersRefreshError: '', balance: null, balanceRefreshError: '', orderCategory: 'all', orderChannel: 'all', pickup: null, pickupRefreshError: '', pickupChannel: 'all', pickupSelection: new Set(), domesticExpressConfig: null, domesticExpressResult: null, inventorySelection: new Set(), inventoryWarehouses: [], warehouseStats: [], stockWarehouseId: 'all', whdStockOnly: false, awaitingWHDWarehouseSelection: false, productSelectAllWasIndeterminate: false, offerIdSort: 'none', stockFilter: 'all', productPage: 1, pricingPromotion: null, pricingPromotionRefreshError: '', pricingPromotionFilter: 'all', pricingPromotionSelection: new Set(), pricingPromotionOfferIdSort: 'none', pricingPromotionPage: 1, productProfit: null, productProfitRefreshError: '', productProfitFilter: 'all', productProfitOfferIdSort: 'none', productProfitPage: 1, sourcingConfig: null, richContentLoadedProductId: '', richContentSelectedProductId: '', currentView: 'products', autoRefreshEnabled: autoRefreshStorage.enabled !== false, autoRefreshInterval: [300000, 600000, 1800000].includes(storedRefreshInterval) ? storedRefreshInterval : DEFAULT_AUTO_REFRESH_INTERVAL, autoRefreshTimer: null, autoRefreshNextAt: null, autoRefreshBusy: false };
state.balanceAlertNotifiedShops = new Set();
const orderActionBusy = new Set();
let orderSplitDraft = null;

const PICKUP_MESSAGE_PRESETS = [
  { id: 'ru-standard', message: 'Здравствуйте! Ваш заказ {order_number} уже прибыл в пункт выдачи Ozon. Пожалуйста, заберите его в удобное время. Спасибо!' },
  { id: 'ru-friendly', message: 'Рады сообщить: ваш заказ {order_number} уже ждёт вас в пункте выдачи Ozon. Будем благодарны, если вы заберёте его в ближайшее время!' },
  { id: 'ru-short', message: 'Здравствуйте! Заказ {order_number} уже ждёт вас в пункте выдачи Ozon. Пожалуйста, заберите его. Спасибо!' },
  { id: 'zh-standard', message: '您好！您的订单 {order_number} 已送达 Ozon 自提点，请您及时前往取货。谢谢！' }
];
const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const cny = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const MAX_INVENTORY_BATCH_SIZE = 100;
const PRODUCT_PAGE_SIZE = 100;

function autoRefreshIntervalLabel() {
  if (state.autoRefreshInterval === 1800000) return '30 分钟';
  return state.autoRefreshInterval === 600000 ? '10 分钟' : '5 分钟';
}

function renderAutoRefreshControls() {
  const select = $('#autoRefreshInterval');
  const toggle = $('#autoRefreshToggle');
  const status = $('#autoRefreshStatus');
  if (!select || !toggle || !status) return;
  select.value = String(state.autoRefreshInterval);
  toggle.textContent = state.autoRefreshEnabled ? '暂停' : '开启';
  toggle.setAttribute('aria-pressed', String(!state.autoRefreshEnabled));
  if (!state.autoRefreshEnabled) {
    status.textContent = '自动刷新：已暂停';
    return;
  }
  const next = state.autoRefreshNextAt ? new Date(state.autoRefreshNextAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '稍后';
  status.textContent = `自动刷新：${autoRefreshIntervalLabel()} · 下次 ${next}`;
}

function persistAutoRefreshSettings() {
  try {
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, JSON.stringify({ enabled: state.autoRefreshEnabled, interval: state.autoRefreshInterval }));
  } catch { /* 本地存储不可用时仍保持当前页面设置 */ }
}

function scheduleAutoRefresh(delay = state.autoRefreshInterval) {
  clearTimeout(state.autoRefreshTimer);
  state.autoRefreshTimer = null;
  if (!state.autoRefreshEnabled) {
    state.autoRefreshNextAt = null;
    renderAutoRefreshControls();
    return;
  }
  state.autoRefreshNextAt = Date.now() + delay;
  renderAutoRefreshControls();
  state.autoRefreshTimer = setTimeout(async () => {
    state.autoRefreshTimer = null;
    state.autoRefreshNextAt = null;
    renderAutoRefreshControls();
    await refreshActiveView(true);
    if (state.autoRefreshEnabled) scheduleAutoRefresh();
  }, delay);
}

async function refreshActiveView(silent = false) {
  if (!state.configured || state.autoRefreshBusy) return;
  const loaders = { products: refreshDashboard, 'pricing-promotions': loadPricingPromotions, 'product-profit': loadProductProfit, orders: loadOrders, pickup: loadPickup };
  const loader = loaders[state.currentView];
  if (!loader) return;
  state.autoRefreshBusy = true;
  try { await loader({ silent }); }
  finally {
    if (state.currentView !== 'orders') await loadBalance({ silent: true });
    state.autoRefreshBusy = false;
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.activeShopId ? { 'X-Ozon-Shop-Id': state.activeShopId } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2800);
}

function setConnected(config) {
  state.configured = config.configured;
  state.keyHint = config.keyHint || '';
  $('#statusDot').classList.toggle('online', config.configured);
  $('#connectionTitle').textContent = config.configured ? 'API 已配置' : '尚未连接';
  $('#connectionDetail').textContent = config.configured ? `ID ${config.clientId} · Key ${config.keyHint}` : '配置卖家 API';
}

async function loadConfig() {
  const config = await api('/api/config');
  setConnected(config);
  return config;
}

function renderShopSelector() {
  const selector = $('#shopSelector');
  if (!selector) return;
  selector.replaceChildren();
  if (!state.shops.length) {
    selector.add(new Option('添加店铺', ''));
    selector.disabled = true;
    return;
  }
  for (const shop of state.shops) selector.add(new Option(shop.name, shop.id));
  selector.value = state.activeShopId;
  selector.disabled = state.shops.length < 2 || state.shopSwitchPending;
}

function applyShopSnapshot(snapshot) {
  state.shops = Array.isArray(snapshot.shops) ? snapshot.shops : [];
  const savedShopId = localStorage.getItem(STORE_SELECTION_STORAGE_KEY) || '';
  state.activeShopId = state.shops.some(shop => shop.id === savedShopId)
    ? savedShopId
    : (state.shops.some(shop => shop.id === snapshot.activeShopId) ? snapshot.activeShopId : (state.shops[0]?.id || ''));
  if (state.activeShopId) localStorage.setItem(STORE_SELECTION_STORAGE_KEY, state.activeShopId);
  renderShopSelector();
}

async function initializeApp() {
  try {
    const shops = await api('/api/shops');
    applyShopSnapshot(shops);
    const config = await loadConfig();
    if (config.configured) {
      const returnView = sessionStorage.getItem(STORE_RETURN_VIEW_KEY) || '';
      sessionStorage.removeItem(STORE_RETURN_VIEW_KEY);
      const validViews = ['products', 'pricing-promotions', 'product-profit', 'orders', 'pickup', 'domestic-express', 'add', 'rich-content', 'sourcing'];
      if (validViews.includes(returnView)) showView(returnView);
      else {
        refreshDashboard();
        loadBalance({ silent: true });
      }
    }
  } catch (error) {
    toast(error.message);
  }
}

async function switchShop(shopId) {
  if (!shopId || shopId === state.activeShopId || state.shopSwitchPending) return;
  state.shopSwitchPending = true;
  renderShopSelector();
  try {
    await api('/api/shops/active', { method: 'POST', body: JSON.stringify({ shopId }) });
    state.activeShopId = shopId;
    localStorage.setItem(STORE_SELECTION_STORAGE_KEY, shopId);
    sessionStorage.setItem(STORE_RETURN_VIEW_KEY, state.currentView);
    window.location.reload();
  } catch (error) {
    toast(error.message);
    renderShopSelector();
  } finally {
    state.shopSwitchPending = false;
    renderShopSelector();
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function priceLabel(price) {
  if (!price || price.price === '' || price.price === null || price.price === undefined || !Number.isFinite(Number(price.price))) return '—';
  const currency = String(price.currency || 'RUB').toUpperCase();
  const formatter = currency === 'CNY' ? cny : rub;
  return `${formatter.format(Number(price.price))} ${escapeHtml(currency)}`;
}

function selectedStockWarehouse() {
  if (state.stockWarehouseId === 'all') return null;
  return stockFilterWarehouses().find(item => String(item.warehouseId) === String(state.stockWarehouseId)) || null;
}

function selectedStockWarehouseLabel() {
  return selectedStockWarehouse()?.name || '全部仓库';
}

function stockFilterWarehouses() {
  const warehouses = new Map();
  const add = item => {
    const warehouseId = String(item?.warehouseId ?? '').trim();
    if (!/^\d+$/.test(warehouseId) || Number(warehouseId) <= 0) return;
    const current = warehouses.get(warehouseId) || { warehouseId, name: '', warehouseName: '', type: '' };
    current.name ||= String(item.name || item.warehouseName || '').trim();
    current.warehouseName ||= String(item.warehouseName || item.name || '').trim();
    current.type ||= String(item.type || '').trim();
    warehouses.set(warehouseId, current);
  };
  state.inventoryWarehouses.forEach(add);
  state.warehouseStats.forEach(item => add({ warehouseId: item.warehouseId, name: item.warehouseName }));
  // Product stock rows can contain internal warehouse IDs without a display name.
  // Keep those rows for stock calculations, but do not expose them as filter options.
  return [...warehouses.values()].filter(item => {
    const label = String(item.name || item.warehouseName || '').trim();
    const descriptor = [item.name, item.warehouseName, item.type].filter(Boolean).join(' ');
    return label && !/^仓库\s+\d+$/.test(label) && !/\bwhd\b/i.test(descriptor);
  });
}

function productStock(product) {
  const stock = product.stock;
  if (!stock) return { value: null, reserved: 0, exact: false, available: false };
  if (state.stockWarehouseId === 'all') {
    return { value: Number.isFinite(Number(stock.total)) ? Number(stock.total) : null, reserved: Number(stock.reserved || 0), exact: true, available: true };
  }
  const row = (stock.rows || []).find(item => String(item.warehouseId) === String(state.stockWarehouseId));
  if (!row) return { value: null, reserved: 0, exact: false, available: false };
  const rawValue = row.exact && row.present !== null && row.present !== undefined
    ? Number(row.present)
    : row.currentTotal;
  const value = rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);
  return { value: Number.isFinite(value) ? value : null, reserved: Number(row.reserved || 0), exact: row.exact === true, available: true };
}

function stockValueLabel(product) {
  const current = productStock(product);
  if (current.value === null) return '—';
  return `${rub.format(current.value)} 件${current.reserved ? ` · 预留 ${rub.format(current.reserved)}` : ''}`;
}

function whdStockLabel(product) {
  if (!product?.whdStockKnown || product.whdStock === null || product.whdStock === undefined) return '—';
  const value = Number(product.whdStock);
  if (!Number.isFinite(value)) return '—';
  const reserved = Number(product.whdStockReserved || 0);
  return `${rub.format(value)} 件${reserved ? ` · 预留 ${rub.format(reserved)}` : ''}`;
}

function whdSalesLabel(product) {
  if (!product?.whdSalesKnown) return '—';
  return Number(product.whdSales) === 1 ? '1' : '0';
}

function hasWHDStockData() {
  return state.products.some(product => product.whdStockKnown === true);
}

function hasWHDStock(product) {
  return product?.whdStockKnown === true && Number.isFinite(Number(product.whdStock)) && Number(product.whdStock) > 0;
}

function updateStockWarehouseControl() {
  const select = $('#stockWarehouseFilter');
  if (!select) return;
  const warehouses = stockFilterWarehouses();
  const validIds = new Set(warehouses.map(item => String(item.warehouseId)));
  if (state.stockWarehouseId !== 'all' && !validIds.has(String(state.stockWarehouseId))) state.stockWarehouseId = 'all';
  select.innerHTML = '<option value="all">全部仓库</option>' + warehouses
    .map(item => `<option value="${escapeHtml(item.warehouseId)}">${escapeHtml(item.name || `仓库 ${item.warehouseId}`)}</option>`)
    .join('');
  select.value = state.stockWarehouseId;
  select.disabled = warehouses.length === 0;
  select.title = warehouses.length ? '切换商品列表显示的库存仓库' : '尚未读取可用仓库';
  const label = $('#stockWarehouseLabel');
  if (label) label.textContent = `库存仓库：${selectedStockWarehouseLabel()}`;
  const whdButton = $('#whdStockFilter');
  if (whdButton) {
    const active = state.whdStockOnly;
    whdButton.disabled = state.products.length === 0;
    whdButton.setAttribute('aria-pressed', String(active));
    whdButton.classList.toggle('active', active);
    whdButton.classList.remove('awaiting');
    whdButton.textContent = 'WHD 有库存';
    whdButton.title = hasWHDStockData()
      ? (active ? '关闭 WHD 有库存筛选' : '仅显示明确返回 WHD 库存且库存大于 0 的商品')
      : '当前同步数据没有 WHD 库存字段；点击查看原因。普通 FBO/FBS 库存不会作为 WHD 库存';
  }
}

function updateStockMetrics() {
  const values = state.products.map(productStock);
  const stockUnits = values.reduce((sum, current) => sum + (current.value ?? 0), 0);
  const lowStock = state.products.filter((product, index) => !product.archived && values[index].value !== null && values[index].value <= 5).length;
  $('#totalStock').textContent = rub.format(stockUnits);
  $('#lowStock').textContent = rub.format(lowStock);
  const note = $('#totalStockNote');
  if (note) note.textContent = state.stockWarehouseId === 'all' ? '各仓库存数量合计' : `${selectedStockWarehouseLabel()}库存数量`;
}

function renderWarehouseStats() {
  const container = $('#warehouseStats');
  if (!container) return;
  const visibleWarehouses = state.warehouseStats.filter(warehouse => !/\bwhd\b/i.test(
    `${warehouse.warehouseName || ''} ${warehouse.type || ''}`
  ));
  if (!visibleWarehouses.length) {
    container.innerHTML = '<div class="empty-state">暂无仓库库存统计，请刷新数据。</div>';
    return;
  }

  container.innerHTML = visibleWarehouses.map(warehouse => {
    const active = String(state.stockWarehouseId) === String(warehouse.warehouseId);
    return `<button class="warehouse-summary-card${active ? ' active' : ''}" type="button" data-warehouse-id="${escapeHtml(warehouse.warehouseId)}" aria-pressed="${active}" aria-label="查看${escapeHtml(warehouse.warehouseName)}的库存商品"><span class="warehouse-summary-name" title="${escapeHtml(warehouse.warehouseName)}">${escapeHtml(warehouse.warehouseName)}</span><strong>${rub.format(Number(warehouse.stockUnits || 0))} 件</strong><span>有库存商品 ${rub.format(Number(warehouse.productCount || 0))} 个</span><small>库存记录 ${rub.format(Number(warehouse.listedProductCount || 0))} 个 · 预留 ${rub.format(Number(warehouse.reservedUnits || 0))} 件</small></button>`;
  }).join('');
}

function productSearchTerms(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[\s,，;；]+/)
    .map(term => term.trim())
    .filter(Boolean);
}

function filteredProducts() {
  const terms = productSearchTerms($('#searchInput').value);
  const filter = $('#statusFilter').value;
  const products = state.products.filter(product => {
    const searchable = `${product.name} ${product.offerId} ${product.productId}`.toLowerCase();
    const searchableIds = `${product.offerId} ${product.productId}`.toLowerCase();
    const matchesText = !terms.length
      || (terms.length === 1
        ? searchable.includes(terms[0])
        : terms.some(term => searchableIds.includes(term)));
    const matchesStatus = filter === 'all' || (filter === 'archived' ? product.archived : !product.archived);
    const currentStock = productStock(product);
    const matchesStock = state.stockFilter !== 'low' || (currentStock.value !== null && currentStock.value <= 5 && !product.archived);
    const matchesWarehouseStock = state.stockWarehouseId === 'all' || (currentStock.value !== null && currentStock.value > 0);
    const matchesWHDStock = !state.whdStockOnly || hasWHDStock(product);
    return matchesText && matchesStatus && matchesStock && matchesWarehouseStock && matchesWHDStock;
  });
  if (state.offerIdSort === 'none') return products;
  const direction = state.offerIdSort === 'asc' ? 1 : -1;
  return products.sort((left, right) => {
    const leftOfferId = String(left.offerId ?? '').trim();
    const rightOfferId = String(right.offerId ?? '').trim();
    if (!leftOfferId || !rightOfferId) return leftOfferId ? -1 : rightOfferId ? 1 : 0;
    return leftOfferId.localeCompare(rightOfferId, undefined, { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function currentProductPageRows(rows = filteredProducts()) {
  const pageCount = Math.max(Math.ceil(rows.length / PRODUCT_PAGE_SIZE), 1);
  state.productPage = Math.min(Math.max(state.productPage, 1), pageCount);
  const start = (state.productPage - 1) * PRODUCT_PAGE_SIZE;
  return rows.slice(start, start + PRODUCT_PAGE_SIZE);
}

function renderProductPagination(totalRows) {
  const pageCount = Math.max(Math.ceil(totalRows / PRODUCT_PAGE_SIZE), 1);
  state.productPage = Math.min(Math.max(state.productPage, 1), pageCount);
  const first = $('#productPageFirst');
  const previous = $('#productPagePrevious');
  const next = $('#productPageNext');
  const last = $('#productPageLast');
  const input = $('#productPageInput');
  const total = $('#productPageTotal');
  if (!first || !previous || !next || !last || !input || !total) return;
  first.disabled = state.productPage <= 1;
  previous.disabled = state.productPage <= 1;
  next.disabled = state.productPage >= pageCount;
  last.disabled = state.productPage >= pageCount;
  input.value = String(state.productPage);
  input.max = String(pageCount);
  total.textContent = String(pageCount);
}

function goToProductPage(value) {
  const totalRows = filteredProducts().length;
  const pageCount = Math.max(Math.ceil(totalRows / PRODUCT_PAGE_SIZE), 1);
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    toast(`请输入 1 至 ${pageCount} 之间的页码`);
    renderProductPagination(totalRows);
    return;
  }
  state.productPage = page;
  renderProducts();
}

function updateStockFilterControl() {
  const button = $('#lowStockFilter');
  if (!button) return;
  const active = state.stockFilter === 'low';
  button.classList.toggle('hidden', !active);
  button.setAttribute('aria-pressed', String(active));
}

function updateOfferIdSortControl() {
  const column = $('#offerIdSortColumn');
  const button = $('#sortOfferId');
  const indicator = $('#offerIdSortIndicator');
  if (!column || !button || !indicator) return;
  const direction = state.offerIdSort;
  const label = direction === 'asc' ? '升序' : direction === 'desc' ? '降序' : '未排序';
  column.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
  button.setAttribute('aria-label', `按货号 / Offer ID 排序，当前${label}；点击切换`);
  indicator.textContent = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
}

function inventoryRows(product) {
  const stockRows = Array.isArray(product.stock?.rows)
    ? product.stock.rows.filter(row => Number(row.warehouseId) > 0)
    : [];
  const writableWarehouses = state.inventoryWarehouses.filter(warehouse => Number(warehouse.warehouseId) > 0);
  if (!writableWarehouses.length) return stockRows;

  // Ozon may return a stock row only for warehouses that already have a record.
  // Merge those rows with every writable warehouse so a new/empty warehouse is
  // still available in the batch-update selector.
  const stockByWarehouse = new Map(stockRows.map(row => [String(row.warehouseId), row]));
  return writableWarehouses.map(warehouse => {
    const row = stockByWarehouse.get(String(warehouse.warehouseId));
    return row
      ? { ...row, warehouseId: warehouse.warehouseId, warehouseName: warehouse.name || row.warehouseName || `仓库 ${warehouse.warehouseId}` }
      : {
          warehouseId: warehouse.warehouseId,
          warehouseName: warehouse.name || `仓库 ${warehouse.warehouseId}`,
          present: null,
          currentTotal: null,
          exact: false,
          reserved: Number(product.stock?.reserved || 0),
          sku: ''
        };
  });
}

function canUpdateInventory(product) {
  return inventoryRows(product).length > 0;
}

function exactTransferStock(product, warehouseId) {
  const row = (product.stock?.rows || []).find(item => String(item.warehouseId) === String(warehouseId));
  if (!row || row.exact !== true || row.present === null || row.present === undefined) return null;
  const value = Number(row.present);
  return Number.isFinite(value) ? value : null;
}

function transferTargetStock(product, warehouseId) {
  const current = exactTransferStock(product, warehouseId);
  if (current !== null) return { value: current, known: true };
  const hasAnyExactStock = (product.stock?.rows || []).some(row => row.exact === true && row.present !== null && row.present !== undefined);
  return { value: hasAnyExactStock ? 0 : null, known: hasAnyExactStock };
}

function inventoryAvailabilityMessage() {
  if (!state.inventoryWarehouses.length) return 'Ozon 未返回可写入的启用仓库，请先在 Ozon 后台检查仓库状态。';
  const names = state.inventoryWarehouses.map(item => item.name || `仓库 ${item.warehouseId}`).join('、');
  return `已识别 ${state.inventoryWarehouses.length} 个可写入仓库：${names}。`;
}

function updateInventoryControls(rows = currentProductPageRows()) {
  const selectedProducts = state.products.filter(product => state.inventorySelection.has(product.productId) && canUpdateInventory(product));
  const updateButton = $('#openInventoryBatch');
  const transferButton = $('#openInventoryTransfer');
  const priceButton = $('#openPriceBatch');
  const selectAll = $('#productSelectAll');
  if (updateButton) {
    updateButton.disabled = selectedProducts.length === 0;
    updateButton.textContent = selectedProducts.length ? `批量改库存 · ${selectedProducts.length}` : '批量改库存';
  }
  if (transferButton) {
    transferButton.disabled = selectedProducts.length === 0 || state.inventoryWarehouses.length < 2;
    transferButton.textContent = selectedProducts.length ? `库存转移 · ${selectedProducts.length}` : '库存转移';
    transferButton.title = state.inventoryWarehouses.length < 2 ? '至少需要两个可写入仓库' : '将所选商品的库存从一个仓库转移到另一个仓库';
  }
  if (priceButton) {
    priceButton.disabled = selectedProducts.length === 0;
    priceButton.textContent = selectedProducts.length ? `批量改售价 · ${selectedProducts.length}` : '批量改售价';
    priceButton.title = selectedProducts.length ? '修改所选商品的 Ozon 售价' : '请先选择商品';
  }
  if (selectAll) {
    const selectable = rows.filter(canUpdateInventory);
    selectAll.checked = selectable.length > 0 && selectable.every(product => state.inventorySelection.has(product.productId));
    const selectedOnPage = selectable.filter(product => state.inventorySelection.has(product.productId));
    const indeterminate = selectedOnPage.length > 0 && !selectAll.checked;
    selectAll.indeterminate = indeterminate;
    state.productSelectAllWasIndeterminate = indeterminate;
    selectAll.disabled = selectable.length === 0;
  }
}

function ensureProductAnalyticsColumn() {
  const headerRow = $('#productsTable')?.closest('table')?.querySelector('thead tr');
  if (!headerRow || headerRow.querySelector('[data-product-analytics-header]')) return;
  const header = document.createElement('th');
  header.dataset.productAnalyticsHeader = 'true';
  header.textContent = '展示总数';
  header.title = 'Ozon 销售分析，近 7 天';
  headerRow.insertBefore(header, headerRow.lastElementChild);
}

function renderProducts() {
  ensureProductAnalyticsColumn();
  updateOfferIdSortControl();
  renderRichContentProductOptions();
  updateStockFilterControl();
  updateStockWarehouseControl();
  renderWarehouseStats();
  updateStockMetrics();
  const rows = filteredProducts();
  const pageRows = currentProductPageRows(rows);
  const matchedAnalyticsProducts = rows.filter(product => product.displayCount !== null && product.displayCount !== undefined && Number.isFinite(Number(product.displayCount)));
  const displayCountTotal = matchedAnalyticsProducts.length
    ? matchedAnalyticsProducts.reduce((sum, product) => sum + Number(product.displayCount), 0)
    : null;
  $('#displayCountTotal').textContent = displayCountTotal === null ? '—' : rub.format(displayCountTotal);
  const analyticsPeriod = state.analytics?.dateFrom && state.analytics?.dateTo
    ? `${state.analytics.dateFrom} 至 ${state.analytics.dateTo}`
    : '近 7 天';
  const analyticsSource = state.analytics?.stale ? ' · 使用上次成功数据' : '';
  $('#displayCountNote').textContent = `${analyticsPeriod} · 已匹配 ${matchedAnalyticsProducts.length}/${rows.length} 个商品${analyticsSource}`;
  renderProductPagination(rows.length);
  $('#visibleProducts').textContent = rub.format(rows.length);
  const rangeStart = rows.length ? (state.productPage - 1) * PRODUCT_PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(state.productPage * PRODUCT_PAGE_SIZE, rows.length);
  const activeProductFilters = [state.whdStockOnly ? 'WHD 商品' : '', state.stockFilter === 'low' ? '低库存' : ''].filter(Boolean);
  $('#productCountLabel').textContent = `显示第 ${rangeStart}-${rangeEnd} / ${rows.length} 个商品${activeProductFilters.length ? ` · ${activeProductFilters.join(' · ')}` : ''}`;
  if (!rows.length) {
    $('#productsTable').innerHTML = `<tr><td colspan="8" class="empty-state">${state.products.length ? '没有找到匹配的商品。' : '尚无商品数据，请先刷新数据。'}</td></tr>`;
    updateInventoryControls(pageRows);
    return;
  }
  $('#productsTable').innerHTML = pageRows.map(product => {
    const currentStock = productStock(product);
    const stockText = stockValueLabel(product);
    const stockClass = currentStock.value !== null && currentStock.value <= 5 && !product.archived ? ' low' : '';
    const selectable = canUpdateInventory(product);
    const title = selectable ? `选择商品进行批量库存更新（当前显示：${selectedStockWarehouseLabel()}）` : 'Ozon 未返回可写入的仓库信息';
    const productVisual = product.image
      ? `<span class="product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-product-image></span>`
      : '<span class="product-media product-media-placeholder" aria-label="暂无商品图片">无图</span>';
    const displayCount = product.displayCount === null || product.displayCount === undefined
      ? '—'
      : rub.format(Number(product.displayCount));
    return `<tr><td class="select-column"><input class="product-select" type="checkbox" value="${escapeHtml(product.productId)}" ${state.inventorySelection.has(product.productId) ? 'checked' : ''} ${selectable ? '' : 'disabled'} aria-label="选择 ${escapeHtml(product.name)}" title="${title}"></td><td><div class="product-cell">${productVisual}<span class="product-copy"><span class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span><span class="product-sub">${product.status ? escapeHtml(product.status) : 'Ozon 商品'}</span></span></div></td><td class="offer-id">${escapeHtml(product.offerId || '—')}</td><td><span class="status-pill ${product.archived ? 'archived' : 'live'}">${product.archived ? '已归档' : '未归档'}</span></td><td><span class="stock-value${stockClass}">${stockText}</span></td><td><span class="price-value">${priceLabel(product.pricing)}</span></td><td class="analytics-count">${displayCount}</td><td class="offer-id">${escapeHtml(product.productId || '—')}</td></tr>`;
  }).join('');
  updateInventoryControls(pageRows);
}

function openInventoryModal() {
  const selected = state.products.filter(product => state.inventorySelection.has(product.productId) && canUpdateInventory(product));
  if (!selected.length) return toast('请先选择至少一个商品');
  $('#inventorySelectionLabel').textContent = `已选择 ${selected.length} 个商品`;
  $('#inventoryMessage').textContent = '';
  $('#inventoryMessage').className = 'modal-message';
  $('#inventoryCommonWarehouse').innerHTML = '<option value="">选择仓库</option>' + state.inventoryWarehouses
    .filter(warehouse => Number(warehouse.warehouseId) > 0)
    .map(warehouse => `<option value="${escapeHtml(warehouse.warehouseId)}">${escapeHtml(warehouse.name || `仓库 ${warehouse.warehouseId}`)}</option>`)
    .join('');
  $('#inventoryCommonWarehouse').value = '';
  $('#inventoryCommonStock').value = '';
  $('#inventoryList').innerHTML = selected.map(product => {
    const rows = inventoryRows(product);
    const preferredRow = state.stockWarehouseId !== 'all'
      ? rows.find(row => String(row.warehouseId) === String(state.stockWarehouseId))
      : rows.find(row => row.exact) || rows[0];
    const first = preferredRow || rows[0];
    const options = rows.map(row => {
      const current = row.exact
        ? `当前 ${rub.format(row.present)} 件`
        : row.currentTotal === null || row.currentTotal === undefined
          ? '当前库存未知，请确认'
          : `当前总量 ${rub.format(row.currentTotal)} 件，请确认`;
      const selectedAttribute = first && String(first.warehouseId) === String(row.warehouseId) ? ' selected' : '';
      return `<option value="${escapeHtml(row.warehouseId)}" data-stock="${row.exact ? escapeHtml(row.present) : ''}"${selectedAttribute}>${escapeHtml(row.warehouseName || `仓库 ${row.warehouseId}`)} · ${current}</option>`;
    }).join('');
    const initialStock = first.exact ? first.present : '';
    return `<div class="inventory-item" data-product-id="${escapeHtml(product.productId)}"><div class="inventory-item-heading"><div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.offerId || product.productId)}</span></div><span class="offer-id">ID ${escapeHtml(product.productId)}</span></div><div class="inventory-item-fields"><label class="field"><span>仓库</span><select class="inventory-warehouse" aria-label="选择 ${escapeHtml(product.name)} 的仓库">${options}</select></label><label class="field"><span>新库存数量</span><input class="inventory-stock" type="number" min="0" max="1000000000" step="1" value="${escapeHtml(initialStock)}" placeholder="填写数量"></label></div></div>`;
  }).join('');
  $('#inventoryModal').classList.remove('hidden');
  $('#inventoryList .inventory-stock')?.focus();
}

async function submitInventory(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  // Other hidden dialogs (prices, promotions, transfer) also use the
  // .inventory-item class. Only collect rows belonging to this form.
  const rows = [...$('#inventoryList').querySelectorAll('.inventory-item')];
  const stocks = rows.map(row => {
    const product = state.products.find(item => item.productId === row.dataset.productId);
    return {
      productId: product?.productId,
      offerId: product?.offerId,
      warehouseId: row.querySelector('.inventory-warehouse')?.selectedOptions[0]?.value?.trim(),
      stock: row.querySelector('.inventory-stock')?.value?.trim()
    };
  });
  if (!stocks.length) {
    $('#inventoryMessage').textContent = '没有可提交的商品，请关闭窗口后重新选择商品。';
    return;
  }
  const invalidRows = rows.map((row, index) => {
    const item = stocks[index];
    const warehouseValid = /^\d+$/.test(String(item.warehouseId || '')) && Number(item.warehouseId) > 0;
    const stockValid = /^\d+$/.test(String(item.stock ?? '')) && Number.isSafeInteger(Number(item.stock)) && Number(item.stock) <= 1_000_000_000;
    if (warehouseValid && stockValid) return null;
    const field = !warehouseValid ? row.querySelector('.inventory-warehouse') : row.querySelector('.inventory-stock');
    return { row, field, offerId: item.offerId || item.productId || `第 ${index + 1} 项`, reason: !warehouseValid ? '未选仓库' : '库存须为 0 至 1,000,000,000 的整数' };
  }).filter(Boolean);
  rows.forEach(row => row.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid')));
  if (invalidRows.length) {
    const firstInvalid = invalidRows[0];
    invalidRows.forEach(item => item.field?.setAttribute('aria-invalid', 'true'));
    $('#inventoryMessage').textContent = `${invalidRows.length} 个商品的信息需要检查：${invalidRows.slice(0, 4).map(item => `${item.offerId}（${item.reason}）`).join('；')}${invalidRows.length > 4 ? '；…' : ''}。请修正后再提交。`;
    firstInvalid.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    firstInvalid.field?.focus({ preventScroll: true });
    return;
  }
  const confirmed = window.confirm(`即将更新 ${stocks.length} 个商品的 Ozon 库存。提交后会直接生效，确定继续吗？`);
  if (!confirmed) return;
  const button = $('#submitInventory');
  button.disabled = true;
  button.textContent = '更新中…';
  try {
    const result = await api('/api/inventory/batch', { method: 'POST', body: JSON.stringify({ stocks, confirm: true }) });
    const summary = result.summary || {};
    if (summary.failed) {
      $('#inventoryMessage').textContent = `已提交 ${summary.submitted || stocks.length} 条，其中成功 ${summary.success || 0} 条，失败 ${summary.failed} 条。请刷新数据核对。`;
      toast(`库存更新完成，${summary.failed} 条失败`);
    } else {
      $('#inventoryModal').classList.add('hidden');
      state.inventorySelection.clear();
      toast(`已更新 ${summary.success || stocks.length} 个商品的库存`);
      await refreshDashboard();
    }
  } catch (error) {
    $('#inventoryMessage').textContent = error.message;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '确认更新库存';
  }
}

function priceInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(value) : '';
}

function priceTextIsValid(value) {
  return /^\d+(?:\.\d{1,4})?$/.test(String(value).trim());
}

function selectedPriceProducts() {
  return state.products.filter(product => state.inventorySelection.has(product.productId) && product.productId && product.offerId);
}

function openPriceModal(productIds = null, { currentOnly = false } = {}) {
  const selected = productIds
    ? state.products.filter(product => productIds.has(String(product.productId)) && product.productId && product.offerId)
    : selectedPriceProducts();
  if (!selected.length) return toast('请先选择至少一个商品');
  $('#priceModal').dataset.currentOnly = String(currentOnly);
  $('#priceTitle').textContent = currentOnly ? '批量修改当前售价' : '批量修改售价';
  $('#priceIntro').textContent = currentOnly
    ? '只更新所选商品的当前售价，不修改划线价或促销价。可以统一设置后再逐个调整；提交后会直接写入 Ozon。'
    : '修改所选商品在 Ozon 的售价。可以统一填写后再逐个调整；提交后会直接写入 Ozon，请确认币种和价格无误。';
  $('#priceUpdateNote').textContent = currentOnly
    ? '此操作仅更新当前售价；划线价和促销价保持不变。每个商品按当前 Ozon 返回的币种提交。'
    : '售价必须大于 0；划线价留空表示保持原值，填 0 表示清除划线价，填入正数时必须高于售价。每个商品按当前 Ozon 返回的币种提交。';
  $('#priceOldQuickAction').classList.toggle('hidden', currentOnly);
  $('#submitPrice').textContent = currentOnly ? '确认修改当前售价' : '确认修改售价';
  $('#priceSelectionLabel').textContent = `已选择 ${selected.length} 个商品`;
  $('#priceMessage').textContent = '';
  $('#priceMessage').className = 'modal-message';
  $('#priceCommonPrice').value = '';
  $('#priceCommonOldPrice').value = '';
  $('#priceList').innerHTML = selected.map(product => {
    const currency = String(product.pricing?.currency || 'RUB').toUpperCase();
    const currentPrice = priceInputValue(product.pricing?.price);
    const currentOldPrice = priceInputValue(product.pricing?.oldPrice);
    const productVisual = product.image
      ? `<span class="product-media price-product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-price-image></span>`
      : '<span class="product-media product-media-placeholder price-product-media" aria-label="暂无商品图片">无图</span>';
    const oldPriceField = currentOnly ? '' : `<label class="field"><span>划线价（可选，0=清除）</span><input class="price-old" type="number" min="0" step="0.01" value="${escapeHtml(currentOldPrice)}" placeholder="留空不改"></label>`;
    return `<div class="inventory-item price-update-item${currentOnly ? ' current-price-update-item' : ''}" data-product-id="${escapeHtml(product.productId)}" data-currency="${escapeHtml(currency)}"><div class="inventory-item-heading"><div class="price-item-product">${productVisual}<div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.offerId)} · ${escapeHtml(currency)}</span></div></div><span class="price-current">当前 ${priceLabel(product.pricing)}</span></div><div class="inventory-item-fields"><label class="field"><span>新售价（${escapeHtml(currency)}）</span><input class="price-new" name="price" type="number" min="0.01" step="0.01" value="${escapeHtml(currentPrice)}" placeholder="填写售价" required></label>${oldPriceField}</div></div>`;
  }).join('');
  $('#priceModal').classList.remove('hidden');
  $('#priceList .price-new')?.focus();
}

async function submitPrices(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  const currentOnly = $('#priceModal').dataset.currentOnly === 'true';
  const rowSelector = currentOnly ? ':scope > .current-price-update-item' : ':scope > .price-update-item';
  const rows = [...$('#priceList').querySelectorAll(rowSelector)];
  const prices = rows.map(row => {
    const product = state.products.find(item => item.productId === row.dataset.productId);
    const price = {
      productId: product?.productId,
      offerId: product?.offerId,
      currencyCode: row.dataset.currency || product?.pricing?.currency || 'RUB',
      price: row.querySelector('.price-new')?.value.trim() || ''
    };
    if (!currentOnly) price.oldPrice = row.querySelector('.price-old')?.value.trim() || '';
    return price;
  });
  const invalid = prices.find(item => {
    if (!priceTextIsValid(item.price) || Number(item.price) <= 0) return true;
    if (item.oldPrice !== '' && (!priceTextIsValid(item.oldPrice) || Number(item.oldPrice) < 0)) return true;
    return item.oldPrice !== '' && Number(item.oldPrice) > 0 && Number(item.oldPrice) <= Number(item.price);
  });
  if (!prices.length || invalid) {
    $('#priceMessage').textContent = currentOnly
      ? '请为每个商品填写大于 0 的当前售价。'
      : '请填写每个商品的大于 0 的售价；划线价留空或填 0，填写正数时必须高于售价。';
    return;
  }
  const confirmed = window.confirm(currentOnly
    ? `即将只修改 ${prices.length} 个商品的 Ozon 当前售价，不改划线价或促销价。提交后会直接生效，确定继续吗？`
    : `即将修改 ${prices.length} 个商品的 Ozon 售价。提交后会直接生效，确定继续吗？`);
  if (!confirmed) return;
  const button = $('#submitPrice');
  button.disabled = true;
  button.textContent = '修改中…';
  try {
    const result = await api('/api/prices/batch', { method: 'POST', body: JSON.stringify({ prices, confirm: true }) });
    const summary = result.summary || {};
    if (summary.failed) {
      const failedItems = (result.results || []).filter(item => !item.updated).slice(0, 3).map(item => `${item.offerId || item.productId}: ${item.errors?.[0]?.message || '失败'}`);
      $('#priceMessage').textContent = `已提交 ${summary.submitted || prices.length} 个商品，其中成功 ${summary.success || 0} 个，失败 ${summary.failed} 个。${failedItems.length ? `失败示例：${failedItems.join('；')}。` : ''}请修正后重试。`;
      toast(`售价修改完成，${summary.failed} 个商品失败`);
    } else {
      $('#priceModal').classList.add('hidden');
      state.inventorySelection.clear();
      state.pricingPromotionSelection.clear();
      toast(`已修改 ${summary.success || prices.length} 个商品的售价`);
      if (state.currentView === 'pricing-promotions') await loadPricingPromotions({ silent: true, forceRefresh: true });
      else await refreshDashboard();
    }
  } catch (error) {
    $('#priceMessage').textContent = error.message;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = currentOnly ? '确认修改当前售价' : '确认修改售价';
  }
}

function pricingAmountLabel(value, currency = 'RUB') {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const code = String(currency || 'RUB').toUpperCase();
  const formatter = code === 'CNY' ? cny : rub;
  return `${formatter.format(Number(value))} ${escapeHtml(code)}`;
}

function pricingPromotionSearchQuery() {
  const rawQuery = ($('#pricingPromotionSearch')?.value || '').trim();
  const query = rawQuery.toLowerCase();
  const hasMultipleIdDelimiters = /[,，;；、|\r\n\t]/.test(rawQuery);
  const queryTerms = hasMultipleIdDelimiters
    ? rawQuery.split(/[,，;；、|\s]+/).map(term => term.trim().toLowerCase()).filter(Boolean)
    : rawQuery.split(/\s+/).length > 1 && rawQuery.split(/\s+/).every(term => /^(?=.*\d)[a-z\d_-]+$/i.test(term))
      ? rawQuery.split(/\s+/).map(term => term.trim().toLowerCase()).filter(Boolean)
      : [];
  return { query, multipleIds: [...new Set(queryTerms)] };
}

function pricingPromotionRows() {
  const snapshot = state.pricingPromotion;
  const { query, multipleIds } = pricingPromotionSearchQuery();
  const filter = state.pricingPromotionFilter;
  const rows = (snapshot?.products || []).filter(product => {
    if (filter !== 'all' && product.promotionStatus !== filter) return false;
    if (!query) return true;
    if (multipleIds.length) {
      const productId = String(product.productId || '').trim().toLowerCase();
      const offerId = String(product.offerId || '').trim().toLowerCase();
      return multipleIds.includes(productId) || multipleIds.includes(offerId);
    }
    return [product.name, product.offerId, product.productId, ...(product.promotions || []).map(item => item.name)].join(' ').toLowerCase().includes(query);
  });
  if (state.pricingPromotionOfferIdSort === 'none') return rows;
  const direction = state.pricingPromotionOfferIdSort === 'asc' ? 1 : -1;
  return rows.sort((left, right) => {
    const leftOfferId = String(left.offerId ?? '').trim();
    const rightOfferId = String(right.offerId ?? '').trim();
    if (!leftOfferId || !rightOfferId) return leftOfferId ? -1 : rightOfferId ? 1 : 0;
    return leftOfferId.localeCompare(rightOfferId, undefined, { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function currentPricingPromotionPageRows(rows = pricingPromotionRows()) {
  const pageCount = Math.max(Math.ceil(rows.length / PRODUCT_PAGE_SIZE), 1);
  state.pricingPromotionPage = Math.min(Math.max(state.pricingPromotionPage, 1), pageCount);
  const start = (state.pricingPromotionPage - 1) * PRODUCT_PAGE_SIZE;
  return rows.slice(start, start + PRODUCT_PAGE_SIZE);
}

function renderPricingPromotionPagination(totalRows) {
  const pageCount = Math.max(Math.ceil(totalRows / PRODUCT_PAGE_SIZE), 1);
  state.pricingPromotionPage = Math.min(Math.max(state.pricingPromotionPage, 1), pageCount);
  const first = $('#pricingPromotionPageFirst');
  const previous = $('#pricingPromotionPagePrevious');
  const next = $('#pricingPromotionPageNext');
  const last = $('#pricingPromotionPageLast');
  const input = $('#pricingPromotionPageInput');
  const total = $('#pricingPromotionPageTotal');
  if (!first || !previous || !next || !last || !input || !total) return;
  first.disabled = state.pricingPromotionPage <= 1;
  previous.disabled = state.pricingPromotionPage <= 1;
  next.disabled = state.pricingPromotionPage >= pageCount;
  last.disabled = state.pricingPromotionPage >= pageCount;
  input.value = String(state.pricingPromotionPage);
  input.max = String(pageCount);
  total.textContent = String(pageCount);
}

function goToPricingPromotionPage(value) {
  const pageCount = Math.max(Math.ceil(pricingPromotionRows().length / PRODUCT_PAGE_SIZE), 1);
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    toast(`请输入 1 至 ${pageCount} 之间的页码`);
    renderPricingPromotionPagination(pricingPromotionRows().length);
    return;
  }
  state.pricingPromotionPage = page;
  renderPricingPromotions();
  $('#pricingPromotionTable').closest('.table-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePricingPromotionOfferIdSortControl() {
  const column = $('#pricingPromotionOfferIdSortColumn');
  const button = $('#pricingPromotionOfferIdSort');
  const indicator = $('#pricingPromotionOfferIdSortIndicator');
  if (!column || !button || !indicator) return;
  const direction = state.pricingPromotionOfferIdSort;
  const label = direction === 'asc' ? '升序' : direction === 'desc' ? '降序' : '未排序';
  column.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
  button.setAttribute('aria-label', `按价格与促销的 Offer ID 排序，当前${label}；点击切换`);
  indicator.textContent = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
}

function promotionDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
}

function promotionActionNameInChinese(value) {
  return String(value || '').trim()
    .replace(/Эластичный бустинг/gi, '弹性推广')
    .replace(/Без ограничения срока действия/gi, '长期有效')
    .replace(/Максимальный бустинг/gi, '最大化推广')
    .replace(/усиление/gi, '加强版')
    .replace(/\s*[.。]\s*/g, ' · ')
    .replace(/\s+/g, ' ');
}

function promotionLabel(product) {
  const promotion = product.promotions?.[0];
  if (!promotion) return '—';
  const name = promotionActionNameInChinese(promotion.name || (promotion.id ? `活动 ${promotion.id}` : '已参加活动'));
  const dates = [promotionDateLabel(promotion.dateFrom), promotionDateLabel(promotion.dateTo)].filter(Boolean).join(' - ');
  return dates ? `${name} · ${dates}` : name;
}

function renderPricingPromotions() {
  const snapshot = state.pricingPromotion;
  if (!snapshot) return;
  const stats = snapshot.stats || {};
  $('#pricingProductsTotal').textContent = rub.format(stats.total || 0);
  $('#pricingPromotionActive').textContent = rub.format(stats.active || 0);
  $('#pricingPromotionInactive').textContent = rub.format(stats.inactive || 0);
  $('#pricingPromotionUnknown').textContent = rub.format(stats.unknown || 0);
  const warnings = [state.pricingPromotionRefreshError, ...(snapshot.warnings || [])].filter(Boolean);
  $('#pricingPromotionWarning').classList.toggle('hidden', !warnings.length);
  $('#pricingPromotionWarning').textContent = warnings.join(' ');
  const rows = pricingPromotionRows();
  const pageRows = currentPricingPromotionPageRows(rows);
  updatePricingPromotionOfferIdSortControl();
  renderPricingPromotionPagination(rows.length);
  const rangeStart = rows.length ? (state.pricingPromotionPage - 1) * PRODUCT_PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(state.pricingPromotionPage * PRODUCT_PAGE_SIZE, rows.length);
  const totalCountLabel = `显示第 ${rangeStart}-${rangeEnd} / ${rows.length} 个商品`;
  const { multipleIds } = pricingPromotionSearchQuery();
  $('#pricingPromotionCountLabel').textContent = multipleIds.length
    ? `${totalCountLabel} · 已搜索 ${multipleIds.length} 个 ID`
    : totalCountLabel;
  $('#pricingPromotionLastUpdated').textContent = snapshot.syncedAt
    ? `最后同步：${new Date(snapshot.syncedAt).toLocaleString('zh-CN', { hour12: false })}${state.pricingPromotionRefreshError ? ' · 当前刷新失败，保留上次数据' : ''}`
    : '尚无成功同步记录';
  if (!rows.length) {
    $('#pricingPromotionTable').innerHTML = `<tr><td colspan="8" class="empty-state">${snapshot.products?.length ? '当前搜索或筛选下没有商品。' : '没有读取到商品价格。'}</td></tr>`;
  } else {
    $('#pricingPromotionTable').innerHTML = pageRows.map(product => {
      const checked = state.pricingPromotionSelection.has(product.productId);
      const productVisual = product.image
        ? `<span class="product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-pricing-image></span>`
        : '<span class="product-media product-media-placeholder" aria-label="暂无商品图片">无图</span>';
      const statusLabel = product.promotionStatus === 'active' ? '已参加促销' : product.promotionStatus === 'inactive' ? '未参加促销' : '状态待确认';
      const statusClass = product.promotionStatus === 'active' ? 'live' : product.promotionStatus === 'inactive' ? 'archived' : 'promotion-unknown';
      return `<tr><td class="select-column"><input class="pricing-promotion-select" type="checkbox" value="${escapeHtml(product.productId)}" ${checked ? 'checked' : ''} aria-label="选择 ${escapeHtml(product.name)}"></td><td><div class="product-cell">${productVisual}<span class="product-copy"><span class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span><span class="product-sub">商品 ID ${escapeHtml(product.productId || '—')}</span></span></div></td><td class="offer-id">${escapeHtml(product.offerId || '—')}</td><td><span class="price-value">${pricingAmountLabel(product.currentPrice, product.currency)}</span></td><td>${pricingAmountLabel(product.oldPrice, product.currency)}</td><td><span class="price-value ${product.promotionStatus === 'active' ? 'promotion-price' : ''}">${pricingAmountLabel(product.promotionPrice, product.currency)}</span></td><td class="promotion-name" title="${escapeHtml(promotionLabel(product))}">${escapeHtml(promotionLabel(product))}</td><td><span class="status-pill ${statusClass}">${statusLabel}</span></td></tr>`;
    }).join('');
  }
  const selectable = rows.filter(product => product.productId && product.offerId);
  const visibleSelectable = pageRows.filter(product => product.productId && product.offerId);
  const selected = selectable.filter(product => state.pricingPromotionSelection.has(product.productId));
  const selectAll = $('#pricingPromotionSelectAll');
  const visibleSelectedCount = visibleSelectable.filter(product => state.pricingPromotionSelection.has(product.productId)).length;
  selectAll.checked = visibleSelectable.length > 0 && visibleSelectedCount === visibleSelectable.length;
  selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleSelectable.length;
  selectAll.disabled = visibleSelectable.length === 0;
  const deactivateButton = $('#pricingPromotionDeactivateSelected');
  const activeSelected = selected.filter(product => product.promotionStatus === 'active' && product.promotions?.length);
  deactivateButton.disabled = activeSelected.length === 0;
  deactivateButton.textContent = activeSelected.length ? `移出所选促销 · ${activeSelected.length}` : '移出所选促销';
  const joinButton = $('#pricingPromotionJoinSelected');
  joinButton.disabled = selected.length === 0;
  joinButton.textContent = selected.length ? `参加活动 · ${selected.length}` : '参加活动';
  const promotionPriceButton = $('#pricingPromotionEditPromotionPriceSelected');
  const selectedActionIds = [...new Set(selected.map(product => String(product.promotions?.[0]?.id || '')))];
  const eligibleForPromotionPrice = selected.length > 0
    && selected.every(product => product.promotionStatus === 'active' && product.promotions?.[0]?.id)
    && selectedActionIds.length === 1;
  promotionPriceButton.disabled = !eligibleForPromotionPrice;
  promotionPriceButton.textContent = eligibleForPromotionPrice ? `批量改促销价 · ${selected.length}` : '批量改促销价';
  promotionPriceButton.title = selected.length === 0
    ? '请选择商品'
    : eligibleForPromotionPrice
      ? '修改所选商品在当前活动中的促销价'
      : '所选商品需全部参加同一个促销活动';
}

function mergePricingProductsIntoState(rows) {
  const byId = new Map(rows.map(row => [String(row.productId), row]));
  if (!state.products.length) {
    state.products = rows.map(row => ({ ...row, pricing: { price: row.currentPrice, oldPrice: row.oldPrice, currency: row.currency } }));
    return;
  }
  state.products = state.products.map(product => {
    const row = byId.get(String(product.productId));
    return row ? { ...product, name: row.name || product.name, image: row.image || product.image, offerId: row.offerId || product.offerId, pricing: { price: row.currentPrice, oldPrice: row.oldPrice, currency: row.currency } } : product;
  });
}

async function loadPricingPromotions(options = {}) {
  const silent = options.silent === true;
  if (!state.configured) {
    openSettings();
    return;
  }
  const button = $('#refreshPricingPromotions');
  button.disabled = true;
  button.innerHTML = '<span class="refresh-icon">◌</span>同步中';
  try {
    const response = await api(`/api/pricing-promotions${options.forceRefresh ? '?refresh=1' : ''}`);
    state.pricingPromotion = response;
    state.pricingPromotionRefreshError = '';
    state.pricingPromotionPage = 1;
    mergePricingProductsIntoState(response.products || []);
    state.pricingPromotionSelection = new Set([...state.pricingPromotionSelection].filter(id => (response.products || []).some(product => product.productId === id)));
    renderPricingPromotions();
    if (!silent) toast(`已同步 ${response.products?.length || 0} 个商品的价格与促销`);
  } catch (error) {
    state.pricingPromotionRefreshError = `同步失败：${error.message}${state.pricingPromotion ? '，继续显示上次成功读取的数据。' : ''}`;
    if (!state.pricingPromotion) state.pricingPromotion = { products: [], stats: {}, warnings: [] };
    renderPricingPromotions();
    if (!silent) toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="refresh-icon">↻</span>同步价格';
    if (!silent) scheduleAutoRefresh();
  }
}

function productProfitSearchQuery() {
  const raw = ($('#productProfitSearch')?.value || '').trim();
  const query = raw.toLowerCase();
  const terms = raw.split(/[,，;；、|\s]+/).map(term => term.trim().toLowerCase()).filter(Boolean);
  const explicitlySeparated = /[,，;；、|\r\n\t]/.test(raw);
  const whitespaceSeparatedIds = raw.split(/\s+/).length > 1 && raw.split(/\s+/).every(term => /^(?=.*\d)[a-z\d_-]+$/i.test(term));
  return { query, idTerms: explicitlySeparated || whitespaceSeparatedIds ? [...new Set(terms)] : [] };
}

function productProfitFilteredRows() {
  const { query, idTerms } = productProfitSearchQuery();
  const rows = (state.productProfit?.products || []).filter(product => {
    if (state.productProfitFilter !== 'all' && product.status !== state.productProfitFilter) return false;
    if (!query) return true;
    const productId = String(product.productId || '').toLowerCase();
    const offerId = String(product.offerId || '').toLowerCase();
    if (idTerms.length) return idTerms.includes(productId) || idTerms.includes(offerId);
    return [product.name, product.offerId, product.productId].join(' ').toLowerCase().includes(query);
  });
  if (state.productProfitOfferIdSort === 'none') return rows;
  return rows.sort((left, right) => {
    const byOfferId = String(left.offerId || '').localeCompare(String(right.offerId || ''), undefined, { numeric: true, sensitivity: 'base' });
    return state.productProfitOfferIdSort === 'asc' ? byOfferId : -byOfferId;
  });
}

function productProfitMoney(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${cny.format(Number(value))} CNY`;
}

function renderProductProfit() {
  const snapshot = state.productProfit;
  if (!snapshot) return;
  const stats = snapshot.stats || {};
  const incompleteCount = Number(stats.incomplete || 0) + Number(stats.unavailable || 0);
  $('#productProfitTotal').textContent = rub.format(stats.total || 0);
  $('#productProfitCalculated').textContent = rub.format(stats.calculated || 0);
  $('#productProfitIncomplete').textContent = rub.format(incompleteCount);
  $('#productProfitExchangeRate').textContent = Number(snapshot.exchangeRate).toFixed(4);
  const offerIdSortColumn = $('#productProfitOfferIdSortColumn');
  const offerIdSortButton = $('#productProfitOfferIdSort');
  const offerIdSortIndicator = $('#productProfitOfferIdSortIndicator');
  offerIdSortColumn.setAttribute('aria-sort', state.productProfitOfferIdSort === 'none' ? 'none' : state.productProfitOfferIdSort === 'asc' ? 'ascending' : 'descending');
  offerIdSortButton.setAttribute('aria-label', `按 Offer ID 排序，当前${state.productProfitOfferIdSort === 'none' ? '未排序' : state.productProfitOfferIdSort === 'asc' ? '升序' : '降序'}；点击切换`);
  offerIdSortIndicator.textContent = state.productProfitOfferIdSort === 'asc' ? '↑' : state.productProfitOfferIdSort === 'desc' ? '↓' : '↕';
  const warnings = [state.productProfitRefreshError, ...(snapshot.warnings || [])].filter(Boolean);
  $('#productProfitWarning').classList.toggle('hidden', !warnings.length);
  $('#productProfitWarning').textContent = warnings.join(' ');

  const rows = productProfitFilteredRows();
  const pageCount = Math.max(1, Math.ceil(rows.length / PRODUCT_PAGE_SIZE));
  state.productProfitPage = Math.min(Math.max(1, state.productProfitPage), pageCount);
  const start = (state.productProfitPage - 1) * PRODUCT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + PRODUCT_PAGE_SIZE);
  const { idTerms } = productProfitSearchQuery();
  $('#productProfitCountLabel').textContent = idTerms.length > 1
    ? `显示 ${rows.length} / ${snapshot.products?.length || 0} 个商品 · 搜索 ${idTerms.length} 个 ID`
    : `显示 ${rows.length} / ${snapshot.products?.length || 0} 个商品`;
  $('#productProfitLastUpdated').textContent = snapshot.syncedAt
    ? `最后同步：${new Date(snapshot.syncedAt).toLocaleString('zh-CN', { hour12: false })}${state.productProfitRefreshError ? ' · 刷新失败，保留上次数据' : ''}`
    : '尚无成功同步记录';

  if (!pageRows.length) {
    $('#productProfitTable').innerHTML = `<tr><td colspan="12" class="empty-state">${snapshot.products?.length ? '当前搜索或筛选下没有商品。' : '没有读取到商品利润数据。'}</td></tr>`;
  } else {
    $('#productProfitTable').innerHTML = pageRows.map(product => {
      const visual = product.image
        ? `<span class="product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-product-profit-image></span>`
        : '<span class="product-media product-media-placeholder" aria-label="暂无商品图片">无图</span>';
      const price = product.sellingPrice === null || product.sellingPrice === undefined
        ? '—'
        : pricingAmountLabel(product.sellingPrice, product.currency);
      const source = product.priceSource === 'promotion' ? '<span class="profit-source-tag">促销价</span>' : '<span class="profit-source-tag current">当前售价</span>';
      const route = product.route
        ? `${escapeHtml(product.route)}<small class="profit-cell-note">${rub.format(product.billableWeightGrams || 0)} g${product.volumetricWeightGrams > product.actualWeightGrams ? ' · 体积重计费' : ''}</small>`
        : '—';
      const commission = product.commissionRate === null || product.commissionRate === undefined
        ? '—'
        : `${Number(product.commissionRate).toFixed(2)}%<small class="profit-cell-note">${productCommissionAmount(product)}</small>`;
      const logisticsPlatformFee = productProfitMoney(product.logisticsPlatformFeeCny);
      const transportContractFee = productProfitMoney(product.transportContractFeeCny);
      const starAdsFee = productProfitMoney(product.starAdsFeeCny);
      const statusLabel = product.status === 'calculated' ? '已核算' : product.status === 'unavailable' ? '无适用线路' : '资料不完整';
      const statusClass = product.status === 'calculated' ? 'live' : product.status === 'unavailable' ? 'archived' : 'promotion-unknown';
      const profitNumber = Number(product.profitCny);
      const profitClass = product.status !== 'calculated' || !Number.isFinite(profitNumber)
        ? ''
        : profitNumber < 0 ? 'profit-negative' : 'profit-positive';
      const statusTitle = product.statusMessage ? ` title="${escapeHtml(product.statusMessage)}"` : '';
      return `<tr><td><div class="product-cell">${visual}<span class="product-copy"><span class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span><span class="product-sub">Offer ID ${escapeHtml(product.offerId || '—')} · 商品 ID ${escapeHtml(product.productId || '—')}</span></span></div></td><td><span class="price-value">${price}</span>${source}</td><td>${route}</td><td>${productProfitMoney(product.oglShippingCny)}</td><td>${logisticsPlatformFee}</td><td>${transportContractFee}</td><td>${starAdsFee}</td><td>${productProfitMoney(product.acquiringFeeCny)}</td><td>${commission}</td><td><span class="profit-amount ${profitClass}">${productProfitMoney(product.profitCny)}</span></td><td>${product.profitMargin === null || product.profitMargin === undefined ? '—' : `${(Number(product.profitMargin) * 100).toFixed(2)}%`}</td><td><span class="status-pill ${statusClass}"${statusTitle}>${statusLabel}</span></td></tr>`;
    }).join('');
  }
  $('#productProfitPageInput').value = String(state.productProfitPage);
  $('#productProfitPageTotal').textContent = String(pageCount);
  $('#productProfitPageFirst').disabled = state.productProfitPage <= 1;
  $('#productProfitPagePrevious').disabled = state.productProfitPage <= 1;
  $('#productProfitPageNext').disabled = state.productProfitPage >= pageCount;
  $('#productProfitPageLast').disabled = state.productProfitPage >= pageCount;
}

function productCommissionAmount(product) {
  return product.commissionCny === null || product.commissionCny === undefined
    ? '佣金金额 —'
    : productProfitMoney(product.commissionCny);
}

function goToProductProfitPage(value) {
  const pageCount = Math.max(1, Math.ceil(productProfitFilteredRows().length / PRODUCT_PAGE_SIZE));
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    toast(`请输入 1 至 ${pageCount} 之间的页码`);
    $('#productProfitPageInput').value = String(state.productProfitPage);
    return;
  }
  state.productProfitPage = page;
  renderProductProfit();
  $('#productProfitTable').closest('.table-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadProductProfit(options = {}) {
  const silent = options.silent === true;
  if (!state.configured) {
    openSettings();
    return;
  }
  const button = $('#refreshProductProfit');
  button.disabled = true;
  button.innerHTML = '<span class="refresh-icon">◌</span>核算中';
  try {
    const response = await api(`/api/product-profit${options.forceRefresh ? '?refresh=1' : ''}`);
    state.productProfit = response;
    state.productProfitRefreshError = '';
    state.productProfitPage = 1;
    renderProductProfit();
    if (!silent) toast(`已完成 ${response.stats?.calculated || 0} 个商品利润核算`);
  } catch (error) {
    state.productProfitRefreshError = `同步失败：${error.message}${state.productProfit ? '，继续显示上次成功读取的数据。' : ''}`;
    if (!state.productProfit) state.productProfit = { products: [], stats: {}, warnings: [], exchangeRate: 0 };
    renderProductProfit();
    if (!silent) toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="refresh-icon">↻</span>同步核算';
    if (!silent) scheduleAutoRefresh();
  }
}

async function deactivateSelectedPromotions() {
  const selected = (state.pricingPromotion?.products || []).filter(product => state.pricingPromotionSelection.has(product.productId) && product.promotionStatus === 'active' && product.promotions?.[0]?.id);
  if (!selected.length) return toast('请先选择已参加促销的商品');
  const actionIds = [...new Set(selected.map(product => String(product.promotions[0].id)))];
  if (actionIds.length !== 1) return toast('所选商品属于不同促销活动，请分活动分别移出');
  const actionId = actionIds[0];
  const actionName = promotionActionNameInChinese(selected[0].promotions[0].name || `活动 ${actionId}`);
  const confirmed = window.confirm(`即将把 ${selected.length} 个商品移出促销活动“${actionName}”。此操作会直接提交到 Ozon，确定继续吗？`);
  if (!confirmed) return;
  const button = $('#pricingPromotionDeactivateSelected');
  button.disabled = true;
  button.textContent = '提交中…';
  try {
    const result = await api('/api/pricing-promotions/deactivate', {
      method: 'POST',
      body: JSON.stringify({ actionId, productIds: selected.map(product => product.productId), confirm: true })
    });
    const summary = result.summary || {};
    state.pricingPromotionSelection.clear();
    toast(summary.failed ? `已移出 ${summary.success || 0} 个商品，${summary.failed} 个失败` : `已将 ${summary.success || selected.length} 个商品移出促销`);
    await loadPricingPromotions({ forceRefresh: true, silent: true });
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    renderPricingPromotions();
  }
}

function resetPromotionJoinPreview(message = '') {
  $('#promotionJoinList').innerHTML = '<div class="empty-state">请先选择活动并检查商品资格。</div>';
  $('#promotionJoinMessage').textContent = message;
  $('#promotionJoinMessage').className = 'modal-message';
  $('#promotionJoinCommonPrice').value = '';
  $('#promotionJoinCommonPriceLabel').textContent = '统一活动价';
  $('#submitPromotionJoin').disabled = true;
  $('#submitPromotionJoin').textContent = '加入活动';
  $('#promotionJoinList').dataset.scanComplete = 'false';
}

function openPromotionJoinModal() {
  const selected = (state.pricingPromotion?.products || []).filter(product => state.pricingPromotionSelection.has(product.productId));
  if (!selected.length) return toast('请先选择要参加活动的商品');
  if (selected.length > MAX_INVENTORY_BATCH_SIZE) return toast(`单次最多选择 ${MAX_INVENTORY_BATCH_SIZE} 个商品`);
  const actions = (state.pricingPromotion?.actions || []).filter(action => action.id);
  if (!actions.length) return toast('没有读取到可用活动，请先同步价格与促销数据');
  $('#promotionJoinSelectionLabel').textContent = `已选择 ${selected.length} 个商品`;
  $('#promotionJoinAction').innerHTML = '<option value="">请选择活动</option>' + actions.map(action => {
    const sourceName = action.name || `活动 ${action.id}`;
    const name = promotionActionNameInChinese(sourceName);
    const period = [promotionDateLabel(action.dateFrom), promotionDateLabel(action.dateTo)].filter(Boolean).join(' 至 ');
    const label = `${name}${period ? `（${period}）` : ''}${action.isParticipating ? ' · 店铺已参加' : ''}`;
    return `<option value="${escapeHtml(action.id)}" title="${escapeHtml(sourceName)}">${escapeHtml(label)}</option>`;
  }).join('');
  $('#promotionJoinModal').classList.remove('hidden');
  resetPromotionJoinPreview();
  $('#promotionJoinAction').focus();
}

async function loadPromotionCandidates() {
  const actionId = $('#promotionJoinAction').value;
  const selected = (state.pricingPromotion?.products || []).filter(product => state.pricingPromotionSelection.has(product.productId));
  if (!actionId) return toast('请先选择一个活动');
  if (!selected.length) return toast('请先选择要参加活动的商品');
  const button = $('#loadPromotionCandidates');
  button.disabled = true;
  button.textContent = '检查中…';
  resetPromotionJoinPreview();
  $('#promotionJoinList').innerHTML = '<div class="empty-state">正在向 Ozon 核实商品资格…</div>';
  try {
    const result = await api('/api/pricing-promotions/candidates', {
      method: 'POST',
      body: JSON.stringify({ actionId, productIds: selected.map(product => product.productId) })
    });
    const candidates = result.candidates || [];
    const missing = new Set(result.unavailableProductIds || []);
    const currencies = [...new Set(candidates.map(candidate => String(candidate.currency || candidate.product?.currency || 'RUB').toUpperCase()))];
    $('#promotionJoinCommonPriceLabel').textContent = currencies.length === 1
      ? `统一活动价（${currencies[0]}）`
      : currencies.length > 1 ? '统一活动价（多个币种）' : '统一活动价';
    $('#promotionJoinList').innerHTML = candidates.length ? candidates.map(candidate => {
      const product = candidate.product || {};
      const currency = candidate.currency || product.currency || 'RUB';
      const actionPrice = candidate.actionPrice || candidate.maxActionPrice || product.currentPrice || '';
      const minStock = Number(candidate.minStock) || 0;
      const recommendedStock = Number(candidate.recommendedStock) || 0;
      const stockMarkup = minStock || recommendedStock
        ? `<label class="field promotion-join-stock"><span>活动库存${minStock ? `（至少 ${minStock} 件）` : ''}</span><input class="promotion-join-stock-input" type="number" min="${Math.max(minStock, 1)}" max="1000000000" step="1" value="${recommendedStock || minStock || ''}" placeholder="填写活动库存"></label>`
        : '';
      const price = `<label class="field promotion-join-price"><span>活动价（${escapeHtml(currency)}）</span><input class="promotion-join-price-input" type="number" min="0.01" step="0.01" value="${escapeHtml(priceInputValue(actionPrice))}" required></label>`;
      const quarantined = candidate.quarantined ? '<span class="status-pill archived">隔离中</span>' : '<span class="status-pill live">符合资格</span>';
      return `<div class="inventory-item price-item promotion-join-item" data-product-id="${escapeHtml(candidate.productId)}" data-currency="${escapeHtml(currency)}" data-min-stock="${minStock}" data-max-action-price="${escapeHtml(candidate.maxActionPrice || '')}"><div class="inventory-item-heading"><label class="promotion-join-product"><input class="promotion-join-select" type="checkbox" ${candidate.quarantined ? 'disabled' : 'checked'}><span class="price-item-product">${product.image ? `<span class="product-media price-product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-promotion-join-image></span>` : '<span class="product-media product-media-placeholder price-product-media">无图</span>'}<span><strong>${escapeHtml(product.name || `商品 ${candidate.productId}`)}</strong><span>${escapeHtml(product.offerId || '—')} · ID ${escapeHtml(candidate.productId)} · ${escapeHtml(currency)}</span></span></span></label>${quarantined}</div><div class="promotion-join-fields">${price}${stockMarkup}</div>${candidate.maxActionPrice ? `<small class="subtle">Ozon 活动价上限：${pricingAmountLabel(candidate.maxActionPrice, currency)}</small>` : ''}</div>`;
    }).join('') : '<div class="empty-state">Ozon 未返回所选商品的活动候选资格。</div>';
    const unavailableLabel = missing.size ? `未在活动候选中找到 ${missing.size} 个商品（ID：${[...missing].slice(0, 8).join('、')}${missing.size > 8 ? '…' : ''}）。` : '';
    const incompleteLabel = result.scanComplete ? '' : '候选列表较长，已达到本次扫描上限；未返回的商品资格尚不能确认。';
    const quarantinedCount = candidates.filter(candidate => candidate.quarantined).length;
    const warning = [unavailableLabel, incompleteLabel, quarantinedCount ? `${quarantinedCount} 个商品处于隔离状态，不能加入。` : '', ...(result.warnings || [])].filter(Boolean).join(' ');
    $('#promotionJoinNotice').textContent = warning || '已找到符合资格的商品。活动价和活动库存可在提交前调整。';
    $('#promotionJoinList').dataset.scanComplete = String(result.scanComplete === true);
    updatePromotionJoinSubmit();
  } catch (error) {
    $('#promotionJoinList').innerHTML = '<div class="empty-state">资格检查失败，请稍后重试。</div>';
    $('#promotionJoinMessage').textContent = error.message;
    $('#promotionJoinMessage').className = 'modal-message';
    $('#submitPromotionJoin').disabled = true;
  } finally {
    button.disabled = false;
    button.textContent = '检查商品资格';
  }
}

function updatePromotionJoinSubmit() {
  const checked = [...$('#promotionJoinList').querySelectorAll('.promotion-join-item')].filter(row => row.querySelector('.promotion-join-select')?.checked);
  const valid = checked.filter(row => {
    const input = row.querySelector('.promotion-join-price-input');
    const price = Number(input?.value);
    const maxPrice = Number(row.dataset.maxActionPrice);
    const stockInput = row.querySelector('.promotion-join-stock-input');
    const minimumStock = Number(row.dataset.minStock) || 0;
    const stock = Number(stockInput?.value);
    const priceValid = Number.isFinite(price) && price > 0 && (!maxPrice || price <= maxPrice);
    if (input) {
      if (priceValid) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    }
    return priceValid
      && (!minimumStock || (Number.isInteger(stock) && stock >= minimumStock));
  });
  const button = $('#submitPromotionJoin');
  button.disabled = !checked.length || valid.length !== checked.length;
  button.textContent = checked.length ? `加入活动 · ${checked.length}` : '加入活动';
}

function applyCommonPromotionJoinPrice() {
  const value = $('#promotionJoinCommonPrice').value.trim();
  if (!priceTextIsValid(value) || Number(value) <= 0) return toast('统一活动价必须是大于 0 的数字');
  const rows = [...$('#promotionJoinList').querySelectorAll('.promotion-join-item')]
    .filter(row => !row.querySelector('.promotion-join-select')?.disabled);
  if (!rows.length) return toast('没有可应用统一活动价的候选商品');
  rows.forEach(row => {
    const input = row.querySelector('.promotion-join-price-input');
    if (input) input.value = value;
  });
  const currencies = [...new Set(rows.map(row => String(row.dataset.currency || '').toUpperCase()).filter(Boolean))];
  const currencyNote = currencies.length > 1 ? `（同一数值将按各商品币种填写：${currencies.join('、')}）` : '';
  $('#promotionJoinMessage').textContent = `已将统一活动价应用到 ${rows.length} 个可加入商品${currencyNote}；请检查各商品的 Ozon 活动价上限。`;
  $('#promotionJoinMessage').className = 'modal-message';
  updatePromotionJoinSubmit();
}

async function submitPromotionJoin(event) {
  event.preventDefault();
  const actionId = $('#promotionJoinAction').value;
  const selected = [...document.querySelectorAll('.promotion-join-item')]
    .filter(row => row.querySelector('.promotion-join-select')?.checked)
    .map(row => ({
      productId: row.dataset.productId,
      actionPrice: row.querySelector('.promotion-join-price-input')?.value.trim() || '',
      stock: row.querySelector('.promotion-join-stock-input')?.value.trim() || ''
    }));
  if (!/^\d{1,16}$/.test(actionId) || !selected.length || selected.length > MAX_INVENTORY_BATCH_SIZE) return toast('请选择活动和符合资格的商品');
  const includesStock = selected.some(item => item.stock);
  if (!window.confirm(`即将把 ${selected.length} 个商品加入所选 Ozon 活动。活动价${includesStock ? '及填写的活动库存' : ''}将提交到 Ozon，确定继续吗？`)) return;
  const button = $('#submitPromotionJoin');
  button.disabled = true;
  button.textContent = '提交中…';
  try {
    const result = await api('/api/pricing-promotions/join', {
      method: 'POST',
      body: JSON.stringify({ actionId, products: selected, confirm: true })
    });
    const summary = result.summary || {};
    if (summary.failed) {
      for (const item of result.results || []) {
        if (!item.ok) continue;
        const row = document.querySelector(`.promotion-join-item[data-product-id="${CSS.escape(String(item.productId))}"]`);
        const checkbox = row?.querySelector('.promotion-join-select');
        if (checkbox) {
          checkbox.checked = false;
          checkbox.disabled = true;
          const badge = row.querySelector('.inventory-item-heading > .status-pill');
          if (badge) {
            badge.className = 'status-pill live';
            badge.textContent = '已加入';
          }
        }
      }
      const failed = (result.results || []).filter(item => !item.ok).slice(0, 4).map(item => `${item.productId}：${item.error || '加入失败'}`);
      $('#promotionJoinMessage').textContent = `已提交 ${summary.submitted || selected.length} 个商品，成功 ${summary.success || 0} 个，失败 ${summary.failed} 个。${failed.join('；')}`;
      $('#promotionJoinMessage').className = 'modal-message';
      toast(`参加活动完成，${summary.failed} 个商品失败`);
    } else {
      $('#promotionJoinModal').classList.add('hidden');
      state.pricingPromotionSelection.clear();
      toast(`已将 ${summary.success || selected.length} 个商品提交参加活动`);
      await loadPricingPromotions({ forceRefresh: true, silent: true });
    }
  } catch (error) {
    $('#promotionJoinMessage').textContent = error.message;
    $('#promotionJoinMessage').className = 'modal-message';
    toast(error.message);
  } finally {
    updatePromotionJoinSubmit();
  }
}

function openPromotionPriceModal() {
  const selected = (state.pricingPromotion?.products || []).filter(product => state.pricingPromotionSelection.has(product.productId));
  if (!selected.length) return toast('请先选择已参加同一个促销活动的商品');
  if (selected.some(product => product.promotionStatus !== 'active' || !product.promotions?.[0]?.id)) {
    return toast('批量修改促销价只支持已参加促销活动的商品');
  }
  const actionIds = [...new Set(selected.map(product => String(product.promotions[0].id)))];
  if (actionIds.length !== 1) return toast('所选商品属于不同促销活动，请按活动分别选择');
  const action = selected[0].promotions[0];
  $('#promotionPriceModal').dataset.actionId = actionIds[0];
  const actionName = promotionActionNameInChinese(action.name || `活动 ${actionIds[0]}`);
  $('#promotionPriceSelectionLabel').textContent = `活动：${actionName} · 已选择 ${selected.length} 个商品`;
  $('#promotionPriceIntro').textContent = `只更新所选商品在“${actionName}”中的促销价，不修改商品当前售价或划线价。`;
  $('#promotionPriceMessage').textContent = '';
  $('#promotionPriceMessage').className = 'modal-message';
  $('#promotionPriceCommon').value = '';
  $('#promotionPriceList').innerHTML = selected.map(product => {
    const promotion = product.promotions[0];
    const currency = String(promotion.currency || product.currency || 'RUB').toUpperCase();
    const productVisual = product.image
      ? `<span class="product-media price-product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-promotion-price-image></span>`
      : '<span class="product-media product-media-placeholder price-product-media" aria-label="暂无商品图片">无图</span>';
    return `<div class="inventory-item price-item promotion-price-item" data-product-id="${escapeHtml(product.productId)}" data-currency="${escapeHtml(currency)}"><div class="inventory-item-heading"><div class="price-item-product">${productVisual}<div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.offerId)} · ${escapeHtml(currency)}</span></div></div><span class="price-current">当前促销价 ${pricingAmountLabel(promotion.actionPrice, currency)}</span></div><label class="field"><span>新促销价（${escapeHtml(currency)}）</span><input class="promotion-price-new" type="number" min="0.01" step="0.01" value="${escapeHtml(priceInputValue(promotion.actionPrice))}" placeholder="填写促销价" required></label></div>`;
  }).join('');
  $('#promotionPriceModal').classList.remove('hidden');
  $('#promotionPriceList .promotion-price-new')?.focus();
}

async function submitPromotionPrices(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  const actionId = $('#promotionPriceModal').dataset.actionId || '';
  const prices = [...document.querySelectorAll('.promotion-price-item')].map(row => ({
    productId: row.dataset.productId,
    currencyCode: row.dataset.currency || 'RUB',
    price: row.querySelector('.promotion-price-new')?.value.trim() || ''
  }));
  const invalid = prices.find(item => !/^\d+(?:\.\d{1,4})?$/.test(item.price) || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0);
  if (!/^\d{1,16}$/.test(actionId) || !prices.length || invalid) {
    $('#promotionPriceMessage').textContent = '请为每个商品填写大于 0 的促销价。';
    return;
  }
  if (!window.confirm(`即将修改促销活动中的 ${prices.length} 个商品价格；当前售价和划线价不会更改。不符合活动规则的价格可能被 Ozon 拒绝或导致商品移出活动。确定继续吗？`)) return;
  const button = $('#submitPromotionPrice');
  button.disabled = true;
  button.textContent = '提交中…';
  try {
    const result = await api('/api/pricing-promotions/prices/batch', {
      method: 'POST',
      body: JSON.stringify({ actionId, prices, confirm: true })
    });
    const summary = result.summary || {};
    if (summary.failed) {
      const failed = (result.results || []).filter(item => !item.ok).slice(0, 3).map(item => `${item.productId}：${item.error || 'Ozon 未确认更新'}`);
      $('#promotionPriceMessage').textContent = `已提交 ${summary.submitted || prices.length} 个商品，成功 ${summary.success || 0} 个，失败 ${summary.failed} 个。${failed.length ? `失败示例：${failed.join('；')}。` : ''}${(result.warnings || []).slice(0, 2).join(' ')}`;
      toast(`促销价修改完成，${summary.failed} 个商品失败`);
    } else {
      $('#promotionPriceModal').classList.add('hidden');
      state.pricingPromotionSelection.clear();
      toast(`已修改 ${summary.success || prices.length} 个商品的促销价`);
      await loadPricingPromotions({ forceRefresh: true, silent: true });
    }
  } catch (error) {
    $('#promotionPriceMessage').textContent = error.message;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '确认修改促销价';
  }
}

function renderInventoryTransferRows(products) {
  const fromWarehouseId = $('#inventoryTransferFrom').value;
  const toWarehouseId = $('#inventoryTransferTo').value;
  $('#inventoryTransferList').innerHTML = products.map(product => {
    const source = exactTransferStock(product, fromWarehouseId);
    const target = transferTargetStock(product, toWarehouseId);
    const sourceLabel = source === null ? '库存未知' : `当前 ${rub.format(source)} 件`;
    const targetLabel = target.known ? `当前 ${rub.format(target.value)} 件` : '库存未知';
    const targetHint = target.known && exactTransferStock(product, toWarehouseId) === null ? '未返回记录，按 0 件计算' : '';
    const quantity = source !== null && source > 0 ? String(source) : '';
    const quantityPlaceholder = source === null ? '库存未知' : source > 0 ? '默认全部库存' : '无可转移库存';
    return `<div class="inventory-transfer-item" data-product-id="${escapeHtml(product.productId)}"><div class="inventory-item-heading"><div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.offerId || product.productId)}</span></div><span class="offer-id">ID ${escapeHtml(product.productId)}</span></div><div class="inventory-transfer-summary"><span><b>来源仓</b>${escapeHtml(sourceLabel)}</span><span><b>目标仓</b>${escapeHtml(targetLabel)}${targetHint ? `<small>${escapeHtml(targetHint)}</small>` : ''}</span></div><label class="field"><span>本商品转移数量（默认全部）</span><input class="inventory-transfer-quantity" type="number" min="1" max="1000000000" step="1" value="${escapeHtml(quantity)}" placeholder="${escapeHtml(quantityPlaceholder)}"></label></div>`;
  }).join('');
}

function openInventoryTransferModal() {
  const selected = state.products.filter(product => state.inventorySelection.has(product.productId) && canUpdateInventory(product));
  if (!selected.length) return toast('请先选择至少一个商品');
  if (state.inventoryWarehouses.length < 2) return toast('至少需要两个可写入仓库才能转移库存');
  const warehouses = state.inventoryWarehouses.filter(warehouse => Number(warehouse.warehouseId) > 0);
  const options = warehouses.map(warehouse => `<option value="${escapeHtml(warehouse.warehouseId)}">${escapeHtml(warehouse.name || `仓库 ${warehouse.warehouseId}`)}</option>`).join('');
  $('#inventoryTransferFrom').innerHTML = options;
  $('#inventoryTransferTo').innerHTML = options;
  const preferredFrom = state.stockWarehouseId !== 'all' && warehouses.some(item => String(item.warehouseId) === String(state.stockWarehouseId))
    ? String(state.stockWarehouseId)
    : String(warehouses[0].warehouseId);
  const preferredTo = String(warehouses.find(item => String(item.warehouseId) !== preferredFrom)?.warehouseId || warehouses[1].warehouseId);
  $('#inventoryTransferFrom').value = preferredFrom;
  $('#inventoryTransferTo').value = preferredTo;
  $('#inventoryTransferSelectionLabel').textContent = `已选择 ${selected.length} 个商品`;
  $('#inventoryTransferCommonQuantity').value = '';
  $('#inventoryTransferMessage').textContent = '';
  $('#inventoryTransferMessage').className = 'modal-message';
  renderInventoryTransferRows(selected);
  $('#inventoryTransferModal').classList.remove('hidden');
  $('#inventoryTransferList .inventory-transfer-quantity')?.focus();
}

async function submitInventoryTransfer(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  const fromWarehouseId = $('#inventoryTransferFrom').value;
  const toWarehouseId = $('#inventoryTransferTo').value;
  if (!/^\d+$/.test(String(fromWarehouseId)) || !/^\d+$/.test(String(toWarehouseId)) || fromWarehouseId === toWarehouseId) {
    $('#inventoryTransferMessage').textContent = '请选择两个不同的来源仓和目标仓。';
    return;
  }
  const rows = [...document.querySelectorAll('.inventory-transfer-item')];
  const transfers = rows.map(row => {
    const product = state.products.find(item => item.productId === row.dataset.productId);
    return {
      productId: product?.productId,
      offerId: product?.offerId,
      fromWarehouseId,
      toWarehouseId,
      quantity: row.querySelector('.inventory-transfer-quantity')?.value?.trim() || ''
    };
  });
  if (!transfers.length || transfers.some(item => item.quantity !== '' && (!/^\d+$/.test(String(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 1_000_000_000))) {
    $('#inventoryTransferMessage').textContent = '转移数量可以留空（自动转移来源仓全部库存），也可以填写 1 至 1,000,000,000 之间的整数。';
    return;
  }
  const unknownSource = rows.find(row => exactTransferStock(state.products.find(item => item.productId === row.dataset.productId), fromWarehouseId) === null);
  if (unknownSource) {
    $('#inventoryTransferMessage').textContent = '至少有一个商品的来源仓库存未知。请刷新数据，确认 Ozon 返回仓库库存后再转移。';
    return;
  }
  const confirmed = window.confirm(`即将把 ${transfers.length} 个商品的库存从来源仓转移到目标仓，提交后会直接写入 Ozon。确定继续吗？`);
  if (!confirmed) return;
  const button = $('#submitInventoryTransfer');
  button.disabled = true;
  button.textContent = '转移中…';
  try {
    const result = await api('/api/inventory/transfer', { method: 'POST', body: JSON.stringify({ transfers, confirm: true }) });
    const summary = result.summary || {};
    const batchSummary = summary.batches > 1
      ? `已按每批最多 50 个商品提交，共 ${summary.batches} 批，完成 ${summary.completedBatches || 0} 批。`
      : '';
    if (summary.failed) {
      const batchFailure = (summary.batchFailures || []).length
        ? ` ${summary.batchFailures.map(item => `第 ${item.batch} 批失败（${item.products} 个商品）`).join('；')}。`
        : '';
      $('#inventoryTransferMessage').textContent = `${batchSummary}已处理 ${summary.submitted || transfers.length} 个商品，其中成功 ${summary.success || 0} 个，失败 ${summary.failed} 个。${batchFailure}请刷新数据核对两边库存。`;
      toast(`库存转移完成，${summary.failed} 个商品失败`);
    } else {
      $('#inventoryTransferModal').classList.add('hidden');
      state.inventorySelection.clear();
      toast(`${batchSummary}已转移 ${summary.success || transfers.length} 个商品的库存`);
      await refreshDashboard();
    }
  } catch (error) {
    $('#inventoryTransferMessage').textContent = error.message;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '确认库存转移';
  }
}

function filteredPickupCandidates() {
  const filter = $('#pickupFilter').value;
  const query = $('#pickupSearch').value.trim().toLocaleLowerCase();
  return (state.pickup?.candidates || []).filter(item => {
    if (state.pickupChannel !== 'all' && item.channel !== state.pickupChannel) return false;
    if (query && ![item.orderNumber, item.postingNumber, item.productName, item.productOfferId].some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
    if (filter === 'ready') return item.canContact;
    if (filter === 'blocked') return !item.canContact && item.sentState !== 'sent';
    if (filter === 'sent') return item.sentState === 'sent';
    return true;
  });
}

function renderPickupChannelFilters() {
  const candidates = state.pickup?.candidates || [];
  const unavailable = state.pickup?.ordersUnavailable;
  const unavailableChannels = new Set(state.pickup?.unavailableChannels || []);
  const counts = {
    all: candidates.length,
    FBO: candidates.filter(item => item.channel === 'FBO').length,
    'FBS/rFBS': candidates.filter(item => item.channel === 'FBS/rFBS').length
  };
  document.querySelectorAll('[data-pickup-channel]').forEach(button => {
    const channel = button.dataset.pickupChannel;
    const label = channel === 'all' ? '全部渠道' : channel;
    const countLabel = unavailable
      || (channel === 'all' && unavailableChannels.size > 0)
      || (channel !== 'all' && unavailableChannels.has(channel))
      ? '—'
      : rub.format(counts[channel] || 0);
    button.textContent = `${label} · ${countLabel}`;
    button.classList.toggle('active', state.pickupChannel === channel);
    button.setAttribute('aria-pressed', String(state.pickupChannel === channel));
  });
}

function updatePickupSelectionControls(rows = filteredPickupCandidates()) {
  const sendable = rows.filter(item => item.canContact);
  const remindable = rows.filter(item => item.canRemindAgain);
  const allCandidates = state.pickup?.candidates || [];
  const selectedItems = allCandidates.filter(item => state.pickupSelection.has(item.postingNumber));
  const selectedFirst = selectedItems.filter(item => item.canContact);
  const selectedAgain = selectedItems.filter(item => item.canRemindAgain);
  const selectedMixed = selectedFirst.length > 0 && selectedAgain.length > 0;
  const selectedVisibleCount = selectedFirst.length && !selectedAgain.length
    ? sendable.filter(item => state.pickupSelection.has(item.postingNumber)).length
    : selectedAgain.length && !selectedFirst.length
      ? remindable.filter(item => state.pickupSelection.has(item.postingNumber)).length
      : 0;
  const selectAllItems = selectedFirst.length && !selectedAgain.length
    ? sendable
    : selectedAgain.length && !selectedFirst.length
      ? remindable
      : sendable.length ? sendable : remindable;
  const selectAll = $('#pickupSelectAll');
  selectAll.checked = selectAllItems.length > 0 && selectedVisibleCount === selectAllItems.length;
  selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < selectAllItems.length;
  selectAll.disabled = rows.length === 0;
  selectAll.title = selectAllItems.length ? '选择当前筛选下同一种提醒类型的订单' : '当前筛选没有可操作订单';
  $('#sendPickupSelected').disabled = !selectedFirst.length || selectedMixed;
  $('#sendPickupSelected').textContent = `发送所选提醒${selectedFirst.length ? ` · ${selectedFirst.length}` : ''} →`;
  $('#remindPickupAgainSelected').disabled = !selectedAgain.length || selectedMixed;
  $('#remindPickupAgainSelected').textContent = `再次提醒所选${selectedAgain.length ? ` · ${selectedAgain.length}` : ''} ↻`;
  const selectionHint = selectedMixed ? '首次提醒和再次提醒不能混合提交，请分开选择' : '';
  $('#sendPickupSelected').title = selectionHint || '给尚未提醒的订单发送首次提醒';
  $('#remindPickupAgainSelected').title = selectionHint || '给已提醒过的订单再次发送提醒';
}

function pickupStatus(item) {
  if (item.sentState === 'sent') {
    const count = Number.isSafeInteger(Number(item.reminderCount)) ? Number(item.reminderCount) : 1;
    const date = item.lastReminderAt ? new Date(item.lastReminderAt).toLocaleString('zh-CN', { hour12: false }) : '';
    const error = item.lastReminderError ? ` · 上次响应：${item.lastReminderError}` : '';
    return `<span class="status-pill live" title="${escapeHtml(date ? `发送请求已发出 · 最近一次 ${date} · 不代表买家已读${error}` : `发送请求已发出；不代表买家已读${error}`)}">已提醒 ${count} 次</span>${date ? `<small class="pickup-reminder-meta">最近：${escapeHtml(date)}</small>` : ''}`;
  }
  if (item.sentState === 'sending' || item.sentState === 'uncertain') return '<span class="status-pill pickup-pending">发送结果待核实</span>';
  if (item.sentState === 'failed') return '<span class="status-pill archived" title="可手动重试">发送失败，可重试</span>';
  return item.canContact ? '<span class="status-pill live">可创建聊天并发送</span>' : `<span class="status-pill archived" title="${escapeHtml(item.blockedReason)}">暂不可发送</span>`;
}

function renderAutoModeLabel() {
  const checked = $('#pickupAutoEnabled').checked;
  const saved = Boolean(state.pickup?.autoEnabled);
  $('#pickupAutoLabel').textContent = checked === saved
    ? (checked ? '已开启' : '已关闭')
    : (checked ? '待保存开启' : '待保存关闭');
}

function syncPickupTemplatePreset() {
  const template = $('#pickupTemplate').value;
  const preset = PICKUP_MESSAGE_PRESETS.find(item => item.message === template);
  $('#pickupTemplatePreset').value = preset?.id || 'custom';
}

function renderPickup() {
  const snapshot = state.pickup;
  if (!snapshot) return;
  const stats = snapshot.stats || {};
  const unavailable = Boolean(snapshot.ordersUnavailable);
  const unavailableChannels = new Set(snapshot.unavailableChannels || []);
  const totalsIncomplete = unavailable || unavailableChannels.size > 0;
  const knownCount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const partialCount = value => knownCount(value) > 0 ? `≥${rub.format(knownCount(value))}` : '—';
  $('#pickupArrived').textContent = totalsIncomplete ? partialCount(stats.arrived) : rub.format(stats.arrived || 0);
  $('#pickupEligible').textContent = totalsIncomplete ? '—' : rub.format(stats.eligible || 0);
  $('#pickupSent').textContent = totalsIncomplete ? partialCount(stats.sent) : rub.format(stats.sent || 0);
  $('#pickupBlocked').textContent = totalsIncomplete ? partialCount(stats.blocked) : rub.format(stats.blocked || 0);
  $('#pickupArrivedNote').textContent = totalsIncomplete ? '已知记录，渠道恢复后补全' : '已到 Ozon 自提点';
  $('#pickupEligibleNote').textContent = totalsIncomplete ? '部分渠道未同步，数量未知' : '买家会话可回复且尚未发送';
  $('#pickupSentNote').textContent = totalsIncomplete ? '已知已发送记录，不含未同步渠道' : '发送请求已发出，不代表买家已读';
  $('#pickupBlockedNote').textContent = totalsIncomplete ? '部分渠道未同步，数量未知' : '避免网络异常后重复联系';
  renderPickupChannelFilters();
  renderAutoModeLabel();
  $('#pickupTemplateCount').textContent = `${$('#pickupTemplate').value.length} / 1000`;
  const warnings = [state.pickupRefreshError, ...(snapshot.warnings || [])].filter(Boolean);
  $('#pickupWarning').classList.toggle('hidden', !warnings.length);
  $('#pickupWarning').textContent = warnings.join(' ');
  const rows = filteredPickupCandidates();
  const channelLabel = state.pickupChannel === 'all' ? '全部渠道' : state.pickupChannel;
  const selectedChannelUnavailable = unavailable
    || (state.pickupChannel === 'all' ? unavailableChannels.size > 0 : unavailableChannels.has(state.pickupChannel));
  $('#pickupCountLabel').textContent = selectedChannelUnavailable
    ? `显示 ${rows.length} 条已知记录 · 总数未知 · ${channelLabel}`
    : `显示 ${rows.length} / ${snapshot.candidates.length} 个到货订单 · ${channelLabel}`;
  $('#pickupLastUpdated').textContent = snapshot.syncedAt
    ? `最后同步：${new Date(snapshot.syncedAt).toLocaleString('zh-CN', { hour12: false })}${state.pickupRefreshError ? ' · 当前刷新失败，保留上次数据' : ''}`
    : '尚无成功同步记录';
  updatePickupSelectionControls(rows);
  if (!rows.length) {
    const emptyMessage = selectedChannelUnavailable
      ? '当前渠道读取失败或没有可用缓存，数量未知。请稍后重新同步；这不代表没有到货订单。'
      : snapshot.candidates.length ? '当前渠道或状态筛选下没有订单。' : '近 90 天没有发现已到 Ozon 自提点的订单。';
    $('#pickupTable').innerHTML = `<tr><td colspan="8" class="empty-state">${emptyMessage}</td></tr>`;
    return;
  }
  $('#pickupTable').innerHTML = rows.map(item => {
    const canSend = item.canContact;
    const canRemindAgain = item.canRemindAgain;
    const chatLabel = item.chatCreated ? '已有提醒聊天' : '发送时按订单创建聊天';
    const action = canSend
      ? `<button class="mini-action" data-send="${escapeHtml(item.postingNumber)}">${item.sentState === 'failed' ? '重试' : '发送'}</button>`
      : canRemindAgain
        ? `<button class="mini-action" data-remind-again="${escapeHtml(item.postingNumber)}">再次提醒</button>`
      : ['sending', 'uncertain'].includes(item.sentState)
        ? `<button class="mini-action" data-mark-sent="${escapeHtml(item.postingNumber)}" title="仅在 Ozon 聊天确认消息已发送后使用">标记已发送</button>`
      : '<button class="mini-action" disabled>—</button>';
    const checked = state.pickupSelection.has(item.postingNumber);
    const productLabel = item.productCount > 1 ? `${item.productName} · 共 ${item.productCount} 种商品` : item.productName;
    const productMeta = [item.productOfferId ? `货号 ${item.productOfferId}` : '', item.productQuantity > 1 ? `数量 ${item.productQuantity}` : ''].filter(Boolean).join(' · ');
    const productVisual = item.productImage
      ? `<span class="pickup-product-media"><img src="${escapeHtml(item.productImage)}" alt="${escapeHtml(item.productName)}" loading="lazy" data-pickup-image></span>`
      : '<span class="pickup-product-media pickup-product-placeholder" aria-label="暂无商品图片">无图</span>';
    const selectionLabel = canSend ? '选择订单进行首次提醒' : canRemindAgain ? '选择订单进行再次提醒' : '此订单当前不可操作';
    return `<tr><td><input class="pickup-select" type="checkbox" value="${escapeHtml(item.postingNumber)}" ${checked ? 'checked' : ''} ${canSend || canRemindAgain ? '' : 'disabled'} aria-label="${selectionLabel} ${escapeHtml(item.orderNumber)}"></td><td><div class="pickup-product-cell">${productVisual}<span class="pickup-product-copy"><strong title="${escapeHtml(productLabel)}">${escapeHtml(productLabel)}</strong><small>${escapeHtml(productMeta || '商品图片来自 Ozon 商品信息')}</small></span></div></td><td><strong class="pickup-order">${escapeHtml(item.orderNumber || item.postingNumber)}</strong><div class="product-sub">${escapeHtml(item.postingNumber)}</div></td><td>${escapeHtml(item.channel || '—')}</td><td><span class="status-pill pickup-arrival">已到自提点</span></td><td><span class="pickup-chat" title="${escapeHtml(item.blockedReason || '')}">${escapeHtml(chatLabel)}</span></td><td>${pickupStatus(item)}</td><td>${action}</td></tr>`;
  }).join('');
  updatePickupSelectionControls(rows);
}

async function loadPickup(options = {}) {
  const silent = options.silent === true;
  if (!state.configured) {
    openSettings();
    return;
  }
  const button = $('#refreshPickup');
  const hadSnapshot = Boolean(state.pickup);
  const templateDraft = $('#pickupTemplate').value;
  const autoDraft = $('#pickupAutoEnabled').checked;
  const templateChanged = hadSnapshot && templateDraft !== state.pickup.template;
  const autoChanged = hadSnapshot && autoDraft !== state.pickup.autoEnabled;
  button.disabled = true;
  button.innerHTML = '<span class="refresh-icon">◌</span>同步中';
  try {
    const response = await api(`/api/pickup/candidates${options.forceRefresh ? '?refresh=1' : ''}`);
    const snapshot = {
      ...response,
      ordersUnavailable: Boolean(response.ordersUnavailable),
      syncedAt: response.syncedAt || (response.ordersUnavailable ? '' : new Date().toISOString())
    };
    if (snapshot.ordersUnavailable && state.pickup && !state.pickup.ordersUnavailable) {
      state.pickupRefreshError = '本次同步失败，继续显示上次成功读取的订单数据。';
    } else {
      state.pickup = snapshot;
      state.pickupRefreshError = '';
    }
    const selectableNumbers = new Set((state.pickup.candidates || []).filter(item => item.canContact || item.canRemindAgain).map(item => item.postingNumber));
    state.pickupSelection = new Set([...state.pickupSelection].filter(number => selectableNumbers.has(number)));
    if (!templateChanged) $('#pickupTemplate').value = state.pickup.template || '';
    if (!autoChanged) $('#pickupAutoEnabled').checked = Boolean(state.pickup.autoEnabled);
    syncPickupTemplatePreset();
    $('#pickupTemplateCount').textContent = `${$('#pickupTemplate').value.length} / 1000`;
    renderPickup();
  } catch (error) {
    state.pickupRefreshError = `同步失败：${error.message}${state.pickup ? '，继续显示上次成功读取的订单数据。' : ''}`;
    if (!state.pickup) {
      state.pickup = { candidates: [], stats: {}, warnings: [], ordersUnavailable: true };
    }
    renderPickup();
    if (!silent) toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="refresh-icon">↻</span>同步到货订单';
    if (!silent) scheduleAutoRefresh();
  }
}

async function savePickupSettings() {
  if (!state.configured) return openSettings();
  const autoEnabled = $('#pickupAutoEnabled').checked;
  if (autoEnabled && !state.pickup?.autoEnabled) {
    const confirmed = window.confirm('开启后，本机服务每天检查一次，并自动向所有符合条件的新到货订单发送提醒；目前已到货且可发送的订单也可能在下一次检查时发送。是否开启？');
    if (!confirmed) {
      $('#pickupAutoEnabled').checked = false;
      return;
    }
  }
  const button = $('#savePickupSettings');
  button.disabled = true;
  try {
    const result = await api('/api/pickup/settings', {
      method: 'POST',
      body: JSON.stringify({ autoEnabled, template: $('#pickupTemplate').value })
    });
    if (state.pickup) {
      state.pickup.autoEnabled = result.autoEnabled;
      state.pickup.template = result.template;
      renderPickup();
    }
    toast(result.autoEnabled ? '提醒模板已保存，自动提醒已开启' : '到货提醒设置已保存');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function sendPickup(postingNumbers) {
  if (!postingNumbers.length) return toast('请先选择可发送的订单');
  const selectedItems = postingNumbers.map(number => state.pickup?.candidates.find(item => item.postingNumber === number)).filter(Boolean);
  if (selectedItems.some(item => !item.canContact) || selectedItems.some(item => item.canRemindAgain)) {
    return toast('选择中包含已提醒订单，请使用“再次提醒所选”并单独提交');
  }
  const orderLabels = postingNumbers.slice(0, 3).map(number => {
    const item = state.pickup?.candidates.find(candidate => candidate.postingNumber === number);
    return item?.orderNumber || number;
  });
  const suffix = postingNumbers.length > 3 ? ` 等 ${postingNumbers.length} 个订单` : '';
  const template = $('#pickupTemplate').value;
  const templateChanged = Boolean(state.pickup && template !== state.pickup.template);
  const saveNote = templateChanged ? '当前编辑的消息模板也会先保存并用于发送。' : '';
  const confirmed = window.confirm(`${saveNote}即将通过 Ozon 聊天发送俄语取货提醒：${orderLabels.join('、')}${suffix}。发送后无法撤回，继续吗？`);
  if (!confirmed) return;
  $('#sendPickupSelected').disabled = true;
  try {
    if (templateChanged) {
      await api('/api/pickup/settings', {
        method: 'POST',
        body: JSON.stringify({ autoEnabled: Boolean(state.pickup.autoEnabled), template })
      });
      state.pickup.template = template;
    }
    const result = await api('/api/pickup/send', {
      method: 'POST',
      body: JSON.stringify({ postingNumbers, confirm: true })
    });
    toast(`已发送 ${result.summary.sent} 条，未成功 ${result.summary.failed} 条`);
    await loadPickup();
  } catch (error) {
    toast(error.message);
  } finally {
    renderPickup();
  }
}

async function sendPickupAgain(postingNumbers) {
  if (!postingNumbers.length) return toast('请先选择已提醒的订单');
  const selectedItems = postingNumbers.map(number => state.pickup?.candidates.find(item => item.postingNumber === number)).filter(Boolean);
  if (selectedItems.some(item => !item.canRemindAgain) || selectedItems.some(item => item.canContact)) {
    return toast('选择中包含未提醒订单，请使用“发送所选提醒”并单独提交');
  }
  const orderLabels = postingNumbers.slice(0, 3).map(number => {
    const item = state.pickup?.candidates.find(candidate => candidate.postingNumber === number);
    return item?.orderNumber || number;
  });
  const suffix = postingNumbers.length > 3 ? ` 等 ${postingNumbers.length} 个订单` : '';
  const template = $('#pickupTemplate').value;
  const templateChanged = Boolean(state.pickup && template !== state.pickup.template);
  const saveNote = templateChanged ? '当前编辑的消息模板也会先保存并用于再次提醒。' : '';
  const confirmed = window.confirm(`${saveNote}即将通过已有 Ozon 买家聊天再次发送取货提醒：${orderLabels.join('、')}${suffix}。每个订单的提醒次数会增加 1 次，继续吗？`);
  if (!confirmed) return;
  $('#remindPickupAgainSelected').disabled = true;
  try {
    if (templateChanged) {
      await api('/api/pickup/settings', {
        method: 'POST',
        body: JSON.stringify({ autoEnabled: Boolean(state.pickup.autoEnabled), template })
      });
      state.pickup.template = template;
    }
    const result = await api('/api/pickup/remind-again', {
      method: 'POST',
      body: JSON.stringify({ postingNumbers, confirm: true })
    });
    toast(`已再次提醒 ${result.summary.sent} 条，未成功 ${result.summary.failed} 条`);
    await loadPickup();
  } catch (error) {
    toast(error.message);
  } finally {
    renderPickup();
  }
}

async function markPickupSent(postingNumber) {
  const item = state.pickup?.candidates.find(candidate => candidate.postingNumber === postingNumber);
  if (!item) return;
  const confirmed = window.confirm(`请确认你已在 Ozon 聊天中看到订单 ${item.orderNumber || postingNumber} 的提醒消息。确认后，本机将记为已发送并阻止重复发送。`);
  if (!confirmed) return;
  try {
    await api('/api/pickup/mark-sent', {
      method: 'POST',
      body: JSON.stringify({ postingNumber, confirm: true })
    });
    toast('已记录为发送成功，后续不会重复提醒');
    await loadPickup();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshDashboard(options = {}) {
  const silent = options.silent === true;
  if (!state.configured) {
    openSettings();
    return;
  }
  const button = $('#refreshButton');
  button.disabled = true;
  button.innerHTML = '<span class="refresh-icon">◌</span>加载中';
  try {
    const data = await api('/api/dashboard');
    state.products = data.products || [];
    state.analytics = data.analytics || null;
    renderRichContentProductOptions();
    state.inventoryWarehouses = data.inventoryWarehouses || [];
    state.warehouseStats = data.warehouseStats || [];
    $('#totalProducts').textContent = rub.format(data.stats.total);
    $('#activeProducts').textContent = rub.format(data.stats.active);
    $('#warningBanner').classList.toggle('hidden', !data.warnings?.length);
    $('#warningBanner').textContent = (data.warnings || []).join(' ');
    if (state.products.length && !state.products.some(canUpdateInventory)) {
      $('#warningBanner').classList.remove('hidden');
      $('#warningBanner').textContent = inventoryAvailabilityMessage();
    }
    $('#lastUpdated').textContent = `最后同步：${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    renderProducts();
    if (!silent) toast(`已加载 ${state.products.length} 个商品`);
  } catch (error) {
    if (!silent) toast(error.message);
    if (!silent && /API ID|API Key|设置/.test(error.message)) openSettings();
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="refresh-icon">↻</span>刷新数据';
    if (!silent) scheduleAutoRefresh();
  }
}

function openSettings() {
  $('#settingsModal').classList.remove('hidden');
  $('#settingsMessage').textContent = '';
  $('#settingsMessage').className = 'modal-message';
  $('#settingsForm').elements.clientId.value = '';
  $('#settingsForm').elements.apiKey.value = '';
  $('#settingsForm').elements.clientId.focus();
}

const RICH_CONTENT_TEMPLATE = JSON.stringify({ version: 1, blocks: [] }, null, 2);

function setRichContentMessage(message = '', success = false) {
  const element = $('#richContentMessage');
  if (!element) return;
  element.textContent = message;
  element.className = success ? 'modal-message success' : 'modal-message';
}

function selectedRichContentProduct() {
  const productId = $('#richContentProductSelect')?.value || '';
  return state.products.find(product => String(product.productId) === String(productId)) || null;
}

function renderRichContentProductOptions() {
  const select = $('#richContentProductSelect');
  if (!select) return;
  const search = ($('#richContentProductSearch')?.value || '').trim().toLocaleLowerCase();
  const selected = select.value || state.richContentSelectedProductId;
  const sortedProducts = state.products
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));
  const matches = sortedProducts.filter(product => !search || [product.productId, product.offerId, product.name]
    .some(value => String(value || '').toLocaleLowerCase().includes(search)));
  const selectedProduct = sortedProducts.find(product => String(product.productId) === String(selected));
  const selectedIsInResults = matches.some(product => String(product.productId) === String(selected));
  const optionMarkup = product => `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name || '未命名商品')} · Offer ID: ${escapeHtml(product.offerId || '—')} · ID: ${escapeHtml(product.productId)}</option>`;
  const currentSelection = selectedProduct && !selectedIsInResults
    ? `<optgroup label="当前已选商品">${optionMarkup(selectedProduct)}</optgroup>`
    : '';
  const results = matches.length
    ? `<optgroup label="搜索结果（${matches.length}）">${matches.map(optionMarkup).join('')}</optgroup>`
    : '';
  const emptyLabel = !sortedProducts.length ? '请先刷新商品列表' : search ? '没有匹配的商品' : '请选择商品';
  select.innerHTML = `<option value="">${emptyLabel}</option>${currentSelection}${results}`;
  if (selectedProduct) select.value = String(selectedProduct.productId);
  const status = $('#richContentProductSearchStatus');
  if (status) status.textContent = sortedProducts.length
    ? `共 ${sortedProducts.length} 件商品 · 当前匹配 ${matches.length} 件`
    : '请先刷新商品列表';
  updateRichContentProductSummary();
}

function updateRichContentProductSummary() {
  const product = selectedRichContentProduct();
  const loadButton = $('#loadRichContent');
  const submitButton = $('#submitRichContent');
  if (loadButton) loadButton.disabled = !product;
  if (submitButton) submitButton.disabled = !product || !$('#richContentInput')?.value.trim();
  const container = $('#richContentProductSummary');
  if (!container) return;
  if (!product) {
    container.innerHTML = '<div class="rich-content-empty">选择商品后显示商品图片、名称和 Offer ID。</div>';
    return;
  }
  const visual = product.image
    ? `<span class="rich-content-product-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-rich-content-image></span>`
    : '<span class="rich-content-product-media rich-content-product-placeholder" aria-label="暂无商品图片">无图</span>';
  container.innerHTML = `${visual}<div class="rich-content-product-copy"><strong title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong><span>Offer ID：${escapeHtml(product.offerId || '—')}</span><span>商品 ID：${escapeHtml(product.productId)}</span></div>`;
}

function richContentImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function richContentDisplayText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  for (const key of ['text', 'title', 'description', 'value', 'content']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return '';
}

function renderRichContentPreview(value) {
  const container = $('#richContentPreview');
  if (!container) return;
  if (!value || typeof value !== 'object') {
    container.innerHTML = '<div class="rich-content-empty">输入或读取 JSON 后，这里会显示预览。</div>';
    return;
  }
  const blocks = Array.isArray(value) ? value : (Array.isArray(value.blocks) ? value.blocks : []);
  if (!blocks.length) {
    container.innerHTML = '<div class="rich-content-preview-empty"><strong>JSON 已解析</strong><span>当前未找到 blocks，Ozon 组件的最终效果请以商品页为准。</span></div>';
    return;
  }
  container.innerHTML = blocks.slice(0, 20).map((block, index) => {
    const item = block && typeof block === 'object' ? block : { content: block };
    const type = String(item.type || item.block_type || item.component || `组件 ${index + 1}`);
    const image = richContentImageUrl(item.image || item.image_url || item.url || item.src);
    const text = richContentDisplayText(item);
    const fallback = text || (item.content && typeof item.content === 'object' ? richContentDisplayText(item.content) : '') || '该组件将在 Ozon 中按账号支持的结构呈现';
    return `<article class="rich-preview-block"><div class="rich-preview-type">${escapeHtml(type)}</div>${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" data-rich-preview-image>` : ''}<p>${escapeHtml(fallback)}</p></article>`;
  }).join('') + (blocks.length > 20 ? '<div class="rich-content-preview-more">仅预览前 20 个组件</div>' : '');
}

function parseRichContentEditor(showMessage = true) {
  const raw = $('#richContentInput')?.value.trim() || '';
  const container = $('#richContentPreview');
  if (!raw) {
    if (showMessage) setRichContentMessage('请先选择商品并填写富内容 JSON。');
    renderRichContentPreview(null);
    updateRichContentProductSummary();
    return null;
  }
  let value;
  try { value = JSON.parse(raw); }
  catch {
    if (showMessage) setRichContentMessage('富内容 JSON 格式不正确，请检查括号、引号和逗号。');
    container.innerHTML = '<div class="rich-content-empty rich-content-invalid">JSON 格式不正确，预览暂不可用。</div>';
    return null;
  }
  if (!value || typeof value !== 'object') {
    if (showMessage) setRichContentMessage('富内容必须是 JSON 对象或数组。');
    container.innerHTML = '<div class="rich-content-empty rich-content-invalid">顶层内容必须为对象或数组。</div>';
    return null;
  }
  renderRichContentPreview(value);
  if (showMessage) setRichContentMessage('JSON 校验通过。提交前请确认结构来自 Ozon 富内容构造器。', true);
  updateRichContentProductSummary();
  return value;
}

function setRichContentTemplate(target, messageTarget) {
  const input = $(target);
  if (!input) return;
  if (input.value.trim() && !window.confirm('当前编辑器已有内容，确定用空模板替换吗？')) return;
  input.value = RICH_CONTENT_TEMPLATE;
  if (messageTarget) $(messageTarget).textContent = '已插入空模板，请按 Ozon 富内容构造器结构编辑。';
  if (target === '#richContentInput') parseRichContentEditor(false);
}

async function loadSelectedRichContent() {
  const product = selectedRichContentProduct();
  if (!product) return toast('请先选择一个商品');
  const button = $('#loadRichContent');
  button.disabled = true;
  setRichContentMessage('正在读取 Ozon 当前富内容…');
  try {
    const data = await api(`/api/rich-content?product_id=${encodeURIComponent(product.productId)}`);
    $('#richContentInput').value = data.richContentText || '';
    state.richContentLoadedProductId = product.productId;
    if (!data.found) {
      renderRichContentPreview(null);
      setRichContentMessage('Ozon 未返回该商品的富内容，可以在此编辑后提交。');
    } else if (!data.validJson) {
      renderRichContentPreview(null);
      setRichContentMessage('已读取到内容，但它不是有效 JSON。原文已保留，请修正后再提交。');
    } else {
      parseRichContentEditor(false);
      setRichContentMessage('已读取当前富内容并格式化。', true);
    }
  } catch (error) {
    setRichContentMessage(error.message);
  } finally {
    updateRichContentProductSummary();
    button.disabled = false;
  }
}

async function submitRichContent(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  const product = selectedRichContentProduct();
  const richContent = parseRichContentEditor(true);
  if (!product || !richContent) return;
  if (!window.confirm(`即将更新商品“${product.name}”（${product.offerId || product.productId}）的富内容，提交后会写入 Ozon。确定继续吗？`)) return;
  const button = $('#submitRichContent');
  const taskPanel = $('#richContentTaskPanel');
  button.disabled = true;
  button.textContent = '提交中…';
  setRichContentMessage('正在提交 Ozon 富内容任务…');
  taskPanel.classList.add('hidden');
  try {
    const result = await api('/api/rich-content', { method: 'POST', body: JSON.stringify({ confirm: true, items: [{ productId: product.productId, offerId: product.offerId, richContent }] }) });
    taskPanel.classList.remove('hidden');
    taskPanel.innerHTML = `<h3>富内容更新任务</h3><p>任务 ID：<strong>${escapeHtml(result.taskId || '已提交')}</strong> · <span class="task-state">正在等待 Ozon 处理…</span></p>`;
    setRichContentMessage('富内容更新请求已提交。', true);
    if (result.taskId) pollImport(result.taskId, taskPanel);
    toast('富内容已提交，正在查询处理结果');
  } catch (error) {
    setRichContentMessage(error.message);
    toast(error.message);
  } finally {
    button.textContent = '提交到 Ozon →';
    updateRichContentProductSummary();
  }
}

function renderDomesticExpressConfig(config) {
  state.domesticExpressConfig = config || {};
  const status = $('#domesticExpressConfigStatus');
  const button = $('#openDomesticExpressSettings');
  if (!status || !button) return;
  status.textContent = config?.configured
    ? `快递 100 已配置 ${config.customerHint || ''}`
    : '尚未配置快递 100 Customer / Key';
  status.classList.toggle('configured', Boolean(config?.configured));
  button.title = config?.configured ? '修改快递查询 API 配置' : '配置快递查询 API';
}

async function loadDomesticExpressConfig() {
  try {
    renderDomesticExpressConfig(await api('/api/domestic-express/config'));
  } catch (error) {
    $('#domesticExpressConfigStatus').textContent = error.message;
  }
}

function renderDomesticExpressResult(result) {
  state.domesticExpressResult = result || null;
  const panel = $('#domesticExpressResultPanel');
  if (!panel) return;
  if (!result) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#domesticExpressResultNumber').textContent = result.number || '—';
  $('#domesticExpressResultCarrier').textContent = result.carrierLabel || '快递公司未识别';
  $('#domesticExpressResultUpdated').textContent = result.updatedAt ? `最近轨迹：${orderDateLabel(result.updatedAt)}` : '暂无更新时间';
  $('#domesticExpressResultMeta').textContent = `${result.source || '快递查询接口'}${result.cached ? ' · 使用本机短时缓存' : ''}`;
  const status = $('#domesticExpressResultStatus');
  status.textContent = result.statusLabel || '运输中';
  status.className = `express-status-pill ${result.status === '3' ? 'delivered' : result.status === '2' ? 'exception' : ''}`;
  const timeline = $('#domesticExpressTimeline');
  const traces = Array.isArray(result.traces) ? result.traces : [];
  timeline.innerHTML = traces.length
    ? traces.map((item, index) => `<div class="express-timeline-item ${index === 0 ? 'current' : ''}"><span class="express-timeline-dot" aria-hidden="true"></span><div><time>${escapeHtml(item.time || '时间未返回')}</time><p>${escapeHtml(item.context || '物流状态未返回')}</p></div></div>`).join('')
    : '<div class="empty-state express-empty">暂未返回物流轨迹，请核对单号、快递公司和手机号后四位。</div>';
}

function openDomesticExpressSettings() {
  const form = $('#domesticExpressSettingsForm');
  form.elements.customer.value = '';
  form.elements.key.value = '';
  $('#domesticExpressSettingsMessage').textContent = '';
  $('#domesticExpressSettingsMessage').className = 'modal-message';
  $('#domesticExpressSettingsModal').classList.remove('hidden');
  form.elements.customer.focus();
}

async function submitDomesticExpressQuery(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#queryDomesticExpress');
  const status = $('#domesticExpressQueryStatus');
  const number = form.elements.number.value.trim();
  const carrier = form.elements.carrier.value;
  const phone = form.elements.phone.value.trim();
  if (!number) return toast('请输入快递单号');
  button.disabled = true;
  button.innerHTML = '<span>◌</span>查询中';
  status.textContent = '正在查询物流轨迹，请稍候…';
  renderDomesticExpressResult(null);
  try {
    const result = await api('/api/domestic-express/query', {
      method: 'POST',
      body: JSON.stringify({ number, carrier, phone })
    });
    renderDomesticExpressResult(result);
    status.textContent = result.traces?.length ? `查询完成，共返回 ${result.traces.length} 条轨迹。` : '接口已返回，但暂时没有物流轨迹。';
  } catch (error) {
    status.textContent = error.message;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>⌕</span>查询物流';
  }
}

async function submitDomesticExpressSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#domesticExpressSettingsMessage');
  const button = $('#saveDomesticExpressSettings');
  button.disabled = true;
  message.textContent = '正在保存设置…';
  message.className = 'modal-message';
  try {
    const response = await api('/api/domestic-express/config', {
      method: 'POST',
      body: JSON.stringify({ customer: form.elements.customer.value.trim(), key: form.elements.key.value.trim() })
    });
    renderDomesticExpressConfig(response.config);
    message.textContent = '快递查询 API 设置已保存。';
    message.className = 'modal-message success';
    setTimeout(() => $('#domesticExpressSettingsModal').classList.add('hidden'), 450);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function showView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === viewName));
  $(`#${viewName}View`).classList.add('active');
  $('#breadcrumbCurrent').textContent = viewName === 'add' ? '添加商品' : viewName === 'rich-content' ? '富内容' : viewName === 'pickup' ? '到货提醒' : viewName === 'domestic-express' ? '国内快递' : viewName === 'sourcing' ? '找货源' : viewName === 'orders' ? '订单' : viewName === 'product-profit' ? '商品利润' : viewName === 'pricing-promotions' ? '价格与促销' : '商品与库存';
  if (['add', 'rich-content'].includes(viewName) && !state.configured) openSettings();
  if (viewName === 'products' && state.configured) refreshDashboard();
  if (viewName === 'pricing-promotions' && state.configured) loadPricingPromotions();
  if (viewName === 'product-profit' && state.configured) loadProductProfit();
  if (viewName === 'orders' && state.configured) loadOrders();
  else if (state.configured) loadBalance({ silent: true });
  if (viewName === 'pickup' && state.configured) loadPickup();
  if (viewName === 'domestic-express') loadDomesticExpressConfig();
  if (viewName === 'sourcing') loadSourcingConfig();
  if (viewName === 'rich-content') {
    renderRichContentProductOptions();
    if (state.configured && !state.products.length) refreshDashboard({ silent: true });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function orderDateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('zh-CN', { hour12: false });
}

function orderAmountLabel(order) {
  return order.amountCny === null || order.amountCny === undefined
    ? '—'
    : `${cny.format(Number(order.amountCny))} CNY`;
}

function canOperateFbsOrder(order) {
  const actions = Array.isArray(order.availableActions)
    ? order.availableActions.map(action => String(action || '').toLowerCase())
    : [];
  return order.channel === 'FBS/rFBS'
    && Boolean(order.postingNumber)
    && String(order.status || '').toLowerCase() === 'awaiting_packaging'
    && actions.includes('pack');
}

function setOrderActionNotice(message, success = false) {
  const notice = $('#ordersActionNotice');
  notice.textContent = message || '';
  notice.classList.toggle('hidden', !message);
  notice.classList.toggle('success', Boolean(message) && success);
}

function renderOrderSplitDraft() {
  const draft = orderSplitDraft;
  if (!draft) return;
  $('#orderSplitNumber').textContent = `订单 ${draft.orderNumber || draft.postingNumber}`;
  $('#orderSplitList').innerHTML = draft.products.map(product => {
    const packageOneQuantity = draft.packageOneQuantities[product.productId] ?? 0;
    const meta = [product.offerId ? `Offer ID ${product.offerId}` : '', `SKU ${product.productId}`, `订单数量 ${product.quantity}`].filter(Boolean).join(' · ');
    return `<div class="inventory-item order-split-item"><div class="inventory-item-heading"><div class="order-split-product"><strong title="${escapeHtml(product.name || product.offerId || product.productId)}">${escapeHtml(product.name || product.offerId || `SKU ${product.productId}`)}</strong><small>${escapeHtml(meta)}</small></div><label class="order-split-quantity"><span>包裹 1 数量</span><input class="order-split-input" type="number" min="0" max="${product.quantity}" step="1" value="${packageOneQuantity}" data-split-sku="${escapeHtml(product.productId)}" aria-label="${escapeHtml(product.name || product.offerId || product.productId)} 分配到包裹 1 的数量"></label></div></div>`;
  }).join('');
  updateOrderSplitSummary();
}

function updateOrderSplitSummary() {
  if (!orderSplitDraft) return;
  let packageOneQuantity = 0;
  let totalQuantity = 0;
  let valid = true;
  document.querySelectorAll('.order-split-input').forEach(input => {
    const product = orderSplitDraft.products.find(item => item.productId === input.dataset.splitSku);
    const value = input.value.trim();
    const quantity = Number(value);
    const inputValid = Boolean(product) && /^\d+$/.test(value) && Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= product.quantity;
    input.setAttribute('aria-invalid', String(!inputValid));
    valid = valid && inputValid;
    if (inputValid) packageOneQuantity += quantity;
  });
  totalQuantity = orderSplitDraft.totalQuantity;
  const packageTwoQuantity = totalQuantity - packageOneQuantity;
  $('#orderSplitPackageOneCount').textContent = rub.format(packageOneQuantity);
  $('#orderSplitPackageTwoCount').textContent = rub.format(packageTwoQuantity);
  const canSubmit = valid && packageOneQuantity > 0 && packageTwoQuantity > 0;
  $('#submitOrderSplit').disabled = !canSubmit;
  $('#orderSplitMessage').textContent = canSubmit ? '' : '请确保两个包裹都有商品，并且每种商品分配数量不超过订单数量。';
}

async function openOrderSplitModal(postingNumber) {
  if (orderActionBusy.has(postingNumber)) return;
  orderActionBusy.add(postingNumber);
  renderOrders();
  try {
    const preview = await api('/api/orders/action-preview', {
      method: 'POST',
      body: JSON.stringify({ postingNumber })
    });
    if (preview.totalQuantity < 2) return toast('订单总件数不足 2 件，无法拆成两个包裹。');
    const packageOneQuantities = {};
    let assignedInitialUnit = false;
    preview.products.forEach(product => {
      const quantity = !assignedInitialUnit && product.quantity > 0 ? 1 : 0;
      packageOneQuantities[product.productId] = quantity;
      if (quantity) assignedInitialUnit = true;
    });
    orderSplitDraft = { ...preview, packageOneQuantities };
    renderOrderSplitDraft();
    $('#orderSplitModal').classList.remove('hidden');
    $('#orderSplitList').querySelector('.order-split-input')?.focus();
  } catch (error) {
    toast(error.message);
  } finally {
    orderActionBusy.delete(postingNumber);
    renderOrders();
  }
}

async function packOrder(postingNumber) {
  const order = (state.orders?.orders || []).find(item => item.postingNumber === postingNumber);
  if (!order || !canOperateFbsOrder(order) || orderActionBusy.has(postingNumber)) return;
  const label = order.orderNumber || postingNumber;
  if (!window.confirm(`确认对 FBS/rFBS 订单 ${label} 执行备货吗？Ozon 将把该订单推进到待发运状态。`)) return;
  orderActionBusy.add(postingNumber);
  renderOrders();
  try {
    const response = await api('/api/orders/pack', {
      method: 'POST',
      body: JSON.stringify({ confirm: true, postingNumber })
    });
    if (response.verified) {
      Object.assign(order, {
        status: response.status,
        statusLabel: response.statusLabel || '等待发运',
        category: 'ready_to_ship',
        categoryLabel: '待发运',
        availableActions: response.availableActions || []
      });
      setOrderActionNotice(`订单 ${label} 已备货，Ozon 状态：${response.statusLabel || '等待发运'}。`, true);
    } else {
      setOrderActionNotice(response.warning || `订单 ${label} 的备货请求已提交，请同步订单核实状态。`);
    }
  } catch (error) {
    setOrderActionNotice(error.message || '备货请求失败。');
    toast(error.message);
  } finally {
    orderActionBusy.delete(postingNumber);
    renderOrders();
  }
}

async function submitOrderSplit(event) {
  event.preventDefault();
  if (!orderSplitDraft) return;
  updateOrderSplitSummary();
  if ($('#submitOrderSplit').disabled) return;
  const packageOne = [...document.querySelectorAll('.order-split-input')].map(input => ({
    productId: input.dataset.splitSku,
    quantity: Number(input.value)
  }));
  const packageOneQuantity = packageOne.reduce((sum, item) => sum + item.quantity, 0);
  const packageTwoQuantity = orderSplitDraft.totalQuantity - packageOneQuantity;
  const label = orderSplitDraft.orderNumber || orderSplitDraft.postingNumber;
  if (!window.confirm(`确认拆分订单 ${label}？包裹 1 为 ${packageOneQuantity} 件，包裹 2 为 ${packageTwoQuantity} 件。拆分会直接提交到 Ozon。`)) return;
  const postingNumber = orderSplitDraft.postingNumber;
  $('#submitOrderSplit').disabled = true;
  $('#cancelOrderSplit').disabled = true;
  $('#closeOrderSplit').disabled = true;
  $('#orderSplitMessage').textContent = '正在向 Ozon 提交拆单请求…';
  try {
    const response = await api('/api/orders/split', {
      method: 'POST',
      body: JSON.stringify({ confirm: true, postingNumber, packageOne })
    });
    $('#orderSplitModal').classList.add('hidden');
    orderSplitDraft = null;
    if (response.warning) setOrderActionNotice(response.warning);
    else {
      const newPostings = response.splitPostings?.length ? `，新运单：${response.splitPostings.join('、')}` : '';
      setOrderActionNotice(`订单 ${label} 已提交拆分：包裹 ${packageOneQuantity} 件、${packageTwoQuantity} 件${newPostings}。点击“同步订单”核对拆分后的运单。`, true);
    }
  } catch (error) {
    $('#orderSplitMessage').textContent = error.message;
    $('#submitOrderSplit').disabled = false;
    toast(error.message);
  } finally {
    $('#cancelOrderSplit').disabled = false;
    $('#closeOrderSplit').disabled = false;
    renderOrders();
  }
}

function filteredOrders() {
  const query = $('#ordersSearchInput').value.trim().toLowerCase();
  return (state.orders?.orders || []).filter(order => {
    const matchesCategory = state.orderCategory === 'all' || order.category === state.orderCategory;
    const matchesChannel = state.orderChannel === 'all' || order.channel === state.orderChannel;
    const searchable = [order.orderNumber, order.postingNumber, order.orderId, order.productName, order.productOfferId, order.statusLabel].join(' ').toLowerCase();
    return matchesCategory && matchesChannel && (!query || searchable.includes(query));
  });
}

function ordersForSelectedChannel() {
  return (state.orders?.orders || []).filter(order => state.orderChannel === 'all' || order.channel === state.orderChannel);
}

function selectedOrderStats() {
  const orders = ordersForSelectedChannel();
  const byCategory = Object.fromEntries(['preparing', 'ready_to_ship', 'in_transit', 'delivered', 'cancelled', 'other']
    .map(category => [category, orders.filter(order => order.category === category).length]));
  return { total: orders.length, byCategory };
}

function renderOrderChannelTabs() {
  const orders = state.orders?.orders || [];
  const unavailableChannels = new Set(state.orders?.unavailableChannels || []);
  document.querySelectorAll('[data-order-channel]').forEach(button => {
    const channel = button.dataset.orderChannel;
    const count = channel === 'all' ? orders.length : orders.filter(order => order.channel === channel).length;
    const label = channel === 'all' ? '全部渠道' : channel;
    const countLabel = (state.orders?.ordersUnavailable || (channel !== 'all' && unavailableChannels.has(channel)))
      ? '—'
      : rub.format(count);
    button.textContent = `${label} · ${countLabel}`;
    button.classList.toggle('active', state.orderChannel === channel);
    button.setAttribute('aria-selected', String(state.orderChannel === channel));
  });
}

function renderOrderCategoryTabs() {
  const selectedStats = selectedOrderStats();
  const counts = selectedStats.byCategory;
  document.querySelectorAll('[data-order-category]').forEach(button => {
    const category = button.dataset.orderCategory;
    const count = category === 'all' ? selectedStats.total : counts[category] || 0;
    button.textContent = `${category === 'all' ? '全部' : ({ preparing: '备货', ready_to_ship: '待发运', in_transit: '运输中', delivered: '已签收', cancelled: '已取消', other: '其他' }[category] || category)} · ${state.orders?.ordersUnavailable ? '—' : rub.format(count)}`;
    button.classList.toggle('active', state.orderCategory === category);
    button.setAttribute('aria-selected', String(state.orderCategory === category));
  });
}

function renderBalance() {
  const rubElement = $('#ordersBalanceRub');
  const cnyElement = $('#ordersBalanceCny');
  const noteElement = $('#ordersBalanceNote');
  if (!rubElement || !cnyElement || !noteElement) return;
  const alertElement = $('#ordersBalanceAlert');
  const balanceCard = rubElement.closest('.balance-metric-card');
  const balance = state.balance;
  if (!balance || !balance.available) {
    rubElement.textContent = '— RUB';
    cnyElement.textContent = '≈ — CNY';
    noteElement.textContent = balance?.warning || '暂无法读取 Ozon 财务余额';
    noteElement.title = balance?.warning || '';
    alertElement?.classList.add('hidden');
    balanceCard?.classList.remove('balance-alert-active');
    return;
  }
  rubElement.textContent = `RUB ${rub.format(Number(balance.rub))}`;
  cnyElement.textContent = `≈ CNY ${cny.format(Number(balance.cny))}`;
  const cnyBalance = Number(balance.cny);
  const thresholdReached = Number.isFinite(cnyBalance) && cnyBalance >= BALANCE_ALERT_THRESHOLD_CNY;
  if (alertElement) {
    alertElement.textContent = thresholdReached
      ? `余额已达到提醒线 CNY ${cny.format(BALANCE_ALERT_THRESHOLD_CNY)}（当前 CNY ${cny.format(cnyBalance)}）`
      : '';
    alertElement.classList.toggle('hidden', !thresholdReached);
  }
  balanceCard?.classList.toggle('balance-alert-active', thresholdReached);
  const shopKey = state.activeShopId || 'default';
  const storageKey = `ozon-balance-alerted-v1:${shopKey}`;
  let previouslyNotified = state.balanceAlertNotifiedShops.has(shopKey);
  try { previouslyNotified ||= localStorage.getItem(storageKey) === 'true'; } catch { /* 页面内状态仍可阻止重复提醒 */ }
  if (thresholdReached) {
    if (!previouslyNotified) {
      state.balanceAlertNotifiedShops.add(shopKey);
      try { localStorage.setItem(storageKey, 'true'); } catch { /* 不影响页面提醒 */ }
      const shopName = state.shops.find(shop => shop.id === shopKey)?.name;
      toast(`${shopName ? `${shopName}：` : ''}余额已达到提醒线 CNY ${cny.format(BALANCE_ALERT_THRESHOLD_CNY)}，当前 CNY ${cny.format(cnyBalance)}`);
    }
  } else {
    state.balanceAlertNotifiedShops.delete(shopKey);
    try { localStorage.removeItem(storageKey); } catch { /* 不影响页面提醒 */ }
  }
  const rate = Number(balance.exchangeRate);
  const rateLabel = Number.isFinite(rate) ? `1 RUB = ${rate.toFixed(4)} CNY` : 'CNY 为参考换算值';
  const periodEnd = Date.parse(balance.period?.end || balance.period?.to || '');
  const periodLabel = Number.isFinite(periodEnd) ? `余额截至 ${new Date(periodEnd).toLocaleDateString('zh-CN')}` : 'Ozon 当前余额';
  const syncedLabel = balance.syncedAt ? ` · ${orderDateLabel(balance.syncedAt)}` : '';
  noteElement.textContent = `${balance.stale ? '缓存余额 · ' : ''}${periodLabel} · ${rateLabel}${syncedLabel}`;
  noteElement.title = balance.warning || '余额来自 Ozon 财务余额接口；CNY 为按配置汇率换算的参考值。';
}

function renderOrders() {
  const snapshot = state.orders;
  if (!snapshot) return;
  renderBalance();
  const stats = selectedOrderStats();
  const unavailable = Boolean(snapshot.ordersUnavailable);
  $('#ordersTotal').textContent = unavailable ? '—' : rub.format(stats.total || 0);
  $('#ordersPreparing').textContent = unavailable ? '—' : rub.format(stats.byCategory?.preparing || 0);
  $('#ordersInTransit').textContent = unavailable ? '—' : rub.format(stats.byCategory?.in_transit || 0);
  $('#ordersDelivered').textContent = unavailable ? '—' : rub.format(stats.byCategory?.delivered || 0);
  const channelLabel = state.orderChannel === 'all' ? 'FBO + FBS/rFBS' : state.orderChannel;
  $('#ordersPeriodNote').textContent = `最近 ${snapshot.lookbackDays || 90} 天 · ${channelLabel}`;
  renderOrderChannelTabs();
  renderOrderCategoryTabs();
  const warnings = [state.ordersRefreshError, state.balanceRefreshError, state.balance?.warning, ...(snapshot.warnings || [])].filter(Boolean);
  $('#ordersWarning').classList.toggle('hidden', !warnings.length);
  $('#ordersWarning').textContent = warnings.join(' ');
  const rows = filteredOrders();
  const channelDescription = state.orderChannel === 'all' ? '全部渠道' : state.orderChannel;
  $('#ordersCountLabel').textContent = unavailable
    ? `订单数量未知 · ${channelDescription}`
    : `显示 ${rows.length} / ${ordersForSelectedChannel().length} 个订单 · ${channelDescription}`;
  $('#ordersLastUpdated').textContent = snapshot.syncedAt
    ? `最后同步：${orderDateLabel(snapshot.syncedAt)}${state.ordersRefreshError ? ' · 当前刷新失败，保留上次数据' : ''}`
    : '尚无成功同步记录';
  if (!rows.length) {
    const emptyMessage = unavailable
      ? '订单读取失败，数量未知。请检查网络后重试；这不代表没有订单。'
      : snapshot.orders.length ? '当前渠道或状态筛选下没有订单。' : '近 90 天没有读取到订单。';
    $('#ordersTable').innerHTML = `<tr><td colspan="9" class="empty-state">${emptyMessage}</td></tr>`;
    return;
  }
  $('#ordersTable').innerHTML = rows.map(order => {
    const productLabel = order.productCount > 1 ? `${order.productName} · 共 ${order.productCount} 种商品` : order.productName;
    const productMeta = [order.productOfferId ? `货号 ${order.productOfferId}` : '', order.productQuantity > 1 ? `数量 ${order.productQuantity}` : ''].filter(Boolean).join(' · ');
    const productVisual = order.productImage
      ? `<span class="order-product-media"><img src="${escapeHtml(order.productImage)}" alt="${escapeHtml(order.productName)}" loading="lazy" data-order-image></span>`
      : '<span class="order-product-media order-product-placeholder" aria-label="暂无商品图片">无图</span>';
    const statusClass = order.category === 'delivered' ? 'live' : order.category === 'cancelled' ? 'archived' : order.category === 'in_transit' ? 'order-transit' : 'order-preparing';
    const logistics = [order.warehouse, order.deliveryMethod].filter(Boolean).join(' · ') || '—';
    const actionable = canOperateFbsOrder(order);
    const busy = orderActionBusy.has(order.postingNumber);
    const orderActions = actionable
      ? `<div class="order-row-actions"><button type="button" class="mini-action" data-order-action="pack" data-posting-number="${escapeHtml(order.postingNumber)}" ${busy ? 'disabled' : ''}>${busy ? '处理中…' : '备货'}</button><button type="button" class="mini-action" data-order-action="split" data-posting-number="${escapeHtml(order.postingNumber)}" title="${Number(order.productQuantity) < 2 ? '订单总件数至少 2 件才能拆分' : '拆分为两个包裹'}" ${busy || Number(order.productQuantity) < 2 ? 'disabled' : ''}>拆分订单</button></div>`
      : '<span class="order-no-action">—</span>';
    return `<tr><td><div class="order-product-cell">${productVisual}<span class="order-product-copy"><strong title="${escapeHtml(productLabel)}">${escapeHtml(productLabel)}</strong><small>${escapeHtml(productMeta || '商品图片来自 Ozon 订单信息')}</small></span></div></td><td><strong class="order-number">${escapeHtml(order.orderNumber || order.postingNumber || '—')}</strong><div class="product-sub">${escapeHtml(order.postingNumber || order.orderId || '')}</div></td><td><span class="status-pill ${statusClass}">${escapeHtml(order.statusLabel || order.categoryLabel || '—')}</span><small class="order-status-meta">${escapeHtml(order.categoryLabel || '')}</small></td><td><span class="order-channel">${escapeHtml(order.channel || '—')}</span></td><td><span class="order-logistics">${escapeHtml(logistics)}</span></td><td>${rub.format(order.productQuantity || 0)} 件</td><td><strong class="order-amount">${orderAmountLabel(order)}</strong></td><td><span class="order-date">${orderDateLabel(order.createdAt)}</span>${order.shipmentDate ? `<small class="order-status-meta">发运：${orderDateLabel(order.shipmentDate)}</small>` : ''}</td><td>${orderActions}</td></tr>`;
  }).join('');
}

async function loadBalance(options = {}) {
  if (!state.configured) return;
  try {
    const response = await api(`/api/balance${options.forceRefresh ? '?refresh=1' : ''}`);
    state.balance = response;
    state.balanceRefreshError = '';
  } catch (error) {
    state.balanceRefreshError = `余额同步失败：${error.message}`;
  }
  renderBalance();
  if (state.orders) renderOrders();
}

async function loadOrders(options = {}) {
  const silent = options.silent === true;
  if (!state.configured) {
    openSettings();
    return;
  }
  const button = $('#refreshOrders');
  button.disabled = true;
  button.innerHTML = '<span class="refresh-icon">◌</span>同步中';
  try {
    const response = await api(`/api/orders${options.forceRefresh ? '?refresh=1' : ''}`);
    if (response.ordersUnavailable && state.orders && !state.orders.ordersUnavailable) {
      state.ordersRefreshError = '本次同步失败，继续显示上次成功读取的订单数据。';
    } else {
      state.orders = response;
      state.ordersRefreshError = '';
    }
    renderOrders();
    if (!silent && !response.ordersUnavailable) toast(`已同步 ${response.orders?.length || 0} 个订单`);
  } catch (error) {
    state.ordersRefreshError = `同步失败：${error.message}${state.orders ? '，继续显示上次成功读取的订单数据。' : ''}`;
    if (!state.orders) state.orders = { orders: [], stats: {}, warnings: [], ordersUnavailable: true, lookbackDays: 90 };
    renderOrders();
    if (!silent) toast(error.message);
  } finally {
    await loadBalance({ silent: true, forceRefresh: options.forceRefresh === true });
    button.disabled = false;
    button.innerHTML = '<span class="refresh-icon">↻</span>同步订单';
    if (!silent) scheduleAutoRefresh();
  }
}

function sourcingProviderLabel(source) {
  return source === 'pdd' ? '拼多多' : '1688';
}

function formatSourcingPrice(item) {
  if (item.price === null || item.price === undefined) return '价格以平台为准';
  return `${rub.format(Number(item.price))} ${escapeHtml(item.currency || 'CNY')}`;
}

function renderSourcingConfig(config) {
  state.sourcingConfig = config;
  const pdd = config?.pdd || {};
  const alibaba = config?.alibaba1688 || {};
  $('#sourcingStatus').textContent = `拼多多：${pdd.configured ? `已配置 ${pdd.clientIdHint}` : '待配置'} · 1688：${alibaba.configured ? `已配置 ${alibaba.appKeyHint}` : '待配置'}`;
  $('#pddApiState').textContent = pdd.configured ? `已配置 ${pdd.clientIdHint}` : '未配置';
  $('#alibaba1688ApiState').textContent = alibaba.configured ? `已配置 ${alibaba.appKeyHint}` : '未配置';
  $('#pddApiState').classList.toggle('configured', pdd.configured);
  $('#alibaba1688ApiState').classList.toggle('configured', alibaba.configured);
}

async function loadSourcingConfig() {
  try { renderSourcingConfig(await api('/api/sourcing/config')); }
  catch (error) { $('#sourcingStatus').textContent = error.message; }
}

function openSourcingSettings() {
  const config = state.sourcingConfig || {};
  const form = $('#sourcingSettingsForm');
  ['pddClientId', 'pddClientSecret', 'pddAccessToken', 'alibaba1688AppKey', 'alibaba1688AppSecret', 'alibaba1688AccessToken'].forEach(name => { form.elements[name].value = ''; });
  $('#sourcingSettingsMessage').textContent = '';
  $('#sourcingSettingsMessage').className = 'modal-message';
  renderSourcingConfig(config);
  $('#sourcingSettingsModal').classList.remove('hidden');
  form.elements.pddClientId.focus();
}

function renderSourcingResults(data) {
  const results = data.results || [];
  const total = results.reduce((sum, result) => sum + (result.items || []).length, 0);
  $('#sourcingSummary').innerHTML = results.map(result => `<div class="sourcing-summary-item"><strong>${sourcingProviderLabel(result.source)}</strong><span>${result.error ? '不可用' : `${result.items.length} 条结果`}</span></div>`).join('');
  if (!total) {
    $('#sourcingResults').innerHTML = `<div class="panel empty-state sourcing-empty">${results.map(result => `<p><strong>${sourcingProviderLabel(result.source)}：</strong>${escapeHtml(result.error || '没有找到商品结果。')}</p>`).join('')}</div>`;
    return;
  }
  $('#sourcingResults').innerHTML = `<div class="sourcing-grid">${results.flatMap(result => (result.items || []).map(item => `<article class="panel sourcing-card"><div class="sourcing-card-media">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<span>无图片</span>'}</div><div class="sourcing-card-body"><div class="sourcing-card-top"><span class="source-badge ${item.source}">${escapeHtml(item.sourceLabel)}</span><span class="sourcing-id">${escapeHtml(item.id || '—')}</span></div><h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3><div class="sourcing-price">${formatSourcingPrice(item)}</div><div class="sourcing-meta"><span>${escapeHtml(item.shopName || '未返回店铺')}</span><span>${escapeHtml(item.sales || '销量未返回')}</span></div>${item.detailUrl ? `<a class="button button-secondary sourcing-link" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noreferrer">查看平台商品 <span>↗</span></a>` : '<span class="subtle">平台未返回商品链接</span>'}</div></article>`)).join('')}</div>`;
}

async function searchSourcing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const keyword = form.elements.keyword.value.trim();
  const platform = form.elements.platform.value;
  const pageSize = form.elements.pageSize.value;
  if (!keyword) return toast('请输入商品关键词');
  const button = $('#searchSourcing');
  button.disabled = true;
  button.innerHTML = '<span>◌</span>搜索中';
  $('#sourcingStatus').textContent = '正在分别请求已配置的平台商品接口…';
  try {
    const data = await api(`/api/sourcing/search?platform=${encodeURIComponent(platform)}&keyword=${encodeURIComponent(keyword)}&page=1&page_size=${encodeURIComponent(pageSize)}`);
    renderSourcingResults(data);
    const available = (data.results || []).filter(result => !result.error).reduce((sum, result) => sum + result.items.length, 0);
    $('#sourcingStatus').textContent = `关键词“${keyword}”搜索完成，共返回 ${available} 条商品结果。`;
  } catch (error) {
    $('#sourcingStatus').textContent = error.message;
    $('#sourcingResults').innerHTML = `<div class="panel empty-state sourcing-empty">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>⌕</span>搜索货源';
  }
}

function showLowStockProducts() {
  state.stockFilter = 'low';
  state.productPage = 1;
  $('#statusFilter').value = 'active';
  showView('products');
  renderProducts();
  requestAnimationFrame(() => $('#productsTable').closest('.table-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function clearStockFilter() {
  state.stockFilter = 'all';
  state.productPage = 1;
  $('#statusFilter').value = 'all';
  renderProducts();
}

async function testConnection() {
  const message = $('#settingsMessage');
  const form = $('#settingsForm');
  const clientId = form.elements.clientId.value.trim();
  const apiKey = form.elements.apiKey.value.trim();
  message.textContent = '正在测试 Ozon API…';
  message.className = 'modal-message';
  try {
    await api('/api/config', { method: 'POST', body: JSON.stringify({ clientId, apiKey }) });
    const shops = await api('/api/shops');
    if (shops.activeShopId && shops.activeShopId !== state.activeShopId) {
      state.activeShopId = shops.activeShopId;
      localStorage.setItem(STORE_SELECTION_STORAGE_KEY, state.activeShopId);
      renderShopSelector();
    }
    const result = await api('/api/test-connection', { method: 'POST', body: '{}' });
    message.textContent = `连接成功。Ozon API 已响应（示例商品 ${result.sampleCount} 个）。`;
    message.className = 'modal-message success';
    await loadConfig();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'modal-message';
  }
}

async function submitProduct(event) {
  event.preventDefault();
  if (!state.configured) return openSettings();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (String(data.richContent || '').trim()) {
    try {
      const richContent = JSON.parse(data.richContent);
      if (!richContent || typeof richContent !== 'object') throw new Error('invalid type');
    } catch {
      $('#newProductRichContentMessage').textContent = '富内容必须是有效的 JSON 对象或数组。';
      form.elements.richContent.focus();
      return;
    }
  }
  $('#newProductRichContentMessage').textContent = '';
  const button = $('#submitProduct');
  button.disabled = true;
  button.textContent = '提交中…';
  $('#taskPanel').classList.add('hidden');
  try {
    const result = await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    const panel = $('#taskPanel');
    panel.classList.remove('hidden');
    panel.innerHTML = `<h3>商品导入任务</h3><p>任务 ID：<strong>${escapeHtml(result.taskId || '已提交')}</strong> · <span class="task-state">正在等待 Ozon 处理…</span></p>`;
    if (result.taskId) pollImport(result.taskId, panel);
    toast('商品已提交，正在查询处理结果');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '提交到 Ozon <span>→</span>';
  }
}

async function pollImport(taskId, panel) {
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      const status = await api(`/api/import-status?task_id=${encodeURIComponent(taskId)}`);
      const label = status.status || status.state || '处理中';
      const results = status.items || status.result?.items || [];
      const detail = results.map(item => item.errors?.map(error => error.message).join('; ') || item.status).filter(Boolean).join(' · ');
      const stateNode = panel.querySelector('.task-state');
      if (stateNode) stateNode.textContent = `${label}${detail ? ` — ${detail}` : ''}`;
      if (/completed|complete|success|error|failed/i.test(label)) {
        if (/success|complete/i.test(label)) toast('Ozon 已完成导入任务');
        return;
      }
    } catch (error) {
      const stateNode = panel.querySelector('.task-state');
      if (stateNode) stateNode.textContent = `暂时无法查询任务状态：${error.message}`;
      return;
    }
  }
  const stateNode = panel.querySelector('.task-state');
  if (stateNode) stateNode.textContent = 'Ozon 仍在处理。你可以稍后在商品列表刷新查看。';
}

document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('#addProductTop').addEventListener('click', () => showView('add'));
$('#cancelAdd').addEventListener('click', () => showView('products'));
$('#settingsButton').addEventListener('click', openSettings);
$('#closeSettings').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
$('#settingsModal').addEventListener('click', event => { if (event.target === $('#settingsModal')) $('#settingsModal').classList.add('hidden'); });
$('#shopSelector').addEventListener('change', event => switchShop(event.currentTarget.value));
$('#addShopButton').addEventListener('click', () => {
  $('#shopForm').reset();
  $('#shopMessage').textContent = '';
  $('#shopMessage').className = 'modal-message';
  $('#shopModal').classList.remove('hidden');
  $('#shopForm').elements.name.focus();
});
$('#closeShop').addEventListener('click', () => $('#shopModal').classList.add('hidden'));
$('#cancelShop').addEventListener('click', () => $('#shopModal').classList.add('hidden'));
$('#shopModal').addEventListener('click', event => { if (event.target === $('#shopModal')) $('#shopModal').classList.add('hidden'); });
$('#shopForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#saveShop');
  button.disabled = true;
  $('#shopMessage').textContent = '正在安全保存店铺信息…';
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/shops', { method: 'POST', body: JSON.stringify(body) });
    applyShopSnapshot(result);
    const active = result.activeShop?.id || result.activeShopId;
    if (active) {
      state.activeShopId = active;
      localStorage.setItem(STORE_SELECTION_STORAGE_KEY, active);
    }
    sessionStorage.setItem(STORE_RETURN_VIEW_KEY, state.currentView);
    window.location.reload();
  } catch (error) {
    $('#shopMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$('#openSourcingSettings').addEventListener('click', openSourcingSettings);
$('#closeSourcingSettings').addEventListener('click', () => $('#sourcingSettingsModal').classList.add('hidden'));
$('#cancelSourcingSettings').addEventListener('click', () => $('#sourcingSettingsModal').classList.add('hidden'));
$('#sourcingSettingsModal').addEventListener('click', event => { if (event.target === $('#sourcingSettingsModal')) $('#sourcingSettingsModal').classList.add('hidden'); });
$('#sourcingSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/sourcing/config', { method: 'POST', body: JSON.stringify(body) });
    renderSourcingConfig(result.config);
    $('#sourcingSettingsMessage').textContent = '货源 API 设置已保存到本机。';
    $('#sourcingSettingsMessage').className = 'modal-message success';
    toast('货源 API 设置已保存');
    setTimeout(() => $('#sourcingSettingsModal').classList.add('hidden'), 850);
  } catch (error) {
    $('#sourcingSettingsMessage').textContent = error.message;
    $('#sourcingSettingsMessage').className = 'modal-message';
  } finally {
    button.disabled = false;
  }
});
$('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    await api('/api/config', { method: 'POST', body: JSON.stringify({ clientId: form.elements.clientId.value.trim(), apiKey: form.elements.apiKey.value.trim() }) });
    const shops = await api('/api/shops');
    if (shops.activeShopId && shops.activeShopId !== state.activeShopId) {
      state.activeShopId = shops.activeShopId;
      localStorage.setItem(STORE_SELECTION_STORAGE_KEY, state.activeShopId);
      sessionStorage.setItem(STORE_RETURN_VIEW_KEY, state.currentView);
      window.location.reload();
      return;
    }
    await loadConfig();
    $('#settingsMessage').textContent = '设置已安全保存到本机。';
    $('#settingsMessage').className = 'modal-message success';
    toast('API 设置已保存');
    setTimeout(() => $('#settingsModal').classList.add('hidden'), 850);
  } catch (error) {
    $('#settingsMessage').textContent = error.message;
  }
});
$('#testConnection').addEventListener('click', testConnection);
$('#refreshButton').addEventListener('click', refreshDashboard);
$('#refreshPricingPromotions').addEventListener('click', () => loadPricingPromotions({ forceRefresh: true }));
$('#refreshProductProfit').addEventListener('click', () => loadProductProfit({ forceRefresh: true }));
$('#productProfitSearch').addEventListener('input', () => {
  state.productProfitPage = 1;
  renderProductProfit();
});
$('#productProfitFilter').addEventListener('change', event => {
  state.productProfitFilter = event.currentTarget.value || 'all';
  state.productProfitPage = 1;
  renderProductProfit();
});
$('#pricingPromotionSearch').addEventListener('input', () => {
  state.pricingPromotionPage = 1;
  renderPricingPromotions();
});
$('#pricingPromotionFilter').addEventListener('change', event => {
  state.pricingPromotionFilter = event.currentTarget.value || 'all';
  state.pricingPromotionPage = 1;
  renderPricingPromotions();
});
$('#pricingPromotionOfferIdSort').addEventListener('click', () => {
  state.pricingPromotionOfferIdSort = state.pricingPromotionOfferIdSort === 'asc' ? 'desc' : 'asc';
  state.pricingPromotionPage = 1;
  renderPricingPromotions();
});
$('#pricingPromotionEditPromotionPriceSelected').addEventListener('click', openPromotionPriceModal);
$('#pricingPromotionJoinSelected').addEventListener('click', openPromotionJoinModal);
$('#closePromotionJoin').addEventListener('click', () => $('#promotionJoinModal').classList.add('hidden'));
$('#cancelPromotionJoin').addEventListener('click', () => $('#promotionJoinModal').classList.add('hidden'));
$('#promotionJoinModal').addEventListener('click', event => {
  if (event.target === $('#promotionJoinModal')) $('#promotionJoinModal').classList.add('hidden');
});
$('#promotionJoinAction').addEventListener('change', () => resetPromotionJoinPreview());
$('#loadPromotionCandidates').addEventListener('click', loadPromotionCandidates);
$('#applyCommonPromotionJoinPrice').addEventListener('click', applyCommonPromotionJoinPrice);
$('#promotionJoinForm').addEventListener('submit', submitPromotionJoin);
$('#promotionJoinList').addEventListener('input', event => {
  if (event.target.matches('.promotion-join-price-input, .promotion-join-stock-input')) updatePromotionJoinSubmit();
});
$('#promotionJoinList').addEventListener('change', event => {
  if (event.target.matches('.promotion-join-select')) updatePromotionJoinSubmit();
});
$('#promotionJoinList').addEventListener('error', event => {
  if (!event.target.matches('[data-promotion-join-image]')) return;
  const media = event.target.closest('.product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('product-media-placeholder');
  media.textContent = '无图';
}, true);
$('#closePromotionPrice').addEventListener('click', () => $('#promotionPriceModal').classList.add('hidden'));
$('#cancelPromotionPrice').addEventListener('click', () => $('#promotionPriceModal').classList.add('hidden'));
$('#promotionPriceModal').addEventListener('click', event => {
  if (event.target === $('#promotionPriceModal')) $('#promotionPriceModal').classList.add('hidden');
});
$('#promotionPriceForm').addEventListener('submit', submitPromotionPrices);
$('#applyCommonPromotionPrice').addEventListener('click', () => {
  const value = $('#promotionPriceCommon').value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0) return toast('统一促销价必须是大于 0 的数字');
  document.querySelectorAll('.promotion-price-new').forEach(input => { input.value = value; });
});
$('#pricingPromotionPageFirst').addEventListener('click', () => goToPricingPromotionPage(1));
$('#pricingPromotionPagePrevious').addEventListener('click', () => goToPricingPromotionPage(state.pricingPromotionPage - 1));
$('#pricingPromotionPageNext').addEventListener('click', () => goToPricingPromotionPage(state.pricingPromotionPage + 1));
$('#pricingPromotionPageLast').addEventListener('click', () => goToPricingPromotionPage(Math.max(Math.ceil(pricingPromotionRows().length / PRODUCT_PAGE_SIZE), 1)));
$('#pricingPromotionPageJump').addEventListener('click', () => goToPricingPromotionPage($('#pricingPromotionPageInput').value));
$('#pricingPromotionPageInput').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  goToPricingPromotionPage(event.currentTarget.value);
});
$('#pricingPromotionSelectAll').addEventListener('change', event => {
  const visible = currentPricingPromotionPageRows().filter(product => product.productId && product.offerId);
  if (event.currentTarget.checked && state.pricingPromotionSelection.size + visible.filter(product => !state.pricingPromotionSelection.has(product.productId)).length > MAX_INVENTORY_BATCH_SIZE) {
    event.currentTarget.checked = false;
    return toast(`批量改价单次最多选择 ${MAX_INVENTORY_BATCH_SIZE} 个商品`);
  }
  visible.forEach(product => {
    if (event.currentTarget.checked) state.pricingPromotionSelection.add(product.productId);
    else state.pricingPromotionSelection.delete(product.productId);
  });
  renderPricingPromotions();
});
$('#pricingPromotionTable').addEventListener('change', event => {
  if (!event.target.matches('.pricing-promotion-select')) return;
  const productId = event.target.value;
  if (event.target.checked && state.pricingPromotionSelection.size >= MAX_INVENTORY_BATCH_SIZE) {
    event.target.checked = false;
    toast(`批量改价单次最多选择 ${MAX_INVENTORY_BATCH_SIZE} 个商品`);
    return;
  }
  if (event.target.checked) state.pricingPromotionSelection.add(productId);
  else state.pricingPromotionSelection.delete(productId);
  renderPricingPromotions();
});
$('#pricingPromotionDeactivateSelected').addEventListener('click', deactivateSelectedPromotions);
$('#pricingPromotionTable').addEventListener('error', event => {
  if (!event.target.matches('[data-pricing-image]')) return;
  const media = event.target.closest('.product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('product-media-placeholder');
  media.textContent = '无图';
}, true);
$('#refreshOrders').addEventListener('click', () => loadOrders({ forceRefresh: true }));
$('#autoRefreshInterval').addEventListener('change', event => {
  const interval = Number(event.currentTarget.value);
  if (![300000, 600000, 1800000].includes(interval)) return;
  state.autoRefreshInterval = interval;
  persistAutoRefreshSettings();
  scheduleAutoRefresh();
  toast(`自动刷新间隔已设置为${autoRefreshIntervalLabel()}`);
});
$('#autoRefreshToggle').addEventListener('click', () => {
  state.autoRefreshEnabled = !state.autoRefreshEnabled;
  persistAutoRefreshSettings();
  scheduleAutoRefresh();
  toast(state.autoRefreshEnabled ? `自动刷新已开启（${autoRefreshIntervalLabel()}）` : '自动刷新已暂停');
});
$('#ordersSearchInput').addEventListener('input', renderOrders);
$('#ordersTable').addEventListener('click', event => {
  const button = event.target.closest('[data-order-action]');
  if (!button || button.disabled) return;
  const postingNumber = button.dataset.postingNumber;
  if (button.dataset.orderAction === 'pack') packOrder(postingNumber);
  else if (button.dataset.orderAction === 'split') openOrderSplitModal(postingNumber);
});
$('#orderSplitForm').addEventListener('submit', submitOrderSplit);
$('#orderSplitList').addEventListener('input', event => {
  if (event.target.matches('.order-split-input')) updateOrderSplitSummary();
});
function closeOrderSplitModal() {
  if ($('#closeOrderSplit').disabled) return;
  $('#orderSplitModal').classList.add('hidden');
  orderSplitDraft = null;
}
$('#closeOrderSplit').addEventListener('click', closeOrderSplitModal);
$('#cancelOrderSplit').addEventListener('click', closeOrderSplitModal);
$('#orderSplitModal').addEventListener('click', event => {
  if (event.target === $('#orderSplitModal')) closeOrderSplitModal();
});
document.querySelectorAll('[data-order-channel]').forEach(button => button.addEventListener('click', () => {
  state.orderChannel = button.dataset.orderChannel || 'all';
  renderOrders();
}));
document.querySelectorAll('[data-order-category]').forEach(button => button.addEventListener('click', () => {
  state.orderCategory = button.dataset.orderCategory;
  renderOrders();
}));
$('#openInventoryBatch').addEventListener('click', openInventoryModal);
$('#closeInventory').addEventListener('click', () => $('#inventoryModal').classList.add('hidden'));
$('#cancelInventory').addEventListener('click', () => $('#inventoryModal').classList.add('hidden'));
$('#inventoryModal').addEventListener('click', event => { if (event.target === $('#inventoryModal')) $('#inventoryModal').classList.add('hidden'); });
$('#inventoryForm').addEventListener('submit', submitInventory);
$('#openPriceBatch').addEventListener('click', () => openPriceModal());
$('#closePrice').addEventListener('click', () => $('#priceModal').classList.add('hidden'));
$('#cancelPrice').addEventListener('click', () => $('#priceModal').classList.add('hidden'));
$('#priceModal').addEventListener('click', event => { if (event.target === $('#priceModal')) $('#priceModal').classList.add('hidden'); });
$('#priceForm').addEventListener('submit', submitPrices);
$('#applyCommonPrice').addEventListener('click', () => {
  const value = $('#priceCommonPrice').value.trim();
  if (!priceTextIsValid(value) || Number(value) <= 0) return toast('统一售价必须是大于 0 的数字');
  $('#priceList').querySelectorAll(':scope > .price-update-item .price-new').forEach(input => { input.value = value; });
});
$('#applyCommonOldPrice').addEventListener('click', () => {
  const value = $('#priceCommonOldPrice').value.trim();
  if (value !== '' && (!priceTextIsValid(value) || Number(value) < 0)) return toast('统一划线价必须留空、填 0，或填写大于 0 的数字');
  $('#priceList').querySelectorAll(':scope > .price-update-item .price-old').forEach(input => { input.value = value; });
});
$('#applyCommonWarehouse').addEventListener('click', () => {
  const warehouseId = $('#inventoryCommonWarehouse').value;
  if (!/^\d+$/.test(String(warehouseId))) return toast('请先选择统一库存仓库');
  document.querySelectorAll('.inventory-item').forEach(row => {
    const product = state.products.find(item => item.productId === row.dataset.productId);
    const warehouseRow = inventoryRows(product || {}).find(item => String(item.warehouseId) === String(warehouseId));
    const warehouseSelect = row.querySelector('.inventory-warehouse');
    const stockInput = row.querySelector('.inventory-stock');
    if (!warehouseSelect || !stockInput) return;
    warehouseSelect.value = warehouseId;
    if (warehouseRow?.exact && warehouseRow.present !== null && warehouseRow.present !== undefined) {
      stockInput.value = String(warehouseRow.present);
    } else {
      stockInput.value = '';
    }
  });
});
$('#applyCommonStock').addEventListener('click', () => {
  const value = $('#inventoryCommonStock').value;
  if (!/^\d+$/.test(value) || Number(value) > 1_000_000_000) return toast('统一库存必须是 0 至 1,000,000,000 之间的整数');
  document.querySelectorAll('.inventory-stock').forEach(input => { input.value = value; });
});
$('#inventoryList').addEventListener('change', event => {
  if (!event.target.matches('.inventory-warehouse')) return;
  const option = event.target.selectedOptions[0];
  const stockInput = event.target.closest('.inventory-item')?.querySelector('.inventory-stock');
  if (stockInput && option?.dataset.stock !== undefined) stockInput.value = option.dataset.stock;
});
$('#inventoryList').addEventListener('input', event => {
  if (!event.target.matches('.inventory-stock')) return;
  event.target.removeAttribute('aria-invalid');
  if (!document.querySelector('.inventory-item [aria-invalid="true"]')) $('#inventoryMessage').textContent = '';
});
$('#inventoryList').addEventListener('change', event => {
  if (!event.target.matches('.inventory-warehouse')) return;
  event.target.removeAttribute('aria-invalid');
  if (!document.querySelector('.inventory-item [aria-invalid="true"]')) $('#inventoryMessage').textContent = '';
});
$('#openInventoryTransfer').addEventListener('click', openInventoryTransferModal);
$('#closeInventoryTransfer').addEventListener('click', () => $('#inventoryTransferModal').classList.add('hidden'));
$('#cancelInventoryTransfer').addEventListener('click', () => $('#inventoryTransferModal').classList.add('hidden'));
$('#inventoryTransferModal').addEventListener('click', event => { if (event.target === $('#inventoryTransferModal')) $('#inventoryTransferModal').classList.add('hidden'); });
$('#inventoryTransferForm').addEventListener('submit', submitInventoryTransfer);
$('#applyCommonTransfer').addEventListener('click', () => {
  const value = $('#inventoryTransferCommonQuantity').value;
  if (!/^\d+$/.test(value) || Number(value) <= 0 || Number(value) > 1_000_000_000) return toast('统一转移数量必须是 1 至 1,000,000,000 之间的整数');
  document.querySelectorAll('.inventory-transfer-quantity').forEach(input => { input.value = value; });
});
$('#inventoryTransferFrom').addEventListener('change', () => {
  if ($('#inventoryTransferFrom').value === $('#inventoryTransferTo').value) {
    const alternative = [...$('#inventoryTransferTo').options].find(option => option.value !== $('#inventoryTransferFrom').value);
    if (alternative) $('#inventoryTransferTo').value = alternative.value;
  }
  renderInventoryTransferRows(state.products.filter(product => state.inventorySelection.has(product.productId) && canUpdateInventory(product)));
});
$('#inventoryTransferTo').addEventListener('change', () => {
  if ($('#inventoryTransferTo').value === $('#inventoryTransferFrom').value) {
    const alternative = [...$('#inventoryTransferFrom').options].find(option => option.value !== $('#inventoryTransferTo').value);
    if (alternative) $('#inventoryTransferFrom').value = alternative.value;
  }
  renderInventoryTransferRows(state.products.filter(product => state.inventorySelection.has(product.productId) && canUpdateInventory(product)));
});
$('#refreshPickup').addEventListener('click', () => loadPickup());
$('#savePickupSettings').addEventListener('click', savePickupSettings);
$('#sendPickupSelected').addEventListener('click', () => {
  const selected = [...state.pickupSelection].filter(number => state.pickup?.candidates.find(item => item.postingNumber === number)?.canContact);
  sendPickup(selected);
});
$('#remindPickupAgainSelected').addEventListener('click', () => {
  const selected = [...state.pickupSelection].filter(number => state.pickup?.candidates.find(item => item.postingNumber === number)?.canRemindAgain);
  sendPickupAgain(selected);
});
$('#pickupFilter').addEventListener('change', renderPickup);
$('#pickupSearch').addEventListener('input', renderPickup);
document.querySelectorAll('[data-pickup-channel]').forEach(button => button.addEventListener('click', () => {
  state.pickupChannel = button.dataset.pickupChannel;
  renderPickup();
}));
$('#pickupTemplatePreset').addEventListener('change', event => {
  const preset = PICKUP_MESSAGE_PRESETS.find(item => item.id === event.target.value);
  if (!preset) return;
  $('#pickupTemplate').value = preset.message;
  $('#pickupTemplateCount').textContent = `${preset.message.length} / 1000`;
});
$('#pickupTemplate').addEventListener('input', () => {
  $('#pickupTemplateCount').textContent = `${$('#pickupTemplate').value.length} / 1000`;
  syncPickupTemplatePreset();
});
$('#pickupAutoEnabled').addEventListener('change', renderAutoModeLabel);
$('#pickupSelectAll').addEventListener('change', event => {
  const rows = filteredPickupCandidates();
  const allCandidates = state.pickup?.candidates || [];
  const selectedItems = allCandidates.filter(item => state.pickupSelection.has(item.postingNumber));
  const selectedFirst = selectedItems.filter(item => item.canContact);
  const selectedAgain = selectedItems.filter(item => item.canRemindAgain);
  const visibleSelectable = selectedFirst.length && !selectedAgain.length
    ? rows.filter(item => item.canContact)
    : selectedAgain.length && !selectedFirst.length
      ? rows.filter(item => item.canRemindAgain)
      : rows.filter(item => item.canContact).length
        ? rows.filter(item => item.canContact)
        : rows.filter(item => item.canRemindAgain);
  if (!visibleSelectable.length) {
    event.currentTarget.checked = false;
    event.currentTarget.indeterminate = false;
    return toast('当前筛选没有可操作的订单');
  }
  visibleSelectable.forEach(item => {
    if (event.currentTarget.checked) state.pickupSelection.add(item.postingNumber);
    else state.pickupSelection.delete(item.postingNumber);
  });
  renderPickup();
});
$('#pickupTable').addEventListener('change', event => {
  if (!event.target.matches('.pickup-select')) return;
  const item = state.pickup?.candidates.find(candidate => candidate.postingNumber === event.target.value);
  if (event.target.checked) {
    const selectedItems = (state.pickup?.candidates || []).filter(candidate => state.pickupSelection.has(candidate.postingNumber));
    const hasFirst = selectedItems.some(candidate => candidate.canContact);
    const hasAgain = selectedItems.some(candidate => candidate.canRemindAgain);
    if ((item?.canContact && hasAgain) || (item?.canRemindAgain && hasFirst)) {
      event.target.checked = false;
      return toast('首次提醒和再次提醒不能混合选择，请先取消另一类订单。');
    }
    state.pickupSelection.add(event.target.value);
  } else state.pickupSelection.delete(event.target.value);
  updatePickupSelectionControls();
});
$('#pickupTable').addEventListener('click', event => {
  const button = event.target.closest('[data-send]');
  if (button) sendPickup([button.dataset.send]);
  const remindAgainButton = event.target.closest('[data-remind-again]');
  if (remindAgainButton) sendPickupAgain([remindAgainButton.dataset.remindAgain]);
  const markSentButton = event.target.closest('[data-mark-sent]');
  if (markSentButton) markPickupSent(markSentButton.dataset.markSent);
});
$('#pickupTable').addEventListener('error', event => {
  if (!event.target.matches('[data-pickup-image]')) return;
  const media = event.target.closest('.pickup-product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('pickup-product-placeholder');
  media.textContent = '无图';
}, true);
$('#ordersTable').addEventListener('error', event => {
  if (!event.target.matches('[data-order-image]')) return;
  const media = event.target.closest('.order-product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('order-product-placeholder');
  media.textContent = '无图';
}, true);
$('#productSelectAll').addEventListener('change', event => {
  const wasIndeterminate = state.productSelectAllWasIndeterminate;
  state.productSelectAllWasIndeterminate = false;
  if (wasIndeterminate) {
    state.inventorySelection.clear();
    renderProducts();
    return;
  }
  const selectable = currentProductPageRows().filter(canUpdateInventory);
  if (event.currentTarget.checked) {
    const remainingSlots = Math.max(MAX_INVENTORY_BATCH_SIZE - state.inventorySelection.size, 0);
    const unselected = selectable.filter(product => !state.inventorySelection.has(product.productId));
    unselected.slice(0, remainingSlots).forEach(product => state.inventorySelection.add(product.productId));
    if (unselected.length > remainingSlots) toast(`单次最多选择 ${MAX_INVENTORY_BATCH_SIZE} 个商品，已按上限选择`);
  } else {
    selectable.forEach(product => state.inventorySelection.delete(product.productId));
  }
  renderProducts();
});
$('#productsTable').addEventListener('change', event => {
  if (!event.target.matches('.product-select')) return;
  const productId = event.target.value;
  if (event.target.checked && state.inventorySelection.size >= MAX_INVENTORY_BATCH_SIZE) {
    event.target.checked = false;
    toast(`单次最多选择 ${MAX_INVENTORY_BATCH_SIZE} 个商品`);
    return;
  }
  if (event.target.checked) state.inventorySelection.add(productId);
  else state.inventorySelection.delete(productId);
  updateInventoryControls();
});
$('#productsTable').addEventListener('error', event => {
  if (!event.target.matches('[data-product-image]')) return;
  const media = event.target.closest('.product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('product-media-placeholder');
  media.textContent = '无图';
}, true);
$('#priceList').addEventListener('error', event => {
  if (!event.target.matches('[data-price-image]')) return;
  const media = event.target.closest('.price-product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('product-media-placeholder');
  media.textContent = '无图';
}, true);
$('#searchInput').addEventListener('input', () => { state.productPage = 1; renderProducts(); });
$('#statusFilter').addEventListener('change', () => { state.productPage = 1; renderProducts(); });
$('#stockWarehouseFilter').addEventListener('change', event => {
  const warehouseId = event.currentTarget.value || 'all';
  state.stockWarehouseId = warehouseId;
  state.whdStockOnly = false;
  state.awaitingWHDWarehouseSelection = false;
  state.productPage = 1;
  renderProducts();
});
$('#warehouseStats').addEventListener('click', event => {
  const card = event.target.closest('[data-warehouse-id]');
  if (!card) return;
  state.stockWarehouseId = card.dataset.warehouseId;
  state.whdStockOnly = false;
  state.awaitingWHDWarehouseSelection = false;
  state.productPage = 1;
  renderProducts();
});
$('#sortOfferId').addEventListener('click', () => {
  state.offerIdSort = state.offerIdSort === 'asc' ? 'desc' : 'asc';
  state.productPage = 1;
  renderProducts();
});
$('#productPageFirst').addEventListener('click', () => {
  goToProductPage(1);
});
$('#productPagePrevious').addEventListener('click', () => {
  if (state.productPage <= 1) return;
  state.productPage -= 1;
  renderProducts();
});
$('#productPageNext').addEventListener('click', () => {
  const totalRows = filteredProducts().length;
  const pageCount = Math.max(Math.ceil(totalRows / PRODUCT_PAGE_SIZE), 1);
  if (state.productPage >= pageCount) return;
  state.productPage += 1;
  renderProducts();
});
$('#productPageLast').addEventListener('click', () => {
  goToProductPage(Math.max(Math.ceil(filteredProducts().length / PRODUCT_PAGE_SIZE), 1));
});
$('#productPageJump').addEventListener('click', () => {
  goToProductPage($('#productPageInput').value);
});
$('#productPageInput').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  goToProductPage(event.currentTarget.value);
});
$('#productProfitPageFirst').addEventListener('click', () => goToProductProfitPage(1));
$('#productProfitOfferIdSort').addEventListener('click', () => {
  state.productProfitOfferIdSort = state.productProfitOfferIdSort === 'asc' ? 'desc' : 'asc';
  state.productProfitPage = 1;
  renderProductProfit();
});
$('#productProfitPagePrevious').addEventListener('click', () => goToProductProfitPage(state.productProfitPage - 1));
$('#productProfitPageNext').addEventListener('click', () => goToProductProfitPage(state.productProfitPage + 1));
$('#productProfitPageLast').addEventListener('click', () => goToProductProfitPage(Math.max(Math.ceil(productProfitFilteredRows().length / PRODUCT_PAGE_SIZE), 1)));
$('#productProfitPageJump').addEventListener('click', () => goToProductProfitPage($('#productProfitPageInput').value));
$('#productProfitPageInput').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  goToProductProfitPage(event.currentTarget.value);
});
$('#lowStockCard').addEventListener('click', showLowStockProducts);
$('#lowStockFilter').addEventListener('click', clearStockFilter);
$('#productForm').addEventListener('submit', submitProduct);
$('#domesticExpressQueryForm').addEventListener('submit', submitDomesticExpressQuery);
$('#openDomesticExpressSettings').addEventListener('click', openDomesticExpressSettings);
$('#domesticExpressSettingsForm').addEventListener('submit', submitDomesticExpressSettings);
function closeDomesticExpressSettings() { $('#domesticExpressSettingsModal').classList.add('hidden'); }
$('#closeDomesticExpressSettings').addEventListener('click', closeDomesticExpressSettings);
$('#cancelDomesticExpressSettings').addEventListener('click', closeDomesticExpressSettings);
$('#domesticExpressSettingsModal').addEventListener('click', event => { if (event.target === $('#domesticExpressSettingsModal')) closeDomesticExpressSettings(); });
$('#sourcingSearchForm').addEventListener('submit', searchSourcing);
$('#richContentForm').addEventListener('submit', submitRichContent);
$('#richContentProductSelect').addEventListener('change', () => {
  const nextProductId = $('#richContentProductSelect').value;
  if (state.richContentSelectedProductId !== nextProductId && $('#richContentInput').value.trim()
    && !window.confirm('切换商品会清除当前编辑器内容，确定继续吗？')) {
    $('#richContentProductSelect').value = state.richContentSelectedProductId;
    return;
  }
  state.richContentSelectedProductId = nextProductId;
  state.richContentLoadedProductId = '';
  $('#richContentInput').value = '';
  setRichContentMessage('');
  renderRichContentPreview(null);
  updateRichContentProductSummary();
});
$('#richContentProductSearch').addEventListener('input', renderRichContentProductOptions);
$('#loadRichContent').addEventListener('click', loadSelectedRichContent);
$('#richContentInput').addEventListener('input', () => {
  setRichContentMessage('');
  parseRichContentEditor(false);
  updateRichContentProductSummary();
});
$('#insertRichContentTemplate').addEventListener('click', () => setRichContentTemplate('#richContentInput'));
$('#formatRichContent').addEventListener('click', () => {
  const value = parseRichContentEditor(true);
  if (value) $('#richContentInput').value = JSON.stringify(value, null, 2);
});
$('#clearRichContent').addEventListener('click', () => {
  if ($('#richContentInput').value.trim() && !window.confirm('确定清空当前富内容编辑器吗？')) return;
  $('#richContentInput').value = '';
  state.richContentLoadedProductId = '';
  setRichContentMessage('编辑器已清空。');
  renderRichContentPreview(null);
  updateRichContentProductSummary();
});
$('#richContentProductSummary').addEventListener('error', event => {
  if (!event.target.matches('[data-rich-content-image]')) return;
  const media = event.target.closest('.rich-content-product-media');
  if (!media) return;
  event.target.remove();
  media.classList.add('rich-content-product-placeholder');
  media.textContent = '无图';
}, true);
$('#richContentPreview').addEventListener('error', event => {
  if (!event.target.matches('[data-rich-preview-image]')) return;
  event.target.remove();
}, true);
$('#goToAddWithRichContent').addEventListener('click', () => {
  const raw = $('#richContentInput').value.trim();
  const target = $('#newProductRichContent');
  if (raw && target.value.trim() && !window.confirm('新增商品表单已有富内容，确定覆盖吗？')) return;
  if (raw) target.value = raw;
  showView('add');
  target.focus();
});
$('#insertNewRichContentTemplate').addEventListener('click', () => setRichContentTemplate('#newProductRichContent', '#newProductRichContentMessage'));
$('#newProductRichContent').addEventListener('input', () => { $('#newProductRichContentMessage').textContent = ''; });
$('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date());
renderAutoRefreshControls();

initializeApp();
