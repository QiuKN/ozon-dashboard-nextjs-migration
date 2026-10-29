const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('orders and pickup share one FBO/FBS sync within the cache window', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-shared-order-sync-'));
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
      global.__ozonCalls.push(endpoint);
      const body = options?.body ? JSON.parse(options.body) : {};
      global.__ozonBodies.push({ endpoint, body });
      let result;
      if (endpoint === '/v3/product/info/list') {
        result = { items: [] };
      } else if (endpoint === '/v3/posting/fbo/list' || endpoint === '/v4/posting/fbs/list') {
        const channel = endpoint.includes('/fbo/') ? 'FBO' : 'FBS/rFBS';
        result = body.cursor
          ? { postings: [], has_next: false, cursor: '' }
          : { postings: [{
              posting_number: channel + '-POSTING',
              order_number: channel + '-ORDER',
              status: 'delivering',
              substatus: 'posting_in_pickup_point',
              created_at: '2026-10-20T00:00:00.000Z',
              buyer: { name: 'Private Buyer', phone: '+70000000000', email: 'buyer@example.test' },
              analytics_data: { delivery_type: 'private-fixture' },
              currency_code: 'RUB',
              products: [{
                product_id: '101', sku: 201, offer_id: channel + '-OFFER', name: channel + ' 商品',
                primary_image: 'https://example.test/item.jpg', quantity: 1,
                price: { amount: '24.90', currency: channel === 'FBS/rFBS' ? 'CNY' : 'RUB' }
              }]
            }], has_next: true, cursor: 'cursor-2' };
      } else {
        throw new Error('Unexpected mocked Ozon endpoint: ' + endpoint);
      }
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.on('message', message => {
      if (message?.type === 'get-ozon-calls') process.send({ type: 'ozon-calls', calls: global.__ozonCalls });
      if (message?.type === 'get-ozon-bodies') process.send({ type: 'ozon-bodies', bodies: global.__ozonBodies });
    });
  `);

  child = fork(path.join(tempDir, 'server.js'), [], {
    cwd: tempDir,
    execArgv: ['--require', preloadPath],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      OZON_CLIENT_ID: '123456',
      OZON_API_KEY: 'test-api-key-for-isolated-integration'
    },
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

  const ordersResponse = await fetch(`${baseUrl}/api/orders?refresh=1`);
  assert.equal(ordersResponse.status, 200);
  const orders = await ordersResponse.json();
  assert.equal(orders.stats.byChannel.FBO, 1);
  assert.equal(orders.stats.byChannel['FBS/rFBS'], 1);
  const fboOrder = orders.orders.find(order => order.channel === 'FBO');
  const fbsOrder = orders.orders.find(order => order.channel === 'FBS/rFBS');
  assert.equal(fboOrder.amount, 24.9);
  assert.equal(fboOrder.currency, 'RUB');
  assert.equal(fboOrder.amountCny, 1.99);
  assert.equal(fbsOrder.amount, 24.9);
  assert.equal(fbsOrder.currency, 'CNY');
  assert.equal(fbsOrder.amountCny, 24.9);

  const pickupResponse = await fetch(`${baseUrl}/api/pickup/candidates?refresh=1`);
  assert.equal(pickupResponse.status, 200);
  const pickup = await pickupResponse.json();
  assert.equal(pickup.candidates.length, 2);
  assert.deepEqual(new Set(pickup.candidates.map(item => item.channel)), new Set(['FBO', 'FBS/rFBS']));

  const cachedOrdersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(cachedOrdersResponse.status, 200);

  const calls = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mock Ozon call count.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'ozon-calls') return reject(new Error('Invalid Ozon call-count response.'));
      resolve(message.calls);
    });
    child.send({ type: 'get-ozon-calls' });
  });
  assert.equal(calls.filter(endpoint => endpoint === '/v3/posting/fbo/list').length, 2);
  assert.equal(calls.filter(endpoint => endpoint === '/v4/posting/fbs/list').length, 2);
  assert.equal(calls.filter(endpoint => endpoint === '/v3/posting/fbs/list').length, 0);
  assert.equal(calls.filter(endpoint => endpoint === '/v3/product/info/list').length, 3);
  const requestBodies = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mock Ozon request bodies.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'ozon-bodies') return reject(new Error('Invalid Ozon request-body response.'));
      resolve(message.bodies);
    });
    child.send({ type: 'get-ozon-bodies' });
  });
  const fboBody = requestBodies.find(item => item.endpoint === '/v3/posting/fbo/list')?.body;
  const fbsBody = requestBodies.find(item => item.endpoint === '/v4/posting/fbs/list')?.body;
  assert.equal(fboBody.sort_dir, 'DESC');
  assert.equal(fboBody.cursor, '');
  assert.equal('offset' in fboBody, false);
  assert.equal(fbsBody.sort_dir, 'DESC');
  assert.equal(fbsBody.cursor, '');
  assert.equal('offset' in fbsBody, false);
  assert.deepEqual(
    requestBodies.filter(item => item.endpoint === '/v3/posting/fbo/list').map(item => item.body.cursor),
    ['', 'cursor-2']
  );
  assert.deepEqual(
    requestBodies.filter(item => item.endpoint === '/v4/posting/fbs/list').map(item => item.body.cursor),
    ['', 'cursor-2']
  );
  const storedCache = fs.readFileSync(path.join(tempDir, '.operational-postings-cache.json'), 'utf8');
  assert.doesNotMatch(storedCache, /Private Buyer|buyer@example\.test|\+70000000000|private-fixture/);
  assert.match(storedCache, /FBO-OFFER/);
  assert.match(storedCache, /"currency_code":"CNY"/);
});
