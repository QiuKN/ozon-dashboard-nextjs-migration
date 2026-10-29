const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

test('Russian promotion names are translated consistently in the promotion table and action dialogs', () => {
  const translateSource = app.match(/function promotionActionNameInChinese\(value\) \{[\s\S]*?\n\}/)?.[0];
  const labelSource = app.match(/function promotionLabel\(product\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(translateSource, 'promotionActionNameInChinese should exist');
  assert.ok(labelSource, 'promotionLabel should exist');

  const promotionActionNameInChinese = new Function(`${translateSource}; return promotionActionNameInChinese;`)();
  const promotionLabel = new Function('promotionActionNameInChinese', 'promotionDateLabel', `${labelSource}; return promotionLabel;`)(
    promotionActionNameInChinese,
    value => value || ''
  );
  const russianName = 'Эластичный бустинг. Без ограничения срока действия';

  assert.equal(promotionActionNameInChinese(russianName), '弹性推广 · 长期有效');
  assert.equal(promotionLabel({ promotions: [{ name: russianName }] }), '弹性推广 · 长期有效');
  assert.equal(promotionActionNameInChinese('Seasonal offer'), 'Seasonal offer');
  assert.match(app, /promotionActionNameInChinese\(selected\[0\]\.promotions\[0\]\.name/);
  assert.match(app, /const actionName = promotionActionNameInChinese\(action\.name/);
});
