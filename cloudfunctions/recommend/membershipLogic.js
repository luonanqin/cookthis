'use strict'

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

/** 账号级首购：任一档付过费（或标记 any）后，所有档均不再享首购价 */
function hasUsedFirstPurchase(firstPurchaseUsedMap) {
  if (!firstPurchaseUsedMap || typeof firstPurchaseUsedMap !== 'object') return false
  if (firstPurchaseUsedMap.any === true || firstPurchaseUsedMap.used === true) return true
  return !!(
    firstPurchaseUsedMap.month ||
    firstPurchaseUsedMap.quarter ||
    firstPurchaseUsedMap.year
  )
}

function isFirstPurchaseOpen(_sku, firstPurchaseUsedMap) {
  return !hasUsedFirstPurchase(firstPurchaseUsedMap)
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

function isFirstPurchaseProduct(sku, productId) {
  const item = getSku(sku)
  if (!item || productId == null || productId === '') return false
  return String(productId) === item.productIdFirst
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
  if (!(paidSkuSet instanceof Set)) return {}
  for (const sku of paidSkuSet) {
    if (getSku(sku)) return { any: true }
  }
  return {}
}

module.exports = {
  isMemberActive,
  computeNewExpiry,
  hasUsedFirstPurchase,
  resolvePriceFen,
  resolveProductId,
  isFirstPurchaseProduct,
  buildSkuOffer,
  firstPurchaseUsedFromOrders
}
