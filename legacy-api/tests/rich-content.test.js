const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('rich content can be read, updated, and included in a new product import', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozon-rich-content-'));
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
    global.__richContentBodies = [];
    global.fetch = async (url, options) => {
      const value = String(url);
      if (!value.startsWith('https://api-seller.ozon.ru/')) return originalFetch(url, options);
      const endpoint = new URL(value).pathname;
      const body = options?.body ? JSON.parse(options.body) : {};
      global.__ozonCalls.push(endpoint);
      if (endpoint === '/v4/product/info/attributes') {
        return new Response(JSON.stringify({ result: { items: [{
          product_id: 101,
          offer_id: 'OFFER-101',
          attributes: [{ id: 11254, values: [{ dictionary_value_id: 0, value: '{"version":1,"blocks":[{"type":"text","text":"Existing content"}]}' }] }]
        }], last_id: '', has_next: false } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (endpoint === '/v1/product/attributes/update') {
        global.__richContentBodies.push({ endpoint, body });
        return new Response(JSON.stringify({ result: { task_id: 902 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (endpoint === '/v3/product/import') {
        global.__richContentBodies.push({ endpoint, body });
        return new Response(JSON.stringify({ result: { task_id: 903 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('Unexpected mocked Ozon endpoint: ' + endpoint);
    };
    process.on('message', message => {
      if (message?.type === 'get-captures') process.send({
        type: 'captures',
        calls: global.__ozonCalls,
        bodies: global.__richContentBodies
      });
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

  const readResponse = await fetch(`${baseUrl}/api/rich-content?product_id=101`);
  assert.equal(readResponse.status, 200);
  const readResult = await readResponse.json();
  assert.equal(readResult.found, true);
  assert.equal(readResult.validJson, true);
  assert.match(readResult.richContentText, /Existing content/);

  const richContent = { version: 1, blocks: [{ type: 'text', text: 'Updated content' }] };
  const updateResponse = await fetch(`${baseUrl}/api/rich-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, items: [{ productId: '101', offerId: 'OFFER-101', richContent }] })
  });
  assert.equal(updateResponse.status, 202);
  assert.equal((await updateResponse.json()).taskId, 902);

  const invalidResponse = await fetch(`${baseUrl}/api/rich-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, items: [{ productId: '101', offerId: 'OFFER-101', richContent: '{invalid' }] })
  });
  assert.equal(invalidResponse.status, 400);

  const newProductRichContent = { version: 1, blocks: [{ type: 'text', text: 'New product content' }] };
  const productResponse = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      offerId: 'NEW-101', name: 'New product', price: '100', vat: '0.2', description: 'Description',
      descriptionCategoryId: '1', typeId: '2', attributes: JSON.stringify([
        { id: 8229, values: [{ dictionary_value_id: 0, value: 'Black' }] },
        { id: 11254, values: [{ dictionary_value_id: 0, value: 'old' }] }
      ]),
      richContent: JSON.stringify(newProductRichContent)
    })
  });
  assert.equal(productResponse.status, 202);
  assert.equal((await productResponse.json()).taskId, 903);

  const captures = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out reading mocked Ozon requests.')), 2_000);
    child.once('message', message => {
      clearTimeout(timeout);
      if (message?.type !== 'captures') return reject(new Error('Invalid mocked Ozon capture response.'));
      resolve(message);
    });
    child.send({ type: 'get-captures' });
  });
  assert.deepEqual(captures.calls, [
    '/v4/product/info/attributes',
    '/v1/product/attributes/update',
    '/v3/product/import'
  ]);
  const updateItem = captures.bodies.find(item => item.endpoint === '/v1/product/attributes/update').body.items[0];
  assert.equal(updateItem.offer_id, 'OFFER-101');
  assert.equal(updateItem.attributes[0].id, 11254);
  assert.deepEqual(JSON.parse(updateItem.attributes[0].values[0].value), richContent);

  const newProduct = captures.bodies.find(item => item.endpoint === '/v3/product/import').body.items[0];
  const richAttributes = newProduct.attributes.filter(attribute => attribute.id === 11254);
  assert.equal(richAttributes.length, 1);
  assert.deepEqual(JSON.parse(richAttributes[0].values[0].value), newProductRichContent);
  assert.equal(newProduct.attributes.some(attribute => attribute.id === 8229), true);
});
