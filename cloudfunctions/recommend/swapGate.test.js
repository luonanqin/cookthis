'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  evaluateSwapAccess,
  buildSwapQuotaUserPatch
} = require('./swapGate.js')
const { FREE_SWAP_LIMIT, SWAP_RATE_MAX, dayKeyChina } = require('./swapQuota.js')

const NOW = Date.parse('2026-11-18T04:00:00.000Z')
const DAY = dayKeyChina(NOW)

function daily(used) {
  return { day: DAY, used, rewardExtra: 0, rewardWatches: 0 }
}

describe('evaluateSwapAccess', () => {
  it('4th free swap hits SWAP_CAP without plans', () => {
    const r = evaluateSwapAccess({
      membership: null,
      swapDaily: daily(3),
      swapRateTimestamps: [],
      nowMs: NOW
    })
    assert.equal(r.ok, false)
    assert.equal(r.error, 'SWAP_CAP')
    assert.equal(r.used, 3)
    assert.equal(r.limit, FREE_SWAP_LIMIT)
    assert.equal(r.isMember, false)
    assert.equal('plans' in r, false)
  })

  it('allows a free swap under the cap and marks consume', () => {
    const r = evaluateSwapAccess({
      membership: null,
      swapDaily: daily(2),
      swapRateTimestamps: [],
      nowMs: NOW
    })
    assert.equal(r.ok, true)
    assert.equal(r.consume, true)
    assert.equal(r.isMember, false)
    assert.equal(r.swapDaily.used, 2)
    assert.ok(Array.isArray(r.nextTimestamps))
    assert.equal(r.nextTimestamps[r.nextTimestamps.length - 1], NOW)
  })

  it('active member skips consume even with high used', () => {
    const r = evaluateSwapAccess({
      membership: { expiresAt: NOW + 86400000 },
      swapDaily: daily(99),
      swapRateTimestamps: [],
      nowMs: NOW
    })
    assert.equal(r.ok, true)
    assert.equal(r.consume, false)
    assert.equal(r.isMember, true)
  })

  it('expired membership is treated as free and can hit SWAP_CAP', () => {
    const r = evaluateSwapAccess({
      membership: { expiresAt: NOW },
      swapDaily: daily(3),
      swapRateTimestamps: [],
      nowMs: NOW
    })
    assert.equal(r.ok, false)
    assert.equal(r.error, 'SWAP_CAP')
    assert.equal(r.isMember, false)
  })

  it('rate limit fails before quota even when under the daily cap', () => {
    const stamps = Array.from({ length: SWAP_RATE_MAX }, () => NOW - 1000)
    const r = evaluateSwapAccess({
      membership: null,
      swapDaily: daily(0),
      swapRateTimestamps: stamps,
      nowMs: NOW
    })
    assert.deepEqual(r, { ok: false, error: 'SWAP_RATE_LIMIT' })
  })
})

describe('buildSwapQuotaUserPatch', () => {
  it('increments used only when consume is true', () => {
    const serverDate = 'SERVER'
    const consumed = buildSwapQuotaUserPatch({
      consume: true,
      swapDaily: daily(2),
      nextTimestamps: [NOW],
      nowMs: NOW,
      serverDate
    })
    assert.deepEqual(consumed.swapDaily, {
      day: DAY,
      used: 3,
      rewardExtra: 0,
      rewardWatches: 0
    })
    assert.deepEqual(consumed.swapRateTimestamps, [NOW])
    assert.equal(consumed.updatedAt, serverDate)

    const skipped = buildSwapQuotaUserPatch({
      consume: false,
      swapDaily: daily(2),
      nextTimestamps: [NOW],
      nowMs: NOW,
      serverDate
    })
    assert.equal('swapDaily' in skipped, false)
    assert.deepEqual(skipped.swapRateTimestamps, [NOW])
  })
})
