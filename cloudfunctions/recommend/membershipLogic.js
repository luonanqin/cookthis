'use strict'
// Vendored: keep in sync with cloudfunctions/_shared/membershipLogic.js

const { getSku, formatYuanFromFen } = require('./membershipCatalog.js')

const DAY_MS = 86400000

function toEpochMs(value) {
  if (value == null || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Date.parse(value)
  return NaN
}

function isMemberActive(membership, nowMs) {
  if (!membership) return false
  const exp = toEpochMs(membership.expiresAt)
  const now = Number(nowMs)
  if (!Number.isFinite(exp) || !Number.isFinite(now)) return false
  return exp > now
}

function computeNewExpiry(prevExpiresAt, days, nowMs) {
  const now = Number(nowMs)
  const prev = toEpochMs(prevExpiresAt)
  const base = Number.isFinite(prev) ? Math.max(now, prev) : now
  return new Date(base + Number(days) * DAY_MS).toISOString()
}

function isFirstPurchaseOpen(sku, firstPurchaseUsedMap) {
  return !(firstPurchaseUsedMap && firstPurchaseUsedMap[sku])
}

function resolvePriceFen(sku, firstPurchaseUsedMap) {
  const item = getSku(sku)
  if (!item) return null
  return isFirstPurchaseOpen(sku, firstPurchaseUsedMap) ? item.firstFen : item.listFen
}

/** 首购走 productIdFirst，复购走 productIdList（各对应米大师固定标价道具） */
function resolveProductId(sku, firstPurchaseUsedMap) {
  const item = getSku(sku)
  if (!item) return null
  return isFirstPurchaseOpen(sku, firstPurchaseUsedMap)
    ? item.productIdFirst
    : item.productIdList
}

function buildSkuOffer(sku, firstPurchaseUsedMap) {
  const item = getSku(sku)
  if (!item) return null
  const isFirst = isFirstPurchaseOpen(sku, firstPurchaseUsedMap)
  const payFen = resolvePriceFen(sku, firstPurchaseUsedMap)
  return {
    sku,
    listFen: item.listFen,
    payFen,
    isFirstPurchase: isFirst,
    productId: resolveProductId(sku, firstPurchaseUsedMap),
    labelYuan: formatYuanFromFen(payFen),
    listYuan: formatYuanFromFen(item.listFen)
  }
}

function firstPurchaseUsedFromOrders(paidSkuSet) {
  const used = {}
  if (!(paidSkuSet instanceof Set)) return used
  for (const sku of paidSkuSet) {
    if (getSku(sku)) used[sku] = true
  }
  return used
}

module.exports = {
  isMemberActive,
  computeNewExpiry,
  resolvePriceFen,
  resolveProductId,
  buildSkuOffer,
  firstPurchaseUsedFromOrders
}
