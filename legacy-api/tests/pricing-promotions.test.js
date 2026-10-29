const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('pricing and promotion module reads Ozon prices and participating promotion products', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-pricing-promotions-'));
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
      global.__ozonBodies.push({ endpoint, method: options?.method || 'GET', body });
      let result;
      if (endpoint === '/v3/product/list') {
        result = { items: [
          { product_id: 101, offer_id: 'ACTIVE-101', name: 'Promotion item' },
          { product_id: 102, offer_id: 'REGULAR-102', name: 'Regular item' }
        ], last_id: '' };
      } else if (endpoint === '/v3/product/info/list') {
        result = { items: [
          { id: 101, name: 'Promotion item detail', primary_image: ['https://example.test/101.jpg'] },
          { id: 102, name: 'Regular item detail', primary_image: ['https://example.test/102.jpg'] }
        ] };
      } else if (endpoint === '/v5/product/info/prices') {
        result = { items: [
          { product_id: 101, price: { price: '1200', old_price: '1500', retail_price: '1300', currency_code: 'RUB' } },
          { product_id: 102, price: { price: '700', old_price: '', currency_code: 'RUB' } }
        ] };
      } else if (endpoint === '/v1/actions') {
        result = { actions: [
          { id: 55, title: 'Flash sale', date_start: '2026-10-20T00:00:00Z', date_end: '2026-10-30T00:00:00Z', is_participating: true, participating_products_count: 1 },
          { id: 66, title: 'Other sale', is_participating: false }
        ] };
      } else if (endpoint === '/v1/actions/products') {
        throw new Error('The retired v1 promotion-products endpoint must not be called.');
      } else if (endpoint === '/v2/actions/products') {
        result = { products: [{ id: 101, action_price: { amount: '1000', currency: 'RUB' } }], total: 1, last_id: '' };
      } else if (endpoint === '/v2/actions/candidates') {
        result = body.action_id === 66 ? { products: [
          { id: 102, action_price: { amount: '550', currency: 'RUB' }, max_action_price: { amount: '650', currency: 'RUB' }, min_stock: 2, recommended_stock: 5 },
          { id: 101, action_price: { amount: '900', currency: 'RUB' }, is_quarantined: true }
        ], last_id: '' } : { products: [], last_id: '' };
      } else if (endpoint === '/v1/actions/products/activate') {
        throw new Error('The retired promotion activation endpoint must not be called.');
      } else if (endpoint === '/v2/actions/products/deactivate') {
        result = { product_ids: body.product_ids || [], rejected: [] };
      } else if (endpoint === '/v1/actions/products/update') {
        result = { active_product_ids: (body.products || []).map(item => item.product_id), deactivated_product_ids: [], rejected: [], warnings: [] };
      } else if (endpoint === '/v1/product/import/prices') {
        result = { result: (body.prices || []).map(item => ({ product_id: item.product_id, offer_id: item.offer_id, updated: true, errors: [] })) };
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

  const response = await fetch(`${baseUrl}/api/pricing-promotions?refresh=1`);
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.stats.total, 2);
  assert.equal(snapshot.stats.active, 1);
  assert.equal(snapshot.stats.inactive, 1);
  assert.equal(snapshot.stats.unknown, 0);
  const active = snapshot.products.find(product => product.productId === '101');
  assert.equal(active.name, 'Promotion item detail');
  assert.equal(active.image, 'https://example.test/101.jpg');
  assert.equal(active.currentPrice, '1200');
  assert.equal(active.oldPrice, '1500');
  assert.equal(active.promotionPrice, '1000');
  assert.equal(active.promotions[0].name, 'Flash sale');
  assert.equal(active.promotionStatus, 'active');
  assert.equal(snapshot.products.find(product => product.productId === '102').promotionStatus, 'inactive');
  assert.equal(snapshot.products.find(product => product.productId === '102').image, 'https://example.test/102.jpg');
  assert.equal(snapshot.actions.find(action => action.id === '66').name, 'Other sale');
  assert.equal(snapshot.actions.find(action => action.id === '66').isParticipating, false);
  assert.deepEqual(snapshot.warnings, []);

  const cachedResponse = await fetch(`${baseUrl}/api/pricing-promotions`);
  assert.equal(cachedResponse.status, 200);
  await cachedResponse.json();
  const captures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon requests.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  assert.deepEqual([...captures.calls].sort(), ['/v1/actions', '/v2/actions/products', '/v3/product/info/list', '/v3/product/list', '/v5/product/info/prices'].sort());
  assert.equal(captures.bodies.find(item => item.endpoint === '/v1/actions').method, 'GET');
  const productRequest = captures.bodies.find(item => item.endpoint === '/v2/actions/products').body;
  assert.equal(productRequest.action_id, 55);
  assert.equal(productRequest.limit, 100);
  assert.equal(productRequest.last_id, '');

  const candidateResponse = await fetch(`${baseUrl}/api/pricing-promotions/candidates`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '66', productIds: ['102'] })
  });
  assert.equal(candidateResponse.status, 200);
  const candidateSnapshot = await candidateResponse.json();
  assert.equal(candidateSnapshot.candidates.length, 1);
  assert.equal(candidateSnapshot.candidates[0].productId, '102');
  assert.equal(candidateSnapshot.candidates[0].actionPrice, '550');
  assert.equal(candidateSnapshot.candidates[0].recommendedStock, 5);
  assert.deepEqual(candidateSnapshot.unavailableProductIds, []);

  const missingJoinConfirmation = await fetch(`${baseUrl}/api/pricing-promotions/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '66', products: [{ productId: '102', actionPrice: '500', stock: '5' }] })
  });
  assert.equal(missingJoinConfirmation.status, 400);

  const ineligibleJoin = await fetch(`${baseUrl}/api/pricing-promotions/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '55', confirm: true, products: [{ productId: '102', actionPrice: '500' }] })
  });
  assert.equal(ineligibleJoin.status, 409);
  assert.match((await ineligibleJoin.json()).error, /不在该活动候选列表/);

  const quarantinedJoin = await fetch(`${baseUrl}/api/pricing-promotions/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '66', confirm: true, products: [{ productId: '101', actionPrice: '900' }] })
  });
  assert.equal(quarantinedJoin.status, 409);
  assert.match((await quarantinedJoin.json()).error, /隔离状态/);

  const joinResponse = await fetch(`${baseUrl}/api/pricing-promotions/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '66', confirm: true, products: [{ productId: '102', actionPrice: '500', stock: '5' }] })
  });
  assert.equal(joinResponse.status, 200);
  const joined = await joinResponse.json();
  assert.deepEqual(joined.summary, { submitted: 1, success: 1, failed: 0 });
  const activationCaptures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon promotion activation.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  const activationCall = activationCaptures.bodies.find(item => item.endpoint === '/v1/actions/products/update');
  assert.deepEqual(activationCall.body, {
    action_id: 66,
    products: [{ product_id: 102, action_price: { amount: '500', currency: 'RUB' }, stock: 5 }]
  });

  const missingConfirmation = await fetch(`${baseUrl}/api/pricing-promotions/deactivate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '55', productIds: ['101'] })
  });
  assert.equal(missingConfirmation.status, 400);

  const deactivateResponse = await fetch(`${baseUrl}/api/pricing-promotions/deactivate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '55', productIds: ['101'], confirm: true })
  });
  assert.equal(deactivateResponse.status, 200);
  const deactivate = await deactivateResponse.json();
  assert.deepEqual(deactivate.summary, { submitted: 1, success: 1, failed: 0 });
  assert.equal(deactivate.results[0].ok, true);
  const finalCaptures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon requests.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  const deactivateCall = finalCaptures.bodies.find(item => item.endpoint === '/v2/actions/products/deactivate');
  assert.deepEqual(deactivateCall.body, { action_id: 55, product_ids: [101] });

  const missingPromotionPriceConfirmation = await fetch(`${baseUrl}/api/pricing-promotions/prices/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '55', prices: [{ productId: '101', price: '950', currencyCode: 'RUB' }] })
  });
  assert.equal(missingPromotionPriceConfirmation.status, 400);

  const promotionPriceResponse = await fetch(`${baseUrl}/api/pricing-promotions/prices/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionId: '55', confirm: true, prices: [{ productId: '101', price: '950', currencyCode: 'RUB' }] })
  });
  assert.equal(promotionPriceResponse.status, 200);
  const promotionPrice = await promotionPriceResponse.json();
  assert.deepEqual(promotionPrice.summary, { submitted: 1, success: 1, failed: 0 });
  const promotionPriceCaptures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon promotion price update.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  const promotionPriceCall = promotionPriceCaptures.bodies.find(item => item.endpoint === '/v1/actions/products/update' && item.body.action_id === 55);
  assert.deepEqual(promotionPriceCall.body, {
    action_id: 55,
    products: [{ product_id: 101, action_price: { amount: '950', currency: 'RUB' } }]
  });

  const priceUpdateResponse = await fetch(`${baseUrl}/api/prices/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, prices: [
      { productId: '101', offerId: 'ACTIVE-101', price: '1150', currencyCode: 'RUB' },
      { productId: '102', offerId: 'REGULAR-102', price: '800', oldPrice: '900', currencyCode: 'RUB' }
    ] })
  });
  assert.equal(priceUpdateResponse.status, 200);
  const priceUpdate = await priceUpdateResponse.json();
  assert.deepEqual(priceUpdate.summary, { submitted: 2, success: 2, failed: 0 });
  const priceCaptures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon price update.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  const priceCall = priceCaptures.bodies.find(item => item.endpoint === '/v1/product/import/prices');
  assert.deepEqual(priceCall.body.prices[0], {
    product_id: 101, offer_id: 'ACTIVE-101', price: '1150', currency_code: 'RUB'
  });
  assert.deepEqual(priceCall.body.prices[1], {
    product_id: 102, offer_id: 'REGULAR-102', price: '800', currency_code: 'RUB', old_price: '900'
  });
});
