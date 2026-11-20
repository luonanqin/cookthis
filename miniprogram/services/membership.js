'use strict'

const { callCloud } = require('./cloud.js')

/**
 * 会员购买 / 入口总开关（发版形态见 doc/分支与发布约定.md）。
 * - false：无会员先上——隐藏 VIP / 「我的」会员态 / 会员页 / 「开通会员」导流；
 *   换菜日限、菜数软限仍可生效。
 * - true：开放购买与会员 UI（联调或正式卖会员时打开）。
 * 广告位走 utils/ads.js（ADS_ENABLED），与本开关无关。
 * 当前联调为 true；上线前若暂不卖会员改回 false。
 */
const MEMBERSHIP_ENABLED = true

/** 页面 onShow 等：缓存未过期则不再打 getStatus */
const MEMBERSHIP_SOFT_TTL_MS = 15 * 60 * 1000

const STORAGE_KEY = 'cookthis_membership_lite'

let membershipLite = null
let ensureInflight = null

function readStorage() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch (e) {
    return null
  }
}

function writeStorage(lite) {
  try {
    if (!lite) {
      wx.removeStorageSync(STORAGE_KEY)
      return
    }
    wx.setStorageSync(STORAGE_KEY, lite)
  } catch (e) {}
}

function toExpiresMs(expiresAt) {
  if (expiresAt == null || expiresAt === '') return NaN
  if (typeof expiresAt === 'number') return expiresAt
  const parsed = Date.parse(expiresAt)
  return Number.isFinite(parsed) ? parsed : NaN
}

function normalizeLite(status, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const expiresAt =
    status.expiresAt != null && status.expiresAt !== ''
      ? String(status.expiresAt)
      : null
  const expiresMs = toExpiresMs(expiresAt)
  let isMember
  if (Number.isFinite(expiresMs)) {
    isMember = expiresMs > now
  } else {
    isMember = !!status.isMember
  }
  const updatedAt = Number.isFinite(Number(status.updatedAt))
    ? Number(status.updatedAt)
    : now
  return {
    isMember,
    expiresAt,
    expiresLabel: status.expiresLabel ? String(status.expiresLabel) : '',
    updatedAt,
    dailyMealCustomUnlockDay: status.dailyMealCustomUnlockDay
      ? String(status.dailyMealCustomUnlockDay)
      : null
  }
}

function refreshLiteActive(lite, nowMs) {
  if (!lite) return null
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const expiresMs = toExpiresMs(lite.expiresAt)
  if (!Number.isFinite(expiresMs)) return lite
  const isMember = expiresMs > now
  if (isMember === !!lite.isMember) return lite
  const next = Object.assign({}, lite, { isMember })
  membershipLite = next
  writeStorage(next)
  return next
}

function getStatus() {
  return callCloud('membership', { action: 'getStatus' })
}

function createOrder(sku, opts) {
  const data = { action: 'createOrder', sku }
  if (opts && opts.replacePending) data.replacePending = true
  return callCloud('membership', data)
}

function payOrder(orderId) {
  return callCloud('membership', { action: 'payOrder', orderId })
}

function cancelOrder(orderId) {
  return callCloud('membership', { action: 'cancelOrder', orderId })
}

function refresh() {
  return callCloud('membership', { action: 'refresh' })
}

function unlockDailyMealCustom() {
  // used by confirm「更多」餐解锁；改动此文件后请重新编译小程序
  return callCloud('membership', { action: 'unlockDailyMealCustom' })
}

function clearDailyMealCustomUnlock() {
  return callCloud('membership', { action: 'clearDailyMealCustomUnlock' })
}

function devGrant(sku) {
  return callCloud('membership', { action: 'devGrant', sku })
}

function devClear() {
  return callCloud('membership', { action: 'devClear' })
}

function devExpireSoon() {
  return callCloud('membership', { action: 'devExpireSoon' })
}

function devResetFirstPurchase() {
  return callCloud('membership', { action: 'devResetFirstPurchase' })
}

function devClearOrders() {
  return callCloud('membership', { action: 'devClearOrders' })
}

function devCreatePending(sku) {
  return callCloud('membership', { action: 'devCreatePending', sku })
}

function memberStatusLabel(status) {
  if (status && status.isMember) {
    const exp = status.expiresLabel ? String(status.expiresLabel) : ''
    return exp ? '会员于' + exp + '到期' : '会员已开通'
  }
  return '未开通会员'
}

function getMembershipLite(nowMs) {
  if (!membershipLite) membershipLite = readStorage()
  if (!membershipLite) return null
  return refreshLiteActive(membershipLite, nowMs)
}

function setMembershipLite(status, nowMs) {
  if (!status || typeof status !== 'object') {
    membershipLite = null
    writeStorage(null)
    return null
  }
  const lite = normalizeLite(status, nowMs)
  membershipLite = lite
  writeStorage(lite)
  return lite
}

function isCacheFresh(ttlMs, nowMs) {
  const lite = getMembershipLite(nowMs)
  if (!lite || !Number.isFinite(Number(lite.updatedAt))) return false
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const ttl = Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : MEMBERSHIP_SOFT_TTL_MS
  return now - Number(lite.updatedAt) < ttl
}

/**
 * 登录后 / 页面 onShow：有新鲜本地缓存则直接用；否则拉一次 getStatus 写入缓存。
 * force: 门槛纠偏、支付后对齐失败时强制查库。
 */
function ensureMembershipStatus(opts) {
  const options = opts || {}
  if (!MEMBERSHIP_ENABLED) {
    return Promise.resolve(getMembershipLite(options.nowMs))
  }
  const force = !!options.force
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
  const ttlMs = Number.isFinite(Number(options.ttlMs))
    ? Number(options.ttlMs)
    : MEMBERSHIP_SOFT_TTL_MS

  if (!force && isCacheFresh(ttlMs, nowMs)) {
    return Promise.resolve(getMembershipLite(nowMs))
  }

  if (ensureInflight) return ensureInflight

  ensureInflight = getStatus()
    .then((res) => {
      setMembershipLite(res, nowMs)
      return res
    })
    .finally(() => {
      ensureInflight = null
    })
  return ensureInflight
}

module.exports = {
  MEMBERSHIP_ENABLED,
  MEMBERSHIP_SOFT_TTL_MS,
  getStatus,
  createOrder,
  payOrder,
  cancelOrder,
  refresh,
  unlockDailyMealCustom,
  clearDailyMealCustomUnlock,
  devGrant,
  devClear,
  devExpireSoon,
  devResetFirstPurchase,
  devClearOrders,
  devCreatePending,
  memberStatusLabel,
  getMembershipLite,
  setMembershipLite,
  ensureMembershipStatus,
  isCacheFresh
}
