'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  PAY_TTL_MS,
  payExpiresAtIso,
  isCreatedPayExpired,
  isActiveCreated,
  selectOrdersForDisplay,
  remainMs
} = require('./orderLifecycle.js')

const NOW = Date.parse('2026-11-18T04:00:00.000Z')

describe('orderLifecycle', () => {
  it('marks created orders expired after pay TTL', () => {
    const order = {
      status: 'created',
      createdAt: new Date(NOW).toISOString(),
      payExpiresAt: payExpiresAtIso(NOW, NOW)
    }
    assert.equal(isCreatedPayExpired(order, NOW + PAY_TTL_MS - 1), false)
    assert.equal(isActiveCreated(order, NOW + PAY_TTL_MS - 1), true)
    assert.equal(isCreatedPayExpired(order, NOW + PAY_TTL_MS), true)
    assert.equal(isActiveCreated(order, NOW + PAY_TTL_MS), false)
    assert.equal(remainMs(order, NOW + 60 * 1000), PAY_TTL_MS - 60 * 1000)
  })

  it('selectOrdersForDisplay keeps paid and active created only, max 5', () => {
    const rows = [
      { orderId: 'a', status: 'paid', createdAt: new Date(NOW + 5).toISOString() },
      {
        orderId: 'b',
        status: 'created',
        createdAt: new Date(NOW + 4).toISOString(),
        payExpiresAt: new Date(NOW + PAY_TTL_MS).toISOString()
      },
      {
        orderId: 'c',
        status: 'closed',
        createdAt: new Date(NOW + 3).toISOString()
      },
      {
        orderId: 'd',
        status: 'created',
        createdAt: new Date(NOW - PAY_TTL_MS - 1).toISOString(),
        payExpiresAt: new Date(NOW - 1).toISOString()
      },
      { orderId: 'e', status: 'paid', createdAt: new Date(NOW + 2).toISOString() },
      { orderId: 'f', status: 'paid', createdAt: new Date(NOW + 1).toISOString() }
    ]
    const picked = selectOrdersForDisplay(rows, NOW, 5)
    assert.deepEqual(
      picked.map((o) => o.orderId),
      ['a', 'b', 'e', 'f']
    )
  })
})
