'use strict';

/**
 * Node.js adapter for justmd5/pinduoduo-sdk.
 *
 * The linked SDK is a PHP Composer package. This adapter mirrors its
 * Justmd5\\PinDuoDuo\\Api::request behavior so the Node.js dashboard can use
 * the same public-parameter handling and MD5 signing without a PHP runtime.
 * Source: https://github.com/justmd5/pinduoduo-sdk (MIT License)
 */

const crypto = require('node:crypto');

const PINDUODUO_ROUTER_URL = 'https://gw-api.pinduoduo.com/api/router';

function sdkParamValue(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

function signParams(params, clientSecret) {
  const source = Object.keys(params)
    .sort()
    .filter(key => !String(params[key]).startsWith('@'))
    .map(key => `${key}${params[key]}`)
    .join('');
  return crypto.createHash('md5').update(`${clientSecret}${source}${clientSecret}`).digest('hex').toUpperCase();
}

function createPinduoduoSdk({ clientId, clientSecret, accessToken = '', transport }) {
  if (typeof transport !== 'function') throw new TypeError('拼多多 SDK 适配器缺少请求传输函数。');

  const request = (needToken = false) => async (type, params = {}, dataType = 'JSON', version = 'V1') => {
    const payload = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, sdkParamValue(value)]));
    if (needToken && accessToken) payload.access_token = accessToken;
    payload.client_id = clientId;
    payload.sign_method = 'md5';
    payload.type = type;
    payload.data_type = dataType;
    payload.version = version;
    payload.timestamp = String(Math.floor(Date.now() / 1000));
    payload.sign = signParams(payload, clientSecret);
    return transport(PINDUODUO_ROUTER_URL, payload);
  };

  return {
    api: { request: request(false) },
    auth_api: { request: request(true) }
  };
}

module.exports = { PINDUODUO_ROUTER_URL, createPinduoduoSdk, signParams };
