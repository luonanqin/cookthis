'use strict'

const { callCloud } = require('./cloud.js')

/**
 * 会员购买 / 入口总开关。
 * - true：首页 VIP、「我的」会员态、推荐页开通入口、会员页可见（当前便于联调）
 * - false：上述 UI 全部隐藏；软限仍可生效但不展示「开通会员」导流
 * 广告位走 utils/ads.js，与本开关无关。
 * 积累用户后正式开放时改为 true 即可（见 README Slice 18）。
 */
const MEMBERSHIP_ENABLED = true

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

function memberStatusLabel(status) {
  if (status && status.isMember) {
    const exp = status.expiresLabel ? String(status.expiresLabel) : ''
    return exp ? '会员至 ' + exp : '会员至'
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
  devGrant,
  devClear,
  devExpireSoon,
  devResetFirstPurchase,
  memberStatusLabel,
  getMembershipLite,
  setMembershipLite
}
