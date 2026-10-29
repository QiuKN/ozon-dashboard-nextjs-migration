const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('inventory transfers split into Ozon-compatible batches', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-inventory-transfer-'));
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
    global.__stockBodies = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      const value = String(url);
      if (!value.startsWith('https://api-seller.ozon.ru/')) return originalFetch(url, options);
      const endpoint = new URL(value).pathname;
      const body = options.body ? JSON.parse(options.body) : {};
      let result;
      if (endpoint === '/v2/warehouse/list') {
        result = { warehouses: [
          { warehouse_id: 1, name: 'Source', status: 'active' },
          { warehouse_id: 2, name: 'Target', status: 'active' }
        ], has_next: false, cursor: '' };
      } else if (endpoint === '/v1/product/info/stocks-by-warehouse/fbo') {
        result = { products: (body.offer_ids || []).map((offerId, index) => ({
          product_id: String(index + 1), offer_id: offerId, warehouse_id: 1, present: 10, reserved: 0
        })) };
      } else if (endpoint === '/v2/product/info/stocks-by-warehouse/fbs') {
        result = { products: [] };
      } else if (endpoint === '/v2/products/stocks') {
        global.__stockBodies.push(body);
        result = { stocks: (body.stocks || []).map(item => ({ ...item, errors: [] })) };
      } else {
        throw new Error('Unexpected mocked Ozon endpoint: ' + endpoint);
      }
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.on('message', message => {
      if (message?.type === 'get-stock-bodies') process.send({ type: 'stock-bodies', bodies: global.__stockBodies });
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
      OZON_API_KEY: 'test-api-key-for-inventory-transfer'
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

  const transfers = Array.from({ length: 51 }, (_, index) => ({
    productId: String(index + 1),
    offerId: `OFFER-${index + 1}`,
    fromWarehouseId: 1,
    toWarehouseId: 2,
    quantity: 1
  }));
  const response = await fetch(`${baseUrl}/api/inventory/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transfers, confirm: true })
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.summary, {
    submitted: 51,
    success: 51,
    failed: 0,
    partial: false,
    batches: 2,
    completedBatches: 2,
    batchFailures: []
  });

  const bodies = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked stock requests.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'stock-bodies') reject(new Error('Unexpected stock-body response.'));
      else resolve(message.bodies);
    });
    child.send({ type: 'get-stock-bodies' });
  });
  assert.deepEqual(bodies.map(body => body.stocks.length), [100, 2]);
  assert.ok(bodies.every(body => body.stocks.length >= 1 && body.stocks.length <= 100));
});
