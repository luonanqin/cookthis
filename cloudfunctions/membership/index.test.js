'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryDb } = require('./fakeDb.js')
const { createMembershipApi, handleMain } = require('./index.js')
const xpay = require('./xpay.js')
const { SKUS } = require('./membershipCatalog.js')

const NOW = Date.parse('2026-11-18T04:00:00.000Z')
const SESSION_KEY = '9hAb/NEYUlkaMBEsmFgzig=='
const PAY_ENV = {
  XPAY_OFFER_ID: '123',
  XPAY_APP_KEY: '12345',
  XPAY_ENV: '0'
}

async function seedUser(db) {
  await db.collection('user_identities').add({
    data: { provider: 'wechat_mp', providerUserId: 'oTEST', uid: 'user-1' }
  })
  await db.collection('users').add({
    data: {
      uid: 'user-1',
      firstPurchaseUsed: {},
      swapDaily: { day: '2026-11-18', used: 1, rewardExtra: 0, rewardWatches: 0 }
    }
  })
}

function api(db, env) {
  return createMembershipApi({
    db,
    xpay,
    env: env || PAY_ENV,
    nowMs: NOW,
    openid: 'oTEST',
    sessionKey: SESSION_KEY
  })
}

describe('createOrder', () => {
  it('writes a created order and returns virtual pay params', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await api(db).createOrder('user-1', 'month')
    assert.equal(res.ok, true)
    assert.equal(res.payFen, 99)
    assert.equal(typeof res.orderId, 'string')
    assert.ok(res.orderId.length >= 8 && res.orderId.length <= 32)
    assert.match(res.orderId, /^[A-Za-z0-9_\-|*@]+$/)
    assert.equal(res.orderId.startsWith('_'), false)
    assert.equal(res.payment.mode, 'short_series_goods')
    assert.equal(typeof res.payment.signData, 'string')
    assert.equal(typeof res.payment.paySig, 'string')
    assert.equal(typeof res.payment.signature, 'string')

    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get())
      .data
    assert.equal(orders.length, 1)
    assert.equal(orders[0].status, 'created')
    assert.equal(orders[0].sku, 'month')
    assert.equal(orders[0].amountFen, 99)
    assert.equal(orders[0].isFirstPurchase, true)
    assert.equal(orders[0].productId, SKUS.month.productIdFirst)
    assert.equal(orders[0].orderId, res.orderId)

    const memberships = (await db.collection('memberships').where({ uid: 'user-1' }).get())
      .data
    assert.equal(memberships.length, 0)
  })

  it('returns PAY_NOT_CONFIGURED without writing an order when keys are missing', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await api(db, {}).createOrder('user-1', 'month')
    assert.deepEqual(res, { ok: false, error: 'PAY_NOT_CONFIGURED' })
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get())
      .data
    assert.equal(orders.length, 0)
  })

  it('rejects an unknown sku', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await api(db).createOrder('user-1', 'week')
    assert.deepEqual(res, { ok: false, error: 'BAD_SKU' })
  })

  it('reuses the pending created order for the same uid+sku instead of duplicating', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const first = await api(db).createOrder('user-1', 'month')
    const second = await api(db).createOrder('user-1', 'month')
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.equal(second.orderId, first.orderId)
    assert.equal(second.reused, true)
    assert.equal(second.payFen, 99)
    assert.equal(second.productId, 'vip_month_first')
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get()).data
    const created = orders.filter((o) => o.status === 'created')
    assert.equal(created.length, 1)
    assert.equal(created[0].orderId, first.orderId)
  })

  it('closes a stale first-purchase pending when the sku must use list price', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await db.collection('membership_orders').add({
      data: {
        orderId: 'm-stale-first',
        uid: 'user-1',
        sku: 'month',
        amountFen: 99,
        isFirstPurchase: true,
        productId: 'vip_month_first',
        status: 'created',
        createdAt: new Date(NOW - 5000).toISOString()
      }
    })
    await db.collection('membership_orders').add({
      data: {
        orderId: 'm-paid-month',
        uid: 'user-1',
        sku: 'month',
        amountFen: 99,
        isFirstPurchase: true,
        productId: 'vip_month_first',
        status: 'paid',
        createdAt: new Date(NOW - 4000).toISOString(),
        paidAt: new Date(NOW - 3000).toISOString()
      }
    })
    const res = await api(db).createOrder('user-1', 'month')
    assert.equal(res.ok, true)
    assert.equal(res.productId, 'vip_month')
    assert.equal(res.payFen, 660)
    const stale = (
      await db.collection('membership_orders').where({ orderId: 'm-stale-first' }).limit(1).get()
    ).data[0]
    assert.equal(stale.status, 'closed')
    assert.equal(stale.closedReason, 'SUPERSEDED')
    const created = (await db.collection('membership_orders').where({ uid: 'user-1' }).get()).data.filter(
      (o) => o.status === 'created'
    )
    assert.equal(created.length, 1)
    assert.equal(created[0].productId, 'vip_month')
  })

  it('after a paid month sku, createOrder uses list productId and list price', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await db.collection('membership_orders').add({
      data: {
        orderId: 'm-paid-month',
        uid: 'user-1',
        sku: 'month',
        amountFen: 99,
        isFirstPurchase: true,
        productId: 'vip_month_first',
        status: 'paid',
        createdAt: new Date(NOW - 1000).toISOString(),
        paidAt: new Date(NOW - 500).toISOString()
      }
    })
    const res = await api(db).createOrder('user-1', 'month')
    assert.equal(res.ok, true)
    assert.equal(res.payFen, 660)
    assert.equal(res.productId, SKUS.month.productIdList)
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get()).data
    const created = orders.filter((o) => o.status === 'created')
    assert.equal(created.length, 1)
    assert.equal(created[0].productId, 'vip_month')
    assert.equal(created[0].isFirstPurchase, false)
  })

  it('returns a clear error when sessionKey is empty and does not write an order', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await createMembershipApi({
      db,
      xpay,
      env: PAY_ENV,
      nowMs: NOW,
      openid: 'oTEST',
      sessionKey: ''
    }).createOrder('user-1', 'month')
    assert.equal(res.ok, false)
    assert.equal(res.error, 'NO_SESSION_KEY')
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get())
      .data
    assert.equal(orders.length, 0)
  })
})

describe('getStatus', () => {
  it('returns inactive membership, shanghai swap, and first-purchase offers', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await api(db).getStatus('user-1')
    assert.equal(res.ok, true)
    assert.equal(res.isMember, false)
    assert.equal(res.tier, null)
    assert.equal(res.expiresAt, null)
    assert.equal(res.expiresLabel, null)
    assert.deepEqual(res.swap, { used: 1, limit: 3, rewardExtra: 0 })
    assert.equal(res.noticeAckRequired, true)
    assert.equal(res.offers.length, 3)
    assert.equal(res.offers[0].sku, 'month')
    assert.equal(res.offers[0].payFen, 99)
    assert.equal(res.offers[0].isFirstPurchase, true)
  })
})

describe('push deliver notify', () => {
  it('rejects client callFunction spoof and does not fulfill', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const created = await api(db).createOrder('user-1', 'month')
    const res = await handleMain(
      { Event: 'xpay_goods_deliver_notify', OutTradeNo: created.orderId },
      { db, xpay, env: PAY_ENV, nowMs: NOW, wxContext: { OPENID: 'oUser' } }
    )
    assert.deepEqual(res, { ok: false, error: 'FORBIDDEN' })
    const paid = (
      await db.collection('membership_orders').where({ orderId: created.orderId }).limit(1).get()
    ).data[0]
    assert.equal(paid.status, 'created')
    const memberships = (await db.collection('memberships').where({ uid: 'user-1' }).get()).data
    assert.equal(memberships.length, 0)
  })

  it('fulfills OutTradeNo and always returns WeChat success shape', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const created = await api(db).createOrder('user-1', 'month')
    const event = {
      MsgType: 'event',
      Event: 'xpay_goods_deliver_notify',
      OutTradeNo: created.orderId,
      WeChatPayInfo: { TransactionId: 'wx_push_1' }
    }
    const first = await handleMain(event, {
      db,
      xpay,
      env: PAY_ENV,
      nowMs: NOW,
      wxContext: {}
    })
    assert.deepEqual(first, { ErrCode: 0, ErrMsg: 'success' })
    const paid = (
      await db.collection('membership_orders').where({ orderId: created.orderId }).limit(1).get()
    ).data[0]
    assert.equal(paid.status, 'paid')

    const again = await handleMain(event, {
      db,
      xpay,
      env: PAY_ENV,
      nowMs: NOW,
      wxContext: {}
    })
    assert.deepEqual(again, { ErrCode: 0, ErrMsg: 'success' })
  })

  it('still returns success when the order is missing', async () => {
    const db = createMemoryDb()
    const res = await handleMain(
      {
        MsgType: 'event',
        Event: 'xpay_goods_deliver_notify',
        OutTradeNo: 'missing-order'
      },
      { db, xpay, env: PAY_ENV, nowMs: NOW, wxContext: {} }
    )
    assert.deepEqual(res, { ErrCode: 0, ErrMsg: 'success' })
  })

  it('returns non-zero ErrCode when fulfill throws so WeChat retries', async () => {
    const db = {
      collection() {
        throw new Error('db unavailable')
      }
    }
    const res = await handleMain(
      {
        MsgType: 'event',
        Event: 'xpay_goods_deliver_notify',
        OutTradeNo: 'morder001abc'
      },
      { db, xpay, env: PAY_ENV, nowMs: NOW, wxContext: {} }
    )
    assert.notEqual(res.ErrCode, 0)
    assert.equal(typeof res.ErrCode, 'number')
  })
})

describe('devGrant', () => {
  it('is forbidden unless MEMBERSHIP_ALLOW_DEV_GRANT=1', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const denied = await api(db, PAY_ENV).devGrant('user-1', 'month')
    assert.deepEqual(denied, { ok: false, error: 'FORBIDDEN' })
    const allowed = await api(
      db,
      Object.assign({ MEMBERSHIP_ALLOW_DEV_GRANT: '1' }, PAY_ENV)
    ).devGrant('user-1', 'month')
    assert.equal(allowed.ok, true)
    assert.equal(allowed.membership.tier, 'month')
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get())
      .data
    assert.equal(orders.length, 1)
    assert.equal(orders[0].amountFen, 0)
    assert.equal(orders[0].dev, true)
    assert.equal(orders[0].status, 'paid')
  })
})
