'use strict'

const { getSku } = require('./membershipCatalog.js')
const { computeNewExpiry, isFirstPurchaseProduct } = require('./membershipLogic.js')

function nowIso(nowMs) {
  return new Date(Number(nowMs)).toISOString()
}

function toExpiryMs(value) {
  if (value == null || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function membershipCoversExpected(membership, expectedExpiresAt) {
  if (!membership) return false
  const expected = toExpiryMs(expectedExpiresAt)
  if (!Number.isFinite(expected)) return true
  const actual = toExpiryMs(membership.expiresAt)
  return Number.isFinite(actual) && actual >= expected
}

async function loadOrder(db, orderId) {
  const res = await db
    .collection('membership_orders')
    .where({ orderId })
    .limit(1)
    .get()
  return (res.data && res.data[0]) || null
}

async function loadMembership(db, uid) {
  const res = await db.collection('memberships').where({ uid }).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function loadUser(db, uid) {
  const res = await db.collection('users').where({ uid }).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function upsertMembership(db, uid, sku, nowMs, targetExpiresAt) {
  const item = getSku(sku)
  const days = item ? item.days : 0
  const tier = item ? item.tier : sku
  const existing = await loadMembership(db, uid)
  const expiresAt = targetExpiresAt || computeNewExpiry(existing && existing.expiresAt, days, nowMs)
  if (membershipCoversExpected(existing, expiresAt)) return existing
  const updatedAt = nowIso(nowMs)
  const startsAt = (existing && existing.startsAt) || nowIso(nowMs)
  const row = { uid, tier, startsAt, expiresAt, updatedAt }
  if (existing && existing._id) {
    await db.collection('memberships').doc(existing._id).update({ data: row })
    return Object.assign({}, existing, row)
  }
  const addRes = await db.collection('memberships').add({ data: row })
  return Object.assign({ _id: addRes._id }, row)
}

async function ensureMembershipGranted(db, order, nowMs) {
  const membership = await loadMembership(db, order.uid)
  if (membershipCoversExpected(membership, order.expectedExpiresAt)) {
    return { ok: true, membership }
  }
  const grantNow = toExpiryMs(order.paidAt) || nowMs
  const granted = await upsertMembership(
    db,
    order.uid,
    order.sku,
    grantNow,
    order.expectedExpiresAt
  )
  await markFirstPurchaseUsed(db, order.uid, order.sku)
  return { ok: true, membership: granted }
}

async function markFirstPurchaseUsed(db, uid, sku) {
  const user = await loadUser(db, uid)
  if (!user || !user._id || !getSku(sku)) return
  const used = Object.assign({}, user.firstPurchaseUsed || {}, { [sku]: true })
  await db.collection('users').doc(user._id).update({
    data: { firstPurchaseUsed: used }
  })
}

/** 同档是否已有其它已支付订单（任意价都算用过该档首购资格） */
async function hasOtherPaidSkuOrder(db, uid, sku, excludeOrderId) {
  const res = await db
    .collection('membership_orders')
    .where({ uid, sku, status: 'paid' })
    .limit(20)
    .get()
  for (const row of res.data || []) {
    if (!row) continue
    if (excludeOrderId && row.orderId === excludeOrderId) continue
    return true
  }
  return false
}

async function closeOrderFirstPurchaseUsed(db, orderId) {
  await db
    .collection('membership_orders')
    .where({ orderId, status: 'created' })
    .update({
      data: {
        status: 'closed',
        closedReason: 'FIRST_PURCHASE_USED',
        closedAt: new Date().toISOString()
      }
    })
}

/**
 * Idempotent grant: created → paid + stack membership.
 * Claims the order with a conditional update (orderId + status=='created') and
 * stores expectedExpiresAt. Paid retries (including lost CAS) still grant if
 * membership is missing or short of that expiry, without restacking.
 */
async function fulfillPaidOrder({ db, orderId, wxPayment, nowMs }) {
  const ts = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const order = await loadOrder(db, orderId)
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' }
  if (order.status === 'paid') {
    return ensureMembershipGranted(db, order, ts)
  }
  if (order.status !== 'created') {
    return { ok: false, error: 'BAD_ORDER_STATUS' }
  }

  const item = getSku(order.sku)
  if (
    isFirstPurchaseProduct(order.sku, order.productId) &&
    (await hasOtherPaidSkuOrder(db, order.uid, order.sku, order.orderId))
  ) {
    await closeOrderFirstPurchaseUsed(db, order.orderId)
    return { ok: false, error: 'FIRST_PURCHASE_USED' }
  }

  const existing = await loadMembership(db, order.uid)
  const days = item ? item.days : 0
  const expectedExpiresAt = computeNewExpiry(existing && existing.expiresAt, days, ts)
  const paidAt = nowIso(ts)
  const patch = { status: 'paid', paidAt, expectedExpiresAt }
  if (wxPayment != null) patch.wxPayment = wxPayment
  const claimed = await db
    .collection('membership_orders')
    .where({ orderId, status: 'created' })
    .update({ data: patch })
  const updated = claimed && claimed.stats ? claimed.stats.updated : 0
  if (updated !== 1) {
    const latest = await loadOrder(db, orderId)
    if (latest && latest.status === 'paid') {
      return ensureMembershipGranted(db, latest, ts)
    }
    const membership = await loadMembership(db, order.uid)
    return { ok: true, membership }
  }

  return ensureMembershipGranted(
    db,
    Object.assign({}, order, { status: 'paid', paidAt, expectedExpiresAt }),
    ts
  )
}

module.exports = {
  fulfillPaidOrder,
  loadMembership,
  loadOrder
}
