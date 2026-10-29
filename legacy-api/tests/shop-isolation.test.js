const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('shop selection isolates Ozon credentials, order caches, and pickup settings', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-shop-isolation-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit').catch(() => {});
      child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    global.__shopCalls = [];
    global.fetch = async (url, options = {}) => {
      const value = String(url);
      if (!value.startsWith('https://api-seller.ozon.ru/')) return originalFetch(url, options);
      const endpoint = new URL(value).pathname;
      const clientId = String(options.headers?.['Client-Id'] || '');
      const apiKey = String(options.headers?.['Api-Key'] || '');
      global.__shopCalls.push({ endpoint, clientId, apiKey });
      let result;
      if (endpoint === '/v3/posting/fbo/list' || endpoint === '/v4/posting/fbs/list') {
        const channel = endpoint.includes('/fbo/') ? 'FBO' : 'FBS/rFBS';
        result = { postings: [{
          posting_number: clientId + '-' + channel,
          order_number: clientId + '-ORDER',
          status: 'delivering',
          substatus: 'posting_in_pickup_point',
          created_at: '2026-10-20T00:00:00.000Z',
          products: [{ product_id: '101', sku: 201, offer_id: 'OFFER-' + clientId, name: 'Product-' + clientId, primary_image: 'https://example.test/item.jpg', quantity: 1, price: { amount: '20', currency: 'RUB' } }]
        }], has_next: false, cursor: '' };
      } else if (endpoint === '/v3/product/info/list') {
        result = { items: [] };
      } else {
        throw new Error('Unexpected mocked Ozon endpoint: ' + endpoint);
      }
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.on('message', message => {
      if (message?.type === 'get-shop-calls') process.send({ type: 'shop-calls', calls: global.__shopCalls });
    });
  `);

  child = fork(path.join(tempDir, 'server.js'), [], {
    cwd: tempDir,
    execArgv: ['--require', preloadPath],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      OZON_CLIENT_ID: '111111',
      OZON_API_KEY: 'first-shop-test-api-key'
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (url, shopId = '', options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      ...options,
      headers: {
        ...(shopId ? { 'X-Ozon-Shop-Id': shopId } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    return { response, data: await response.json() };
  };
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

  const initial = await request('/api/shops');
  assert.equal(initial.data.shops.length, 1);
  const firstShopId = initial.data.shops[0].id;
  const created = await request('/api/shops', firstShopId, {
    method: 'POST',
    body: JSON.stringify({ name: 'Second shop', clientId: '222222', apiKey: 'second-shop-test-api-key' })
  });
  assert.equal(created.response.status, 200);
  const secondShopId = created.data.activeShopId;
  assert.notEqual(firstShopId, secondShopId);
  assert.equal(JSON.stringify(created.data).includes('second-shop-test-api-key'), false);

  const firstOrders = await request('/api/orders', firstShopId);
  const secondOrders = await request('/api/orders', secondShopId);
  assert.equal(firstOrders.response.status, 200);
  assert.equal(secondOrders.response.status, 200);
  assert.ok(firstOrders.data.orders.every(order => order.productName === 'Product-111111'));
  assert.ok(secondOrders.data.orders.every(order => order.productName === 'Product-222222'));

  await request('/api/pickup/settings', firstShopId, {
    method: 'POST', body: JSON.stringify({ autoEnabled: false, template: 'First shop reminder' })
  });
  await request('/api/pickup/settings', secondShopId, {
    method: 'POST', body: JSON.stringify({ autoEnabled: true, template: 'Second shop reminder' })
  });
  const firstPickup = await request('/api/pickup/candidates', firstShopId);
  const secondPickup = await request('/api/pickup/candidates', secondShopId);
  assert.equal(firstPickup.data.autoEnabled, false);
  assert.equal(firstPickup.data.template, 'First shop reminder');
  assert.equal(secondPickup.data.autoEnabled, true);
  assert.equal(secondPickup.data.template, 'Second shop reminder');

  const calls = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon shop calls.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'shop-calls') reject(new Error('Unexpected child IPC response.'));
      else resolve(message.calls);
    });
    child.send({ type: 'get-shop-calls' });
  });
  assert.ok(calls.some(call => call.clientId === '111111' && call.apiKey === 'first-shop-test-api-key'));
  assert.ok(calls.some(call => call.clientId === '222222' && call.apiKey === 'second-shop-test-api-key'));
});
