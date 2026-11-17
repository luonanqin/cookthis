'use strict'

const crypto = require('crypto')

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

/** Refresh 查单；未接通微信支付前返回 null。 */
async function queryOrder(_outTradeNo) {
  return null
}

module.exports = {
  hmacSha256Hex,
  calcPaySig,
  calcSignature,
  isPayConfigured,
  buildVirtualPayParams,
  queryOrder
}
