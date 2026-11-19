'use strict'

const crypto = require('crypto')
const https = require('https')
const { URL } = require('url')

const QUERY_ORDER_URI = '/xpay/query_order'

function hmacSha256Hex(key, message) {
  return crypto
    .createHmac('sha256', String(key))
    .update(String(message), 'utf8')
    .digest('hex')
}

/** pay_sig = hex(hmac_sha256(appKey, uri + '&' + postBody)) */
function calcPaySig(uri, postBody, appKey) {
  return hmacSha256Hex(appKey, String(uri) + '&' + String(postBody))
}

/** signature = hex(hmac_sha256(sessionKey, postBody)) */
function calcSignature(postBody, sessionKey) {
  return hmacSha256Hex(sessionKey, String(postBody))
}

function isPayConfigured(env) {
  const e = env || {}
  return !!(e.XPAY_OFFER_ID && e.XPAY_APP_KEY)
}

function payEnvNumber(env) {
  const n = Number(env && env.XPAY_ENV)
  return n === 1 ? 1 : 0
}

/**
 * Build wx.requestVirtualPayment params for short_series_goods.
 * signData key order matches the official example string.
 */
function buildVirtualPayParams({
  orderId,
  productId,
  goodsPrice,
  openid,
  attach,
  sessionKey,
  env
}) {
  void openid
  if (!isPayConfigured(env)) return { ok: false, error: 'PAY_NOT_CONFIGURED' }
  if (!String(sessionKey || '').trim()) return { ok: false, error: 'NO_SESSION_KEY' }
  const signData = JSON.stringify({
    offerId: String(env.XPAY_OFFER_ID),
    buyQuantity: 1,
    env: payEnvNumber(env),
    currencyType: 'CNY',
    productId: String(productId),
    goodsPrice: Math.trunc(Number(goodsPrice)),
    outTradeNo: String(orderId),
    attach: String(attach == null ? orderId : attach)
  })
  return {
    ok: true,
    payment: {
      signData,
      paySig: calcPaySig('requestVirtualPayment', signData, env.XPAY_APP_KEY),
      signature: calcSignature(signData, sessionKey || ''),
      mode: 'short_series_goods'
    }
  }
}

async function defaultGetAccessToken() {
  try {
    const cloud = require('wx-server-sdk')
    if (typeof cloud.getAccessToken === 'function') {
      const r = await cloud.getAccessToken()
      return (r && (r.accessToken || r.access_token)) || null
    }
    if (
      cloud.openapi &&
      cloud.openapi.auth &&
      typeof cloud.openapi.auth.getAccessToken === 'function'
    ) {
      const r = await cloud.openapi.auth.getAccessToken()
      return (r && (r.accessToken || r.access_token)) || null
    }
  } catch (err) {
    console.error('xpay getAccessToken failed', err)
  }
  return null
}

function defaultPostJson(url, postBody) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch (err) {
      reject(err)
      return
    }
    const body = String(postBody)
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(JSON.parse(raw))
          } catch (err) {
            reject(err)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * POST /xpay/query_order — 推送丢失时查单补发货。
 * @param {object} opts
 * @param {string} opts.orderId outTradeNo
 * @param {string} opts.openid
 * @param {object} opts.env
 * @param {Function} [opts.getAccessToken]
 * @param {Function} [opts.postJson]
 */
async function queryOrder(opts) {
  const options = opts && typeof opts === 'object' ? opts : { orderId: opts }
  const orderId = String(options.orderId || '').trim()
  const openid = String(options.openid || '').trim()
  const env = options.env || {}
  if (!isPayConfigured(env) || !orderId || !openid) return null

  const postBody = JSON.stringify({
    openid,
    env: payEnvNumber(env),
    order_id: orderId
  })
  const paySig = calcPaySig(QUERY_ORDER_URI, postBody, env.XPAY_APP_KEY)
  const getAccessToken = options.getAccessToken || defaultGetAccessToken
  const postJson = options.postJson || defaultPostJson
  let token = null
  try {
    token = await getAccessToken()
  } catch (err) {
    console.error('xpay queryOrder token failed', err)
    return null
  }
  if (!token) return null

  const url =
    'https://api.weixin.qq.com/xpay/query_order?access_token=' +
    encodeURIComponent(String(token)) +
    '&pay_sig=' +
    encodeURIComponent(paySig)

  let res = null
  try {
    res = await postJson(url, postBody)
  } catch (err) {
    console.error('xpay queryOrder http failed', err)
    return null
  }
  if (!res || Number(res.errcode) !== 0) return null
  return res.order || res
}

module.exports = {
  QUERY_ORDER_URI,
  hmacSha256Hex,
  calcPaySig,
  calcSignature,
  isPayConfigured,
  buildVirtualPayParams,
  queryOrder
}
