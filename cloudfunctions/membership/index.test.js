'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryDb } = require('./fakeDb.js')
const { createMembershipApi, handleMain } = require('./index.js')
const xpay = require('./xpay.js')
const { SKUS } = require('./membershipCatalog.js')
const { computeNewExpiry } = require('./membershipLogic.js')

const NOW = Date.parse('2026-11-18T04:00:00.000Z')
const DAY_MS = 86400000
const SESSION_KEY = '9hAb/NEYUlkaMBEsmFgzig=='
const PAY_ENV = {
  XPAY_OFFER_ID: '123',
  XPAY_APP_KEY: '12345',
  XPAY_ENV: '0'
}
const DEV_ENV = Object.assign({ MEMBERSHIP_ALLOW_DEV_GRANT: '1' }, PAY_ENV)

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

  it('returns PENDING_OTHER_SKU when another tier is unpaid; replacePending closes and creates', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const month = await api(db).createOrder('user-1', 'month')
    assert.equal(month.ok, true)
    const blocked = await api(db).createOrder('user-1', 'quarter')
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'PENDING_OTHER_SKU')
    assert.equal(blocked.pending.sku, 'month')
    const replaced = await api(db).createOrder('user-1', 'quarter', { replacePending: true })
    assert.equal(replaced.ok, true)
    assert.equal(replaced.productId, 'vip_quarter_first')
    const monthRow = (
      await db.collection('membership_orders').where({ orderId: month.orderId }).limit(1).get()
    ).data[0]
    assert.equal(monthRow.status, 'closed')
    assert.equal(monthRow.closedReason, 'SUPERSEDED')
  })

  it('cancelOrder and payOrder reject expired orders with ORDER_EXPIRED', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const created = await api(db).createOrder('user-1', 'month')
    const late = createMembershipApi({
      db,
      xpay,
      env: PAY_ENV,
      nowMs: NOW + 6 * 60 * 1000,
      openid: 'oTEST',
      sessionKey: SESSION_KEY
    })
    const cancelled = await late.cancelOrder('user-1', created.orderId)
    assert.equal(cancelled.ok, false)
    assert.equal(cancelled.error, 'ORDER_EXPIRED')
    const pay = await late.payOrder('user-1', created.orderId)
    assert.equal(pay.ok, false)
    assert.equal(pay.error, 'ORDER_EXPIRED')
    const row = (
      await db.collection('membership_orders').where({ orderId: created.orderId }).limit(1).get()
    ).data[0]
    assert.equal(row.status, 'closed')
    assert.equal(row.closedReason, 'EXPIRED')
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

  it('after a paid month sku, quarter also uses list price (account-wide first purchase)', async () => {
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
    const status = await api(db).getStatus('user-1')
    const quarter = status.offers.find((o) => o.sku === 'quarter')
    assert.equal(quarter.isFirstPurchase, false)
    assert.equal(quarter.payFen, 1660)
    const res = await api(db).createOrder('user-1', 'quarter')
    assert.equal(res.ok, true)
    assert.equal(res.payFen, 1660)
    assert.equal(res.productId, SKUS.quarter.productIdList)
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
    assert.equal(res.dailyMealCustomUnlockDay, null)
    assert.deepEqual(res.swap, { used: 1, limit: 3, rewardExtra: 0 })
    assert.equal(res.noticeAckRequired, true)
    assert.equal(res.offers.length, 3)
    assert.equal(res.offers[0].sku, 'month')
    assert.equal(res.offers[0].payFen, 99)
    assert.equal(res.offers[0].isFirstPurchase, true)
  })
})

describe('unlockDailyMealCustom', () => {
  it('writes Shanghai day key onto the user', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const { dayKeyChina } = require('./swapQuota.js')
    const res = await api(db).unlockDailyMealCustom('user-1')
    assert.equal(res.ok, true)
    assert.equal(res.dailyMealCustomUnlockDay, dayKeyChina(NOW))
    const user = (await db.collection('users').where({ uid: 'user-1' }).limit(1).get()).data[0]
    assert.equal(user.dailyMealCustomUnlockDay, dayKeyChina(NOW))
  })

  it('clearDailyMealCustomUnlock clears the day mark', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await api(db).unlockDailyMealCustom('user-1')
    const cleared = await api(db).clearDailyMealCustomUnlock('user-1')
    assert.equal(cleared.ok, true)
    assert.equal(cleared.dailyMealCustomUnlockDay, null)
    const user = (await db.collection('users').where({ uid: 'user-1' }).limit(1).get()).data[0]
    assert.equal(user.dailyMealCustomUnlockDay, null)
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

describe('dev tools', () => {
  it('devGrant is forbidden unless MEMBERSHIP_ALLOW_DEV_GRANT=1', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const denied = await api(db, PAY_ENV).devGrant('user-1', 'month')
    assert.deepEqual(denied, { ok: false, error: 'FORBIDDEN' })
    const allowed = await api(db, DEV_ENV).devGrant('user-1', 'month')
    assert.equal(allowed.ok, true)
    assert.equal(allowed.isMember, true)
    assert.equal(allowed.tier, 'month')
    const orders = (await db.collection('membership_orders').where({ uid: 'user-1' }).get())
      .data
    assert.equal(orders.length, 1)
    assert.equal(orders[0].amountFen, SKUS.month.firstFen)
    assert.equal(orders[0].dev, true)
    assert.equal(orders[0].status, 'paid')
  })

  it('devGrant stacks month on month from previous expiry', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const first = await api(db, DEV_ENV).devGrant('user-1', 'month')
    assert.equal(first.ok, true)
    const second = await api(db, DEV_ENV).devGrant('user-1', 'month')
    assert.equal(second.ok, true)
    assert.equal(second.expiresAt, computeNewExpiry(first.expiresAt, 31, NOW))
  })

  it('devClear expires membership and forbids without flag', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await api(db, DEV_ENV).devGrant('user-1', 'month')
    assert.deepEqual(await api(db, PAY_ENV).devClear('user-1'), {
      ok: false,
      error: 'FORBIDDEN'
    })
    const cleared = await api(db, DEV_ENV).devClear('user-1')
    assert.equal(cleared.ok, true)
    assert.equal(cleared.isMember, false)
  })

  it('devExpireSoon sets ~1 day and grants month first if needed', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    assert.deepEqual(await api(db, PAY_ENV).devExpireSoon('user-1'), {
      ok: false,
      error: 'FORBIDDEN'
    })
    const res = await api(db, DEV_ENV).devExpireSoon('user-1')
    assert.equal(res.ok, true)
    assert.equal(res.isMember, true)
    assert.equal(Date.parse(res.expiresAt), NOW + DAY_MS)
  })

  it('devResetFirstPurchase restores first-buy offers', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await api(db, DEV_ENV).devGrant('user-1', 'month')
    const before = await api(db, DEV_ENV).getStatus('user-1')
    assert.equal(before.offers.find((o) => o.sku === 'month').isFirstPurchase, false)
    assert.deepEqual(await api(db, PAY_ENV).devResetFirstPurchase('user-1'), {
      ok: false,
      error: 'FORBIDDEN'
    })
    const after = await api(db, DEV_ENV).devResetFirstPurchase('user-1')
    assert.equal(after.ok, true)
    assert.equal(after.offers.find((o) => o.sku === 'month').isFirstPurchase, true)
    const paid = (
      await db.collection('membership_orders').where({ uid: 'user-1', status: 'paid' }).get()
    ).data
    assert.ok(paid.length >= 1)
    assert.ok(paid.every((o) => o.ignoreForFirstPurchase === true))
  })

  it('devResetFirstPurchase succeeds with no paid orders', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    const res = await api(db, DEV_ENV).devResetFirstPurchase('user-1')
    assert.equal(res.ok, true)
    assert.equal(res.offers.find((o) => o.sku === 'month').isFirstPurchase, true)
  })

  it('devClearOrders removes history and restores first-purchase; keeps membership', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await api(db, DEV_ENV).devGrant('user-1', 'month')
    const before = await api(db, DEV_ENV).getStatus('user-1')
    assert.equal(before.isMember, true)
    assert.ok((before.orders || []).length >= 1)
    assert.equal(before.offers.find((o) => o.sku === 'month').isFirstPurchase, false)
    assert.deepEqual(await api(db, PAY_ENV).devClearOrders('user-1'), {
      ok: false,
      error: 'FORBIDDEN'
    })
    const after = await api(db, DEV_ENV).devClearOrders('user-1')
    assert.equal(after.ok, true)
    assert.equal(after.isMember, true)
    assert.equal((after.orders || []).length, 0)
    assert.equal(after.offers.find((o) => o.sku === 'month').isFirstPurchase, true)
    const left = (await db.collection('membership_orders').where({ uid: 'user-1' }).get()).data
    assert.equal(left.length, 0)
  })

  it('devCreatePending inserts a short-lived unpaid order', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    assert.deepEqual(await api(db, PAY_ENV).devCreatePending('user-1', 'month'), {
      ok: false,
      error: 'FORBIDDEN'
    })
    const res = await api(db, DEV_ENV).devCreatePending('user-1', 'quarter')
    assert.equal(res.ok, true)
    const pending = (res.orders || []).find((o) => o.status === 'created' && o.canPay)
    assert.ok(pending)
    assert.equal(pending.sku, 'quarter')
    assert.ok(pending.remainMs > 0 && pending.remainMs <= 20 * 1000)
  })

  it('devGrant refuses while an unpaid order is active', async () => {
    const db = createMemoryDb()
    await seedUser(db)
    await api(db, DEV_ENV).devCreatePending('user-1', 'month')
    const denied = await api(db, DEV_ENV).devGrant('user-1', 'month')
    assert.deepEqual(denied, { ok: false, error: 'PENDING_ORDER_EXISTS' })
  })
})
