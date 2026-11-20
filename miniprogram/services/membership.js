'use strict'

const { callCloud } = require('./cloud.js')

/**
 * 会员购买 / 入口总开关（发版形态见 doc/分支与发布约定.md）。
 * - false（默认）：无会员先上——隐藏 VIP / 「我的」会员态 / 会员页 / 「开通会员」导流；
 *   换菜日限、菜数软限仍可生效。
 * - true：开放购买与会员 UI（联调或正式卖会员时打开）。
 * 广告位走 utils/ads.js（ADS_ENABLED），与本开关无关。
 */
const MEMBERSHIP_ENABLED = false

let membershipLite = null

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

function getMembershipLite() {
  return membershipLite
}

function setMembershipLite(status) {
  if (!status || typeof status !== 'object') {
    membershipLite = null
    return null
  }
  membershipLite = {
    isMember: !!status.isMember,
    expiresLabel: status.expiresLabel || ''
  }
  return membershipLite
}

module.exports = {
  MEMBERSHIP_ENABLED,
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
  setMembershipLite
}
