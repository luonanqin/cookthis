'use strict'

const { getSku } = require('./membershipCatalog.js')
const { computeNewExpiry } = require('./membershipLogic.js')

function nowIso(nowMs) {
  return new Date(Number(nowMs)).toISOString()
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

async function upsertMembership(db, uid, sku, nowMs) {
  const item = getSku(sku)
  const days = item ? item.days : 0
  const tier = item ? item.tier : sku
  const existing = await loadMembership(db, uid)
  const expiresAt = computeNewExpiry(existing && existing.expiresAt, days, nowMs)
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

async function markFirstPurchaseUsed(db, uid, sku) {
  const user = await loadUser(db, uid)
  if (!user || !user._id || !getSku(sku)) return
  const used = Object.assign({}, user.firstPurchaseUsed || {}, { [sku]: true })
  await db.collection('users').doc(user._id).update({
    data: { firstPurchaseUsed: used }
  })
}

/**
 * Idempotent grant: created → paid + stack membership.
 * Already paid returns current membership without stacking again.
 */
async function fulfillPaidOrder({ db, orderId, wxPayment, nowMs }) {
  const ts = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const order = await loadOrder(db, orderId)
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' }
  if (order.status === 'paid') {
    const membership = await loadMembership(db, order.uid)
    return { ok: true, membership }
  }
  if (order.status !== 'created') {
    return { ok: false, error: 'BAD_ORDER_STATUS' }
  }

  const paidAt = nowIso(ts)
  const patch = { status: 'paid', paidAt }
  if (wxPayment != null) patch.wxPayment = wxPayment
  await db.collection('membership_orders').doc(order._id).update({ data: patch })

  const membership = await upsertMembership(db, order.uid, order.sku, ts)
  await markFirstPurchaseUsed(db, order.uid, order.sku)
  return { ok: true, membership }
}

module.exports = {
  fulfillPaidOrder,
  loadMembership,
  loadOrder
}
