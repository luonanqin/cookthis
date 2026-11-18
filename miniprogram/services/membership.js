'use strict'

const { callCloud } = require('./cloud.js')

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
  getStatus,
  createOrder,
  payOrder,
  cancelOrder,
  refresh,
  memberStatusLabel,
  getMembershipLite,
  setMembershipLite
}
