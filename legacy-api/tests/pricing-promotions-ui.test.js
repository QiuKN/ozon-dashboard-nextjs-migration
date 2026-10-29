const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(dashboardDir, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dashboardDir, 'styles.css'), 'utf8');

test('pricing and promotion module paginates 100 filtered products at a time', () => {
  const declaration = app.match(/function currentPricingPromotionPageRows\(rows = pricingPromotionRows\(\)\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(declaration, 'currentPricingPromotionPageRows should exist');
  const rows = Array.from({ length: 249 }, (_, index) => ({ productId: String(index + 1) }));
  const state = { pricingPromotionPage: 2 };
  const currentPricingPromotionPageRows = new Function('state', 'PRODUCT_PAGE_SIZE', 'pricingPromotionRows', `${declaration}; return currentPricingPromotionPageRows;`)(state, 100, () => rows);

  assert.equal(currentPricingPromotionPageRows().length, 100);
  assert.equal(currentPricingPromotionPageRows()[0].productId, '101');
  assert.equal(currentPricingPromotionPageRows()[99].productId, '200');
  state.pricingPromotionPage = 9;
  assert.equal(currentPricingPromotionPageRows(rows).length, 49);
  assert.equal(state.pricingPromotionPage, 3);
});

test('pricing and promotion pagination provides controls, resets on filtering, and selects only this page', () => {
  for (const id of [
    'pricingPromotionPagination', 'pricingPromotionPageFirst', 'pricingPromotionPagePrevious',
    'pricingPromotionPageInput', 'pricingPromotionPageTotal', 'pricingPromotionPageNext',
    'pricingPromotionPageLast', 'pricingPromotionPageJump'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /state\.pricingPromotionPage = 1;\s*renderPricingPromotions\(\);/);
  assert.match(app, /const pageRows = currentPricingPromotionPageRows\(rows\);/);
  assert.match(app, /const selectable = rows\.filter\(product => product\.productId && product\.offerId\);[\s\S]*?const visibleSelectable = pageRows\.filter/);
  assert.match(app, /const visible = currentPricingPromotionPageRows\(\)\.filter/);
  assert.match(css, /\.pricing-promotion-panel #pricingPromotionPagination\{order:0;width:100%\}/);
});
