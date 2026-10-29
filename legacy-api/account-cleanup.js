// Map visible cleanup choices to persisted file keys so unrelated account data stays untouched.
const cleanupGroups = Object.freeze({
  shops: key => key === '.ozon-shops.json' || key === '.env',
  cache: key => [
    '.product-analytics-cache.json',
    '.balance-cache.json',
    '.orders-cache.json',
    '.operational-postings-cache.json',
    '.pickup-candidates-cache.json'
  ].includes(key.split('/').at(-1)),
  reminders: key => key.split('/').at(-1) === '.pickup-reminders.json',
  rateLimits: key => key.split('/').at(-1) === '.ozon-rate-limits.json'
});

function cleanupKeysForGroups(keys, groups) {
  return keys.filter(key => groups.some(group => cleanupGroups[group]?.(key)));
}

module.exports = { cleanupKeysForGroups };
