const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createPinduoduoSdk } = require('./pinduoduo-sdk-adapter');

const ROOT = __dirname;
// Request-scoped roots let the same business handlers use temporary files backed by Neon in serverless deployments.
const requestDataRoot = new AsyncLocalStorage();
const dataRoot = () => requestDataRoot.getStore() || ROOT;
const envPath = () => path.join(dataRoot(), '.env');
const shopRegistryPath = () => path.join(dataRoot(), '.ozon-shops.json');
const shopDataRoot = () => path.join(dataRoot(), '.store-data');
const storeContext = new AsyncLocalStorage();
const DEFAULT_PICKUP_MESSAGE = 'Здравствуйте! Ваш заказ {order_number} уже прибыл в пункт выдачи Ozon. Пожалуйста, заберите его до даты, указанной в приложении Ozon.';
const ORDER_LOOKBACK_DAYS = 90;
const DEFAULT_ORDER_RUB_TO_CNY = 0.0798;
const PRODUCT_PROFIT_ACQUIRING_FEE_RATE = 0.02;
const PRODUCT_PROFIT_LOGISTICS_PLATFORM_FEE_RATE = 0.02;
const PRODUCT_PROFIT_TRANSPORT_CONTRACT_FEE_RATE = 0.0035;
const PRODUCT_PROFIT_STAR_ADS_FEE_RATE = 0.015;
const OPERATIONAL_POSTINGS_CACHE_MS = 15 * 60_000;
const ORDER_LIST_PAGE_LIMIT = 100;
const ORDER_LIST_MAX_PAGES = 10;
const FBS_V4_LIST_ENDPOINT = '/v4/posting/fbs/list';
const FBS_V3_LIST_ENDPOINT = '/v3/posting/fbs/list';
const BALANCE_ENDPOINT = '/v1/finance/balance';
const BALANCE_CACHE_MS = 30 * 60_000;
const RICH_CONTENT_ATTRIBUTE_ID = 11254;
const RICH_CONTENT_MAX_ITEM_BYTES = 500_000;
const RICH_CONTENT_MAX_BATCH_BYTES = 1_000_000;
// Ozon 对部分接口限制了请求频率。仪表盘刷新时会读取多个接口，
// 因此需要在服务端统一错峰，避免 Promise.all 把请求瞬间打到 Ozon 后触发 429。
const OZON_REQUEST_INTERVAL_MS = 1_500;
const OZON_MAX_RATE_LIMIT_RETRIES = 3;
const OZON_RATE_LIMIT_COOLDOWN_BASE_MS = 5 * 60_000;
const OZON_RATE_LIMIT_COOLDOWN_MAX_MS = 60 * 60_000;
let ozonRequestTail = Promise.resolve();
let ozonLastRequestAt = 0;
const storeRuntimeById = new Map();
const endpointRateLimitsByStore = new Map();
const globalCooldownByStore = new Map();
const PRICING_PROMOTIONS_CACHE_MS = 5 * 60_000;
const PRODUCT_ANALYTICS_CACHE_MS = 6 * 60 * 60_000;
const PRODUCT_ANALYTICS_LOOKBACK_DAYS = 7;
const PRODUCT_ANALYTICS_ENDPOINT = '/v1/analytics/data';
const DOMESTIC_EXPRESS_CACHE_MS = 2 * 60_000;
const DOMESTIC_EXPRESS_MAX_BATCH = 20;
// 每个库存转移商品会生成来源仓和目标仓两条 stocks 记录，Ozon 单次最多接受 100 条。
const INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST = 50;
let shopRegistry = null;
let activeShopId = '';
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function readEnvFile() {
  const filePath = envPath();
  if (!fs.existsSync(filePath)) return {};
  const parsed = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    parsed[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return parsed;
}

function stableShopId(clientId) {
  return `shop_${crypto.createHash('sha256').update(String(clientId)).digest('hex').slice(0, 16)}`;
}

function saveShopRegistry() {
  const targetPath = shopRegistryPath();
  const temporaryPath = `${targetPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({
    version: 1,
    activeShopId,
    shops: shopRegistry || []
  }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, targetPath);
}

function loadShopRegistry() {
  if (shopRegistry) return shopRegistry;
  try {
    const stored = JSON.parse(fs.readFileSync(shopRegistryPath(), 'utf8'));
    shopRegistry = Array.isArray(stored?.shops) ? stored.shops.filter(shop =>
      shop && typeof shop.id === 'string' && typeof shop.name === 'string'
      && typeof shop.clientId === 'string' && typeof shop.apiKey === 'string'
    ).map(shop => ({
      id: shop.id,
      name: shop.name,
      clientId: shop.clientId,
      apiKey: shop.apiKey,
      legacyStorage: shop.legacyStorage === true
    })) : [];
    activeShopId = shopRegistry.some(shop => shop.id === stored.activeShopId)
      ? stored.activeShopId
      : (shopRegistry[0]?.id || '');
  } catch {
    shopRegistry = [];
    activeShopId = '';
  }

  if (shopRegistry.length === 0) {
    const legacy = readEnvFile();
    const clientId = process.env.OZON_CLIENT_ID || legacy.OZON_CLIENT_ID || '';
    const apiKey = process.env.OZON_API_KEY || legacy.OZON_API_KEY || '';
    if (clientId && apiKey) {
      const id = stableShopId(clientId);
      shopRegistry.push({ id, name: '默认店铺', clientId, apiKey, legacyStorage: true });
      activeShopId = id;
      saveShopRegistry();
    }
  }
  return shopRegistry;
}

function currentShopId() {
  loadShopRegistry();
  const requested = storeContext.getStore()?.shopId;
  return shopRegistry.some(shop => shop.id === requested) ? requested : activeShopId;
}

function findShop(shopId = currentShopId()) {
  loadShopRegistry();
  return shopRegistry.find(shop => shop.id === shopId) || null;
}

function currentStoreRuntime() {
  const shopId = currentShopId() || 'unconfigured';
  if (!storeRuntimeById.has(shopId)) {
    storeRuntimeById.set(shopId, {
      operationalPostingsCache: null,
      operationalPostingsCacheAt: 0,
      operationalPostingsInFlight: null,
      pricingPromotionsCache: null,
      pricingPromotionsCacheAt: 0,
      pricingPromotionsInFlight: null,
      productProfitCache: null,
      productProfitCacheAt: 0,
      productProfitInFlight: null,
      productAnalyticsCache: null,
      productAnalyticsCacheAt: 0,
      productAnalyticsInFlight: null,
      balanceCache: null,
      balanceCacheAt: 0,
      balanceCacheLoaded: false,
      balanceInFlight: null,
      domesticExpressCache: new Map(),
      pickupSnapshotInFlight: null,
      autoReminderRunning: false
    });
  }
  return storeRuntimeById.get(shopId);
}

function storePath(filename) {
  const shop = findShop();
  if (!shop || shop.legacyStorage) return path.join(/*turbopackIgnore: true*/ dataRoot(), filename);
  const directory = path.join(shopDataRoot(), crypto.createHash('sha256').update(shop.id).digest('hex').slice(0, 24));
  return path.join(directory, filename);
}

function publicShop(shop) {
  return {
    id: shop.id,
    name: shop.name,
    clientId: shop.clientId,
    keyHint: shop.apiKey ? `••••••${shop.apiKey.slice(-4)}` : '',
    configured: Boolean(shop.clientId && shop.apiKey)
  };
}

function registerShop({ name, clientId, apiKey }, { legacyStorage = false } = {}) {
  loadShopRegistry();
  let shop = shopRegistry.find(item => item.clientId === clientId);
  if (!shop) {
    shop = { id: crypto.randomUUID(), name, clientId, apiKey, legacyStorage };
    shopRegistry.push(shop);
  } else {
    shop.name = name || shop.name;
    shop.apiKey = apiKey;
  }
  if (!activeShopId) activeShopId = shop.id;
  saveShopRegistry();
  return shop;
}

function shopsSnapshot() {
  loadShopRegistry();
  return {
    shops: shopRegistry.map(publicShop),
    activeShopId
  };
}

function config() {
  const file = readEnvFile();
  const shop = findShop();
  const orderRubToCny = Number(process.env.ORDER_RUB_TO_CNY || file.ORDER_RUB_TO_CNY || DEFAULT_ORDER_RUB_TO_CNY);
  return {
    clientId: shop ? shop.clientId : (process.env.OZON_CLIENT_ID || file.OZON_CLIENT_ID || ''),
    apiKey: shop ? shop.apiKey : (process.env.OZON_API_KEY || file.OZON_API_KEY || ''),
    pddClientId: process.env.PDD_CLIENT_ID || file.PDD_CLIENT_ID || '',
    pddClientSecret: process.env.PDD_CLIENT_SECRET || file.PDD_CLIENT_SECRET || '',
    pddAccessToken: process.env.PDD_ACCESS_TOKEN || file.PDD_ACCESS_TOKEN || '',
    alibaba1688AppKey: process.env.ALIBABA_1688_APP_KEY || file.ALIBABA_1688_APP_KEY || '',
    alibaba1688AppSecret: process.env.ALIBABA_1688_APP_SECRET || file.ALIBABA_1688_APP_SECRET || '',
    alibaba1688AccessToken: process.env.ALIBABA_1688_ACCESS_TOKEN || file.ALIBABA_1688_ACCESS_TOKEN || '',
    kuaidi100Customer: process.env.KUAIDI100_CUSTOMER || file.KUAIDI100_CUSTOMER || '',
    kuaidi100Key: process.env.KUAIDI100_KEY || file.KUAIDI100_KEY || '',
    orderRubToCny: Number.isFinite(orderRubToCny) && orderRubToCny > 0 ? orderRubToCny : DEFAULT_ORDER_RUB_TO_CNY,
    port: Number(process.env.PORT || file.PORT || 8787),
    host: process.env.HOST || file.HOST || '127.0.0.1'
  };
}

function writeEnvFile(values) {
  const file = readEnvFile();
  const current = {
    clientId: process.env.OZON_CLIENT_ID || file.OZON_CLIENT_ID || '',
    apiKey: process.env.OZON_API_KEY || file.OZON_API_KEY || '',
    pddClientId: process.env.PDD_CLIENT_ID || file.PDD_CLIENT_ID || '',
    pddClientSecret: process.env.PDD_CLIENT_SECRET || file.PDD_CLIENT_SECRET || '',
    pddAccessToken: process.env.PDD_ACCESS_TOKEN || file.PDD_ACCESS_TOKEN || '',
    alibaba1688AppKey: process.env.ALIBABA_1688_APP_KEY || file.ALIBABA_1688_APP_KEY || '',
    alibaba1688AppSecret: process.env.ALIBABA_1688_APP_SECRET || file.ALIBABA_1688_APP_SECRET || '',
    alibaba1688AccessToken: process.env.ALIBABA_1688_ACCESS_TOKEN || file.ALIBABA_1688_ACCESS_TOKEN || '',
    kuaidi100Customer: process.env.KUAIDI100_CUSTOMER || file.KUAIDI100_CUSTOMER || '',
    kuaidi100Key: process.env.KUAIDI100_KEY || file.KUAIDI100_KEY || '',
    orderRubToCny: Number(process.env.ORDER_RUB_TO_CNY || file.ORDER_RUB_TO_CNY || DEFAULT_ORDER_RUB_TO_CNY),
    port: Number(process.env.PORT || file.PORT || 8787),
    host: process.env.HOST || file.HOST || '127.0.0.1'
  };
  const next = { ...current, ...values };
  const lines = [
    `OZON_CLIENT_ID=${next.clientId || ''}`,
    `OZON_API_KEY=${next.apiKey || ''}`,
    `PDD_CLIENT_ID=${next.pddClientId || ''}`,
    `PDD_CLIENT_SECRET=${next.pddClientSecret || ''}`,
    `PDD_ACCESS_TOKEN=${next.pddAccessToken || ''}`,
    `ALIBABA_1688_APP_KEY=${next.alibaba1688AppKey || ''}`,
    `ALIBABA_1688_APP_SECRET=${next.alibaba1688AppSecret || ''}`,
    `ALIBABA_1688_ACCESS_TOKEN=${next.alibaba1688AccessToken || ''}`,
    `KUAIDI100_CUSTOMER=${next.kuaidi100Customer || ''}`,
    `KUAIDI100_KEY=${next.kuaidi100Key || ''}`,
    `ORDER_RUB_TO_CNY=${next.orderRubToCny || DEFAULT_ORDER_RUB_TO_CNY}`,
    `PORT=${next.port}`,
    `HOST=${next.host}`
  ];
  fs.writeFileSync(envPath(), `${lines.join('\n')}\n`, { mode: 0o600 });
}

function preserveConfiguredSecrets(values, cfg = config()) {
  return {
    ...values,
    pddClientId: values.pddClientId || cfg.pddClientId,
    pddClientSecret: values.pddClientSecret || cfg.pddClientSecret,
    pddAccessToken: values.pddAccessToken || cfg.pddAccessToken,
    alibaba1688AppKey: values.alibaba1688AppKey || cfg.alibaba1688AppKey,
    alibaba1688AppSecret: values.alibaba1688AppSecret || cfg.alibaba1688AppSecret,
    alibaba1688AccessToken: values.alibaba1688AccessToken || cfg.alibaba1688AccessToken,
    kuaidi100Customer: values.kuaidi100Customer || cfg.kuaidi100Customer,
    kuaidi100Key: values.kuaidi100Key || cfg.kuaidi100Key
  };
}

function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_500_000) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('请求 JSON 格式无效')); }
    });
    req.on('error', reject);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withOzonRequestSlot(task) {
  let release;
  const previous = ozonRequestTail;
  ozonRequestTail = new Promise(resolve => { release = resolve; });
  await previous.catch(() => {});

  try {
    const delay = Math.max(
      0,
      ozonLastRequestAt + OZON_REQUEST_INTERVAL_MS - Date.now(),
      Number(globalCooldownByStore.get(currentShopId()) || 0) - Date.now()
    );
    if (delay) await wait(delay);
    ozonLastRequestAt = Date.now();
    return await task();
  } finally {
    release();
  }
}

function rateLimitRetryDelay(error, attempt) {
  const retryAfter = Number(error?.retryAfterMs);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter;
  return Math.min(2_000 * (2 ** attempt), 15_000);
}

function isRateLimitError(error) {
  return error?.status === 429 || /rate limit|too many requests|请求过于频繁|限流/i.test(String(error?.message || ''));
}

function parseRetryAfterMs(value) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function loadOzonEndpointRateLimits() {
  const shopId = currentShopId() || 'unconfigured';
  if (endpointRateLimitsByStore.has(shopId)) return endpointRateLimitsByStore.get(shopId);
  let limits = {};
  try {
    const stored = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ storePath('.ozon-rate-limits.json'), 'utf8'));
    limits = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    limits = {};
  }
  endpointRateLimitsByStore.set(shopId, limits);
  return limits;
}

function saveOzonEndpointRateLimits() {
  try {
    const targetPath = storePath('.ozon-rate-limits.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(loadOzonEndpointRateLimits()), { mode: 0o600 });
    fs.renameSync(temporaryPath, targetPath);
  } catch {
    // Rate-limit protection remains active in memory if disk persistence fails.
  }
}

function endpointCooldownError(endpoint, entry) {
  const remaining = Math.max(0, Number(entry?.until) - Date.now());
  const retryAt = Number(entry?.until);
  const error = new Error(`Ozon 接口仍在限流冷却中，预计 ${new Date(retryAt).toLocaleString('zh-CN', { hour12: false })} 后重试。`);
  error.status = 429;
  error.retryAfterMs = remaining;
  error.rateLimitedUntil = retryAt;
  error.endpoint = endpoint;
  error.rateLimitCooldown = true;
  return error;
}

function recordEndpointRateLimit(endpoint, retryAfterMs = 0) {
  const limits = loadOzonEndpointRateLimits();
  const previous = limits[endpoint];
  const recentFailures = previous && Date.now() - Number(previous.lastFailureAt || 0) < 24 * 60 * 60_000
    ? Number(previous.failures || 0)
    : 0;
  const failures = recentFailures + 1;
  const backoff = Math.min(OZON_RATE_LIMIT_COOLDOWN_BASE_MS * (2 ** Math.min(failures - 1, 10)), OZON_RATE_LIMIT_COOLDOWN_MAX_MS);
  const until = Date.now() + Math.max(backoff, retryAfterMs);
  limits[endpoint] = { failures, lastFailureAt: Date.now(), until };
  saveOzonEndpointRateLimits();
  return endpointCooldownError(endpoint, limits[endpoint]);
}

function clearEndpointRateLimit(endpoint) {
  const limits = loadOzonEndpointRateLimits();
  if (!Object.hasOwn(limits, endpoint)) return;
  delete limits[endpoint];
  saveOzonEndpointRateLimits();
}

async function ozon(endpoint, body, cfg = config(), onDispatched, options = {}) {
  if (!cfg.clientId || !cfg.apiKey) {
    const error = new Error('请先在“设置”中填写 Ozon API ID 和 API Key。');
    error.status = 400;
    throw error;
  }
  const maxRateLimitRetries = Number.isInteger(options.maxRateLimitRetries)
    ? Math.max(options.maxRateLimitRetries, 0)
    : OZON_MAX_RATE_LIMIT_RETRIES;
  const method = String(options.method || 'POST').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    const error = new Error('Ozon 请求方法不受支持。');
    error.status = 500;
    throw error;
  }
  const useGlobalRateLimitCooldown = options.useGlobalRateLimitCooldown !== false;
  const endpointLimit = loadOzonEndpointRateLimits()[endpoint];
  if (Number(endpointLimit?.until) > Date.now()) throw endpointCooldownError(endpoint, endpointLimit);
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    try {
      return await withOzonRequestSlot(async () => {
        let response;
        try {
          response = await fetch(`https://api-seller.ozon.ru${endpoint}`, {
            method,
            headers: {
              'Client-Id': cfg.clientId,
              'Api-Key': cfg.apiKey,
              'Content-Type': 'application/json'
            },
            ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(25_000)
          });
        } catch (cause) {
          const error = new Error(cause.name === 'TimeoutError' ? '连接 Ozon 超时，请稍后重试。' : '无法连接 Ozon API，请检查网络。');
          error.status = 502;
          error.network = true;
          throw error;
        }
        if (onDispatched) onDispatched();
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { data = { message: raw.slice(0, 500) }; }
        if (!response.ok) {
          const error = new Error(data.message || data.error || `Ozon API 返回 HTTP ${response.status}`);
          error.status = response.status;
          if (response.status === 429 || isRateLimitError(error)) {
            error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          }
          if (isRateLimitError(error) && useGlobalRateLimitCooldown) {
            globalCooldownByStore.set(currentShopId(), Math.max(
              Number(globalCooldownByStore.get(currentShopId()) || 0),
              Date.now() + rateLimitRetryDelay(error, attempt)
            ));
          }
          throw error;
        }
        clearEndpointRateLimit(endpoint);
        return data;
      });
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      if (attempt === maxRateLimitRetries) throw recordEndpointRateLimit(endpoint, Number(error.retryAfterMs) || 0);
      if (useGlobalRateLimitCooldown) {
        globalCooldownByStore.set(currentShopId(), Math.max(
          Number(globalCooldownByStore.get(currentShopId()) || 0),
          Date.now() + rateLimitRetryDelay(error, attempt)
        ));
      }
    }
  }
}

async function externalJson(url, options, label) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(25_000) });
  } catch (cause) {
    const error = new Error(cause.name === 'TimeoutError' ? `${label}请求超时，请稍后重试。` : `无法连接${label}，请检查网络或接口配置。`);
    error.status = 502;
    error.network = true;
    throw error;
  }
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(data.message || data.error || `${label}返回 HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

function supplierConfigPublic(cfg = config()) {
  return {
    pdd: {
      configured: Boolean(cfg.pddClientId && cfg.pddClientSecret),
      clientIdHint: cfg.pddClientId ? `••••••${cfg.pddClientId.slice(-4)}` : '',
      accessTokenConfigured: Boolean(cfg.pddAccessToken)
    },
    alibaba1688: {
      configured: Boolean(cfg.alibaba1688AppKey && cfg.alibaba1688AppSecret && cfg.alibaba1688AccessToken),
      appKeyHint: cfg.alibaba1688AppKey ? `••••••${cfg.alibaba1688AppKey.slice(-4)}` : '',
      accessTokenConfigured: Boolean(cfg.alibaba1688AccessToken)
    }
  };
}

const DOMESTIC_EXPRESS_CARRIERS = new Map([
  ['auto', '自动识别'],
  ['sf', '顺丰速运'],
  ['zto', '中通快递'],
  ['yto', '圆通速递'],
  ['sto', '申通快递'],
  ['yunda', '韵达快递'],
  ['jd', '京东物流'],
  ['ems', '中国邮政 EMS'],
  ['youzhengguonei', '邮政快递包裹'],
  ['jtexpress', '极兔速递'],
  ['dbkd', '德邦快递'],
  ['best', '百世快递']
]);

function domesticExpressConfigPublic(cfg = config()) {
  return {
    configured: Boolean(cfg.kuaidi100Customer && cfg.kuaidi100Key),
    customerHint: cfg.kuaidi100Customer ? `••••••${cfg.kuaidi100Customer.slice(-4)}` : ''
  };
}

function normalizeDomesticExpressNumber(value) {
  const number = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{3,63}$/.test(number)) {
    const error = new Error('请输入有效的国内快递单号（4 至 64 位字母、数字或短横线）。');
    error.status = 400;
    throw error;
  }
  return number;
}

function normalizeDomesticExpressCarrier(value) {
  const carrier = String(value || 'auto').trim().toLowerCase();
  if (!DOMESTIC_EXPRESS_CARRIERS.has(carrier)) {
    const error = new Error('快递公司选项不正确，请重新选择。');
    error.status = 400;
    throw error;
  }
  return carrier;
}

function domesticExpressStatusLabel(status, isCheck) {
  const labels = {
    '0': '在途',
    '1': '揽收',
    '2': '疑难',
    '3': '已签收',
    '4': '退签',
    '5': '派件中',
    '6': '退回',
    '7': '转投'
  };
  return labels[String(status)] || (String(isCheck) === '1' ? '已签收' : '运输中');
}

function domesticExpressCacheKey(carrier, number, phone) {
  return `${carrier}:${number.toUpperCase()}:${String(phone || '').trim()}`;
}

function normalizeDomesticExpressResult(data, query) {
  const traces = Array.isArray(data?.data)
    ? data.data.map(item => ({
      time: String(item?.ftime || item?.time || '').trim(),
      context: String(item?.context || item?.status || '').trim()
    })).filter(item => item.time || item.context)
    : [];
  const status = String(data?.state ?? data?.status ?? '').trim();
  const companyCode = String(data?.com || query.carrier).trim().toLowerCase();
  const message = String(data?.message || '').trim();
  if ((data?.result === false || (message && !/^ok$/i.test(message))) && !traces.length) {
    const error = new Error(message || '快递查询接口未返回轨迹。');
    error.status = 502;
    throw error;
  }
  return {
    number: query.number,
    carrier: companyCode,
    carrierLabel: DOMESTIC_EXPRESS_CARRIERS.get(companyCode) || companyCode || '快递公司未识别',
    status,
    statusLabel: domesticExpressStatusLabel(status, data?.ischeck),
    isChecked: String(data?.ischeck || '') === '1',
    updatedAt: traces[0]?.time || new Date().toISOString(),
    traces,
    source: '快递 100',
    queriedAt: new Date().toISOString()
  };
}

async function queryDomesticExpress(number, carrier = 'auto', phone = '') {
  const cfg = config();
  if (!cfg.kuaidi100Customer || !cfg.kuaidi100Key) {
    const error = new Error('请先在“国内快递”模块配置快递 100 Customer 和 Key。');
    error.status = 400;
    throw error;
  }
  const normalizedNumber = normalizeDomesticExpressNumber(number);
  const normalizedCarrier = normalizeDomesticExpressCarrier(carrier);
  const normalizedPhone = String(phone || '').trim();
  if (normalizedPhone && !/^\d{4}$/.test(normalizedPhone)) {
    const error = new Error('收件人手机号后四位必须是 4 位数字。');
    error.status = 400;
    throw error;
  }
  const runtime = currentStoreRuntime();
  const cacheKey = domesticExpressCacheKey(normalizedCarrier, normalizedNumber, normalizedPhone);
  const cached = runtime.domesticExpressCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < DOMESTIC_EXPRESS_CACHE_MS) {
    return { ...cached.data, cached: true, cacheAt: new Date(cached.cachedAt).toISOString() };
  }
  const param = JSON.stringify({
    com: normalizedCarrier,
    num: normalizedNumber,
    resultv2: '1',
    ...(normalizedPhone ? { phone: normalizedPhone } : {})
  });
  const sign = md5(`${param}${cfg.kuaidi100Key}${cfg.kuaidi100Customer}`);
  const body = new URLSearchParams({
    customer: cfg.kuaidi100Customer,
    sign,
    param
  }).toString();
  const response = await externalJson('https://poll.kuaidi100.com/poll/query.do', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body
  }, '快递 100');
  const result = normalizeDomesticExpressResult(response, { number: normalizedNumber, carrier: normalizedCarrier });
  runtime.domesticExpressCache.set(cacheKey, { cachedAt: Date.now(), data: result });
  return result;
}

function requirePddConfig(cfg) {
  if (!cfg.pddClientId || !cfg.pddClientSecret) {
    const error = new Error('请先在“找货源设置”中填写拼多多开放平台 Client ID 和 Client Secret。');
    error.status = 400;
    throw error;
  }
}

function require1688Config(cfg) {
  if (!cfg.alibaba1688AppKey || !cfg.alibaba1688AppSecret || !cfg.alibaba1688AccessToken) {
    const error = new Error('请先在“找货源设置”中填写 1688 App Key、App Secret 和 Access Token。');
    error.status = 400;
    throw error;
  }
}

function numberOrNull(value, divisor = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number / divisor : null;
}

function normalizeSourcingItem(item, source) {
  const pdd = source === 'pdd';
  const id = String(item.goods_id ?? item.goodsId ?? item.offer_id ?? item.offerId ?? item.id ?? '').trim();
  const title = String(item.goods_name ?? item.title ?? item.subject ?? item.name ?? '未命名商品').trim();
  const rawPrice = pdd ? (item.min_group_price ?? item.minGroupPrice ?? item.min_price) : (item.price ?? item.min_price ?? item.price_range ?? item.priceInfo?.price);
  const price = pdd ? numberOrNull(rawPrice, 100) : numberOrNull(rawPrice);
  const imageValue = item.goods_image_url ?? item.goodsImageUrl ?? item.image_url ?? item.imageUrl ?? item.pic_url ?? item.picUrl ?? item.imageList?.[0]?.url ?? item.imageList?.[0] ?? '';
  const image = safeSupplierUrl(imageValue);
  const directUrl = item.goods_detail_url ?? item.goodsDetailUrl ?? item.detail_url ?? item.detailUrl ?? item.url ?? '';
  const detailUrl = safeSupplierUrl(directUrl) || (!pdd && id ? `https://detail.1688.com/offer/${encodeURIComponent(id)}.html` : '');
  const sales = pdd ? (item.sales_tip ?? item.salesTip ?? item.sales ?? '') : (item.sold_quantity ?? item.soldQuantity ?? item.tradeQuantity ?? item.sales ?? '');
  return {
    source,
    sourceLabel: pdd ? '拼多多' : '1688',
    id,
    title,
    price,
    currency: pdd ? 'CNY' : String(item.currency ?? 'CNY'),
    image,
    detailUrl: detailUrl || (pdd && id ? `https://mobile.yangkeduo.com/goods.html?goods_id=${encodeURIComponent(id)}` : ''),
    shopName: String(item.mall_name ?? item.mallName ?? item.supplier_name ?? item.supplierName ?? item.company_name ?? item.companyName ?? '').trim(),
    sales: String(sales ?? '').trim()
  };
}

function safeSupplierUrl(value) {
  const url = String(value ?? '').trim();
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

async function searchPinduoduo(keyword, page, pageSize, cfg = config()) {
  requirePddConfig(cfg);
  const sdk = createPinduoduoSdk({
    clientId: cfg.pddClientId,
    clientSecret: cfg.pddClientSecret,
    accessToken: cfg.pddAccessToken,
    transport: (url, params) => externalJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    }, '拼多多商品接口')
  });
  const api = cfg.pddAccessToken ? sdk.auth_api : sdk.api;
  const data = await api.request('pdd.ddk.goods.search', {
    keyword,
    page,
    page_size: pageSize,
    sort_type: 0,
    with_coupon: true
  });
  if (data.error_response) throw new Error(data.error_response.error_msg || '拼多多商品接口返回错误。');
  const response = data.goods_search_response || data.goodsSearchResponse || data;
  const items = Array.isArray(response.goods_list) ? response.goods_list : (Array.isArray(response.goodsList) ? response.goodsList : []);
  return {
    source: 'pdd', sourceLabel: '拼多多', keyword, page, pageSize,
    total: Number(response.total_count ?? response.totalCount ?? items.length) || items.length,
    items: items.map(item => normalizeSourcingItem(item, 'pdd'))
  };
}

async function search1688(keyword, page, pageSize, cfg = config()) {
  require1688Config(cfg);
  const endpoint = 'https://gw.open.1688.com/openapi/param2/1/com.alibaba.product/alibaba.product.search';
  const apiPath = `/openapi/param2/1/com.alibaba.product/alibaba.product.search/${cfg.alibaba1688AccessToken}`;
  const params = { appKey: cfg.alibaba1688AppKey, keywords: keyword, pageNo: page, pageSize };
  const signSource = Object.keys(params).sort().map(key => `${key}${params[key]}`).join('');
  const sign = md5(`${cfg.alibaba1688AppSecret}${apiPath}${signSource}${cfg.alibaba1688AppSecret}`);
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  const url = `https://gw.open.1688.com${apiPath}?${query}&_aop_signature=${sign}`;
  const data = await externalJson(url, { method: 'GET', headers: { Accept: 'application/json' } }, '1688 商品接口');
  const response = data.result ?? data.data ?? data;
  const items = response.offerList || response.offer_list || response.items || response.resultList || response.result_list || [];
  return {
    source: '1688', sourceLabel: '1688', keyword, page, pageSize,
    total: Number(response.totalCount ?? response.total_count ?? response.total ?? items.length) || items.length,
    items: (Array.isArray(items) ? items : []).map(item => normalizeSourcingItem(item, '1688'))
  };
}

async function searchSourcing(platform, keyword, page, pageSize, cfg = config()) {
  const jobs = platform === 'pdd'
    ? [searchPinduoduo(keyword, page, pageSize, cfg)]
    : platform === '1688'
      ? [search1688(keyword, page, pageSize, cfg)]
      : [searchPinduoduo(keyword, page, pageSize, cfg), search1688(keyword, page, pageSize, cfg)];
  const settled = await Promise.allSettled(jobs);
  const results = settled.map((result, index) => {
    const source = platform === 'all' ? (index === 0 ? 'pdd' : '1688') : platform;
    if (result.status === 'fulfilled') return result.value;
    return { source, sourceLabel: source === 'pdd' ? '拼多多' : '1688', items: [], total: 0, error: result.reason.message };
  });
  return { keyword, page, pageSize, results, items: results.flatMap(result => result.items || []) };
}

function resultOf(data) { return data?.result ?? data ?? {}; }

async function getProductPages(maxPages = 5) {
  const items = [];
  let lastId = '';
  for (let page = 0; page < maxPages; page++) {
    const result = resultOf(await ozon('/v3/product/list', {
      filter: { visibility: 'ALL' }, limit: 1000, last_id: lastId
    }));
    const pageItems = result.items || [];
    items.push(...pageItems);
    const next = result.last_id || '';
    if (!next || next === lastId || pageItems.length === 0) break;
    lastId = next;
  }
  return items;
}

async function getProductPagesSnapshot(maxPages = 50) {
  const items = [];
  let lastId = '';
  let complete = false;
  let pages = 0;
  for (; pages < maxPages; pages++) {
    const result = resultOf(await ozon('/v3/product/list', {
      filter: { visibility: 'ALL' }, limit: 1000, last_id: lastId
    }));
    const pageItems = Array.isArray(result.items) ? result.items : [];
    items.push(...pageItems);
    const next = String(result.last_id || '');
    if (!next || next === lastId || pageItems.length === 0) {
      complete = true;
      pages += 1;
      break;
    }
    lastId = next;
  }
  return { items, complete, pages };
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function validateRichContent(value, label = '富内容') {
  if (!value || typeof value !== 'object') {
    const error = new Error(`${label}必须是 JSON 对象或数组。`);
    error.status = 400;
    throw error;
  }
  const serialized = JSON.stringify(value);
  const size = Buffer.byteLength(serialized, 'utf8');
  if (size > RICH_CONTENT_MAX_ITEM_BYTES) {
    const error = new Error(`${label}不能超过 ${RICH_CONTENT_MAX_ITEM_BYTES / 1000} KB。`);
    error.status = 400;
    throw error;
  }
  return serialized;
}

function setRichContentAttribute(attributes, serializedRichContent) {
  const otherAttributes = attributes.filter(attribute => Number(attribute?.id) !== RICH_CONTENT_ATTRIBUTE_ID);
  if (serializedRichContent === null) return otherAttributes;
  return [...otherAttributes, {
    complex_id: 0,
    id: RICH_CONTENT_ATTRIBUTE_ID,
    values: [{ dictionary_value_id: 0, value: serializedRichContent }]
  }];
}

async function readProductRichContent(productId) {
  let lastId = '';
  for (let page = 0; page < 10; page++) {
    const result = resultOf(await ozon('/v4/product/info/attributes', {
      filter: { product_id: [Number(productId)] },
      limit: 100,
      last_id: lastId
    }));
    const item = (Array.isArray(result.items) ? result.items : []).find(candidate =>
      String(candidate.product_id ?? candidate.productId ?? '') === String(productId)
    );
    if (item) {
      const attribute = (Array.isArray(item.attributes) ? item.attributes : []).find(candidate => Number(candidate.id) === RICH_CONTENT_ATTRIBUTE_ID);
      const value = attribute?.values?.find(candidate => candidate?.value !== undefined)?.value;
      return {
        productId: String(item.product_id ?? item.productId ?? productId),
        offerId: String(item.offer_id ?? item.offerId ?? ''),
        found: value !== undefined && value !== null && value !== '',
        rawValue: value === undefined || value === null ? '' : (typeof value === 'string' ? value : JSON.stringify(value))
      };
    }
    const next = String(result.last_id || '').trim();
    if (!next || next === lastId || result.has_next === false) break;
    lastId = next;
  }
  return { productId: String(productId), offerId: '', found: false, rawValue: '' };
}

function stockWarehouseId(row) {
  const candidate = row.warehouse_id ?? row.warehouseId ?? row.stock_warehouse_id ?? row.location_id ?? row.warehouse?.id ?? row.warehouse?.warehouse_id ?? row.warehouse?.warehouseId;
  if (candidate && typeof candidate === 'object') return String(candidate.id ?? candidate.warehouse_id ?? candidate.warehouseId ?? '').trim();
  return String(candidate ?? '').trim();
}

function stockWarehouseIds(row) {
  const list = row.warehouse_ids ?? row.warehouseIds;
  if (Array.isArray(list)) return [...new Set(list.map(value => String(value ?? '').trim()).filter(Boolean))];
  const single = stockWarehouseId(row);
  return single ? [single] : [];
}

function stockWarehouseName(row) {
  const candidate = row.warehouse_name ?? row.warehouseName ?? row.name ?? row.warehouse?.name ?? row.warehouse?.warehouse_name;
  return String(candidate ?? '').trim();
}

function normalizeWarehouse(item) {
  return {
    warehouseId: String(item.warehouse_id ?? item.warehouseId ?? item.id ?? '').trim(),
    name: String(item.name ?? item.warehouse_name ?? item.warehouseName ?? '').trim(),
    type: String(item.warehouse_type ?? item.type ?? '').trim().toLowerCase(),
    isRfbs: item.is_rfbs === true,
    status: String(item.status ?? '').trim().toLowerCase()
  };
}

function isWritableWarehouse(warehouse) {
  return Boolean(warehouse.warehouseId)
    && !['disabled', 'deleted', 'archived', 'paused'].includes(warehouse.status);
}

async function getWarehousePages(maxPages = 10) {
  const warehouses = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page++) {
    const result = resultOf(await ozon('/v2/warehouse/list', { limit: 100, cursor }));
    const pageItems = Array.isArray(result.warehouses) ? result.warehouses : [];
    warehouses.push(...pageItems.map(normalizeWarehouse));
    const next = String(result.cursor || '').trim();
    if (!result.has_next || !next || next === cursor || pageItems.length === 0) break;
    cursor = next;
  }
  return warehouses;
}

function warehouseMatchesStock(warehouse, stockType) {
  const type = String(stockType || '').trim().toLowerCase();
  if (!type) return true;
  if (type === 'rfbs') return warehouse.isRfbs || warehouse.type === 'rfbs';
  if (type === 'fbs') return warehouse.type === 'fbs' || (!warehouse.isRfbs && warehouse.type !== 'fbo');
  if (type === 'fbo') return warehouse.type === 'fbo' || (!warehouse.isRfbs && warehouse.type !== 'fbs');
  return true;
}

function emptyInventoryRows(writableWarehouses, total = 0, reserved = 0) {
  return writableWarehouses.map(warehouse => ({
    warehouseId: warehouse.warehouseId,
    warehouseName: warehouse.name || `仓库 ${warehouse.warehouseId}`,
    present: null,
    currentTotal: null,
    exact: false,
    reserved: Number(reserved || 0),
    sku: ''
  }));
}

function exactStockByWarehouse(item) {
  const rows = new Map();
  const stockRows = Array.isArray(item?.stocks) ? item.stocks : [];
  for (const row of stockRows) {
    const warehouseIds = stockWarehouseIds(row);
    if (warehouseIds.length !== 1) continue;
    const warehouseId = warehouseIds[0];
    const previous = rows.get(warehouseId);
    rows.set(warehouseId, {
      present: Number(previous?.present || 0) + Number(row.present || 0),
      reserved: Number(previous?.reserved || 0) + Number(row.reserved || 0)
    });
  }
  return rows;
}

function explicitWHDValue(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  if (!value || typeof value !== 'object') return null;
  const nested = [value.value, value.enabled, value.is_enabled, value.is_active, value.present, value.stock, value.quantity, value.count]
    .find(candidate => candidate !== undefined && candidate !== null && candidate !== '');
  return explicitWHDValue(nested);
}

function isWHDSalesKey(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'throughwhdsales'
    || normalized === 'throughwhd'
    || normalized === 'throughwhdselling'
    || normalized === 'isthroughwhd'
    || normalized === 'isthroughwhdsales'
    || normalized === 'sellthroughwhd'
    || normalized === 'salethroughwhd'
    || normalized === 'whdsales'
    || normalized === 'whdselling'
    || normalized === 'haswhd'
    || normalized === 'iswhd'
    || normalized.includes('throughwhd')
    || normalized.includes('whdsales');
}

function isWHDStockKey(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'whdstock'
    || normalized === 'whdstocks'
    || normalized === 'whdinventory'
    || normalized === 'whdquantity';
}

function extractWHDData(...sources) {
  let sales = null;
  let stock = null;
  const stockRows = [];
  const visited = new Set();

  // The same field has appeared at different levels in Ozon responses. Walk
  // the product payload so a list item, detail object, or source object is
  // treated consistently.
  function inspect(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 6 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => inspect(item, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
        const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (isWHDSalesKey(key)) {
          const candidate = explicitWHDValue(child);
          if (candidate !== null) sales = candidate;
        }
        if (isWHDStockKey(key)) {
          const candidate = explicitWHDValue(child);
          if (candidate !== null) stock = candidate;
        }
        if (normalized === 'whd' || normalized === 'whdinfo') {
          const whdSales = explicitWHDValue(child?.sales ?? child?.selling ?? child?.enabled ?? child?.is_enabled ?? child?.is_active);
          const whdStock = explicitWHDValue(child?.stock ?? child?.stocks ?? child?.inventory ?? child?.present);
          if (whdSales !== null) sales = whdSales;
          if (whdStock !== null) stock = whdStock;
        }
        if (['stocks', 'stock', 'inventory', 'inventories'].includes(normalized)) {
          if (Array.isArray(child)) stockRows.push(...child);
          else if (Array.isArray(child?.stocks)) stockRows.push(...child.stocks);
        }
        inspect(child, depth + 1);
    }
  }

  sources.forEach(source => inspect(source));
  const whdRows = stockRows.filter(row => {
    if (!row || typeof row !== 'object') return false;
    return row.whd === true || /(?:^|[^a-z0-9])whd(?:$|[^a-z0-9])/i.test(String(row.source ?? row.type ?? row.scheme ?? row.channel ?? row.warehouse_type ?? row.warehouse_name ?? '').trim());
  });
  if (whdRows.length) {
    stock = whdRows.reduce((sum, row) => sum + Math.max(Number(row.present ?? row.stock ?? row.quantity ?? row.count ?? 0) || 0, 0), 0);
  }
  return {
    salesKnown: sales !== null,
    sales,
    stockKnown: stock !== null,
    stock,
    stockReserved: whdRows.reduce((sum, row) => sum + Math.max(Number(row.reserved || 0) || 0, 0), 0)
  };
}

async function getProductExtras(productIds, endpoint, makeBody, batchSize = 1000) {
  const output = [];
  for (const group of chunks(productIds, batchSize)) {
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const raw = await ozon(endpoint, makeBody(group, cursor));
      const result = resultOf(raw);
      const items = Array.isArray(result) ? result : (result.items || []);
      output.push(...items);
      const next = (Array.isArray(result) ? raw?.cursor || raw?.last_id : result.cursor || result.last_id) || '';
      if (!next || next === cursor || items.length === 0) break;
      cursor = next;
    }
  }
  return output;
}

// Product details can be a large response for sellers with many SKUs. Keep
// each request small so a slow batch does not make the whole inventory page
// lose its names and images.
async function getProductDetails(productIds) {
  const items = [];
  const failedBatches = [];
  const groups = chunks(productIds, 100);

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    try {
      const result = resultOf(await ozon('/v3/product/info/list', { product_id: group }));
      const batchItems = Array.isArray(result.items) ? result.items : [];
      items.push(...batchItems);
    } catch (error) {
      failedBatches.push({ index: index + 1, count: group.length, error });
    }
  }

  return { items, failedBatches, batchCount: groups.length };
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function productAnalyticsDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (PRODUCT_ANALYTICS_LOOKBACK_DAYS - 1));
  return { dateFrom: localDateString(from), dateTo: localDateString(to) };
}

function normalizeProductAnalyticsRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(item => {
    const dimensions = Array.isArray(item?.dimensions) ? item.dimensions : [];
    const dimension = dimensions[0] || {};
    const key = String(item?.key ?? item?.sku ?? dimension.id ?? dimension.value ?? '').trim();
    const rawMetric = Array.isArray(item?.metrics) ? item.metrics[0] : (item?.hitsView ?? item?.hits_view ?? item?.metric);
    const hitsView = Number(rawMetric);
    return {
      key,
      sku: String(item?.sku ?? key).trim(),
      name: String(item?.name ?? dimension.name ?? '').trim(),
      hitsView: Number.isFinite(hitsView) && hitsView >= 0 ? hitsView : null
    };
  }).filter(item => item.key && item.hitsView !== null);
}

function isProductAnalyticsSnapshot(value) {
  return Boolean(value && Array.isArray(value.rows) && typeof value.dateFrom === 'string' && typeof value.dateTo === 'string');
}

function readProductAnalyticsCache() {
  try {
    const cachePath = storePath('.product-analytics-cache.json');
    if (!fs.existsSync(/*turbopackIgnore: true*/ cachePath)) return null;
    const stored = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ cachePath, 'utf8'));
    const raw = stored?.data ?? stored;
    if (!raw || !Array.isArray(raw.rows)) return null;
    const data = {
      dateFrom: String(raw.dateFrom || ''),
      dateTo: String(raw.dateTo || ''),
      rows: normalizeProductAnalyticsRows(raw.rows)
    };
    if (!isProductAnalyticsSnapshot(data)) return null;
    return {
      data,
      cachedAt: Number(stored?.cachedAt) || 0,
      rateLimitedUntil: Number(stored?.rateLimitedUntil) || 0
    };
  } catch {
    return null;
  }
}

function writeProductAnalyticsCache(data, rateLimitedUntil = 0) {
  try {
    const targetPath = storePath('.product-analytics-cache.json');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      version: 2,
      cachedAt: Date.now(),
      rateLimitedUntil: Number(rateLimitedUntil) || 0,
      data
    }), { mode: 0o600 });
    fs.renameSync(temporaryPath, targetPath);
  } catch {
    // The current response remains usable when local persistence is unavailable.
  }
}

function analyticsSnapshotForClient(cached, warnings = [], stale = false) {
  const data = cached?.data || { ...productAnalyticsDateRange(), rows: [] };
  return {
    ...data,
    cachedAt: cached?.cachedAt ? new Date(cached.cachedAt).toISOString() : '',
    stale,
    available: data.rows.length > 0,
    warnings: warnings.filter(Boolean)
  };
}

async function fetchProductAnalyticsRows(dateFrom, dateTo) {
  const rows = [];
  const limit = 1000;
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const result = resultOf(await ozon(PRODUCT_ANALYTICS_ENDPOINT, {
      date_from: dateFrom,
      date_to: dateTo,
      metrics: ['hits_view'],
      dimension: ['sku'],
      filters: [],
      sort: [],
      limit,
      offset
    }, config(), undefined, { maxRateLimitRetries: 0 }));
    const pageRows = Array.isArray(result.data) ? result.data : (Array.isArray(result.rows) ? result.rows : []);
    rows.push(...pageRows);
    const hasNext = result.has_next === true || result.hasNext === true;
    if (!hasNext && pageRows.length < limit) break;
    if (!pageRows.length) break;
    offset += pageRows.length;
  }
  return normalizeProductAnalyticsRows(rows);
}

async function getProductAnalyticsSnapshot() {
  const runtime = currentStoreRuntime();
  if (!runtime.productAnalyticsCache) {
    const stored = readProductAnalyticsCache();
    if (stored) {
      runtime.productAnalyticsCache = stored.data;
      runtime.productAnalyticsCacheAt = stored.cachedAt;
    }
  }
  if (runtime.productAnalyticsInFlight) return runtime.productAnalyticsInFlight;
  if (runtime.productAnalyticsCache && runtime.productAnalyticsCacheAt && Date.now() - runtime.productAnalyticsCacheAt < PRODUCT_ANALYTICS_CACHE_MS) {
    return analyticsSnapshotForClient({ data: runtime.productAnalyticsCache, cachedAt: runtime.productAnalyticsCacheAt });
  }

  const cached = runtime.productAnalyticsCache
    ? { data: runtime.productAnalyticsCache, cachedAt: runtime.productAnalyticsCacheAt }
    : readProductAnalyticsCache();
  const endpointLimit = loadOzonEndpointRateLimits()[PRODUCT_ANALYTICS_ENDPOINT];
  if (Number(endpointLimit?.until) > Date.now()) {
    const retryAt = new Date(Number(endpointLimit.until)).toLocaleString('zh-CN', { hour12: false });
    return analyticsSnapshotForClient(cached, [
      `销售分析接口仍在限流冷却中，预计 ${retryAt} 后重试${cached ? '，当前显示最近一次成功数据' : ''}。`
    ], Boolean(cached));
  }

  runtime.productAnalyticsInFlight = (async () => {
    const { dateFrom, dateTo } = productAnalyticsDateRange();
    try {
      const rows = await fetchProductAnalyticsRows(dateFrom, dateTo);
      const data = { dateFrom, dateTo, rows };
      writeProductAnalyticsCache(data);
      runtime.productAnalyticsCache = data;
      runtime.productAnalyticsCacheAt = Date.now();
      return analyticsSnapshotForClient({ data, cachedAt: runtime.productAnalyticsCacheAt });
    } catch (error) {
      const warning = `销售分析暂时无法更新：${error.message}${cached ? '，当前显示最近一次成功数据' : ''}。`;
      return analyticsSnapshotForClient(cached, [warning], Boolean(cached));
    }
  })().finally(() => { runtime.productAnalyticsInFlight = null; });
  return runtime.productAnalyticsInFlight;
}

async function getWarehouseStockPages(offerIds, endpoint, makeBody, extractItems) {
  const output = [];
  for (const group of chunks(offerIds, 1000)) {
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const result = resultOf(await ozon(endpoint, makeBody(group, cursor)));
      const items = extractItems(result);
      output.push(...items);
      const next = String(result.cursor || result.last_id || '').trim();
      if (!next || next === cursor || items.length === 0) break;
      cursor = next;
    }
  }
  return output;
}

function normalizeWarehouseStockRows(items) {
  const byProduct = new Map();
  for (const item of items) {
    const productId = String(item.product_id || '').trim();
    const warehouseId = String(item.warehouse_id || '').trim();
    if (!productId || !warehouseId) continue;
    const rows = byProduct.get(productId) || [];
    const existing = rows.find(row => row.warehouseId === warehouseId);
    if (existing) {
      existing.present += Number(item.present || 0);
      existing.reserved += Number(item.reserved || 0);
      if (!existing.warehouseName && item.warehouse_name) existing.warehouseName = String(item.warehouse_name);
    } else {
      rows.push({
        warehouseId,
        warehouseName: String(item.warehouse_name || '').trim(),
        present: Number(item.present || 0),
        currentTotal: Number(item.present || 0),
        exact: true,
        reserved: Number(item.reserved || 0),
        sku: String(item.sku || '').trim()
      });
    }
    byProduct.set(productId, rows);
  }
  return byProduct;
}

async function getExactWarehouseStockData(offerIds) {
  const [fboResult, fbsResult] = await Promise.allSettled([
    getWarehouseStockPages(offerIds, '/v1/product/info/stocks-by-warehouse/fbo', (ids, cursor) => ({
      offer_ids: ids, limit: 1000, cursor
    }), result => Array.isArray(result.products) ? result.products : []),
    getWarehouseStockPages(offerIds, '/v2/product/info/stocks-by-warehouse/fbs', (ids, cursor) => ({
      offer_id: ids, limit: 1000, cursor
    }), result => Array.isArray(result.products) ? result.products : [])
  ]);
  const rowsByProduct = new Map();
  if (fboResult.status === 'fulfilled') {
    for (const [productId, rows] of normalizeWarehouseStockRows(fboResult.value)) {
      rowsByProduct.set(productId, [...rows]);
    }
  }
  if (fbsResult.status === 'fulfilled') {
    for (const [productId, rows] of normalizeWarehouseStockRows(fbsResult.value)) {
      const existing = rowsByProduct.get(productId) || [];
      const existingIds = new Set(existing.map(row => row.warehouseId));
      rowsByProduct.set(productId, [...existing, ...rows.filter(row => !existingIds.has(row.warehouseId))]);
    }
  }
  return {
    rowsByProduct,
    fboError: fboResult.status === 'rejected' ? fboResult.reason : null,
    fbsError: fbsResult.status === 'rejected' ? fbsResult.reason : null
  };
}

function buildWarehouseStats(writableWarehouses, warehouseStockRows) {
  const statsByWarehouse = new Map(
    writableWarehouses.map(warehouse => [
      String(warehouse.warehouseId),
      {
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.name || `仓库 ${warehouse.warehouseId}`,
        productCount: 0,
        listedProductCount: 0,
        stockUnits: 0,
        reservedUnits: 0
      }
    ])
  );

  for (const rows of warehouseStockRows.values()) {
    for (const row of rows) {
      const stats = statsByWarehouse.get(String(row.warehouseId));
      if (!stats) continue;

      const present = Number(row.present || 0);
      const reserved = Number(row.reserved || 0);
      stats.listedProductCount += 1;
      stats.stockUnits += Number.isFinite(present) ? present : 0;
      stats.reservedUnits += Number.isFinite(reserved) ? reserved : 0;
      if (present > 0) stats.productCount += 1;
    }
  }

  return writableWarehouses.map(warehouse => statsByWarehouse.get(String(warehouse.warehouseId)));
}

function normalizeProduct(item) {
  const product = item.product || item;
  return {
    productId: String(product.id || item.product_id || ''),
    offerId: product.offer_id || item.offer_id || '',
    sku: String(product.sku || product.sku_id || item.sku || item.sku_id || '').trim(),
    name: product.name || item.name || '未命名商品',
    image: pickupProductImage(product) || pickupProductImage(item),
    archived: Boolean(product.archived ?? item.archived),
    status: typeof (product.status || item.status) === 'string' ? (product.status || item.status) : ((product.status || item.status)?.state || (product.status || item.status)?.name || ''),
    // 保留列表项外层字段；Ozon 不同版本可能把 through_whd_sales
    // 放在 item、item.product 或详情对象的嵌套结构中。
    raw: item
  };
}

async function dashboard() {
  const products = (await getProductPages()).map(normalizeProduct);
  const ids = products.map(item => Number(item.productId)).filter(Number.isFinite);
  const offers = products.map(item => String(item.offerId || '').trim()).filter(Boolean);
  const [detailsResult, stocksResult, pricesResult, warehousesResult, exactWarehouseStocksResult, analyticsResult] = await Promise.allSettled([
    getProductDetails(ids),
    getProductExtras(ids, '/v4/product/info/stocks', (productIds, cursor) => ({
      filter: { product_id: productIds }, limit: 1000, cursor
    })),
    getProductExtras(ids, '/v5/product/info/prices', (productIds, cursor) => ({
      filter: { product_id: productIds, visibility: 'ALL' }, limit: 1000, cursor
    })),
    getWarehousePages(),
    getExactWarehouseStockData(offers),
    getProductAnalyticsSnapshot()
  ]);
  const warnings = [];
  const stockInfoByProduct = new Map();
  const warehouseStockRows = exactWarehouseStocksResult.status === 'fulfilled'
    ? exactWarehouseStocksResult.value.rowsByProduct
    : new Map();
  if (exactWarehouseStocksResult.status === 'rejected') {
    warnings.push(`精确仓库库存暂不可用：${exactWarehouseStocksResult.reason.message}`);
  } else {
    const exactWarehouseErrors = exactWarehouseStocksResult.value;
    if (exactWarehouseErrors.fboError) warnings.push(`FBO 仓库库存暂不可用：${exactWarehouseErrors.fboError.message}`);
    if (exactWarehouseErrors.fbsError) warnings.push(`FBS/rFBS 仓库库存暂不可用：${exactWarehouseErrors.fbsError.message}`);
  }
  const warehouses = warehousesResult.status === 'fulfilled' ? warehousesResult.value : [];
  const writableWarehouses = warehouses.filter(isWritableWarehouse);
  if (warehousesResult.status === 'rejected') warnings.push(`仓库列表暂不可用：${warehousesResult.reason.message}`);
  else if (!writableWarehouses.length) warnings.push('Ozon 未返回可写入的启用仓库，暂时无法批量修改库存。');
  const details = new Map();
  if (detailsResult.status === 'fulfilled') {
    for (const item of detailsResult.value.items) details.set(String(item.id || item.product_id || ''), item);
    if (detailsResult.value.failedBatches.length) {
      const failed = detailsResult.value.failedBatches;
      const failedCount = failed.reduce((sum, batch) => sum + batch.count, 0);
      const firstError = failed[0].error?.message || '请求失败';
      warnings.push(`部分商品详情暂不可用：${failed.length}/${detailsResult.value.batchCount} 批（约 ${failedCount} 个商品），${firstError}，可稍后刷新重试。`);
    }
  } else warnings.push(`商品详情暂不可用：${detailsResult.reason.message}`);
  const stocks = new Map();
  if (stocksResult.status === 'fulfilled') {
    for (const item of stocksResult.value) {
      stockInfoByProduct.set(String(item.product_id || ''), item);
      const stockRows = Array.isArray(item.stocks) ? item.stocks : [];
      const total = stockRows.reduce((sum, row) => sum + Number(row.present || 0), 0);
      const reserved = stockRows.reduce((sum, row) => sum + Number(row.reserved || 0), 0);
      const rowsByWarehouse = new Map();
      stockRows.forEach(row => {
        const warehouseIds = stockWarehouseIds(row);
        // FBO/FBS/rFBS is a fulfillment type, not a warehouse ID. Only
        // attach a stock value to a warehouse when Ozon explicitly returns
        // exactly one warehouse ID for that record.
        if (warehouseIds.length !== 1) return;
        const warehouseId = warehouseIds[0];
        const previous = rowsByWarehouse.get(warehouseId);
        rowsByWarehouse.set(warehouseId, {
          warehouseId,
          warehouseName: stockWarehouseName(row) || previous?.warehouseName || '',
          present: Number(previous?.present || 0) + Number(row.present || 0),
          currentTotal: Number(previous?.currentTotal || 0) + Number(row.present || 0),
          exact: true,
          reserved: Number(previous?.reserved || 0) + Number(row.reserved || 0),
          sku: String(row.sku || previous?.sku || '').trim()
        });
      });
      const rows = [...rowsByWarehouse.values()];
      const directRows = warehouseStockRows.get(String(item.product_id)) || [];
      const exactRows = rows.length ? rows : [];
      const mergedRows = [...directRows, ...exactRows.filter(row => !directRows.some(direct => String(direct.warehouseId) === String(row.warehouseId)))];
      stocks.set(String(item.product_id), {
        total,
        reserved,
        rows: mergedRows.length ? mergedRows : emptyInventoryRows(writableWarehouses, total, reserved)
      });
    }
  } else warnings.push(`库存数据暂不可用：${stocksResult.reason.message}`);

  // The aggregate stock endpoint can be rate-limited or omit products. Keep
  // exact warehouse rows usable in both the product table and the overview.
  for (const product of products) {
    if (stocks.has(product.productId)) continue;
    const directRows = warehouseStockRows.get(product.productId) || [];
    if (!directRows.length) continue;
    stocks.set(product.productId, {
      total: directRows.reduce((sum, row) => sum + Number(row.present || 0), 0),
      reserved: directRows.reduce((sum, row) => sum + Number(row.reserved || 0), 0),
      rows: directRows
    });
  }
  const prices = new Map();
  if (pricesResult.status === 'fulfilled') {
    for (const item of pricesResult.value) {
      const price = item.price && typeof item.price === 'object' ? item.price : item;
      prices.set(String(item.product_id || item.product?.id || ''), {
        price: price.price || price.marketing_price || '',
        oldPrice: price.old_price || '',
        currency: price.currency_code || 'RUB'
      });
    }
  } else warnings.push(`价格数据暂不可用：${pricesResult.reason.message}`);

  const analytics = analyticsResult.status === 'fulfilled'
    ? analyticsResult.value
    : analyticsSnapshotForClient(null, [`销售分析暂时无法读取：${analyticsResult.reason.message}`]);
  warnings.push(...analytics.warnings);
  const productIdBySku = new Map();
  const rememberSku = (sku, productId) => {
    const key = String(sku ?? '').trim();
    if (key && productId && !productIdBySku.has(key)) productIdBySku.set(key, String(productId));
  };
  if (detailsResult.status === 'fulfilled') {
    for (const item of detailsResult.value.items) {
      const productId = String(item.id || item.product_id || '');
      rememberSku(item.sku, productId);
      for (const source of Array.isArray(item.sources) ? item.sources : []) rememberSku(source.sku, productId);
    }
  }
  if (stocksResult.status === 'fulfilled') {
    for (const item of stocksResult.value) {
      for (const stock of Array.isArray(item.stocks) ? item.stocks : []) rememberSku(stock.sku, item.product_id);
    }
  }
  const analyticsByProductId = new Map();
  const analyticsByKey = new Map();
  for (const row of analytics.rows || []) {
    analyticsByKey.set(String(row.key), row.hitsView);
    if (row.sku) analyticsByKey.set(String(row.sku), row.hitsView);
    const productId = productIdBySku.get(row.sku) || productIdBySku.get(row.key);
    if (productId) analyticsByProductId.set(productId, row.hitsView);
  }

  const rows = products.map(product => {
    const detail = details.get(product.productId) || {};
    const stock = stocks.get(product.productId) || null;
    const whd = extractWHDData(detail, product.raw, stockInfoByProduct.get(product.productId));
    const stockSkus = (stock?.rows || []).map(row => String(row.sku || '').trim()).filter(Boolean);
    const analyticsKeys = [detail.sku, detail.sku_id, product.sku, ...stockSkus, product.productId, product.offerId]
      .map(value => String(value ?? '').trim()).filter(Boolean);
    const displayCount = analyticsKeys.reduce((value, key) => value ?? analyticsByKey.get(key), analyticsByProductId.get(product.productId) ?? null);
    return {
      ...product,
      name: detail.name || product.name,
      image: pickupProductImage(detail) || product.image || '',
      stock,
      whdSales: whd.sales,
      whdSalesKnown: whd.salesKnown,
      whdStock: whd.stock,
      whdStockKnown: whd.stockKnown,
      whdStockReserved: whd.stockReserved,
      pricing: prices.get(product.productId) || null,
      displayCount: displayCount ?? null
    };
  });
  const warehouseStats = buildWarehouseStats(writableWarehouses, warehouseStockRows);
  return {
    products: rows,
    inventoryWarehouses: writableWarehouses,
    warehouseStats,
    whd: {
      salesAvailable: rows.some(row => row.whdSalesKnown),
      salesEnabledCount: rows.filter(row => row.whdSalesKnown && Number(row.whdSales) === 1).length,
      stockAvailable: rows.some(row => row.whdStockKnown),
      productCount: rows.filter(row => row.whdStockKnown && Number(row.whdStock) > 0).length,
      stockUnits: rows.reduce((sum, row) => sum + (row.whdStockKnown ? Number(row.whdStock) || 0 : 0), 0)
    },
    stats: {
      total: rows.length,
      active: rows.filter(row => !row.archived).length,
      archived: rows.filter(row => row.archived).length,
      stockUnits: rows.reduce((sum, row) => sum + (row.stock?.total || 0), 0),
      lowStock: rows.filter(row => row.stock && row.stock.total <= 5 && !row.archived).length,
      displayCount: rows.reduce((sum, row) => sum + (Number(row.displayCount) || 0), 0)
    },
    analytics: {
      dateFrom: analytics.dateFrom,
      dateTo: analytics.dateTo,
      cachedAt: analytics.cachedAt,
      stale: analytics.stale,
      available: analytics.available
    },
    warnings
  };
}

function firstPriceValue(...values) {
  const value = values.find(candidate => candidate !== undefined && candidate !== null && String(candidate).trim() !== '');
  return value === undefined ? '' : String(value);
}

function priceAmountValue(...values) {
  const value = values.find(candidate => candidate !== undefined && candidate !== null && candidate !== '');
  if (value === undefined) return '';
  if (value && typeof value === 'object') {
    return firstPriceValue(value.amount, value.value, value.price);
  }
  return String(value);
}

function finiteProductNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function convertProductMeasurement(value, unit, kind) {
  if (value === null || value <= 0) return null;
  const normalizedUnit = String(unit || '').trim().toLowerCase();
  const factors = kind === 'length'
    ? { mm: 0.1, millimeter: 0.1, millimeters: 0.1, cm: 1, centimeter: 1, centimeters: 1, m: 100, meter: 100, meters: 100, in: 2.54, inch: 2.54, inches: 2.54 }
    : { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, mg: 0.001 };
  const factor = factors[normalizedUnit];
  return factor ? value * factor : null;
}

function normalizeOglPackageDetails(details = {}) {
  const nested = [details.package_dimensions, details.packageDimensions, details.dimensions, details.packaging, details.package]
    .find(value => value && typeof value === 'object') || {};
  const dimensionUnit = firstPriceValue(details.dimension_unit, details.dimensionUnit, nested.dimension_unit, nested.dimensionUnit);
  const weightUnit = firstPriceValue(details.weight_unit, details.weightUnit, nested.weight_unit, nested.weightUnit);
  const length = convertProductMeasurement(finiteProductNumber(
    details.depth, details.length, details.package_depth, details.package_length, details.packageDepth, details.packageLength,
    nested.depth, nested.length, nested.package_depth, nested.package_length
  ), dimensionUnit, 'length');
  const width = convertProductMeasurement(finiteProductNumber(
    details.width, details.package_width, details.packageWidth, nested.width, nested.package_width
  ), dimensionUnit, 'length');
  const height = convertProductMeasurement(finiteProductNumber(
    details.height, details.package_height, details.packageHeight, nested.height, nested.package_height
  ), dimensionUnit, 'length');
  const weightGrams = convertProductMeasurement(finiteProductNumber(
    details.weight, details.package_weight, details.packageWeight, nested.weight, nested.package_weight
  ), weightUnit, 'weight');
  return { lengthCm: length, widthCm: width, heightCm: height, weightGrams };
}

function mergeProductAttributeSources(details, attributes) {
  if (!attributes || typeof attributes !== 'object') return details || {};
  const merged = { ...(details || {}), ...(attributes || {}) };
  const attributeRows = Array.isArray(attributes.attributes) ? attributes.attributes : [];
  for (const attribute of attributeRows) {
    if (!attribute || typeof attribute !== 'object') continue;
    const key = String(attribute.name ?? attribute.attribute_name ?? attribute.code ?? '').trim();
    const value = Array.isArray(attribute.values)
      ? (attribute.values[0]?.value ?? attribute.values[0]?.name ?? attribute.values[0])
      : (attribute.value ?? attribute.values);
    if (key && value !== undefined && value !== null) merged[key] = value;
  }
  return merged;
}

async function getProductAttributes(productIds) {
  return getProductExtras(productIds, '/v4/product/info/attributes', (ids, cursor) => ({
    filter: { product_id: ids, visibility: 'ALL' }, limit: 1000, cursor
  }), 100);
}

function productCommissionRate(priceItem, price) {
  const commission = priceItem?.commissions || price?.commissions || {};
  const fields = [
    ['sales_percent_rfbs', 'rFBS'], ['sales_percent_fbs', 'FBS'],
    ['sales_percent_real_fbs', 'rFBS'], ['sales_percent', 'Ozon 返回比例']
  ];
  for (const [field, label] of fields) {
    const value = finiteProductNumber(commission[field], priceItem?.[field], price?.[field]);
    if (value !== null && value >= 0 && value <= 100) return { rate: value, source: label };
  }
  return { rate: null, source: '' };
}

const OGL_PRODUCT_ROUTES = {
  extraSmall: { label: 'Extra Small', minWeight: 1, maxWeight: 500, minValue: 1, maxValue: 1500, fixed: 2.9, rate: 0.0247, volumetric: false },
  budget: { label: 'Budget', minWeight: 501, maxWeight: 35000, minValue: 1, maxValue: 1500, fixed: 22.25, rate: 0.0164, volumetric: false },
  small: { label: 'Small', minWeight: 1, maxWeight: 2000, minValue: 1501, maxValue: 7000, fixed: 15.48, rate: 0.0242, volumetric: false },
  big: { label: 'Big', minWeight: 2001, maxWeight: 35000, minValue: 1501, maxValue: 7000, fixed: 34.82, rate: 0.0164, volumetric: true },
  premiumSmall: { label: 'Premium Small', minWeight: 1, maxWeight: 5000, minValue: 7001, maxValue: 250000, fixed: 21.28, rate: 0.0242, volumetric: false },
  premiumBig: { label: 'Premium Big', minWeight: 5001, maxWeight: 35000, minValue: 7001, maxValue: 250000, fixed: 59.97, rate: 0.0222, volumetric: true }
};

function oglPackageRestrictionMessage(product) {
  const issues = [];
  if (product.weightGrams > 35000) issues.push('包装重量超过 35 kg');
  const sides = [product.lengthCm, product.widthCm, product.heightCm].sort((left, right) => right - left);
  if (sides[0] > 200 || sides[1] > 80 || sides[2] > 80) issues.push('包装尺寸超过 200 × 80 × 80 cm');
  if (product.lengthCm * product.widthCm * product.heightCm > 500000) issues.push('包装体积超过 500 L');
  return issues;
}

function oglProductRouteFee(key, product) {
  const route = OGL_PRODUCT_ROUTES[key];
  const actualGrams = product.weightGrams;
  const volumeGrams = product.lengthCm * product.widthCm * product.heightCm / 12000 * 1000;
  const billableGrams = Math.ceil(route.volumetric ? Math.max(actualGrams, volumeGrams) : actualGrams);
  return { route, actualGrams, volumeGrams, billableGrams, shippingCny: route.fixed + billableGrams * route.rate };
}

function calculateProductProfit(product, exchangeRate) {
  const currentPrice = finiteProductNumber(product.currentPrice);
  const promotionPrice = finiteProductNumber(product.promotionPrice);
  const usePromotionPrice = promotionPrice !== null
    && promotionPrice > 0
    && (currentPrice === null || promotionPrice < currentPrice);
  const sellingPrice = usePromotionPrice ? promotionPrice : currentPrice;
  const priceSource = usePromotionPrice ? 'promotion' : 'current';
  const currency = String(product.currency || 'RUB').toUpperCase();
  const priceCny = sellingPrice === null ? null
    : currency === 'RUB' ? sellingPrice * exchangeRate
      : currency === 'CNY' ? sellingPrice : null;
  const priceRub = sellingPrice === null ? null
    : currency === 'RUB' ? sellingPrice
      : currency === 'CNY' ? sellingPrice / exchangeRate : null;
  const missing = [];
  if (sellingPrice === null || sellingPrice <= 0 || priceCny === null || priceRub === null) missing.push('售价或币种缺失');
  if (product.lengthCm === null || product.lengthCm <= 0) missing.push('包装长缺失');
  if (product.widthCm === null || product.widthCm <= 0) missing.push('包装宽缺失');
  if (product.heightCm === null || product.heightCm <= 0) missing.push('包装高缺失');
  if (product.weightGrams === null || product.weightGrams <= 0) missing.push('包装重量缺失');
  if (product.commissionRate === null || product.commissionRate === undefined) missing.push('rFBS/FBS 佣金比例缺失');
  const common = {
    ...product,
    sellingPrice,
    priceSource,
    currency,
    priceCny,
    priceRub,
    missing,
    route: null,
    actualWeightGrams: product.weightGrams,
    volumetricWeightGrams: null,
    billableWeightGrams: null,
    oglShippingCny: null,
    acquiringFeeCny: priceCny === null ? null : priceCny * PRODUCT_PROFIT_ACQUIRING_FEE_RATE,
    logisticsPlatformFeeCny: priceCny === null ? null : priceCny * PRODUCT_PROFIT_LOGISTICS_PLATFORM_FEE_RATE,
    transportContractFeeCny: priceCny === null ? null : priceCny * PRODUCT_PROFIT_TRANSPORT_CONTRACT_FEE_RATE,
    starAdsFeeCny: priceCny === null ? null : priceCny * PRODUCT_PROFIT_STAR_ADS_FEE_RATE,
    commissionCny: priceCny === null || product.commissionRate === null ? null : priceCny * product.commissionRate / 100,
    profitCny: null,
    profitMargin: null,
    status: missing.length ? 'incomplete' : 'calculated',
    statusMessage: missing.join('、')
  };
  if (missing.length) return common;

  const restrictions = oglPackageRestrictionMessage(product);
  const eligible = restrictions.length ? [] : Object.entries(OGL_PRODUCT_ROUTES)
    .filter(([, route]) => {
      const grams = Math.ceil(product.weightGrams);
      return priceRub >= route.minValue && priceRub <= route.maxValue && grams >= route.minWeight && grams <= route.maxWeight;
    })
    .map(([key]) => ({ key, ...oglProductRouteFee(key, product) }))
    .sort((left, right) => left.shippingCny - right.shippingCny);
  if (!eligible.length) {
    return {
      ...common,
      status: 'unavailable',
      statusMessage: restrictions.join('、') || '货值或重量不符合 OGL 线路范围'
    };
  }
  const selected = eligible[0];
  const profitCny = priceCny
    - selected.shippingCny
    - common.acquiringFeeCny
    - common.logisticsPlatformFeeCny
    - common.transportContractFeeCny
    - common.starAdsFeeCny
    - common.commissionCny;
  return {
    ...common,
    status: 'calculated',
    statusMessage: '',
    route: selected.route.label,
    volumetricWeightGrams: selected.volumeGrams,
    billableWeightGrams: selected.billableGrams,
    oglShippingCny: selected.shippingCny,
    profitCny,
    profitMargin: priceCny ? profitCny / priceCny : null
  };
}

function normalizeMarketingAction(action) {
  return {
    id: String(action?.id ?? action?.action_id ?? '').trim(),
    name: String(action?.title ?? action?.name ?? action?.action_name ?? '').trim(),
    dateFrom: String(action?.date_from ?? action?.date_start ?? action?.dateFrom ?? '').trim(),
    dateTo: String(action?.date_to ?? action?.date_end ?? action?.dateTo ?? '').trim(),
    discountValue: firstPriceValue(action?.discount_value, action?.discountValue, action?.value),
    valueType: String(action?.value_type ?? action?.valueType ?? '').trim(),
    isParticipating: action?.is_participating === true || action?.isParticipating === true
  };
}

function normalizePricingPromotionProduct(product, priceItem, activePromotions, promotionDataAvailable, details = {}) {
  const price = priceItem?.price && typeof priceItem.price === 'object' ? priceItem.price : (priceItem || {});
  const actions = activePromotions.get(product.productId) || [];
  const active = actions.length > 0;
  const currency = firstPriceValue(price.currency_code, price.currency, 'RUB').toUpperCase();
  const currentPrice = priceAmountValue(price.price, price.retail_price, price.marketing_seller_price, price.marketing_price);
  const marketingSellerPrice = priceAmountValue(price.marketing_seller_price, price.marketing_price);
  // marketing_seller_price is a price-calculation field, not proof that the
  // product has an active promotion. Only use an explicit action price here.
  const promotionPrice = active
    ? priceAmountValue(actions[0].actionPrice)
    : '';
  const dimensions = normalizeOglPackageDetails(details);
  const commission = productCommissionRate(priceItem, price);
  return {
    productId: product.productId,
    offerId: product.offerId,
    name: product.name,
    image: product.image || '',
    archived: product.archived,
    status: product.status,
    currentPrice,
    retailPrice: firstPriceValue(price.retail_price),
    oldPrice: firstPriceValue(price.old_price),
    promotionPrice,
    marketingSellerPrice,
    currency,
    ...dimensions,
    commissionRate: commission.rate,
    commissionRateSource: commission.source,
    promotionStatus: active ? 'active' : promotionDataAvailable ? 'inactive' : 'unknown',
    promotions: actions
  };
}

async function getMarketingActionList() {
  const result = resultOf(await ozon('/v1/actions', {}, config(), undefined, { method: 'GET' }));
  const actionItems = Array.isArray(result) ? result : (Array.isArray(result.actions) ? result.actions : (Array.isArray(result.items) ? result.items : null));
  if (!actionItems) throw new Error('Ozon 未返回有效的活动列表。');
  return actionItems;
}

async function getActiveMarketingPromotions() {
  const actionItems = await getMarketingActionList();
  const actions = actionItems.map(normalizeMarketingAction);
  const actionById = new Map(actions.map(action => [action.id, action]));
  const participating = actionItems.filter(action => action.is_participating === true || action.isParticipating === true);
  const productsById = new Map();
  const warnings = [];
  const maxActions = 10;
  const maxProductPages = 50;

  for (const action of participating.slice(0, maxActions)) {
    const actionId = String(action.id ?? action.action_id ?? '').trim();
    if (!actionId) continue;
    try {
      let cursor = '';
      let total = NaN;
      let hasMore = false;
      for (let page = 0; page < maxProductPages; page++) {
        const response = resultOf(await ozon('/v2/actions/products', {
          action_id: /^\d+$/.test(actionId) ? Number(actionId) : actionId,
          limit: 100,
          last_id: cursor
        }));
        const items = Array.isArray(response.products) ? response.products : (Array.isArray(response.items) ? response.items : []);
        total = Number(response.total ?? response.total_count ?? response.totalCount ?? action.participating_products_count ?? action.participatingProductsCount);
        for (const item of items) {
          const productId = String(item.product_id ?? item.productId ?? item.id ?? '').trim();
          if (!productId) continue;
          const promotion = {
            ...actionById.get(actionId),
            actionPrice: priceAmountValue(item.action_price, item.actionPrice, item.price),
            currency: String(item.action_price?.currency ?? item.actionPrice?.currency ?? item.price?.currency ?? '').trim().toUpperCase()
          };
          productsById.set(productId, [...(productsById.get(productId) || []), promotion]);
        }
        const next = String(response.last_id ?? response.lastId ?? '').trim();
        hasMore = Boolean(next && next !== cursor && items.length > 0);
        if (!hasMore) break;
        cursor = next;
      }
      if (hasMore) warnings.push(`活动“${actionById.get(actionId)?.name || actionId}”参与商品超过读取上限 ${maxProductPages * 100} 件${Number.isFinite(total) ? `（总数 ${total}）` : ''}，仅统计已返回商品。`);
    } catch (error) {
      warnings.push(`读取促销活动“${actionById.get(actionId)?.name || actionId}”商品失败：${error.message}`);
    }
  }
  if (participating.length > maxActions) warnings.push(`账号参与 ${participating.length} 个活动，本次为控制接口调用仅读取前 ${maxActions} 个。`);
  return { productsById, warnings, available: warnings.length === 0, actions };
}

async function getPromotionCandidates(actionId, requestedProductIds = []) {
  const requested = new Set(requestedProductIds.map(String));
  const candidates = new Map();
  let cursor = '';
  let scanComplete = false;
  const maxPages = 50;
  for (let page = 0; page < maxPages; page++) {
    const response = resultOf(await ozon('/v2/actions/candidates', {
      action_id: Number(actionId), limit: 100, last_id: cursor
    }));
    const items = Array.isArray(response.products) ? response.products : (Array.isArray(response.items) ? response.items : []);
    for (const item of items) {
      const productId = String(item.id ?? item.product_id ?? item.productId ?? '').trim();
      if (!productId) continue;
      candidates.set(productId, {
        productId,
        actionPrice: priceAmountValue(item.action_price, item.actionPrice, item.price),
        currency: String(item.action_price?.currency ?? item.actionPrice?.currency ?? item.price?.currency ?? '').trim().toUpperCase(),
        maxActionPrice: priceAmountValue(item.max_action_price, item.maxActionPrice),
        minStock: Number(item.min_stock ?? item.minStock) || 0,
        recommendedStock: Number(item.recommended_stock ?? item.recommendedStock) || 0,
        quarantined: item.is_quarantined === true || item.isQuarantined === true
      });
    }
    const next = String(response.last_id ?? response.lastId ?? '').trim();
    if (!next || next === cursor || !items.length) {
      scanComplete = true;
      break;
    }
    cursor = next;
    if (requested.size && [...requested].every(productId => candidates.has(productId))) {
      scanComplete = true;
      break;
    }
  }
  return {
    candidates: [...candidates.values()].filter(item => !requested.size || requested.has(item.productId)),
    missingProductIds: [...requested].filter(productId => !candidates.has(productId)),
    scanComplete
  };
}

async function pricingPromotions() {
  const catalog = await getProductPagesSnapshot();
  const products = catalog.items.map(normalizeProduct);
  const ids = products.map(item => Number(item.productId)).filter(Number.isFinite);
  // /v3/product/list already returns the name and primary image for most
  // products. Only request the heavier detail endpoint for rows that really
  // need enrichment; querying every SKU makes this page prone to timeouts.
  const detailIds = products
    .filter(product => !String(product.name || '').trim() || product.name === '未命名商品' || !product.image)
    .map(product => Number(product.productId))
    .filter(Number.isFinite);
  const [pricesResult, promotionsResult, detailsResult] = await Promise.allSettled([
    getProductExtras(ids, '/v5/product/info/prices', (productIds, cursor) => ({
      filter: { product_id: productIds, visibility: 'ALL' }, limit: 1000, cursor
    })),
    getActiveMarketingPromotions(),
    detailIds.length ? getProductDetails(detailIds) : Promise.resolve({ items: [], failedBatches: [], batchCount: 0 })
  ]);
  const prices = pricesResult.status === 'fulfilled' ? pricesResult.value : [];
  const promotions = promotionsResult.status === 'fulfilled'
    ? promotionsResult.value
    : { productsById: new Map(), warnings: [`促销活动暂不可用：${promotionsResult.reason.message}`], available: false };
  const productDetails = detailsResult.status === 'fulfilled' ? detailsResult.value : { items: [], failedBatches: [{ count: ids.length, error: detailsResult.reason }] };
  const detailsByProduct = new Map(productDetails.items.map(item => [String(item.id || item.product_id || ''), item]));
  const pricesByProduct = new Map(prices.map(item => [String(item.product_id || item.product?.id || ''), item]));
  const rows = products.map(product => {
    const details = detailsByProduct.get(product.productId) || {};
    return normalizePricingPromotionProduct({
      ...product,
      name: details.name || product.name,
      image: pickupProductImage(details) || product.image || ''
    },
    pricesByProduct.get(product.productId),
    promotions.productsById,
    promotions.available,
    details
  );
  });
  const warnings = [];
  if (!catalog.complete) warnings.push(`商品列表达到 ${catalog.pages} 页读取上限，当前仅核算前 ${rows.length} 个商品；请提高读取上限后再确认是否已覆盖全部商品。`);
  const missingPrices = rows.filter(row => !pricesByProduct.has(row.productId)).length;
  if (missingPrices) warnings.push(`${missingPrices} 个商品没有返回价格记录，请稍后刷新。`);
  if (pricesResult.status === 'rejected') warnings.push(`价格数据暂不可用：${pricesResult.reason.message}`);
  if (productDetails.failedBatches.length) {
    const failedCount = productDetails.failedBatches.reduce((sum, batch) => sum + batch.count, 0);
    warnings.push(`部分商品图片或详情暂不可用：${productDetails.failedBatches.length} 批（约 ${failedCount} 个商品），${productDetails.failedBatches[0].error?.message || '请求失败'}。`);
  }
  warnings.push(...promotions.warnings);
  return {
    products: rows,
    actions: promotions.actions || [],
    stats: {
      total: rows.length,
      active: rows.filter(row => row.promotionStatus === 'active').length,
      inactive: rows.filter(row => row.promotionStatus === 'inactive').length,
      unknown: rows.filter(row => row.promotionStatus === 'unknown').length
    },
    warnings,
    catalogComplete: catalog.complete,
    syncedAt: new Date().toISOString(),
    sources: { products: '/v3/product/list + /v3/product/info/list', prices: '/v5/product/info/prices', promotions: '/v1/actions + /v2/actions/products', promotionCandidates: '/v2/actions/candidates' }
  };
}

async function buildProductProfit(forceRefresh = false) {
  const pricing = await getPricingPromotionsSnapshot(forceRefresh);
  const exchangeRate = config().orderRubToCny;
  const productIds = (pricing.products || []).map(product => Number(product.productId)).filter(Number.isFinite);
  const attributesResult = await Promise.allSettled([getProductAttributes(productIds)]);
  const attributes = attributesResult[0].status === 'fulfilled' ? attributesResult[0].value : [];
  const attributesByProduct = new Map(attributes.map(item => [String(item.id || item.product_id || item.product?.id || ''), item]));
  const products = (pricing.products || []).map(product => {
    const attributeItem = attributesByProduct.get(String(product.productId));
    const dimensions = normalizeOglPackageDetails(mergeProductAttributeSources(product, attributeItem));
    return calculateProductProfit({ ...product, ...dimensions }, exchangeRate);
  });
  const calculated = products.filter(product => product.status === 'calculated');
  const additionalPlatformFeesCny = calculated.reduce((sum, product) => sum
    + product.logisticsPlatformFeeCny
    + product.transportContractFeeCny
    + product.starAdsFeeCny, 0);
  return {
    products,
    stats: {
      total: products.length,
      calculated: calculated.length,
      incomplete: products.filter(product => product.status === 'incomplete').length,
      unavailable: products.filter(product => product.status === 'unavailable').length,
      estimatedProfitCny: calculated.reduce((sum, product) => sum + product.profitCny, 0),
      additionalPlatformFeesCny
    },
    exchangeRate,
    acquiringFeeRate: PRODUCT_PROFIT_ACQUIRING_FEE_RATE,
    logisticsPlatformFeeRate: PRODUCT_PROFIT_LOGISTICS_PLATFORM_FEE_RATE,
    transportContractFeeRate: PRODUCT_PROFIT_TRANSPORT_CONTRACT_FEE_RATE,
    starAdsFeeRate: PRODUCT_PROFIT_STAR_ADS_FEE_RATE,
    catalogComplete: pricing.catalogComplete !== false,
    syncedAt: pricing.syncedAt || new Date().toISOString(),
    warnings: [
      ...(pricing.warnings || []),
      ...(attributesResult[0].status === 'rejected' ? [`商品尺寸/重量属性暂不可用：${attributesResult[0].reason.message}`] : [])
    ],
    sources: { products: pricing.sources?.products, prices: pricing.sources?.prices, promotions: pricing.sources?.promotions }
  };
}

async function productProfit(forceRefresh = false) {
  const runtime = currentStoreRuntime();
  if (!forceRefresh && runtime.productProfitCache && Date.now() - runtime.productProfitCacheAt < PRICING_PROMOTIONS_CACHE_MS) {
    return runtime.productProfitCache;
  }
  if (runtime.productProfitInFlight) return runtime.productProfitInFlight;
  runtime.productProfitInFlight = buildProductProfit(forceRefresh).then(snapshot => {
    runtime.productProfitCache = snapshot;
    runtime.productProfitCacheAt = Date.now();
    return snapshot;
  }).finally(() => { runtime.productProfitInFlight = null; });
  return runtime.productProfitInFlight;
}

async function getPricingPromotionsSnapshot(forceRefresh = false) {
  const runtime = currentStoreRuntime();
  if (!forceRefresh && runtime.pricingPromotionsCache && Date.now() - runtime.pricingPromotionsCacheAt < PRICING_PROMOTIONS_CACHE_MS) return runtime.pricingPromotionsCache;
  if (runtime.pricingPromotionsInFlight) return runtime.pricingPromotionsInFlight;
  runtime.pricingPromotionsInFlight = pricingPromotions().then(snapshot => {
    runtime.pricingPromotionsCache = snapshot;
    runtime.pricingPromotionsCacheAt = Date.now();
    return snapshot;
  }).finally(() => { runtime.pricingPromotionsInFlight = null; });
  return runtime.pricingPromotionsInFlight;
}

function invalidatePricingPromotionsCache() {
  const runtime = currentStoreRuntime();
  runtime.pricingPromotionsCache = null;
  runtime.pricingPromotionsCacheAt = 0;
  runtime.productProfitCache = null;
  runtime.productProfitCacheAt = 0;
}

function readPickupState() {
  const defaults = { autoEnabled: false, template: DEFAULT_PICKUP_MESSAGE, records: {} };
  try {
    const statePath = storePath('.pickup-reminders.json');
    if (!fs.existsSync(/*turbopackIgnore: true*/ statePath)) return defaults;
    const stored = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ statePath, 'utf8'));
    return {
      autoEnabled: stored.autoEnabled === true,
      template: typeof stored.template === 'string' && stored.template.trim() ? stored.template : DEFAULT_PICKUP_MESSAGE,
      records: stored.records && typeof stored.records === 'object' ? stored.records : {}
    };
  } catch {
    return defaults;
  }
}

function writePickupState(state) {
  const statePath = storePath('.pickup-reminders.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, statePath);
}

function pickupReminderCount(record) {
  const count = Number(record?.reminderCount);
  if (Number.isSafeInteger(count) && count >= 0) return count;
  return record?.state === 'sent' ? 1 : 0;
}

function rowsFromResponse(data, key) {
  const result = resultOf(data);
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.[key]) ? result[key] : [];
}

function isLegacyFbsListEndpoint(endpoint) {
  return endpoint === FBS_V3_LIST_ENDPOINT;
}

function isUnsupportedFbsV4Error(error) {
  return [404, 405, 501].includes(Number(error?.status));
}

function nextPostingCursor(result, cursor, pageItems) {
  const next = String(result?.cursor ?? result?.next_cursor ?? result?.nextCursor ?? '').trim();
  const hasNext = result?.has_next ?? result?.hasNext;
  if (!next || next === cursor || pageItems.length === 0 || hasNext === false) return '';
  return next;
}

async function listOrderPostings(endpoint, channel, since, to, options = {}) {
  const output = [];
  const pageSize = ORDER_LIST_PAGE_LIMIT;
  const legacyOffsetPagination = isLegacyFbsListEndpoint(endpoint);
  let cursor = '';
  for (let page = 0; page < ORDER_LIST_MAX_PAGES; page++) {
    const body = legacyOffsetPagination
      ? {
          dir: 'DESC',
          filter: { since, to },
          limit: pageSize,
          offset: page * pageSize,
          with: { analytics_data: true, financial_data: true }
        }
      : {
          sort_dir: 'DESC',
          filter: { since, to },
          limit: pageSize,
          cursor,
          translit: true,
          with: { analytics_data: true, financial_data: true }
        };
    const data = await ozon(endpoint, body, config(), undefined, options);
    const result = resultOf(data);
    const postings = rowsFromResponse(result, 'postings');
    output.push(...postings.map(posting => ({ ...posting, _channel: channel })));
    if (legacyOffsetPagination) {
      if (postings.length < pageSize) break;
      continue;
    }
    cursor = nextPostingCursor(result, cursor, postings);
    if (!cursor) break;
  }
  return output;
}

async function settlePostings(load) {
  try {
    return { status: 'fulfilled', value: await load() };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

async function settleOrderPostings(endpoint, channel, since, to, options = {}) {
  return settlePostings(() => listOrderPostings(endpoint, channel, since, to, options));
}

async function settleFbsPostings(channel, since, to, options = {}) {
  return settlePostings(async () => {
    try {
      return await listOrderPostings(FBS_V4_LIST_ENDPOINT, channel, since, to, options);
    } catch (error) {
      // Keep accounts on an older Seller API deployment usable without hiding
      // authentication, permission, or rate-limit failures from the caller.
      if (!isUnsupportedFbsV4Error(error)) throw error;
      return listOrderPostings(FBS_V3_LIST_ENDPOINT, channel, since, to, options);
    }
  });
}

function orderReadWarning(channel, error) {
  if (isRateLimitError(error)) {
    const retryAt = Number(error.rateLimitedUntil || 0);
    const retryLabel = retryAt ? new Date(retryAt).toLocaleString('zh-CN', { hour12: false }) : '稍后';
    return `${channel} 订单接口触发 Ozon 请求频率限制；冷却至 ${retryLabel}，冷却期间暂停请求。该渠道数据可能未知或为历史数据。`;
  }
  return `${channel} 订单读取失败：${error?.message || '未知错误'}`;
}

function pickupReadWarning(channel, error) {
  const channelLabel = channel === 'FBS/rFBS' ? 'FBS' : channel;
  if (isRateLimitError(error)) {
    const retryAt = Number(error.rateLimitedUntil || 0);
    const retryLabel = retryAt ? new Date(retryAt).toLocaleString('zh-CN', { hour12: false }) : '稍后';
    return `${channelLabel} 订单读取受限（429）：冷却至 ${retryLabel}，冷却期间暂停请求。该渠道数据可能未知或为历史数据。`;
  }
  return `${channelLabel} 订单读取失败：${error?.message || '未知错误'}`;
}

function pickupUnavailableChannels(snapshot) {
  const unavailable = new Set(snapshot?.unavailableChannels || []);
  if (snapshot?.ordersUnavailable) {
    unavailable.add('FBO');
    unavailable.add('FBS/rFBS');
  }
  for (const warning of snapshot?.warnings || []) {
    if (/FBO.*(?:读取失败|接口触发)/i.test(warning)) unavailable.add('FBO');
    if (/FBS.*(?:读取失败|接口触发)/i.test(warning)) unavailable.add('FBS/rFBS');
  }
  return unavailable;
}

function readSnapshotCache(fileName, validate) {
  try {
    const filePath = storePath(fileName);
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return null;
    const stored = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8'));
    const data = stored?.data ?? stored;
    return validate(data) ? { data, cachedAt: Number(stored?.cachedAt) || 0 } : null;
  } catch {
    return null;
  }
}

function writeSnapshotCache(fileName, data) {
  try {
    const filePath = storePath(fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, cachedAt: Date.now(), data }), { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch {
    // A live response remains usable when local persistence is unavailable.
  }
}

function isOrdersSnapshot(value) {
  return Boolean(value && Array.isArray(value.orders) && value.stats && Array.isArray(value.warnings));
}

function isPickupSnapshot(value) {
  return Boolean(value && Array.isArray(value.candidates) && value.stats && Array.isArray(value.warnings));
}

function seedRateLimitFromRecentSnapshots() {
  const endpoint = FBS_V4_LIST_ENDPOINT;
  const limits = loadOzonEndpointRateLimits();
  if (limits[endpoint]) return;
  const legacyLimit = limits[FBS_V3_LIST_ENDPOINT];
  if (Number(legacyLimit?.until) > Date.now()) {
    limits[endpoint] = { ...legacyLimit };
    saveOzonEndpointRateLimits();
    return;
  }
  const cachedSnapshots = [
    readSnapshotCache('.orders-cache.json', isOrdersSnapshot)?.data,
    readSnapshotCache('.pickup-candidates-cache.json', isPickupSnapshot)?.data
  ].filter(Boolean);
  const recentlyRateLimited = cachedSnapshots.some(snapshot =>
    (snapshot.warnings || []).some(warning => /FBS(?:\/rFBS)?.*(?:429|请求频率|频率限制|限流)/i.test(warning))
  );
  if (!recentlyRateLimited) return;
  const now = Date.now();
  limits[endpoint] = {
    failures: 1,
    lastFailureAt: now,
    until: now + OZON_RATE_LIMIT_COOLDOWN_BASE_MS
  };
  saveOzonEndpointRateLimits();
}

const ORDER_CATEGORY_LABELS = {
  preparing: '备货',
  ready_to_ship: '待发运',
  in_transit: '运输中',
  delivered: '已签收',
  cancelled: '已取消',
  other: '其他'
};

function orderCategory(posting) {
  const status = String(posting.status || '').toLowerCase();
  const substatus = String(posting.substatus || '').toLowerCase();
  const value = `${status} ${substatus}`;
  if (/cancel|canceled|cancelled|Отмен/i.test(value)) return 'cancelled';
  if (/delivered|delivering_to_customer|delivered_to_customer|received|получ/i.test(value)) return 'delivered';
  if (/posting_in_pickup_point|delivering|driver_pick_up|sent_by_seller|on_way|in_transit|transport|передан|достав/i.test(value)) return 'in_transit';
  if (/awaiting_deliver|ready_to_ship|ready_for_shipment|ready_to_deliver|awaiting_pickup|awaiting_acceptance|waiting_for_ship/i.test(value)) return 'ready_to_ship';
  if (/awaiting_packaging|awaiting_fulfillment|awaiting_processing|processing|new|created|ожида/i.test(value)) return 'preparing';
  return 'other';
}

function orderStatusLabel(posting) {
  const status = String(posting.status || '').toLowerCase();
  const substatus = String(posting.substatus || '').toLowerCase();
  const labels = {
    awaiting_packaging: '等待备货',
    awaiting_fulfillment: '等待备货',
    awaiting_deliver: '等待发运',
    delivering: '运输中',
    driver_pick_up: '等待取件',
    sent_by_seller: '卖家已发运',
    on_way_to_city: '运输至城市',
    on_way_to_customer: '配送中',
    posting_in_pickup_point: '已到自提点',
    delivered: '已签收',
    delivered_to_customer: '已签收',
    delivered_to_pickup_point: '已到自提点',
    cancelled: '已取消',
    cancelled_from_buyer: '买家取消',
    cancelled_from_seller: '卖家取消',
    cancelled_by_ozon: 'Ozon 取消'
  };
  return labels[substatus] || labels[status] || substatus || status || '未返回状态';
}

function numberFromValue(value) {
  if (value && typeof value === 'object') return numberFromValue(value.value ?? value.amount ?? value.price);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isBalanceSnapshot(value) {
  return Boolean(value && typeof value === 'object' && typeof value.available === 'boolean'
    && Number.isFinite(Number(value.exchangeRate)));
}

function emptyBalanceSnapshot(warning, cfg = config()) {
  return {
    available: false,
    rub: null,
    cny: null,
    sourceAmount: null,
    sourceCurrency: 'RUB',
    exchangeRate: cfg.orderRubToCny,
    period: null,
    syncedAt: '',
    stale: false,
    warning: warning || 'Ozon 当前未返回可用余额。'
  };
}

function currentBalancePeriod(now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

function normalizeBalanceSnapshot(data, cfg = config()) {
  const result = resultOf(data);
  const total = result.total && typeof result.total === 'object' ? result.total : {};
  const closingBalance = total.closing_balance ?? total.closingBalance ?? result.closing_balance ?? result.closingBalance;
  const sourceAmount = numberFromValue(closingBalance);
  const sourceCurrency = String(
    closingBalance?.currency_code
      || closingBalance?.currencyCode
      || total.currency_code
      || total.currencyCode
      || 'RUB'
  ).trim().toUpperCase();
  const rate = cfg.orderRubToCny;
  const rub = sourceAmount === null
    ? null
    : sourceCurrency === 'RUB'
      ? sourceAmount
      : sourceCurrency === 'CNY' || sourceCurrency === 'RMB'
        ? sourceAmount / rate
        : null;
  const cny = sourceAmount === null
    ? null
    : sourceCurrency === 'CNY' || sourceCurrency === 'RMB'
      ? sourceAmount
      : sourceCurrency === 'RUB'
        ? sourceAmount * rate
        : null;
  const available = Number.isFinite(rub) && Number.isFinite(cny);
  const period = result.period || null;
  return {
    available,
    rub: available ? Number(rub.toFixed(2)) : null,
    cny: available ? Number(cny.toFixed(2)) : null,
    sourceAmount,
    sourceCurrency,
    exchangeRate: rate,
    period,
    syncedAt: new Date().toISOString(),
    stale: false,
    warning: available
      ? ''
      : sourceAmount === null || sourceAmount === undefined
        ? 'Ozon 财务接口已返回，但当前结果没有账户余额字段。'
        : `Ozon 返回了暂不支持的余额币种：${sourceCurrency}。`
  };
}

function balanceReadWarning(error) {
  if (isRateLimitError(error)) {
    const retryAt = Number(error.rateLimitedUntil || 0);
    const retryLabel = retryAt ? new Date(retryAt).toLocaleString('zh-CN', { hour12: false }) : '稍后';
    return `余额接口触发 Ozon 请求频率限制；冷却至 ${retryLabel}，冷却期间暂停请求。`;
  }
  return `余额读取失败：${error?.message || '未知错误'}`;
}

function loadBalanceCache(runtime = currentStoreRuntime()) {
  if (runtime.balanceCacheLoaded) return;
  const stored = readSnapshotCache('.balance-cache.json', isBalanceSnapshot);
  runtime.balanceCache = stored?.data || null;
  runtime.balanceCacheAt = stored?.cachedAt || 0;
  runtime.balanceCacheLoaded = true;
}

async function balanceSnapshot({ forceRefresh = false } = {}) {
  const runtime = currentStoreRuntime();
  loadBalanceCache(runtime);
  if (!forceRefresh && runtime.balanceCache && Date.now() - runtime.balanceCacheAt < BALANCE_CACHE_MS) {
    return { ...runtime.balanceCache, cacheAt: new Date(runtime.balanceCacheAt).toISOString() };
  }
  if (runtime.balanceInFlight) return runtime.balanceInFlight;

  runtime.balanceInFlight = (async () => {
    try {
      const period = currentBalancePeriod();
      const data = await ozon(BALANCE_ENDPOINT, {
        date_from: period.from,
        date_to: period.to
      }, config(), undefined, { maxRateLimitRetries: 0, useGlobalRateLimitCooldown: true });
      const snapshot = normalizeBalanceSnapshot({ ...data, period: { begin: period.from, end: period.to } });
      runtime.balanceCache = snapshot;
      runtime.balanceCacheAt = Date.now();
      writeSnapshotCache('.balance-cache.json', snapshot);
      return { ...snapshot, cacheAt: new Date().toISOString() };
    } catch (error) {
      const warning = balanceReadWarning(error);
      if (runtime.balanceCache) {
        return {
          ...runtime.balanceCache,
          stale: true,
          warning: `${warning} 已保留上次成功读取的余额。`,
          rateLimitedUntil: Number(error.rateLimitedUntil || 0),
          cacheAt: new Date(runtime.balanceCacheAt).toISOString()
        };
      }
      return {
        ...emptyBalanceSnapshot(warning),
        rateLimitedUntil: Number(error.rateLimitedUntil || 0)
      };
    }
  })().finally(() => {
    runtime.balanceInFlight = null;
  });
  return runtime.balanceInFlight;
}

function labelFromValue(value) {
  if (Array.isArray(value)) return value.map(labelFromValue).filter(Boolean).join(' · ');
  if (value && typeof value === 'object') {
    return String(value.name ?? value.title ?? value.value ?? value.label ?? value.type ?? value.id ?? '').trim();
  }
  return String(value ?? '').trim();
}

function orderTotal(posting) {
  const financial = posting.financial_data || posting.financialData || {};
  const candidates = [
    financial.products_price,
    financial.productsPrice,
    financial.order_amount,
    financial.orderAmount,
    posting.total_price,
    posting.totalPrice,
    posting.amount
  ];
  const direct = candidates.map(numberFromValue).find(value => value !== null);
  if (direct !== undefined) return direct;
  const rawProducts = [posting.products, posting.items, posting.product_items, posting.products_info]
    .find(value => Array.isArray(value)) || [];
  const calculated = rawProducts.reduce((sum, item) => {
    const price = numberFromValue(item.price ?? item.price_value ?? item.sale_price ?? item.salePrice);
    const quantity = numberFromValue(item.quantity ?? item.count) || 1;
    return price === null ? sum : sum + price * quantity;
  }, 0);
  return calculated || null;
}

function orderProductTotal(posting) {
  const rawProducts = [posting.products, posting.items, posting.product_items, posting.products_info]
    .find(value => Array.isArray(value)) || [];
  if (!rawProducts.length) return null;

  const lines = rawProducts.map(item => ({
    price: numberFromValue(item.price ?? item.price_value ?? item.sale_price ?? item.salePrice),
    quantity: numberFromValue(item.quantity ?? item.count) || 1,
    currency: String(
      item.currency_code ?? item.currencyCode ?? item.currency ??
      item.price?.currency_code ?? item.price?.currencyCode ?? item.price?.currency ?? ''
    ).trim().toUpperCase()
  }));
  if (lines.some(line => line.price === null)) return null;

  const currencies = [...new Set(lines.map(line => line.currency).filter(Boolean))];
  if (currencies.length > 1) return null;
  return {
    amount: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    // Ozon returns the customer-facing product price and its currency on each
    // posting product. Prefer that value over financial_data.products.price:
    // the latter can contain the same numeric CNY price while labelling it RUB
    // for settlement purposes.
    currency: currencies[0] || ''
  };
}

function normalizeOrderPosting(posting, cfg = config()) {
  const products = posting._products || pickupPostingProducts(posting);
  const primaryProduct = products.find(item => item.image || item.name) || products[0] || {};
  const createdAt = posting.created_at || posting.createdAt || posting.order_date || posting.in_process_at || '';
  const shipmentDate = posting.shipment_date || posting.shipmentDate || posting.shipment_date_from || posting.delivering_date || '';
  const deliveryDate = posting.delivery_date || posting.deliveryDate || posting.delivering_date_to || '';
  const category = orderCategory(posting);
  const productTotal = orderProductTotal(posting);
  const amount = productTotal?.amount ?? orderTotal(posting);
  const currency = String(productTotal?.currency || posting.currency_code || posting.currencyCode || posting.currency || 'RUB').toUpperCase();
  const amountCny = amount === null
    ? null
    : currency === 'CNY'
      ? amount
      : currency === 'RMB'
        ? amount
        : currency === 'RUB'
          ? Number((amount * cfg.orderRubToCny).toFixed(2))
          : null;
  return {
    postingNumber: String(posting.posting_number || posting.postingNumber || '').trim(),
    orderNumber: String(posting.order_number || posting.orderNumber || posting.posting_number || '').trim(),
    orderId: String(posting.order_id || posting.orderId || '').trim(),
    channel: posting._channel,
    category,
    categoryLabel: ORDER_CATEGORY_LABELS[category],
    status: String(posting.status || '').trim(),
    substatus: String(posting.substatus || '').trim(),
    availableActions: Array.isArray(posting.available_actions) ? posting.available_actions : [],
    statusLabel: orderStatusLabel(posting),
    createdAt,
    shipmentDate,
    deliveryDate,
    warehouse: labelFromValue(posting.warehouse_name || posting.warehouseName || posting.warehouse),
    deliveryMethod: labelFromValue(posting.delivery_method_name || posting.deliveryMethodName || posting.delivery_method),
    amount,
    currency,
    amountCny,
    productName: primaryProduct.name || '商品信息未返回',
    productImage: primaryProduct.image || '',
    productOfferId: primaryProduct.offerId || '',
    productQuantity: products.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    productCount: products.length,
    products
  };
}

async function ordersSnapshot(options = {}) {
  const source = await getOperationalPostings(options);
  const warnings = [...source.warnings];
  const unavailableChannels = [...source.unavailableChannels];
  const postings = ['FBO', 'FBS/rFBS'].flatMap(channel => source.channels?.[channel] || []);
  const legacyCache = readSnapshotCache('.orders-cache.json', isOrdersSnapshot);
  const cachedChannels = new Set(postings.map(posting => posting._channel));
  for (const channel of unavailableChannels) {
    if (source.channelSyncedAt[channel] || cachedChannels.has(channel)) continue;
    postings.push(...(legacyCache?.data.orders || [])
      .filter(order => order.channel === channel)
      .map(order => ({ ...order, _channel: channel, _products: order.products || [] })));
  }
  if (unavailableChannels.length && legacyCache) {
    warnings.push('本次同步未能完整读取 Ozon 订单，缺失渠道继续显示最近一次成功的数据。');
  }
  const cfg = config();
  const orders = postings.map(posting => normalizeOrderPosting(posting, cfg))
    .filter(order => order.postingNumber || order.orderNumber)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  const countByCategory = Object.fromEntries(Object.keys(ORDER_CATEGORY_LABELS).map(key => [key, orders.filter(order => order.category === key).length]));
  const countByChannel = {
    all: orders.length,
    FBO: orders.filter(order => order.channel === 'FBO').length,
    'FBS/rFBS': orders.filter(order => order.channel === 'FBS/rFBS').length
  };
  const bothChannelsFailed = unavailableChannels.length === 2;
  const snapshot = {
    orders,
    stats: { total: orders.length, byCategory: countByCategory, byChannel: countByChannel },
    lookbackDays: ORDER_LOOKBACK_DAYS,
    dateFrom: source.dateFrom,
    dateTo: source.dateTo,
    displayCurrency: 'CNY',
    orderRubToCny: cfg.orderRubToCny,
    syncedAt: source.syncedAt || legacyCache?.data.syncedAt || '',
    warnings,
    ordersUnavailable: bothChannelsFailed && !legacyCache,
    unavailableChannels,
    stale: unavailableChannels.length > 0,
    cacheAt: source.cacheAt || (legacyCache?.cachedAt ? new Date(legacyCache.cachedAt).toISOString() : '')
  };
  if (!bothChannelsFailed || !legacyCache) writeSnapshotCache('.orders-cache.json', snapshot);
  return snapshot;
}

async function getActionableFbsPosting(postingNumber) {
  postingNumber = normalizePostingNumber(postingNumber);
  const snapshot = await getOperationalPostings();
  const knownFbsPosting = (snapshot.channels?.['FBS/rFBS'] || []).some(posting => String(posting.posting_number || '') === postingNumber);
  if (!knownFbsPosting) {
    const error = new Error('订单不在当前店铺的 FBS/rFBS 订单列表中，请同步订单后重试。');
    error.status = 404;
    throw error;
  }
  const result = resultOf(await fbsPostingGetByNumber(postingNumber));
  const status = String(result.status || '').trim().toLowerCase();
  if (status !== 'awaiting_packaging') {
    const error = new Error(`订单当前状态为“${orderStatusLabel(result)}”，仅“等待备货”的 FBS/rFBS 订单支持此操作。`);
    error.status = 409;
    throw error;
  }
  const availableActions = Array.isArray(result.available_actions)
    ? result.available_actions.map(value => String(value || '').toLowerCase())
    : [];
  if (!availableActions.includes('pack')) {
    const error = new Error('Ozon 当前未开放此订单的备货操作，请同步订单状态后重试。');
    error.status = 409;
    throw error;
  }
  const productsBySku = new Map();
  for (const item of Array.isArray(result.products) ? result.products : []) {
    const sku = String(item.sku ?? item.sku_id ?? item.skuId ?? '').trim();
    const quantity = Number(item.quantity);
    if (!/^\d{1,16}$/.test(sku) || !Number.isSafeInteger(Number(sku)) || !Number.isSafeInteger(quantity) || quantity < 1) {
      const error = new Error('Ozon 返回的订单商品 SKU 或数量不完整，暂时不能备货或拆单。');
      error.status = 409;
      throw error;
    }
    const current = productsBySku.get(sku);
    if (current) current.quantity += quantity;
    else productsBySku.set(sku, {
      productId: sku,
      quantity,
      offerId: String(item.offer_id || item.offerId || '').trim(),
      name: String(item.name || item.product_name || '').trim()
    });
  }
  const products = [...productsBySku.values()];
  if (!products.length) {
    const error = new Error('Ozon 未返回订单商品，暂时不能备货或拆单。');
    error.status = 409;
    throw error;
  }
  return { posting: result, products };
}

function invalidateOperationalPostingsCache() {
  const runtime = currentStoreRuntime();
  if (runtime.operationalPostingsCache) runtime.operationalPostingsCacheAt = 0;
}

function fbsPostingGetRequest(postingNumber) {
  return {
    posting_number: postingNumber,
    with: {
      analytics_data: false,
      barcodes: false,
      financial_data: false,
      legal_info: false,
      product_exemplars: false,
      related_postings: false,
      translit: false
    }
  };
}

function actionablePostingPreview(posting, products) {
  return {
    postingNumber: String(posting.posting_number || posting.postingNumber || '').trim(),
    orderNumber: String(posting.order_number || posting.orderNumber || posting.posting_number || '').trim(),
    status: String(posting.status || '').trim(),
    statusLabel: orderStatusLabel(posting),
    availableActions: Array.isArray(posting.available_actions) ? posting.available_actions : [],
    products: products.map(item => ({
      productId: item.productId,
      offerId: item.offerId,
      name: item.name,
      quantity: item.quantity
    })),
    totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0)
  };
}

function normalizePostingNumber(value) {
  const postingNumber = String(value ?? '').trim();
  if (!postingNumber || postingNumber.length > 100 || /[\r\n\0]/.test(postingNumber)) {
    const error = new Error('订单编号格式不正确。');
    error.status = 400;
    throw error;
  }
  return postingNumber;
}

function fbsPostingGetByNumber(postingNumber) {
  return ozon('/v3/posting/fbs/get', fbsPostingGetRequest(postingNumber), config(), undefined, { maxRateLimitRetries: 0 });
}

function splitPostingNumbers(result) {
  const values = [];
  for (const key of ['postings', 'posting_numbers', 'postingNumbers', 'result']) {
    const field = result?.[key];
    if (!Array.isArray(field)) continue;
    for (const item of field) {
      const value = typeof item === 'string' || typeof item === 'number'
        ? String(item)
        : String(item?.posting_number || item?.postingNumber || '');
      if (value) values.push(value);
    }
  }
  const direct = String(result?.posting_number || result?.postingNumber || '').trim();
  if (direct) values.push(direct);
  return [...new Set(values)];
}

function isPickupPointSubstatus(posting) {
  return String(posting.substatus || '').toLowerCase() === 'posting_in_pickup_point';
}

function pickupPostingProducts(posting) {
  const rawProducts = [posting.products, posting.items, posting.product_items, posting.products_info]
    .find(value => Array.isArray(value)) || [];
  return rawProducts.map(item => {
    const productId = String(item.product_id ?? item.productId ?? '').trim();
    const sku = String(item.sku ?? item.sku_id ?? item.skuId ?? '').trim();
    const offerId = String(item.offer_id ?? item.offerId ?? '').trim();
    const quantity = Number(item.quantity ?? item.count ?? 1);
    return {
      productId,
      sku,
      offerId,
      name: String(item.name ?? item.product_name ?? item.productName ?? '').trim(),
      image: pickupImageUrl(item.primary_image ?? item.primaryImage ?? item.image_url ?? item.imageUrl ?? item.image ?? item.photo ?? item.photos),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    };
  });
}

function pickupImageUrl(value) {
  const candidate = Array.isArray(value) ? value[0] : (value && typeof value === 'object' ? (value.url || value.src || value.value) : value);
  if (candidate && typeof candidate === 'object') return pickupImageUrl(candidate);
  try {
    return new URL(String(candidate || '').trim()).protocol === 'https:' ? String(candidate).trim() : '';
  } catch {
    return '';
  }
}

function pickupProductImage(item) {
  return pickupImageUrl(item.primary_image ?? item.primaryImage ?? item.image_url ?? item.imageUrl ?? item.color_image ?? item.colorImage)
    || pickupImageUrl(item.images)
    || pickupImageUrl(item.image_list ?? item.imageList);
}

async function enrichPickupPostings(postings, warnings, warningLabel = '到货商品图片') {
  const inlineProducts = postings.flatMap(posting => pickupPostingProducts(posting));
  const productIds = [...new Set(inlineProducts.map(item => item.productId).filter(Boolean))];
  const skus = [...new Set(inlineProducts.map(item => Number(item.sku)).filter(Number.isSafeInteger))];
  const offerIds = [...new Set(inlineProducts.map(item => item.offerId).filter(Boolean))];
  let details = [];
  const lookupGroups = [
    ['product_id', productIds],
    ['offer_id', offerIds],
    ['sku', skus]
  ].filter(([, values]) => values.length);
  const lookupResults = await Promise.allSettled(lookupGroups.map(async ([key, values]) => {
    const result = resultOf(await ozon('/v3/product/info/list', { [key]: values }));
    return Array.isArray(result.items) ? result.items : [];
  }));
  lookupResults.forEach(result => {
    if (result.status === 'fulfilled') details.push(...result.value);
  });
  if (!details.length && lookupResults.some(result => result.status === 'rejected')) {
    const error = lookupResults.find(result => result.status === 'rejected')?.reason;
    warnings.push(`${warningLabel}暂不可用：${error?.message || '商品详情查询失败。'}`);
  }
  const byKey = new Map();
  details.forEach(item => {
    const keys = [item.id, item.product_id, item.productId, item.sku, item.offer_id, item.offerId]
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
    keys.forEach(key => byKey.set(key, item));
  });
  return postings.map(posting => {
    const products = pickupPostingProducts(posting).map(item => {
      const detail = byKey.get(item.productId) || byKey.get(item.offerId) || byKey.get(item.sku);
      return {
        ...item,
        name: item.name || String(detail?.name || '').trim(),
        image: item.image || pickupProductImage(detail || {})
      };
    });
    return { ...posting, _products: products };
  });
}

function isOperationalPostingsCache(value) {
  return Boolean(value && value.channels && Array.isArray(value.channels.FBO) && Array.isArray(value.channels['FBS/rFBS']));
}

function sanitizeOperationalPosting(posting) {
  const rawProducts = [posting.products, posting.items, posting.product_items, posting.products_info]
    .find(value => Array.isArray(value)) || [];
  const products = rawProducts.map(item => {
    const normalized = pickupPostingProducts({ products: [item] })[0];
    const rawPrice = item.price ?? item.price_value ?? item.sale_price ?? item.salePrice;
    const price = numberFromValue(rawPrice);
    const currency = String(
      item.currency_code ?? item.currencyCode ?? item.currency ??
      rawPrice?.currency_code ?? rawPrice?.currencyCode ?? rawPrice?.currency ?? ''
    ).trim().toUpperCase();
    return {
      product_id: normalized.productId,
      sku: normalized.sku,
      offer_id: normalized.offerId,
      name: normalized.name,
      quantity: normalized.quantity,
      primary_image: normalized.image,
      ...(price === null ? {} : { price }),
      ...(currency ? { currency_code: currency } : {})
    };
  });
  const enrichedProducts = (posting._products || []).map(item => ({
    productId: String(item.productId || '').trim(),
    sku: String(item.sku || '').trim(),
    offerId: String(item.offerId || '').trim(),
    name: String(item.name || '').trim(),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    image: pickupImageUrl(item.image)
  }));
  const financial = posting.financial_data || posting.financialData || {};
  const financialData = {};
  for (const key of ['products_price', 'productsPrice', 'order_amount', 'orderAmount']) {
    const value = numberFromValue(financial[key]);
    if (value !== null) financialData[key] = value;
  }
  const totalPrice = numberFromValue(posting.total_price ?? posting.totalPrice);
  const amount = numberFromValue(posting.amount);
  const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && value !== '');

  return {
    posting_number: String(firstDefined(posting.posting_number, posting.postingNumber, '')).trim(),
    order_number: String(firstDefined(posting.order_number, posting.orderNumber, '')).trim(),
    order_id: String(firstDefined(posting.order_id, posting.orderId, '')).trim(),
    _channel: posting._channel,
    status: String(posting.status || '').trim(),
    substatus: String(posting.substatus || '').trim(),
    available_actions: Array.isArray(posting.available_actions)
      ? posting.available_actions.map(value => String(value || '').trim()).filter(Boolean)
      : [],
    created_at: firstDefined(posting.created_at, posting.createdAt, posting.order_date, posting.in_process_at, ''),
    shipment_date: firstDefined(posting.shipment_date, posting.shipmentDate, posting.shipment_date_from, posting.delivering_date, ''),
    delivery_date: firstDefined(posting.delivery_date, posting.deliveryDate, posting.delivering_date_to, ''),
    warehouse_name: labelFromValue(firstDefined(posting.warehouse_name, posting.warehouseName, posting.warehouse, '')),
    delivery_method_name: labelFromValue(firstDefined(posting.delivery_method_name, posting.deliveryMethodName, posting.delivery_method, '')),
    currency_code: String(firstDefined(posting.currency_code, posting.currencyCode, posting.currency, 'RUB')).trim().toUpperCase(),
    ...(totalPrice === null ? {} : { total_price: totalPrice }),
    ...(amount === null ? {} : { amount }),
    ...(Object.keys(financialData).length ? { financial_data: financialData } : {}),
    products,
    _products: enrichedProducts
  };
}

function loadOperationalPostingsCache(runtime = currentStoreRuntime()) {
  if (runtime.operationalPostingsCache) return;
  const stored = readSnapshotCache('.operational-postings-cache.json', isOperationalPostingsCache);
  if (!stored) return;
  runtime.operationalPostingsCache = {
    ...stored.data,
    channels: Object.fromEntries(['FBO', 'FBS/rFBS'].map(channel => [
      channel,
      stored.data.channels[channel].map(sanitizeOperationalPosting)
    ]))
  };
  runtime.operationalPostingsCacheAt = stored.cachedAt;
  writeSnapshotCache('.operational-postings-cache.json', runtime.operationalPostingsCache);
}

async function getOperationalPostings({ forceRefresh = false } = {}) {
  const runtime = currentStoreRuntime();
  loadOperationalPostingsCache(runtime);
  if (!forceRefresh && runtime.operationalPostingsCache && Date.now() - runtime.operationalPostingsCacheAt < OPERATIONAL_POSTINGS_CACHE_MS) {
    return { ...runtime.operationalPostingsCache, cacheAt: new Date(runtime.operationalPostingsCacheAt).toISOString() };
  }
  if (runtime.operationalPostingsInFlight) return runtime.operationalPostingsInFlight;

  runtime.operationalPostingsInFlight = (async () => {
    const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const warnings = [];
    const requestOptions = { maxRateLimitRetries: 0, useGlobalRateLimitCooldown: true };
    const [fboResult, fbsResult] = await Promise.all([
      settleOrderPostings('/v3/posting/fbo/list', 'FBO', since, to, requestOptions),
      settleFbsPostings('FBS/rFBS', since, to, requestOptions)
    ]);
    const results = { FBO: fboResult, 'FBS/rFBS': fbsResult };
    const channels = {
      FBO: [...(runtime.operationalPostingsCache?.channels?.FBO || [])],
      'FBS/rFBS': [...(runtime.operationalPostingsCache?.channels?.['FBS/rFBS'] || [])]
    };
    const channelSyncedAt = { ...(runtime.operationalPostingsCache?.channelSyncedAt || {}) };
    const unavailableChannels = [];
    const successfulPostings = [];
    for (const channel of ['FBO', 'FBS/rFBS']) {
      const result = results[channel];
      if (result.status === 'fulfilled') {
        successfulPostings.push(...result.value);
        channelSyncedAt[channel] = new Date().toISOString();
      } else {
        unavailableChannels.push(channel);
        warnings.push(orderReadWarning(channel, result.reason));
      }
    }
    const enriched = successfulPostings.length
      ? await enrichPickupPostings(successfulPostings, warnings, '订单商品图片')
      : [];
    for (const channel of ['FBO', 'FBS/rFBS']) {
      if (results[channel].status === 'fulfilled') {
        channels[channel] = enriched
          .filter(posting => posting._channel === channel)
          .map(sanitizeOperationalPosting);
      }
    }
    const data = {
      channels,
      channelSyncedAt,
      unavailableChannels,
      warnings,
      dateFrom: since,
      dateTo: to,
      syncedAt: Object.values(channelSyncedAt).sort().at(-1) || '',
      attemptedAt: new Date().toISOString()
    };
    runtime.operationalPostingsCache = data;
    runtime.operationalPostingsCacheAt = Date.now();
    writeSnapshotCache('.operational-postings-cache.json', data);
    return { ...data, cacheAt: new Date(runtime.operationalPostingsCacheAt).toISOString() };
  })().finally(() => {
    runtime.operationalPostingsInFlight = null;
  });
  return runtime.operationalPostingsInFlight;
}

function pickupCandidateFromPosting(posting, state) {
    const postingNumber = String(posting.posting_number || '');
    const orderNumber = String(posting.order_number || posting.posting_number || '');
    const record = state.records[postingNumber];
    const canContact = !record || !['sending', 'sent', 'uncertain', 'resending'].includes(record.state);
    const reminderCount = pickupReminderCount(record);
    const products = posting._products || [];
    const primaryProduct = products.find(item => item.image || item.name) || products[0] || {};
    return {
      postingNumber,
      orderNumber,
      channel: posting._channel,
      status: posting.status || '',
      substatus: posting.substatus || '',
      chatCreated: Boolean(record?.chatId),
      canContact,
      canRemindAgain: record?.state === 'sent' && reminderCount > 0 && Boolean(record?.chatId),
      latestBuyerAt: '',
      blockedReason: record?.state === 'uncertain' ? '发送结果待核实，请先在 Ozon 聊天中确认，避免重复联系' : '',
      sentState: record?.state || '',
      sentAt: record?.sentAt || '',
      reminderCount,
      lastReminderAt: record?.lastReminderAt || record?.sentAt || '',
      lastReminderError: record?.lastReminderError || '',
      productName: primaryProduct.name || '商品信息未返回',
      productImage: primaryProduct.image || '',
      productOfferId: primaryProduct.offerId || '',
      productQuantity: products.reduce((sum, item) => sum + item.quantity, 0),
      productCount: products.length
    };
}

function pickupSnapshot(options = {}) {
  const runtime = currentStoreRuntime();
  if (runtime.pickupSnapshotInFlight) return runtime.pickupSnapshotInFlight;
  runtime.pickupSnapshotInFlight = buildPickupSnapshot(options).finally(() => {
    runtime.pickupSnapshotInFlight = null;
  });
  return runtime.pickupSnapshotInFlight;
}

async function buildPickupSnapshot(options = {}) {
  const source = await getOperationalPostings(options);
  const warnings = [...source.warnings];
  const unavailableChannels = [...source.unavailableChannels];
  const cache = readSnapshotCache('.pickup-candidates-cache.json', isPickupSnapshot);
  const cachedCandidates = cache ? hydratePickupSnapshot(cache.data).candidates : [];
  const state = readPickupState();
  const channelSyncedAt = { ...(source.channelSyncedAt || {}) };
  const candidates = source.postings
    ? source.postings.filter(isPickupPointSubstatus).map(posting => pickupCandidateFromPosting(posting, state))
    : ['FBO', 'FBS/rFBS'].flatMap(channel => (source.channels?.[channel] || []).filter(isPickupPointSubstatus).map(posting => pickupCandidateFromPosting(posting, state)));
  for (const channel of unavailableChannels) {
    const priorChannelSync = channelSyncedAt[channel]
      || (!pickupUnavailableChannels(cache?.data).has(channel) ? cache?.data.channelSyncedAt?.[channel] || cache?.data.syncedAt : '');
    if (!channelSyncedAt[channel] && !priorChannelSync) {
      warnings.push(`${channel} 当前没有可用的历史成功数据，该渠道到货数量未知。`);
      candidates.push(...cachedCandidates.filter(item => item.channel === channel));
      continue;
    }
    channelSyncedAt[channel] ||= priorChannelSync;
    if (!source.channelSyncedAt[channel]) {
      candidates.push(...cachedCandidates.filter(item => item.channel === channel));
      warnings.push(`${channel} 当前显示最近一次成功同步的数据（${new Date(priorChannelSync).toLocaleString('zh-CN', { hour12: false })}）。`);
    }
  }
  const bothChannelsFailed = unavailableChannels.length === 2;
  const deduplicatedCandidates = [...new Map(candidates.map(item => [item.postingNumber, item])).values()]
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
  const activeDelivering = deduplicatedCandidates.length;
  const snapshot = {
    candidates: deduplicatedCandidates,
    stats: {
      activeDelivering,
      arrived: deduplicatedCandidates.length,
      eligible: deduplicatedCandidates.filter(item => item.canContact).length,
      sent: deduplicatedCandidates.filter(item => item.sentState === 'sent').length,
      blocked: deduplicatedCandidates.filter(item => item.sentState === 'uncertain' || item.sentState === 'sending' || item.sentState === 'resending').length,
      reminderTotal: deduplicatedCandidates.reduce((sum, item) => sum + item.reminderCount, 0)
    },
    warnings,
    ordersUnavailable: bothChannelsFailed && !cache && !source.channelSyncedAt.FBO && !source.channelSyncedAt['FBS/rFBS'],
    unavailableChannels,
    channelSyncedAt,
    syncedAt: source.syncedAt || cache?.data.syncedAt || '',
    stale: unavailableChannels.length > 0,
    cacheAt: source.cacheAt || (cache?.cachedAt ? new Date(cache.cachedAt).toISOString() : ''),
    autoEnabled: state.autoEnabled,
    template: state.template
  };
  if (!bothChannelsFailed || cache) writeSnapshotCache('.pickup-candidates-cache.json', snapshot);
  return snapshot;
}

function hydratePickupSnapshot(snapshot) {
  const state = readPickupState();
  const candidates = (snapshot.candidates || []).map(candidate => {
    const record = state.records[candidate.postingNumber];
    if (!record) return candidate;
    const reminderCount = pickupReminderCount(record);
    return {
      ...candidate,
      chatCreated: Boolean(record.chatId || candidate.chatCreated),
      canContact: !['sending', 'sent', 'uncertain', 'resending'].includes(record.state),
      canRemindAgain: record.state === 'sent' && reminderCount > 0 && Boolean(record.chatId || candidate.chatCreated),
      blockedReason: record.state === 'uncertain' ? '发送结果待核实，请先在 Ozon 聊天中确认，避免重复联系' : '',
      sentState: record.state || '',
      sentAt: record.sentAt || '',
      reminderCount,
      lastReminderAt: record.lastReminderAt || record.sentAt || '',
      lastReminderError: record.lastReminderError || ''
    };
  });
  return {
    ...snapshot,
    candidates,
    stats: {
      ...(snapshot.stats || {}),
      arrived: candidates.length,
      eligible: candidates.filter(item => item.canContact).length,
      sent: candidates.filter(item => item.sentState === 'sent').length,
      blocked: candidates.filter(item => ['uncertain', 'sending', 'resending'].includes(item.sentState)).length,
      reminderTotal: candidates.reduce((sum, item) => sum + item.reminderCount, 0)
    },
    autoEnabled: state.autoEnabled,
    template: state.template
  };
}

function publicPickupSnapshot(snapshot) {
  return {
    ...snapshot,
    candidates: snapshot.candidates
  };
}

function renderPickupMessage(template, orderNumber) {
  return template.replaceAll('{order_number}', orderNumber);
}

async function sendPickupReminder(postingNumber, template, freshCandidate) {
  const state = readPickupState();
  const previous = state.records[postingNumber];
  if (previous && ['sending', 'sent', 'uncertain'].includes(previous.state)) {
    return { postingNumber, ok: previous.state === 'sent', skipped: true, state: previous.state, error: '该订单已发送或结果待核实，已阻止重复发送。' };
  }
  if (!freshCandidate?.canContact) return { postingNumber, ok: false, skipped: true, error: freshCandidate?.blockedReason || '此订单当前不可联系。' };
  const text = renderPickupMessage(template, freshCandidate.orderNumber);
  if (!text.trim() || text.length > 1000) return { postingNumber, ok: false, error: '消息内容不能为空或超过 1000 个字符。' };
  const attemptedAt = new Date().toISOString();
  let chatId = previous?.chatId || '';
  state.records[postingNumber] = { state: 'sending', attemptedAt, ...(chatId ? { chatId } : {}) };
  writePickupState(state);
  if (!chatId) {
    try {
      const started = resultOf(await ozon('/v1/chat/start', { posting_number: postingNumber }));
      chatId = String(started?.chat_id || '');
      if (!chatId) throw new Error('Ozon 未返回新聊天 ID，未发送提醒。');
      const updated = readPickupState();
      updated.records[postingNumber] = { state: 'sending', attemptedAt, chatId };
      writePickupState(updated);
    } catch (error) {
      const updated = readPickupState();
      updated.records[postingNumber] = {
        state: 'failed',
        attemptedAt,
        error: error.message
      };
      writePickupState(updated);
      return { postingNumber, ok: false, state: updated.records[postingNumber].state, error: error.message };
    }
  }
  try {
    await ozon('/v1/chat/send/message', { chat_id: chatId, text }, config(), () => {
      const updated = readPickupState();
      const sentAt = new Date().toISOString();
      updated.records[postingNumber] = { state: 'sent', sentAt, lastReminderAt: sentAt, reminderCount: Math.max(1, pickupReminderCount(updated.records[postingNumber])), chatId, requestDispatched: true };
      writePickupState(updated);
    });
    const updated = readPickupState();
    if (updated.records[postingNumber]?.state !== 'sent') {
      const sentAt = new Date().toISOString();
      updated.records[postingNumber] = { state: 'sent', sentAt, lastReminderAt: sentAt, reminderCount: Math.max(1, pickupReminderCount(updated.records[postingNumber])), chatId, requestDispatched: true };
      writePickupState(updated);
    }
    return { postingNumber, ok: true, state: 'sent' };
  } catch (error) {
    const updated = readPickupState();
    const dispatched = updated.records[postingNumber]?.requestDispatched === true;
    if (dispatched) {
      return {
        postingNumber,
        ok: true,
        state: 'sent',
        error: `发送请求已发出；后续响应未能确认（${error.message}），状态仍按已发送保留以防重复联系。`
      };
    }
    updated.records[postingNumber] = { state: 'failed', attemptedAt, chatId, error: error.message };
    writePickupState(updated);
    return { postingNumber, ok: false, state: 'failed', error: error.message };
  }
}

async function sendPickupAgain(postingNumber, template, freshCandidate) {
  const state = readPickupState();
  const previous = state.records[postingNumber];
  if (!previous || previous.state !== 'sent' || pickupReminderCount(previous) < 1) {
    return { postingNumber, ok: false, state: previous?.state || '', error: '此订单尚未完成首次提醒，不能发送再次提醒。' };
  }
  if (!freshCandidate?.canRemindAgain) {
    return { postingNumber, ok: false, state: previous.state, error: '此订单当前不能发送再次提醒，请刷新列表后重试。' };
  }
  const text = renderPickupMessage(template, freshCandidate.orderNumber);
  if (!text.trim() || text.length > 1000) return { postingNumber, ok: false, state: previous.state, error: '消息内容不能为空或超过 1000 个字符。' };
  const chatId = String(previous.chatId || '').trim();
  if (!chatId) return { postingNumber, ok: false, state: previous.state, error: '未找到此订单的买家聊天，无法发送再次提醒。' };
  const attemptedAt = new Date().toISOString();
  state.records[postingNumber] = { ...previous, state: 'resending', attemptedAt, requestDispatched: false };
  writePickupState(state);
  try {
    await ozon('/v1/chat/send/message', { chat_id: chatId, text }, config(), () => {
      const updated = readPickupState();
      const current = updated.records[postingNumber] || previous;
      const sentAt = new Date().toISOString();
      updated.records[postingNumber] = {
        ...current,
        state: 'sent',
        sentAt: current.sentAt || sentAt,
        lastReminderAt: sentAt,
        reminderCount: pickupReminderCount(current) + 1,
        chatId,
        requestDispatched: true
      };
      delete updated.records[postingNumber].lastReminderError;
      writePickupState(updated);
    });
    const updated = readPickupState();
    if (updated.records[postingNumber]?.state !== 'sent') {
      const sentAt = new Date().toISOString();
      updated.records[postingNumber] = {
        ...(updated.records[postingNumber] || previous),
        state: 'sent',
        sentAt: updated.records[postingNumber]?.sentAt || sentAt,
        lastReminderAt: sentAt,
        reminderCount: pickupReminderCount(updated.records[postingNumber]) + 1,
        chatId,
        requestDispatched: true
      };
      writePickupState(updated);
    }
    return { postingNumber, ok: true, state: 'sent', reminderCount: pickupReminderCount(readPickupState().records[postingNumber]) };
  } catch (error) {
    const updated = readPickupState();
    const current = updated.records[postingNumber] || previous;
    if (current.requestDispatched === true) {
      return {
        postingNumber,
        ok: true,
        state: 'sent',
        reminderCount: pickupReminderCount(current),
        error: `再次提醒请求已发出；后续响应未能确认（${error.message}），状态仍按已发送保留。`
      };
    }
    updated.records[postingNumber] = { ...previous, state: 'sent', lastReminderError: error.message, requestDispatched: false };
    writePickupState(updated);
    return { postingNumber, ok: false, state: 'sent', reminderCount: pickupReminderCount(previous), error: error.message };
  }
}

async function runAutoPickupReminders() {
  const runtime = currentStoreRuntime();
  if (runtime.autoReminderRunning) return;
  const state = readPickupState();
  if (!state.autoEnabled) return;
  runtime.autoReminderRunning = true;
  try {
    const snapshot = await pickupSnapshot({ forceRefresh: true });
    const ready = snapshot.candidates.filter(item => item.canContact).slice(0, 50);
    for (const item of ready) await sendPickupReminder(item.postingNumber, state.template, item);
  } finally {
    runtime.autoReminderRunning = false;
  }
}

async function runAutoPickupRemindersForAllShops() {
  const shopIds = loadShopRegistry().map(shop => shop.id);
  for (const shopId of shopIds) {
    await storeContext.run({ shopId }, () => runAutoPickupReminders());
  }
}

const AUTO_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Serverless functions cannot keep daily reminder timers alive between requests.
if (process.env.VERCEL !== '1') {
  const autoReminderTimer = setInterval(() => {
    runAutoPickupRemindersForAllShops().catch(error => console.error(`到货提醒自动检查失败：${error.message}`));
  }, AUTO_REMINDER_INTERVAL_MS);
  autoReminderTimer.unref();
}

function safeError(error) {
  return { error: error.message || '发生未知错误' };
}

async function routeInShop(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      const expectedOrigin = `http://${req.headers.host}`;
      if (origin && origin !== expectedOrigin) return send(res, 403, { error: '拒绝跨站请求。' });
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const cfg = config();
      return send(res, 200, {
        clientId: cfg.clientId,
        configured: Boolean(cfg.clientId && cfg.apiKey),
        keyHint: cfg.apiKey ? `••••••${cfg.apiKey.slice(-4)}` : ''
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/shops') {
      return send(res, 200, shopsSnapshot());
    }
    if (req.method === 'POST' && url.pathname === '/api/shops') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const clientId = String(body.clientId || '').trim();
      const apiKey = String(body.apiKey || '').trim();
      if (!name || name.length > 80) return send(res, 400, { error: '店铺名称不能为空且不能超过 80 个字符。' });
      if (!/^\d{3,20}$/.test(clientId)) return send(res, 400, { error: 'API ID 应为数字。' });
      if (apiKey.length < 16 || apiKey.length > 300 || /[\r\n]/.test(apiKey)) return send(res, 400, { error: 'API Key 格式不正确，请检查后重试。' });
      const shop = registerShop({ name, clientId, apiKey });
      activeShopId = shop.id;
      saveShopRegistry();
      return send(res, 200, { ...shopsSnapshot(), activeShop: publicShop(shop) });
    }
    if (req.method === 'POST' && url.pathname === '/api/shops/active') {
      const body = await readBody(req);
      const shopId = String(body.shopId || '').trim();
      if (!shopRegistry.some(shop => shop.id === shopId)) return send(res, 404, { error: '找不到所选店铺，请刷新店铺列表后重试。' });
      activeShopId = shopId;
      saveShopRegistry();
      return send(res, 200, shopsSnapshot());
    }
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const body = await readBody(req);
      const clientId = String(body.clientId || '').trim();
      const apiKey = String(body.apiKey || '').trim();
      if (!/^\d{3,20}$/.test(clientId)) return send(res, 400, { error: 'API ID 应为数字。' });
      if (apiKey.length < 16 || apiKey.length > 300 || /[\r\n]/.test(apiKey)) return send(res, 400, { error: 'API Key 格式不正确，请检查后重试。' });
      const selectedShop = findShop();
      if (selectedShop) {
        const duplicate = shopRegistry.find(shop => shop.id !== selectedShop.id && shop.clientId === clientId);
        if (duplicate) return send(res, 409, { error: '此 API ID 已登记为另一个店铺，请通过店铺选择器切换后再修改凭据。' });
        selectedShop.clientId = clientId;
        selectedShop.apiKey = apiKey;
        saveShopRegistry();
      } else {
        writeEnvFile({ clientId, apiKey });
        const shop = registerShop({ name: '默认店铺', clientId, apiKey }, { legacyStorage: true });
        activeShopId = shop.id;
        saveShopRegistry();
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/sourcing/config') {
      return send(res, 200, supplierConfigPublic());
    }
    if (req.method === 'POST' && url.pathname === '/api/sourcing/config') {
      const body = await readBody(req);
      const values = {
        pddClientId: String(body.pddClientId || '').trim(),
        pddClientSecret: String(body.pddClientSecret || '').trim(),
        pddAccessToken: String(body.pddAccessToken || '').trim(),
        alibaba1688AppKey: String(body.alibaba1688AppKey || '').trim(),
        alibaba1688AppSecret: String(body.alibaba1688AppSecret || '').trim(),
        alibaba1688AccessToken: String(body.alibaba1688AccessToken || '').trim()
      };
      if (values.pddClientId.length > 200 || values.pddClientSecret.length > 300 || values.pddAccessToken.length > 500 || values.alibaba1688AppKey.length > 200 || values.alibaba1688AppSecret.length > 300 || values.alibaba1688AccessToken.length > 1000) {
        return send(res, 400, { error: '货源平台 API 配置长度不正确。' });
      }
      // The form intentionally never sends existing secrets back to the browser.
      // Preserve configured values when a masked field is left blank, otherwise
      // opening the settings dialog and saving another provider would erase them.
      writeEnvFile(preserveConfiguredSecrets(values));
      return send(res, 200, { ok: true, config: supplierConfigPublic(config()) });
    }
    if (req.method === 'GET' && url.pathname === '/api/domestic-express/config') {
      return send(res, 200, domesticExpressConfigPublic());
    }
    if (req.method === 'POST' && url.pathname === '/api/domestic-express/config') {
      const body = await readBody(req);
      const customer = String(body.customer || '').trim();
      const key = String(body.key || '').trim();
      if (customer.length > 200 || key.length > 300 || /[\r\n]/.test(customer) || /[\r\n]/.test(key)) {
        return send(res, 400, { error: '快递 100 配置长度或格式不正确。' });
      }
      writeEnvFile(preserveConfiguredSecrets({ kuaidi100Customer: customer, kuaidi100Key: key }));
      return send(res, 200, { ok: true, config: domesticExpressConfigPublic(config()) });
    }
    if (req.method === 'POST' && url.pathname === '/api/domestic-express/query') {
      const body = await readBody(req);
      const number = normalizeDomesticExpressNumber(body.number);
      const carrier = normalizeDomesticExpressCarrier(body.carrier);
      const phone = String(body.phone || '').trim();
      return send(res, 200, await queryDomesticExpress(number, carrier, phone));
    }
    if (req.method === 'POST' && url.pathname === '/api/test-connection') {
      const result = resultOf(await ozon('/v3/product/list', { filter: { visibility: 'ALL' }, limit: 1, last_id: '' }));
      return send(res, 200, { ok: true, sampleCount: (result.items || []).length });
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      return send(res, 200, await dashboard());
    }
    if (req.method === 'GET' && url.pathname === '/api/pricing-promotions') {
      return send(res, 200, await getPricingPromotionsSnapshot(url.searchParams.get('refresh') === '1'));
    }
    if (req.method === 'GET' && url.pathname === '/api/product-profit') {
      return send(res, 200, await productProfit(url.searchParams.get('refresh') === '1'));
    }
    if (req.method === 'POST' && url.pathname === '/api/pricing-promotions/candidates') {
      const body = await readBody(req);
      const actionId = String(body.actionId ?? '').trim();
      if (!/^\d{1,16}$/.test(actionId) || !Number.isSafeInteger(Number(actionId))) return send(res, 400, { error: '促销活动 ID 格式不正确。' });
      if (!Array.isArray(body.productIds) || body.productIds.length < 1 || body.productIds.length > 100) return send(res, 400, { error: '请选择 1 至 100 个商品检查资格。' });
      const productIds = body.productIds.map(value => String(value ?? '').trim());
      if (new Set(productIds).size !== productIds.length || productIds.some(value => !/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value)))) return send(res, 400, { error: '商品 ID 格式不正确，且不能重复。' });
      const snapshot = await getPricingPromotionsSnapshot();
      const actions = (await getMarketingActionList()).map(normalizeMarketingAction);
      if (!actions.some(action => action.id === actionId)) return send(res, 409, { error: '活动已失效或当前账号不可参加，请刷新活动列表。' });
      const catalogIds = new Set(snapshot.products.map(product => String(product.productId)));
      if (productIds.some(productId => !catalogIds.has(productId))) return send(res, 409, { error: '所选商品中包含当前账号商品列表以外的 ID，请刷新后重试。' });
      const checked = await getPromotionCandidates(actionId, productIds);
      const candidates = checked.candidates.map(candidate => ({
        ...candidate,
        product: snapshot.products.find(product => String(product.productId) === candidate.productId) || null
      }));
      return send(res, 200, {
        actionId,
        candidates,
        unavailableProductIds: checked.missingProductIds,
        scanComplete: checked.scanComplete,
        warnings: checked.scanComplete ? [] : ['候选商品数量较多，资格扫描达到安全页数上限；仅确认已返回的商品，其余商品请稍后重试。']
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/pricing-promotions/join') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要将商品加入促销活动。' });
      const actionId = String(body.actionId ?? '').trim();
      if (!/^\d{1,16}$/.test(actionId) || !Number.isSafeInteger(Number(actionId))) return send(res, 400, { error: '促销活动 ID 格式不正确。' });
      if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 100) return send(res, 400, { error: '请选择 1 至 100 个符合资格的商品加入活动。' });
      const seen = new Set();
      const products = [];
      for (const item of body.products) {
        const productId = String(item?.productId ?? '').trim();
        const actionPrice = String(item?.actionPrice ?? '').trim();
        const stockText = item?.stock === undefined || item?.stock === null || String(item.stock).trim() === '' ? '' : String(item.stock).trim();
        if (!/^\d{1,16}$/.test(productId) || !Number.isSafeInteger(Number(productId))) return send(res, 400, { error: '商品 ID 格式不正确。' });
        if (!/^\d+(?:\.\d{1,4})?$/.test(actionPrice) || !Number.isFinite(Number(actionPrice)) || Number(actionPrice) <= 0 || Number(actionPrice) > 1_000_000_000_000) return send(res, 400, { error: `商品 ${productId} 的活动价必须是大于 0 的有效数字。` });
        if (stockText && (!/^\d{1,10}$/.test(stockText) || !Number.isSafeInteger(Number(stockText)) || Number(stockText) < 1)) return send(res, 400, { error: `商品 ${productId} 的活动库存必须是大于 0 的整数。` });
        if (seen.has(productId)) return send(res, 400, { error: '同一商品不能重复提交。' });
        seen.add(productId);
        products.push({ productId, actionPrice, stock: stockText });
      }
      const snapshot = await getPricingPromotionsSnapshot();
      const actions = (await getMarketingActionList()).map(normalizeMarketingAction);
      if (!actions.some(action => action.id === actionId)) return send(res, 409, { error: '活动已失效或当前账号不可参加，未提交任何商品。' });
      const catalogIds = new Set(snapshot.products.map(product => String(product.productId)));
      if (products.some(product => !catalogIds.has(product.productId))) return send(res, 409, { error: '所选商品已不在当前账号商品列表中，未提交任何商品。' });
      const checked = await getPromotionCandidates(actionId, products.map(product => product.productId));
      const candidateById = new Map(checked.candidates.map(candidate => [candidate.productId, candidate]));
      const ineligible = products.filter(product => !candidateById.has(product.productId));
      if (ineligible.length) return send(res, 409, { error: `商品 ${ineligible.slice(0, 5).map(product => product.productId).join('、')} 当前不在该活动候选列表中，已取消本次提交，请重新检查资格。` });
      const quarantined = products.filter(product => candidateById.get(product.productId)?.quarantined);
      if (quarantined.length) return send(res, 409, { error: `商品 ${quarantined.slice(0, 5).map(product => product.productId).join('、')} 处于 Ozon 隔离状态，不能加入活动，已取消本次提交。` });
      const invalidPrice = products.find(product => {
        const candidate = candidateById.get(product.productId);
        return candidate.maxActionPrice && Number(product.actionPrice) > Number(candidate.maxActionPrice);
      });
      if (invalidPrice) return send(res, 409, { error: `商品 ${invalidPrice.productId} 的活动价高于 Ozon 允许上限 ${candidateById.get(invalidPrice.productId).maxActionPrice}，未提交任何商品。` });
      const belowMinimumStock = products.find(product => {
        const minimum = candidateById.get(product.productId).minStock;
        return minimum > 0 && (!product.stock || Number(product.stock) < minimum);
      });
      if (belowMinimumStock) return send(res, 409, { error: `商品 ${belowMinimumStock.productId} 的活动库存需至少 ${candidateById.get(belowMinimumStock.productId).minStock} 件，未提交任何商品。` });
      // Ozon retired /v1/actions/products/activate on 2026-10-13 because of
      // unified price logic. The replacement accepts action_price as a Money
      // object, including the candidate's currency.
      const result = resultOf(await ozon('/v1/actions/products/update', {
        action_id: Number(actionId),
        products: products.map(item => ({
          product_id: Number(item.productId),
          action_price: {
            amount: item.actionPrice,
            currency: candidateById.get(item.productId)?.currency || snapshot.products.find(product => String(product.productId) === item.productId)?.currency || 'RUB'
          },
          ...(item.stock ? { stock: Number(item.stock) } : {})
        }))
      }));
      const activatedIds = new Set((Array.isArray(result.product_ids) ? result.product_ids : (Array.isArray(result.active_product_ids) ? result.active_product_ids : [])).map(String));
      const deactivatedIds = new Set((Array.isArray(result.deactivated_product_ids) ? result.deactivated_product_ids : []).map(String));
      const rejected = Array.isArray(result.rejected) ? result.rejected : [];
      const rejectedById = new Map(rejected.map(item => [String(item.product_id ?? item.id ?? ''), item]));
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const warningById = new Map(warnings.map(item => [String(item.product_id ?? item.id ?? ''), item]));
      const results = products.map(item => {
        const rejection = rejectedById.get(item.productId);
        const warning = warningById.get(item.productId);
        const ok = activatedIds.has(item.productId) && !rejection && !deactivatedIds.has(item.productId);
        return {
          productId: item.productId,
          ok,
          error: rejection?.reason || warning?.reason || (deactivatedIds.has(item.productId) ? 'Ozon 已将商品移出活动，请核对活动价格限制。' : ok ? '' : 'Ozon 未确认该商品已加入活动。')
        };
      });
      if (results.some(item => item.ok)) {
        invalidatePricingPromotionsCache();
      }
      return send(res, 200, {
        results,
        summary: { submitted: products.length, success: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length },
        rejected,
        warnings: warnings.map(item => item.reason || '').filter(Boolean)
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/pricing-promotions/prices/batch') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要更新所选商品的促销价。' });
      const actionId = String(body.actionId ?? '').trim();
      if (!/^\d{1,16}$/.test(actionId) || !Number.isSafeInteger(Number(actionId))) return send(res, 400, { error: '促销活动 ID 格式不正确。' });
      if (!Array.isArray(body.prices) || body.prices.length < 1 || body.prices.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品修改促销价。' });
      }
      const seen = new Set();
      const prices = [];
      for (const item of body.prices) {
        const productId = String(item?.productId ?? '').trim();
        const priceText = String(item?.price ?? '').trim();
        const currencyCode = String(item?.currencyCode || 'RUB').trim().toUpperCase();
        if (!/^\d{1,16}$/.test(productId) || !Number.isSafeInteger(Number(productId))) return send(res, 400, { error: '商品 ID 格式不正确。' });
        if (!/^\d+(?:\.\d{1,4})?$/.test(priceText) || !Number.isFinite(Number(priceText)) || Number(priceText) <= 0 || Number(priceText) > 1_000_000_000_000) {
          return send(res, 400, { error: `商品 ${productId} 的促销价必须是大于 0 的有效数字。` });
        }
        if (!/^[A-Z]{3}$/.test(currencyCode)) return send(res, 400, { error: `商品 ${productId} 的币种格式不正确。` });
        if (seen.has(productId)) return send(res, 400, { error: '同一商品不能重复提交促销价。' });
        seen.add(productId);
        prices.push({ productId, price: priceText, currencyCode });
      }
      const snapshot = await getPricingPromotionsSnapshot(true);
      const productsById = new Map(snapshot.products.map(product => [String(product.productId), product]));
      const notParticipating = prices.filter(item => !productsById.get(item.productId)?.promotions?.some(action => String(action.id) === actionId));
      if (notParticipating.length) {
        return send(res, 409, { error: `商品 ${notParticipating.slice(0, 5).map(item => item.productId).join('、')} 当前未参加活动 ${actionId}，已取消提交，请刷新后核对。` });
      }
      const result = resultOf(await ozon('/v1/actions/products/update', {
        action_id: Number(actionId),
        products: prices.map(item => ({
          product_id: Number(item.productId),
          action_price: { amount: item.price, currency: item.currencyCode }
        }))
      }));
      const activeIds = new Set((Array.isArray(result.active_product_ids) ? result.active_product_ids : []).map(String));
      const deactivatedIds = new Set((Array.isArray(result.deactivated_product_ids) ? result.deactivated_product_ids : []).map(String));
      const rejected = Array.isArray(result.rejected) ? result.rejected : [];
      const rejectedById = new Map(rejected.map(item => [String(item.product_id ?? item.id ?? ''), item]));
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const warningById = new Map(warnings.map(item => [String(item.product_id ?? item.id ?? ''), item]));
      const results = prices.map(item => {
        const rejectedItem = rejectedById.get(item.productId);
        const warningItem = warningById.get(item.productId);
        const ok = activeIds.has(item.productId) && !rejectedItem && !deactivatedIds.has(item.productId);
        return {
          productId: item.productId,
          ok,
          error: rejectedItem?.reason || warningItem?.reason || (deactivatedIds.has(item.productId) ? 'Ozon 已将商品移出活动，请核对活动价格限制。' : ok ? '' : 'Ozon 未确认该商品更新成功。')
        };
      });
      if (results.some(item => item.ok)) {
        invalidatePricingPromotionsCache();
      }
      return send(res, 200, {
        results,
        summary: { submitted: prices.length, success: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length },
        warnings: warnings.map(item => item.reason || '').filter(Boolean),
        rejected
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/pricing-promotions/deactivate') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要将商品移出此促销活动。' });
      const actionId = String(body.actionId ?? '').trim();
      if (!/^\d{1,16}$/.test(actionId) || !Number.isSafeInteger(Number(actionId))) return send(res, 400, { error: '促销活动 ID 格式不正确。' });
      if (!Array.isArray(body.productIds) || body.productIds.length < 1 || body.productIds.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品移出促销。' });
      }
      const productIds = [...new Set(body.productIds.map(value => String(value ?? '').trim()))];
      if (productIds.length !== body.productIds.length || productIds.some(value => !/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value)))) {
        return send(res, 400, { error: '商品 ID 格式不正确，且不能重复。' });
      }
      const snapshot = await getPricingPromotionsSnapshot(true);
      const participating = new Map(snapshot.products.map(product => [product.productId, new Set((product.promotions || []).map(action => String(action.id)))]));
      const notParticipating = productIds.filter(productId => !participating.get(productId)?.has(actionId));
      if (notParticipating.length) return send(res, 409, { error: `商品 ${notParticipating.slice(0, 5).join('、')} 当前未参加此活动，已取消提交，请刷新后核对。` });
      const result = resultOf(await ozon('/v2/actions/products/deactivate', {
        action_id: Number(actionId),
        product_ids: productIds.map(Number)
      }));
      const deactivatedIds = new Set((Array.isArray(result.product_ids) ? result.product_ids : []).map(value => String(value)));
      const rejected = Array.isArray(result.rejected) ? result.rejected : [];
      const rejectedById = new Map(rejected.map(item => [String(item.product_id ?? item.id ?? ''), item]));
      const results = productIds.map(productId => ({
        productId,
        ok: deactivatedIds.has(productId),
        error: rejectedById.get(productId)?.reason || rejectedById.get(productId)?.message || (deactivatedIds.has(productId) ? '' : 'Ozon 未返回移出成功结果。')
      }));
      if (results.some(item => item.ok)) {
        invalidatePricingPromotionsCache();
      }
      return send(res, 200, {
        results,
        summary: { submitted: productIds.length, success: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length },
        rejected
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/rich-content') {
      const productId = String(url.searchParams.get('product_id') || '').trim();
      if (!/^\d+$/.test(productId) || Number(productId) <= 0) return send(res, 400, { error: '缺少有效的 product_id。' });
      const content = await readProductRichContent(productId);
      let richContentText = content.rawValue || '';
      let validJson = false;
      if (richContentText) {
        try {
          JSON.parse(richContentText);
          validJson = true;
          richContentText = JSON.stringify(JSON.parse(richContentText), null, 2);
        } catch {
          // Keep the original value visible so the user can repair an older or unsupported value.
        }
      }
      return send(res, 200, { ...content, richContentText, validJson });
    }
    if (req.method === 'POST' && url.pathname === '/api/rich-content') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要更新所选商品的富内容。' });
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品更新富内容。' });
      }
      const seen = new Set();
      let batchBytes = 0;
      const items = [];
      for (const item of body.items) {
        const productId = String(item?.productId || '').trim();
        const offerId = String(item?.offerId || '').trim();
        if (!/^\d+$/.test(productId) || Number(productId) <= 0 || !offerId || offerId.length > 100) {
          return send(res, 400, { error: '商品 ID 或 Offer ID 格式不正确。' });
        }
        if (seen.has(productId)) return send(res, 400, { error: '同一商品不能重复提交富内容。' });
        seen.add(productId);
        let richContent = item?.richContent;
        if (typeof richContent === 'string') {
          try { richContent = JSON.parse(richContent); }
          catch { return send(res, 400, { error: `商品 ${offerId} 的富内容不是有效 JSON。` }); }
        }
        let serialized;
        try { serialized = validateRichContent(richContent, `商品 ${offerId} 的富内容`); }
        catch (error) { return send(res, error.status || 400, { error: error.message }); }
        batchBytes += Buffer.byteLength(serialized, 'utf8');
        if (batchBytes > RICH_CONTENT_MAX_BATCH_BYTES) return send(res, 400, { error: `本次富内容总大小不能超过 ${RICH_CONTENT_MAX_BATCH_BYTES / 1000} KB。` });
        items.push({
          offer_id: offerId,
          attributes: [{
            complex_id: 0,
            id: RICH_CONTENT_ATTRIBUTE_ID,
            values: [{ dictionary_value_id: 0, value: serialized }]
          }]
        });
      }
      const result = resultOf(await ozon('/v1/product/attributes/update', { items }));
      return send(res, 202, { taskId: result.task_id || result.taskId, submitted: items.length, result });
    }
    if (req.method === 'GET' && url.pathname === '/api/sourcing/search') {
      const platform = url.searchParams.get('platform') || 'all';
      const keyword = String(url.searchParams.get('keyword') || '').trim();
      const page = Math.min(Math.max(Number(url.searchParams.get('page') || 1), 1), 100);
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') || 20), 1), 100);
      if (!['all', 'pdd', '1688'].includes(platform)) return send(res, 400, { error: '货源平台参数不正确。' });
      if (!keyword || keyword.length > 100) return send(res, 400, { error: '请输入 1 至 100 个字符的商品关键词。' });
      if (!Number.isInteger(page) || !Number.isInteger(pageSize)) return send(res, 400, { error: '分页参数不正确。' });
      return send(res, 200, await searchSourcing(platform, keyword, page, pageSize));
    }
    if (req.method === 'GET' && url.pathname === '/api/orders') {
      return send(res, 200, await ordersSnapshot({ forceRefresh: url.searchParams.get('refresh') === '1' }));
    }
    if (req.method === 'POST' && url.pathname === '/api/orders/action-preview') {
      const body = await readBody(req);
      const postingNumber = normalizePostingNumber(body.postingNumber);
      const { posting, products } = await getActionableFbsPosting(postingNumber);
      return send(res, 200, actionablePostingPreview(posting, products));
    }
    if (req.method === 'POST' && url.pathname === '/api/orders/pack') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要对订单执行备货。' });
      const postingNumber = normalizePostingNumber(body.postingNumber);
      const { products } = await getActionableFbsPosting(postingNumber);
      try {
        await ozon('/v4/posting/fbs/ship', {
          posting_number: postingNumber,
          packages: [{
            products: products.map(item => ({ product_id: Number(item.productId), quantity: item.quantity }))
          }]
        }, config(), undefined, { maxRateLimitRetries: 0 });
      } catch (error) {
        if (error.network) {
          error.message = `备货请求未收到可靠响应，请先同步并核对订单状态，确认未备货前不要重复提交。${error.message}`;
        }
        throw error;
      }
      invalidateOperationalPostingsCache();
      let refreshedPosting = null;
      let warning = '';
      try {
        refreshedPosting = resultOf(await fbsPostingGetByNumber(postingNumber));
      } catch (error) {
        warning = `备货请求已提交，但暂时无法核实 Ozon 最新状态：${error.message}`;
      }
      const status = String(refreshedPosting?.status || '').trim();
      const verified = status.toLowerCase() === 'awaiting_deliver';
      if (!verified && !warning) warning = `备货请求已提交，Ozon 当前返回状态“${orderStatusLabel(refreshedPosting || {})}”，请同步订单核对。`;
      return send(res, 200, {
        accepted: true,
        verified,
        postingNumber,
        status,
        statusLabel: refreshedPosting ? orderStatusLabel(refreshedPosting) : '',
        availableActions: Array.isArray(refreshedPosting?.available_actions) ? refreshedPosting.available_actions : [],
        warning,
        totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0)
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/orders/split') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要拆分订单。' });
      const postingNumber = normalizePostingNumber(body.postingNumber);
      const { products } = await getActionableFbsPosting(postingNumber);
      if (!Array.isArray(body.packageOne) || body.packageOne.length !== products.length) {
        return send(res, 400, { error: '请为每种商品填写包裹 1 的数量，然后重新预览拆分方案。' });
      }
      const requestedBySku = new Map();
      for (const item of body.packageOne) {
        const productId = String(item?.productId ?? '').trim();
        const quantityText = String(item?.quantity ?? '').trim();
        if (!/^\d{1,16}$/.test(productId) || !Number.isSafeInteger(Number(productId)) || !/^\d+$/.test(quantityText)) {
          return send(res, 400, { error: '拆分商品 SKU 或包裹数量格式不正确。' });
        }
        if (requestedBySku.has(productId)) return send(res, 400, { error: '拆分商品 SKU 不能重复。' });
        requestedBySku.set(productId, Number(quantityText));
      }
      const freshBySku = new Map(products.map(item => [item.productId, item]));
      if (requestedBySku.size !== freshBySku.size || [...requestedBySku.keys()].some(productId => !freshBySku.has(productId))) {
        return send(res, 409, { error: '订单商品已变化，请重新打开拆分订单窗口并核对数量。' });
      }
      let packageOneQuantity = 0;
      let packageTwoQuantity = 0;
      const packageOne = [];
      const packageTwo = [];
      for (const product of products) {
        const quantity = requestedBySku.get(product.productId);
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > product.quantity) {
          return send(res, 400, { error: `商品 ${product.offerId || product.productId} 的包裹 1 数量必须是 0 至 ${product.quantity} 的整数。` });
        }
        const remaining = product.quantity - quantity;
        packageOneQuantity += quantity;
        packageTwoQuantity += remaining;
        if (quantity > 0) packageOne.push({ product_id: Number(product.productId), quantity });
        if (remaining > 0) packageTwo.push({ product_id: Number(product.productId), quantity: remaining });
      }
      if (!packageOneQuantity || !packageTwoQuantity) {
        return send(res, 400, { error: '拆分后两个包裹都必须至少有 1 件商品。' });
      }
      let splitResult;
      try {
        splitResult = resultOf(await ozon('/v1/posting/fbs/split', {
          posting_number: postingNumber,
          packages: [{ products: packageOne }, { products: packageTwo }]
        }, config(), undefined, { maxRateLimitRetries: 0 }));
      } catch (error) {
        if (error.network) {
          error.message = `拆单请求未收到可靠响应，请先同步订单核实，不要直接重复提交。${error.message}`;
        }
        throw error;
      }
      invalidateOperationalPostingsCache();
      const splitPostings = splitPostingNumbers(splitResult);
      const warning = splitPostings.length
        ? ''
        : 'Ozon 已接受拆单请求，但未返回新的运单号；请同步订单核实拆分结果。';
      return send(res, 200, {
        accepted: true,
        postingNumber,
        splitPostings,
        packageQuantities: [packageOneQuantity, packageTwoQuantity],
        warning
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/balance') {
      return send(res, 200, await balanceSnapshot({ forceRefresh: url.searchParams.get('refresh') === '1' }));
    }
    if (req.method === 'GET' && url.pathname === '/api/pickup/candidates') {
      return send(res, 200, publicPickupSnapshot(await pickupSnapshot()));
    }
    if (req.method === 'POST' && url.pathname === '/api/pickup/settings') {
      const body = await readBody(req);
      const template = String(body.template ?? readPickupState().template).trim();
      if (!template || template.length > 1000) return send(res, 400, { error: '提醒模板不能为空，且最多 1000 个字符。' });
      if (body.autoEnabled === true) {
        const cfg = config();
        if (!cfg.clientId || !cfg.apiKey) return send(res, 400, { error: '请先配置 Ozon API，再开启自动提醒。' });
      }
      const state = readPickupState();
      state.template = template;
      state.autoEnabled = body.autoEnabled === true;
      writePickupState(state);
      return send(res, 200, { ok: true, autoEnabled: state.autoEnabled, template: state.template });
    }
    if (req.method === 'POST' && url.pathname === '/api/pickup/send') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要向所选买家发送取货提醒。' });
      if (!Array.isArray(body.postingNumbers) || body.postingNumbers.length < 1 || body.postingNumbers.length > 50) {
        return send(res, 400, { error: '请选择 1 至 50 个到货订单。' });
      }
      const postingNumbers = [...new Set(body.postingNumbers.map(value => String(value).trim()))];
      if (postingNumbers.some(value => !value || value.length > 100)) return send(res, 400, { error: '订单编号格式不正确。' });
      const snapshot = await pickupSnapshot({ forceRefresh: true });
      const freshCandidates = new Map(snapshot.candidates.map(item => [item.postingNumber, item]));
      const state = readPickupState();
      const results = [];
      for (const postingNumber of postingNumbers) {
        const candidate = freshCandidates.get(postingNumber);
        if (!candidate) {
          results.push({ postingNumber, ok: false, error: '此订单已不在到货提醒列表中，请刷新后重试。' });
          continue;
        }
        results.push(await sendPickupReminder(postingNumber, state.template, candidate));
      }
      return send(res, 200, {
        results,
        summary: {
          sent: results.filter(item => item.ok && item.state === 'sent').length,
          failed: results.filter(item => !item.ok).length
        }
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/pickup/remind-again') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要再次向所选买家发送取货提醒。' });
      if (!Array.isArray(body.postingNumbers) || body.postingNumbers.length < 1 || body.postingNumbers.length > 50) {
        return send(res, 400, { error: '请选择 1 至 50 个已提醒订单。' });
      }
      const postingNumbers = [...new Set(body.postingNumbers.map(value => String(value).trim()))];
      if (postingNumbers.some(value => !value || value.length > 100)) return send(res, 400, { error: '订单编号格式不正确。' });
      const snapshot = await pickupSnapshot({ forceRefresh: true });
      const freshCandidates = new Map(snapshot.candidates.map(item => [item.postingNumber, item]));
      const state = readPickupState();
      const results = [];
      for (const postingNumber of postingNumbers) {
        const candidate = freshCandidates.get(postingNumber);
        if (!candidate) {
          results.push({ postingNumber, ok: false, error: '此订单已不在到货提醒列表中，请刷新后重试。' });
          continue;
        }
        if (!candidate.canRemindAgain) {
          results.push({ postingNumber, ok: false, state: candidate.sentState, error: '此订单当前不能发送再次提醒，请刷新列表后重试。' });
          continue;
        }
        results.push(await sendPickupAgain(postingNumber, state.template, candidate));
      }
      return send(res, 200, {
        results,
        summary: {
          sent: results.filter(item => item.ok && item.state === 'sent').length,
          failed: results.filter(item => !item.ok).length
        }
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/pickup/mark-sent') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认此订单的提醒已在 Ozon 聊天中发送。' });
      const postingNumber = String(body.postingNumber || '').trim();
      if (!postingNumber || postingNumber.length > 100) return send(res, 400, { error: '订单号格式不正确。' });
      const snapshot = await pickupSnapshot({ forceRefresh: true });
      if (!snapshot.candidates.some(item => item.postingNumber === postingNumber)) {
        return send(res, 404, { error: '此订单已不在到货提醒列表中，请先同步订单。' });
      }
      const state = readPickupState();
      const previous = state.records[postingNumber];
      if (!previous || !['sending', 'uncertain'].includes(previous.state)) {
        return send(res, 409, { error: '此订单当前不是待核实状态，请刷新列表后重试。' });
      }
      state.records[postingNumber] = {
        ...previous,
        state: 'sent',
        sentAt: previous.sentAt || new Date().toISOString(),
        manuallyConfirmed: true
      };
      delete state.records[postingNumber].error;
      writePickupState(state);
      return send(res, 200, { ok: true, postingNumber, state: 'sent' });
    }
    if (req.method === 'POST' && url.pathname === '/api/inventory/batch') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要更新所选商品的库存。' });
      if (!Array.isArray(body.stocks) || body.stocks.length < 1 || body.stocks.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品更新库存。' });
      }
      const writableWarehouses = (await getWarehousePages()).filter(isWritableWarehouse);
      const writableWarehouseIds = new Set(writableWarehouses.map(item => item.warehouseId));
      if (!writableWarehouseIds.size) return send(res, 400, { error: 'Ozon 当前没有可写入的启用仓库，请先在 Ozon 后台启用仓库后重试。' });
      const seen = new Set();
      const stocks = [];
      for (const item of body.stocks) {
        const productId = String(item?.productId || '').trim();
        const offerId = String(item?.offerId || '').trim();
        const warehouseId = Number(item?.warehouseId);
        const stock = Number(item?.stock);
        if (!/^\d+$/.test(productId) || !offerId || offerId.length > 100) {
          return send(res, 400, { error: '商品 ID 或 Offer ID 格式不正确。' });
        }
        if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
          return send(res, 400, { error: '仓库 ID 必须是正整数。' });
        }
        if (!writableWarehouseIds.has(String(warehouseId))) {
          return send(res, 400, { error: '所选仓库当前不可写入，已刷新仓库状态，请重新打开批量库存窗口。' });
        }
        if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000_000) {
          return send(res, 400, { error: '库存必须是 0 至 1,000,000,000 之间的整数。' });
        }
        const key = `${productId}:${warehouseId}`;
        if (seen.has(key)) return send(res, 400, { error: '同一商品和仓库不能重复提交。' });
        seen.add(key);
        stocks.push({ product_id: Number(productId), offer_id: offerId, warehouse_id: warehouseId, stock });
      }
      const result = resultOf(await ozon('/v2/products/stocks', { stocks }));
      const responseItems = Array.isArray(result) ? result : (Array.isArray(result.stocks) ? result.stocks : (Array.isArray(result.items) ? result.items : []));
      const results = responseItems.map(item => ({
        productId: String(item.product_id || ''),
        offerId: String(item.offer_id || ''),
        warehouseId: String(item.warehouse_id || ''),
        errors: Array.isArray(item.errors) ? item.errors : []
      }));
      const failed = results.filter(item => item.errors.length > 0).length;
      return send(res, 200, {
        results,
        summary: { submitted: stocks.length, success: Math.max(stocks.length - failed, 0), failed },
        raw: result
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/inventory/transfer') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要转移所选商品的库存。' });
      if (!Array.isArray(body.transfers) || body.transfers.length < 1 || body.transfers.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品转移库存。' });
      }
      const writableWarehouses = (await getWarehousePages()).filter(isWritableWarehouse);
      const writableWarehouseIds = new Set(writableWarehouses.map(item => item.warehouseId));
      if (writableWarehouseIds.size < 2) return send(res, 400, { error: 'Ozon 当前可写入的仓库少于 2 个，无法执行库存转移。' });

      const seenProducts = new Set();
      const productIds = [];
      const transfers = [];
      for (const item of body.transfers) {
        const productId = String(item?.productId || '').trim();
        const offerId = String(item?.offerId || '').trim();
        const fromWarehouseId = Number(item?.fromWarehouseId);
        const toWarehouseId = Number(item?.toWarehouseId);
        const quantityText = String(item?.quantity ?? '').trim();
        const quantity = quantityText === '' ? null : Number(quantityText);
        if (!/^\d+$/.test(productId) || !offerId || offerId.length > 100) {
          return send(res, 400, { error: '商品 ID 或 Offer ID 格式不正确。' });
        }
        if (!Number.isInteger(fromWarehouseId) || fromWarehouseId <= 0 || !Number.isInteger(toWarehouseId) || toWarehouseId <= 0) {
          return send(res, 400, { error: '来源仓和目标仓 ID 必须是正整数。' });
        }
        if (fromWarehouseId === toWarehouseId) return send(res, 400, { error: '来源仓和目标仓不能是同一个仓库。' });
        if (!writableWarehouseIds.has(String(fromWarehouseId)) || !writableWarehouseIds.has(String(toWarehouseId))) {
          return send(res, 400, { error: '所选仓库当前不可写入，已刷新仓库状态，请重新打开库存转移窗口。' });
        }
        if (quantityText !== '' && (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000_000)) {
          return send(res, 400, { error: '转移数量必须是 1 至 1,000,000,000 之间的整数。' });
        }
        if (seenProducts.has(productId)) return send(res, 400, { error: '同一商品不能重复提交库存转移。' });
        seenProducts.add(productId);
        productIds.push(Number(productId));
        transfers.push({ productId, offerId, fromWarehouseId, toWarehouseId, quantity });
      }

      let exactWarehouseStockData;
      try {
        exactWarehouseStockData = await getExactWarehouseStockData(transfers.map(item => item.offerId));
      } catch (error) {
        return send(res, error.status || 502, { error: `读取转移前仓库库存失败：${error.message}` });
      }
      const stockByProduct = exactWarehouseStockData.rowsByProduct;
      const updatePairs = [];
      const transferResults = [];
      for (const transfer of transfers) {
        const warehouseRows = stockByProduct.get(transfer.productId);
        if (!Array.isArray(warehouseRows) || warehouseRows.length === 0) {
          return send(res, 409, { error: `商品 ${transfer.offerId} 的仓库库存未返回明确的 warehouse_id，无法安全转移。请刷新数据后重试。` });
        }
        const warehouseStocks = new Map(warehouseRows.map(row => [String(row.warehouseId), row]));
        const source = warehouseStocks.get(String(transfer.fromWarehouseId));
        if (!source) {
          return send(res, 409, { error: `商品 ${transfer.offerId} 的来源仓库存未知，无法确认可转移数量。请先在 Ozon 中确认库存。` });
        }
        if (transfer.quantity === null) transfer.quantity = source.present;
        if (!Number.isInteger(transfer.quantity) || transfer.quantity <= 0) {
          return send(res, 400, { error: `商品 ${transfer.offerId} 的来源仓没有可转移库存。` });
        }
        if (transfer.quantity > source.present) {
          return send(res, 400, { error: `商品 ${transfer.offerId} 的来源仓只有 ${source.present} 件，不能转移 ${transfer.quantity} 件。` });
        }
        const target = warehouseStocks.get(String(transfer.toWarehouseId));
        const targetPresent = target ? target.present : 0;
        updatePairs.push([
          { product_id: Number(transfer.productId), offer_id: transfer.offerId, warehouse_id: transfer.fromWarehouseId, stock: source.present - transfer.quantity },
          { product_id: Number(transfer.productId), offer_id: transfer.offerId, warehouse_id: transfer.toWarehouseId, stock: targetPresent + transfer.quantity }
        ]);
        transferResults.push({ ...transfer, sourceBefore: source.present, targetBefore: targetPresent });
      }

      const results = [];
      const batchResponses = [];
      const batchFailures = [];
      for (let batchStart = 0; batchStart < transferResults.length; batchStart += INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST) {
        const batchTransfers = transferResults.slice(batchStart, batchStart + INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST);
        const stocks = updatePairs.slice(batchStart, batchStart + INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST).flat();
        try {
          const result = resultOf(await ozon('/v2/products/stocks', { stocks }));
          batchResponses.push(result);
          const responseItems = Array.isArray(result)
            ? result
            : (Array.isArray(result.stocks) ? result.stocks : (Array.isArray(result.items) ? result.items : []));
          const responseByKey = new Map();
          responseItems.forEach(item => {
            const key = `${String(item.product_id || '')}:${String(item.warehouse_id || '')}`;
            responseByKey.set(key, Array.isArray(item.errors) ? item.errors : []);
          });
          results.push(...batchTransfers.map(transfer => {
            const errors = [
              ...(responseByKey.get(`${transfer.productId}:${transfer.fromWarehouseId}`) || []),
              ...(responseByKey.get(`${transfer.productId}:${transfer.toWarehouseId}`) || [])
            ];
            return { ...transfer, errors };
          }));
        } catch (error) {
          const message = `第 ${Math.floor(batchStart / INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST) + 1} 批（${batchTransfers.length} 个商品）提交失败：${error.message}`;
          batchFailures.push({
            batch: Math.floor(batchStart / INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST) + 1,
            products: batchTransfers.length,
            error: error.message
          });
          results.push(...batchTransfers.map(transfer => ({ ...transfer, errors: [{ code: 'batch_request_failed', message }] })));
          // 请求结果不确定时停止后续批次，避免用户在未核对 Ozon 状态前继续修改库存。
          break;
        }
      }
      if (results.length < transferResults.length) {
        const message = '前一批请求失败，后续批次未提交；请刷新库存后核对。';
        results.push(...transferResults.slice(results.length).map(transfer => ({
          ...transfer,
          errors: [{ code: 'batch_not_submitted', message }]
        })));
      }
      const failed = results.filter(item => item.errors.length > 0).length;
      return send(res, 200, {
        results,
        summary: {
          submitted: results.length,
          success: Math.max(results.length - failed, 0),
          failed,
          partial: failed > 0,
          batches: Math.ceil(transferResults.length / INVENTORY_TRANSFER_PRODUCTS_PER_REQUEST),
          completedBatches: batchResponses.length,
          batchFailures
        },
        raw: batchResponses.length === 1 ? batchResponses[0] : { batches: batchResponses }
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/prices/batch') {
      const body = await readBody(req);
      if (body.confirm !== true) return send(res, 400, { error: '请先确认要更新所选商品的售价。' });
      if (!Array.isArray(body.prices) || body.prices.length < 1 || body.prices.length > 100) {
        return send(res, 400, { error: '请选择 1 至 100 个商品更新售价。' });
      }
      const seen = new Set();
      const prices = [];
      for (const item of body.prices) {
        const productId = String(item?.productId || '').trim();
        const offerId = String(item?.offerId || '').trim();
        const priceText = String(item?.price ?? '').trim();
        const oldPriceText = String(item?.oldPrice ?? '').trim();
        const currencyCode = String(item?.currencyCode || item?.currency || 'RUB').trim().toUpperCase();
        if (!/^\d+$/.test(productId) || !offerId || offerId.length > 100) {
          return send(res, 400, { error: '商品 ID 或 Offer ID 格式不正确。' });
        }
        if (!/^\d+(?:\.\d{1,4})?$/.test(priceText) || !Number.isFinite(Number(priceText)) || Number(priceText) <= 0 || Number(priceText) > 1_000_000_000_000) {
          return send(res, 400, { error: `商品 ${offerId} 的售价必须是 0 至 1,000,000,000,000 之间的大于 0 的数字。` });
        }
        if (oldPriceText !== '' && (!/^\d+(?:\.\d{1,4})?$/.test(oldPriceText) || !Number.isFinite(Number(oldPriceText)) || Number(oldPriceText) < 0 || Number(oldPriceText) > 1_000_000_000_000)) {
          return send(res, 400, { error: `商品 ${offerId} 的划线价格式不正确。` });
        }
        if (oldPriceText !== '' && Number(oldPriceText) > 0 && Number(oldPriceText) <= Number(priceText)) {
          return send(res, 400, { error: `商品 ${offerId} 的划线价必须高于售价。` });
        }
        if (!/^[A-Z]{3}$/.test(currencyCode)) return send(res, 400, { error: `商品 ${offerId} 的币种格式不正确。` });
        const key = `${productId}:${offerId}`;
        if (seen.has(key)) return send(res, 400, { error: '同一商品不能重复提交售价修改。' });
        seen.add(key);
        const update = {
          product_id: Number(productId),
          offer_id: offerId,
          price: priceText,
          currency_code: currencyCode
        };
        if (oldPriceText !== '') update.old_price = oldPriceText;
        prices.push(update);
      }
      const result = resultOf(await ozon('/v1/product/import/prices', { prices }));
      const responseItems = Array.isArray(result)
        ? result
        : (Array.isArray(result.result) ? result.result : (Array.isArray(result.items) ? result.items : []));
      const responseByKey = new Map();
      responseItems.forEach(item => {
        const errors = Array.isArray(item.errors) ? item.errors : [];
        const updated = item.updated === true || item.updated === 'true';
        if (item.offer_id) responseByKey.set(`offer:${String(item.offer_id)}`, { updated, errors });
        if (item.product_id !== undefined && item.product_id !== null) responseByKey.set(`product:${String(item.product_id)}`, { updated, errors });
      });
      const results = prices.map(item => {
        const response = responseByKey.get(`offer:${item.offer_id}`) || responseByKey.get(`product:${item.product_id}`);
        return {
          productId: String(item.product_id),
          offerId: item.offer_id,
          updated: response?.updated === true,
          errors: response ? response.errors : [{ code: 'missing_result', message: 'Ozon 未返回该商品的处理结果。' }]
        };
      });
      const failed = results.filter(item => !item.updated || item.errors.length > 0).length;
      return send(res, 200, {
        results,
        summary: { submitted: prices.length, success: prices.length - failed, failed },
        raw: result
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/products') {
      const body = await readBody(req);
      const required = ['offerId', 'name', 'price', 'vat', 'description', 'descriptionCategoryId', 'typeId'];
      const missing = required.filter(key => !String(body[key] ?? '').trim());
      if (missing.length) return send(res, 400, { error: `请填写必填项：${missing.join(', ')}` });
      if (!Number.isInteger(Number(body.descriptionCategoryId)) || Number(body.descriptionCategoryId) <= 0 || !Number.isInteger(Number(body.typeId)) || Number(body.typeId) <= 0) {
        return send(res, 400, { error: '类目 ID 和商品类型 ID 必须是正整数。' });
      }
      if (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0 || (body.oldPrice && (!Number.isFinite(Number(body.oldPrice)) || Number(body.oldPrice) <= 0))) {
        return send(res, 400, { error: '售价和划线价必须是大于 0 的数字。' });
      }
      let attributes;
      try { attributes = body.attributes && String(body.attributes).trim() ? JSON.parse(body.attributes) : []; }
      catch { return send(res, 400, { error: '类目属性必须是有效的 JSON 数组。' }); }
      if (!Array.isArray(attributes)) return send(res, 400, { error: '商品属性必须是 JSON 数组。' });
      const richContentText = String(body.richContent || '').trim();
      if (richContentText) {
        let richContent;
        try { richContent = JSON.parse(richContentText); }
        catch { return send(res, 400, { error: '富内容必须是有效的 JSON。' }); }
        let serializedRichContent;
        try { serializedRichContent = validateRichContent(richContent, '富内容'); }
        catch (error) { return send(res, error.status || 400, { error: error.message }); }
        attributes = setRichContentAttribute(attributes, serializedRichContent);
      }
      const images = String(body.images || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      const item = {
        offer_id: String(body.offerId).trim(),
        name: String(body.name).trim(),
        description_category_id: Number(body.descriptionCategoryId),
        type_id: Number(body.typeId),
        price: String(body.price).trim(),
        currency_code: 'RUB',
        vat: String(body.vat).trim(),
        description: String(body.description).trim(),
        images,
        primary_image: images[0] || '',
        attributes,
        depth: Number(body.depth || 10),
        width: Number(body.width || 10),
        height: Number(body.height || 10),
        dimension_unit: 'mm',
        weight: Number(body.weight || 100),
        weight_unit: 'g'
      };
      if (body.oldPrice) item.old_price = String(body.oldPrice).trim();
      if (body.barcode) item.barcode = String(body.barcode).trim();
      const result = resultOf(await ozon('/v3/product/import', { items: [item] }));
      return send(res, 202, { taskId: result.task_id, result });
    }
    if (req.method === 'GET' && url.pathname === '/api/import-status') {
      const taskId = url.searchParams.get('task_id');
      if (!taskId || !/^\d+$/.test(taskId)) return send(res, 400, { error: '缺少有效的 task_id' });
      return send(res, 200, resultOf(await ozon('/v1/product/import/info', { task_id: Number(taskId) })));
    }
    const asset = STATIC_FILES.get(url.pathname);
    if (req.method === 'GET' && asset) {
      const filePath = path.join(ROOT, asset[0]);
      return send(res, 200, fs.readFileSync(filePath, 'utf8'), asset[1]);
    }
    return send(res, 404, { error: '未找到此地址' });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return send(res, status, safeError(error));
  }
}

async function route(req, res) {
  loadShopRegistry();
  const url = new URL(req.url, 'http://127.0.0.1');
  const requestedShopId = String(req.headers['x-ozon-shop-id'] || '').trim();
  const shopExists = shopRegistry.some(shop => shop.id === requestedShopId);
  if (requestedShopId && !shopExists && !(req.method === 'GET' && url.pathname === '/api/shops')) {
    return send(res, 400, { error: '当前选择的店铺不存在，请刷新店铺列表。' });
  }
  const shopId = shopExists ? requestedShopId : activeShopId;
  return storeContext.run({ shopId }, () => routeInShop(req, res));
}

const cfg = config();
for (const shop of loadShopRegistry()) {
  storeContext.run({ shopId: shop.id }, () => seedRateLimitFromRecentSnapshots());
}

function withRequestDataRoot(root, handler) {
  return requestDataRoot.run(root, handler);
}

function resetRequestCaches() {
  shopRegistry = null;
  activeShopId = '';
  endpointRateLimitsByStore.clear();
  storeRuntimeById.clear();
}

function startServer(port = cfg.port, host = cfg.host) {
  return http.createServer(route).listen(port, host, () => {
    console.log(`Ozon 数据看板已启动：http://${host}:${port}`);
    console.log('API 凭据保存在本机 .env 文件中；仅在请求 Ozon Seller API 时用于认证。');
  });
}

module.exports = { route, withRequestDataRoot, resetRequestCaches, startServer };

if (require.main === module) {
  startServer();
}
