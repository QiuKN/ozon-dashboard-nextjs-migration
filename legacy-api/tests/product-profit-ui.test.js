const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(dashboardDir, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dashboardDir, 'styles.css'), 'utf8');

test('product profit table sorts by Offer ID both ways without mutating source products', () => {
  const declaration = app.match(/function productProfitFilteredRows\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(declaration, 'productProfitFilteredRows should exist');
  const getRows = new Function('state', 'productProfitSearchQuery', `${declaration}; return productProfitFilteredRows;`);
  const products = [
    { name: 'Same name', offerId: 'DA010' },
    { name: 'Same name', offerId: 'DA002' },
    { name: 'Same name', offerId: 'DA001' }
  ];
  const state = { productProfit: { products }, productProfitFilter: 'all', productProfitOfferIdSort: 'asc' };
  const productProfitSearchQuery = () => ({ query: '', idTerms: [] });
  const filterRows = getRows(state, productProfitSearchQuery);

  assert.deepEqual(filterRows().map(product => product.offerId), ['DA001', 'DA002', 'DA010']);
  state.productProfitOfferIdSort = 'desc';
  assert.deepEqual(filterRows().map(product => product.offerId), ['DA010', 'DA002', 'DA001']);
  assert.deepEqual(products.map(product => product.offerId), ['DA010', 'DA002', 'DA001']);
  assert.match(html, /id="productProfitOfferIdSort"/);
  assert.match(app, /state\.productProfitOfferIdSort = state\.productProfitOfferIdSort === 'asc' \? 'desc' : 'asc'/);
  assert.match(app, /String\(left\.offerId \|\| ''\)\.localeCompare\(String\(right\.offerId \|\| ''\)/);
});

test('negative calculated profit is rendered with an explicit red style', () => {
  assert.match(app, /profitNumber < 0 \? 'profit-negative' : 'profit-positive'/);
  assert.match(app, /class="profit-amount \$\{profitClass\}"/);
  assert.match(css, /\.product-profit-panel \.profit-amount\.profit-negative\{color:#c94c5a\}/);
});
