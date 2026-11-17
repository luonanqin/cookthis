'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createMemoryDb } = require('./fakeDb.js')
const { fulfillPaidOrder } = require('./fulfill.js')
const { computeNewExpiry } = require('./membershipLogic.js')

const NOW = Date.parse('2026-11-18T04:00:00.000Z')
const DAY_MS = 86400000

async function seedCreatedOrder(db, extra) {
  const userAdd = await db.collection('users').add({
    data: { uid: 'user-1', firstPurchaseUsed: {}, swapDaily: null }
  })
  const order = Object.assign(
    {
      orderId: 'morder001abc',
      uid: 'user-1',
      sku: 'month',
      amountFen: 99,
      isFirstPurchase: true,
      productId: 'vip_month',
      status: 'created',
      createdAt: new Date(NOW - 1000).toISOString()
    },
    extra || {}
  )
  const orderAdd = await db.collection('membership_orders').add({ data: order })
  return { userId: userAdd._id, orderId: order.orderId, docId: orderAdd._id }
}

describe('fulfillPaidOrder', () => {
  it('grants membership from a created order and is idempotent on a second call', async () => {
    const db = createMemoryDb()
    const { orderId } = await seedCreatedOrder(db)
    const wxPayment = { TransactionId: 'wx_txn_1' }

    const first = await fulfillPaidOrder({
      db,
      orderId,
      wxPayment,
      nowMs: NOW
    })
    assert.equal(first.ok, true)
    const expectedExpiry = computeNewExpiry(null, 31, NOW)
    assert.equal(first.membership.uid, 'user-1')
    assert.equal(first.membership.tier, 'month')
    assert.equal(first.membership.expiresAt, expectedExpiry)

    const paid = (await db.collection('membership_orders').where({ orderId }).limit(1).get())
      .data[0]
    assert.equal(paid.status, 'paid')
    assert.equal(paid.wxPayment.TransactionId, 'wx_txn_1')
    assert.ok(paid.paidAt)

    const user = (await db.collection('users').where({ uid: 'user-1' }).limit(1).get()).data[0]
    assert.equal(user.firstPurchaseUsed.month, true)

    const second = await fulfillPaidOrder({
      db,
      orderId,
      wxPayment,
      nowMs: NOW + DAY_MS
    })
    assert.equal(second.ok, true)
    assert.equal(second.membership.expiresAt, expectedExpiry)

    const memberships = await db.collection('memberships').where({ uid: 'user-1' }).get()
    assert.equal(memberships.data.length, 1)
    assert.equal(memberships.data[0].expiresAt, expectedExpiry)
  })

  it('stacks a later paid sku on max(now, previous expiry)', async () => {
    const db = createMemoryDb()
    await seedCreatedOrder(db)
    await fulfillPaidOrder({ db, orderId: 'morder001abc', nowMs: NOW })

    await db.collection('membership_orders').add({
      data: {
        orderId: 'morder002xyz',
        uid: 'user-1',
        sku: 'quarter',
        amountFen: 1660,
        isFirstPurchase: true,
        productId: 'vip_quarter',
        status: 'created',
        createdAt: new Date(NOW + 1000).toISOString()
      }
    })
    const stacked = await fulfillPaidOrder({
      db,
      orderId: 'morder002xyz',
      nowMs: NOW
    })
    assert.equal(stacked.ok, true)
    const monthExpiry = computeNewExpiry(null, 31, NOW)
    assert.equal(stacked.membership.expiresAt, computeNewExpiry(monthExpiry, 93, NOW))
    assert.equal(stacked.membership.tier, 'quarter')
  })

  it('rejects non-created unpaid orders and missing orders', async () => {
    const db = createMemoryDb()
    await seedCreatedOrder(db, { status: 'closed' })
    const closed = await fulfillPaidOrder({ db, orderId: 'morder001abc', nowMs: NOW })
    assert.equal(closed.ok, false)
    assert.equal(closed.error, 'BAD_ORDER_STATUS')

    const missing = await fulfillPaidOrder({ db, orderId: 'does-not-exist', nowMs: NOW })
    assert.equal(missing.ok, false)
    assert.equal(missing.error, 'ORDER_NOT_FOUND')
  })
})
