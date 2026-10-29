const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanupKeysForGroups } = require('../account-cleanup');

test('cleanup choices only select their matching account data', () => {
  const keys = [
    '.ozon-shops.json',
    '.env',
    '.orders-cache.json',
    '.store-data/abc/.balance-cache.json',
    '.pickup-reminders.json',
    '.ozon-rate-limits.json'
  ];

  assert.deepEqual(cleanupKeysForGroups(keys, ['shops']), ['.ozon-shops.json', '.env']);
  assert.deepEqual(cleanupKeysForGroups(keys, ['cache']), ['.orders-cache.json', '.store-data/abc/.balance-cache.json']);
  assert.deepEqual(cleanupKeysForGroups(keys, ['reminders']), ['.pickup-reminders.json']);
  assert.deepEqual(cleanupKeysForGroups(keys, ['browser']), []);
  assert.deepEqual(cleanupKeysForGroups(keys, ['shops', 'rateLimits']), ['.ozon-shops.json', '.env', '.ozon-rate-limits.json']);
});
