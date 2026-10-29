const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const dashboardDir = path.resolve(__dirname, '..');

test('unreliable current-price action is removed from pricing and promotion module', () => {
  const app = fs.readFileSync(path.join(dashboardDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf8');

  assert.doesNotMatch(html, /id="pricingPromotionEditSelected"|批量改当前售价/);
  assert.doesNotMatch(app, /\$\('#pricingPromotionEditSelected'\)/);
  assert.match(html, /id="pricingPromotionEditPromotionPriceSelected"/);
  assert.match(html, /\/legacy\/app\.js\?v=20261029-balance-alert/);
  assert.match(html, /id="openPriceBatch"[^>]*>批量改售价/);
});
