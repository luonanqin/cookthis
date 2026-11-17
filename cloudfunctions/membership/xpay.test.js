'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  hmacSha256Hex,
  calcPaySig,
  calcSignature,
  isPayConfigured,
  buildVirtualPayParams,
  queryOrder
} = require('./xpay.js')

const APP_KEY = '12345'
const SESSION_KEY = '9hAb/NEYUlkaMBEsmFgzig=='
const QUERY_URI = '/xpay/query_user_balance'
const QUERY_BODY = '{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}'
const SIGN_DATA =
  '{"offerId":"123","buyQuantity":1,"env":0,"currencyType":"CNY","productId":"testproductId","goodsPrice":10,"outTradeNo":"xxxxxx","attach":"testdata"}'

describe('xpay HMAC', () => {
  it('matches the official query_user_balance pay_sig / signature vectors', () => {
    assert.equal(
      calcPaySig(QUERY_URI, QUERY_BODY, APP_KEY),
      'c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5'
    )
    assert.equal(
      calcSignature(QUERY_BODY, SESSION_KEY),
      '089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7'
    )
  })

  it('signs requestVirtualPayment with uri + & + signData', () => {
    assert.equal(
      calcPaySig('requestVirtualPayment', SIGN_DATA, APP_KEY),
      '0ce2a9fcab3532e9f78dd3beb841806c0c08a24ec26b04c366584ac06d852bb0'
    )
    assert.equal(
      calcSignature(SIGN_DATA, SESSION_KEY),
      '8e08bc05e10243e2e943385292e2063be327f8285c0db753a5c3e5db5745cb69'
    )
    assert.equal(
      hmacSha256Hex(APP_KEY, 'requestVirtualPayment&' + SIGN_DATA),
      calcPaySig('requestVirtualPayment', SIGN_DATA, APP_KEY)
    )
  })
})

describe('xpay.buildVirtualPayParams', () => {
  it('returns PAY_NOT_CONFIGURED when offer id or app key is missing', () => {
    assert.deepEqual(
      buildVirtualPayParams({
        orderId: 'mabc1234',
        productId: 'vip_month',
        goodsPrice: 99,
        openid: 'oTEST',
        attach: 'mabc1234',
        sessionKey: SESSION_KEY,
        env: {}
      }),
      { ok: false, error: 'PAY_NOT_CONFIGURED' }
    )
    assert.equal(isPayConfigured({ XPAY_OFFER_ID: '123' }), false)
    assert.equal(isPayConfigured({ XPAY_APP_KEY: APP_KEY }), false)
    assert.equal(
      isPayConfigured({ XPAY_OFFER_ID: '123', XPAY_APP_KEY: APP_KEY }),
      true
    )
  })

  it('returns a clear error when sessionKey is empty (does not HMAC an empty key)', () => {
    const res = buildVirtualPayParams({
      orderId: 'xxxxxx',
      productId: 'testproductId',
      goodsPrice: 10,
      openid: 'oTEST',
      attach: 'testdata',
      sessionKey: '',
      env: {
        XPAY_OFFER_ID: '123',
        XPAY_APP_KEY: APP_KEY,
        XPAY_ENV: '0'
      }
    })
    assert.equal(res.ok, false)
    assert.equal(res.error, 'NO_SESSION_KEY')
    assert.equal(res.payment, undefined)
  })

  it('returns signData, paySig, signature, and short_series_goods mode', () => {
    const res = buildVirtualPayParams({
      orderId: 'xxxxxx',
      productId: 'testproductId',
      goodsPrice: 10,
      openid: 'oTEST',
      attach: 'testdata',
      sessionKey: SESSION_KEY,
      env: {
        XPAY_OFFER_ID: '123',
        XPAY_APP_KEY: APP_KEY,
        XPAY_ENV: '0'
      }
    })
    assert.equal(res.ok, true)
    assert.equal(res.payment.mode, 'short_series_goods')
    assert.equal(typeof res.payment.signData, 'string')
    assert.equal(res.payment.signData, SIGN_DATA)
    assert.equal(
      res.payment.paySig,
      '0ce2a9fcab3532e9f78dd3beb841806c0c08a24ec26b04c366584ac06d852bb0'
    )
    assert.equal(
      res.payment.signature,
      '8e08bc05e10243e2e943385292e2063be327f8285c0db753a5c3e5db5745cb69'
    )
  })
})

describe('xpay.queryOrder', () => {
  it('stubs null until WeChat query is wired', async () => {
    assert.equal(await queryOrder('xxxxxx'), null)
  })
})
