'use strict'

const PAY_TTL_MS = 5 * 60 * 1000
const ORDER_LOCK_MS = 15 * 1000
const ORDERS_LIST_LIMIT = 5
const ORDER_CANCELLED_TOAST = '订单已取消，请重新下单'

function toMs(value) {
  if (value == null || value === '') return NaN
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const n = Date.parse(value)
  return Number.isFinite(n) ? n : NaN
}

function payExpiresAtIso(createdAtMs, nowMs) {
  const base = Number.isFinite(createdAtMs) ? createdAtMs : Number(nowMs) || Date.now()
  return new Date(base + PAY_TTL_MS).toISOString()
}

function resolvePayExpiresMs(order) {
  if (!order) return NaN
  const explicit = toMs(order.payExpiresAt)
  if (Number.isFinite(explicit)) return explicit
  const created = toMs(order.createdAt)
  if (Number.isFinite(created)) return created + PAY_TTL_MS
  return NaN
}

function isCreatedPayExpired(order, nowMs) {
  if (!order || order.status !== 'created') return false
  const exp = resolvePayExpiresMs(order)
  if (!Number.isFinite(exp)) return true
  return Number(nowMs) >= exp
}

function isActiveCreated(order, nowMs) {
  return !!(order && order.status === 'created' && !isCreatedPayExpired(order, nowMs))
}

/** 列表：有效未支付 + paid，排除 closed/过期；按 createdAt 倒序最多 5 */
function selectOrdersForDisplay(rows, nowMs, limit) {
  const cap = limit == null ? ORDERS_LIST_LIMIT : limit
  const list = Array.isArray(rows) ? rows.slice() : []
  list.sort((a, b) => {
    const am = toMs(a && a.createdAt) || 0
    const bm = toMs(b && b.createdAt) || 0
    return bm - am
  })
  const out = []
  for (const row of list) {
    if (!row) continue
    if (row.status === 'paid') {
      out.push(row)
    } else if (isActiveCreated(row, nowMs)) {
      out.push(row)
    }
    if (out.length >= cap) break
  }
  return out
}

function remainMs(order, nowMs) {
  const exp = resolvePayExpiresMs(order)
  if (!Number.isFinite(exp)) return 0
  return Math.max(0, exp - Number(nowMs))
}

module.exports = {
  PAY_TTL_MS,
  ORDER_LOCK_MS,
  ORDERS_LIST_LIMIT,
  ORDER_CANCELLED_TOAST,
  toMs,
  payExpiresAtIso,
  resolvePayExpiresMs,
  isCreatedPayExpired,
  isActiveCreated,
  selectOrdersForDisplay,
  remainMs
}
