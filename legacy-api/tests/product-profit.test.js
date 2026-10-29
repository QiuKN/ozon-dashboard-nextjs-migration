const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');
const assertClose = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be within tolerance of ${expected}`);

test('product profit uses OGL tariffs, promotion price, acquiring fee, and FBS commission', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-product-profit-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit').catch(() => {});
      child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        break;
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 9) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });

  for (const file of ['server.js', 'pinduoduo-sdk-adapter.js']) {
    fs.copyFileSync(path.join(dashboardDir, file), path.join(tempDir, file));
  }
  const port = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: freePort } = probe.address();
      probe.close(error => error ? reject(error) : resolve(freePort));
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
          { product_id: 101, offer_id: 'PROMO-101', name: 'Promo small' },
          { product_id: 102, offer_id: 'BIG-102', name: 'Big route' },
          { product_id: 103, offer_id: 'PREMIUM-103', name: 'Premium volumetric' },
          { product_id: 104, offer_id: 'INCOMPLETE-104', name: 'Missing commission' },
          { product_id: 105, offer_id: 'LIMIT-105', name: 'Oversize parcel' }
        ], last_id: '' };
      } else if (endpoint === '/v3/product/info/list') {
        result = { items: [
          { id: 101, name: 'Promo small' },
          { id: 102, name: 'Big route' },
          { id: 103, name: 'Premium volumetric' },
          { id: 104, name: 'Missing commission' },
          { id: 105, name: 'Oversize parcel' }
        ] };
      } else if (endpoint === '/v4/product/info/attributes') {
        result = [
          { id: 101, depth: 200, width: 100, height: 100, dimension_unit: 'mm', weight: 400, weight_unit: 'g' },
          { id: 102, depth: 300, width: 200, height: 100, dimension_unit: 'mm', weight: 2500, weight_unit: 'g' },
          { id: 103, depth: 600, width: 500, height: 500, dimension_unit: 'mm', weight: 6000, weight_unit: 'g' },
          { id: 104, depth: 200, width: 100, height: 100, dimension_unit: 'mm', weight: 400, weight_unit: 'g' },
          { id: 105, depth: 200, width: 100, height: 100, dimension_unit: 'mm', weight: 36000, weight_unit: 'g' }
        ];
      } else if (endpoint === '/v5/product/info/prices') {
        result = { items: [
          { product_id: 101, price: { price: '1000', currency_code: 'RUB' }, commissions: { sales_percent_rfbs: 10 } },
          { product_id: 102, price: { price: '5000', marketing_seller_price: '4800', currency_code: 'RUB' }, commissions: { sales_percent_fbs: 8 } },
          { product_id: 103, price: { price: '8000', currency_code: 'RUB' }, commissions: { sales_percent_rfbs: 15 } },
          { product_id: 104, price: { price: '1000', currency_code: 'RUB' }, commissions: {} },
          { product_id: 105, price: { price: '1000', currency_code: 'RUB' }, commissions: { sales_percent_fbs: 10 } }
        ] };
      } else if (endpoint === '/v1/actions') {
        result = { actions: [{ id: 55, title: 'Sale', is_participating: true, participating_products_count: 1 }] };
      } else if (endpoint === '/v2/actions/products') {
        result = { products: [{ id: 101, action_price: { amount: '900', currency: 'RUB' } }, { id: 102 }], total: 2, last_id: '' };
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
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), OZON_CLIENT_ID: '123456', OZON_API_KEY: 'isolated-product-profit-test-key' },
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

  const response = await fetch(`${baseUrl}/api/product-profit?refresh=1`);
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.stats.total, 5);
  assert.equal(snapshot.stats.calculated, 3);
  assert.equal(snapshot.stats.incomplete, 1);
  assert.equal(snapshot.stats.unavailable, 1);
  assertClose(snapshot.stats.additionalPlatformFeesCny, 42.70497);
  assertClose(snapshot.logisticsPlatformFeeRate, 0.02);
  assertClose(snapshot.transportContractFeeRate, 0.0035);
  assertClose(snapshot.starAdsFeeRate, 0.015);

  const small = snapshot.products.find(product => product.productId === '101');
  assert.equal(small.priceSource, 'promotion');
  assert.equal(small.sellingPrice, 900);
  assert.equal(small.route, 'Extra Small');
  assert.equal(small.lengthCm, 20);
  assert.equal(small.weightGrams, 400);
  assertClose(small.oglShippingCny, 12.78);
  assertClose(small.acquiringFeeCny, 1.4364);
  assertClose(small.logisticsPlatformFeeCny, 1.4364);
  assertClose(small.transportContractFeeCny, 0.25137);
  assertClose(small.starAdsFeeCny, 1.0773);
  assertClose(small.commissionCny, 7.182);
  assertClose(small.profitCny, 47.65653);

  const big = snapshot.products.find(product => product.productId === '102');
  assert.equal(big.priceSource, 'current');
  assert.equal(big.sellingPrice, 5000);
  assert.equal(big.promotionPrice, '');
  assert.equal(big.route, 'Big');
  assert.equal(big.billableWeightGrams, 2500);
  assertClose(big.oglShippingCny, 75.82);
  assertClose(big.profitCny, 267.9185);

  const premium = snapshot.products.find(product => product.productId === '103');
  assert.equal(premium.route, 'Premium Big');
  assert.equal(premium.billableWeightGrams, 12500);
  assertClose(premium.oglShippingCny, 337.47);
  assertClose(premium.profitCny, 167.8236);

  const incomplete = snapshot.products.find(product => product.productId === '104');
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.profitCny, null);
  assert.match(incomplete.statusMessage, /佣金比例缺失/);
  const unavailable = snapshot.products.find(product => product.productId === '105');
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.profitCny, null);
  assert.match(unavailable.statusMessage, /35 kg/);

  const cached = await fetch(`${baseUrl}/api/product-profit`);
  assert.equal(cached.status, 200);
  await cached.json();
  const captures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon request capture.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  assert.equal(captures.calls.filter(endpoint => endpoint === '/v3/product/list').length, 1);
  assert.equal(captures.calls.filter(endpoint => endpoint === '/v4/product/info/attributes').length, 1);
  assert.equal(captures.bodies.find(item => item.endpoint === '/v2/actions/products').body.action_id, 55);
  assert.equal(snapshot.exchangeRate, 0.0798);
  assert.deepEqual(snapshot.warnings, []);
});
