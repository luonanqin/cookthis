'use strict'

const { callCloud } = require('./cloud.js')

function getStatus() {
  return callCloud('membership', { action: 'getStatus' })
}

function createOrder(sku) {
  return callCloud('membership', { action: 'createOrder', sku })
}

function refresh() {
  return callCloud('membership', { action: 'refresh' })
}

module.exports = { getStatus, createOrder, refresh }
