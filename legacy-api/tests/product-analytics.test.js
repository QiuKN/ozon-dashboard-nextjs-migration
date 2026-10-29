const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('dashboard maps Ozon hits_view analytics to products by SKU and caches it', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-product-analytics-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit').catch(() => {});
      child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  for (const file of ['server.js', 'pinduoduo-sdk-adapter.js']) {
    fs.copyFileSync(path.join(dashboardDir, file), path.join(tempDir, file));
  }
  const port = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  const preloadPath = path.join(tempDir, 'mock-ozon.js');
  fs.writeFileSync(preloadPath, `
    const originalFetch = global.fetch;
    global.__ozonCalls = [];
    global.__ozonBodies = [];
    global.fetch = async (url, options) => {
      const value = String(url);
      if (!value.startsWith('https://api-seller.ozon.ru/')) return originalFetch(url, options);
      const endpoint = new URL(value).pathname;
      const body = options?.body ? JSON.parse(options.body) : {};
      global.__ozonCalls.push(endpoint);
      global.__ozonBodies.push({ endpoint, body });
      let result;
      if (endpoint === '/v3/product/list') {
        result = { items: [
          { product_id: 101, offer_id: 'SKU-101', name: 'First item', through_whd_sales: 1 },
          { product_id: 102, offer_id: 'SKU-102', name: 'Second item' },
          { product_id: 103, offer_id: 'SKU-103', name: 'No analytics item' }
        ], last_id: '' };
      } else if (endpoint === '/v3/product/info/list') {
        result = { items: [
          { id: 101, name: 'First item detail', sku: 555 },
          { id: 102, name: 'Second item detail', sku: 666, metadata: { whd: { sales: false } } },
          { id: 103, name: 'No analytics item detail', sku: 777 }
        ] };
      } else if (endpoint === '/v4/product/info/stocks') {
        result = { items: [
          { product_id: 101, stocks: [{ warehouse_id: 1, sku: 555, present: 3, reserved: 0 }] },
          { product_id: 102, stocks: [{ warehouse_id: 1, sku: 666, present: 4, reserved: 0 }, { type: 'WHD', sku: 666, present: 9, reserved: 2 }] },
          { product_id: 103, stocks: [{ warehouse_id: 1, sku: 777, present: 5, reserved: 0 }] }
        ] };
      } else if (endpoint === '/v5/product/info/prices') {
        result = { items: [
          { product_id: 101, price: { price: '100', currency_code: 'RUB' } },
          { product_id: 102, price: { price: '200', currency_code: 'RUB' } },
          { product_id: 103, price: { price: '300', currency_code: 'RUB' } }
        ] };
      } else if (endpoint === '/v2/warehouse/list') {
        result = { warehouses: [{ warehouse_id: 1, name: 'Main', warehouse_type: 'FBO', status: 'active' }], has_next: false, cursor: '' };
      } else if (endpoint === '/v1/product/info/stocks-by-warehouse/fbo' || endpoint === '/v2/product/info/stocks-by-warehouse/fbs') {
        result = { products: [] };
      } else if (endpoint === '/v1/analytics/data') {
        result = { data: [
          { dimensions: [{ id: '555', name: 'First item detail' }], metrics: [42] },
          { dimensions: [{ id: '666', name: 'Second item detail' }], metrics: [0] }
        ], has_next: false };
      } else {
        throw new Error('Unexpected mocked Ozon endpoint: ' + endpoint);
      }
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.on('message', message => {
      if (message?.type === 'get-captures') process.send({ type: 'captures', calls: global.__ozonCalls, bodies: global.__ozonBodies });
    });
  `);
  child = fork(path.join(tempDir, 'server.js'), [], {
    cwd: tempDir,
    execArgv: ['--require', preloadPath],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), OZON_CLIENT_ID: '123456', OZON_API_KEY: 'test-api-key-for-isolated-integration' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Dashboard child exited early: ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, `Dashboard did not start: ${stderr}`);

  const firstResponse = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.deepEqual(first.products.map(product => product.displayCount), [42, 0, null]);
  assert.deepEqual(first.products.map(product => product.whdSalesKnown ? product.whdSales : null), [1, 0, null]);
  assert.deepEqual(first.products.map(product => product.whdStockKnown ? product.whdStock : null), [null, 9, null]);
  assert.deepEqual(first.products.map(product => product.whdStockReserved || 0), [0, 2, 0]);
  assert.equal(first.whd.salesAvailable, true);
  assert.equal(first.whd.stockAvailable, true);
  assert.equal(first.analytics.available, true);
  assert.equal(first.analytics.stale, false);
  assert.equal(first.stats.displayCount, 42);
  assert.deepEqual(first.warnings, []);

  const secondResponse = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.deepEqual(second.products.map(product => product.displayCount), [42, 0, null]);
  const captures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon requests.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  assert.equal(captures.calls.filter(endpoint => endpoint === '/v1/analytics/data').length, 1);
  const analyticsCall = captures.bodies.find(item => item.endpoint === '/v1/analytics/data');
  assert.deepEqual(analyticsCall.body.metrics, ['hits_view']);
  assert.deepEqual(analyticsCall.body.dimension, ['sku']);
  assert.equal(analyticsCall.body.limit, 1000);
});
