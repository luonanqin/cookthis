'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  FREE_SWAP_LIMIT,
  SWAP_RATE_WINDOW_MS,
  SWAP_RATE_MAX,
  dayKeyChina,
  normalizeSwapDaily,
  canConsumeFreeSwap,
  applySwapConsume,
  checkSwapRateLimit
} = require('./swapQuota.js')

const SHANGHAI_MS = 8 * 60 * 60 * 1000

describe('swapQuota', () => {
  it('exports the stage-1 swap constants', () => {
    assert.equal(FREE_SWAP_LIMIT, 3)
    assert.equal(SWAP_RATE_WINDOW_MS, 60 * 1000)
    assert.equal(SWAP_RATE_MAX, 20)
  })

  it('dayKeyChina is the Asia/Shanghai calendar day, not UTC', () => {
    const utcEvening = Date.parse('2026-11-17T16:00:00.000Z')
    const justBeforeShanghaiMidnight = utcEvening - 1
    assert.equal(dayKeyChina(utcEvening), '2026-11-18')
    assert.equal(dayKeyChina(justBeforeShanghaiMidnight), '2026-11-17')
    assert.equal(dayKeyChina(Date.parse('2026-11-17T00:00:00.000Z')), '2026-11-17')
    assert.equal(
      dayKeyChina(Date.parse('2026-11-18T00:00:00.000Z') - SHANGHAI_MS),
      '2026-11-18'
    )
  })

  it('normalizeSwapDaily keeps same-day counters and zeros them after the Shanghai day rolls', () => {
    const now = Date.parse('2026-11-17T02:00:00.000Z')
    const day = dayKeyChina(now)
    assert.deepEqual(
      normalizeSwapDaily({ day, used: 2, rewardExtra: 1, rewardWatches: 1 }, now),
      { day, used: 2, rewardExtra: 1, rewardWatches: 1 }
    )
    assert.deepEqual(
      normalizeSwapDaily(
        { day: '2000-01-01', used: 3, rewardExtra: 2, rewardWatches: 4 },
        now
      ),
      { day, used: 0, rewardExtra: 0, rewardWatches: 0 }
    )
    assert.deepEqual(normalizeSwapDaily(null, now), {
      day,
      used: 0,
      rewardExtra: 0,
      rewardWatches: 0
    })
    assert.deepEqual(
      normalizeSwapDaily({ day, used: -4, rewardExtra: 1.9, rewardWatches: '2' }, now),
      { day, used: 0, rewardExtra: 1, rewardWatches: 2 }
    )
  })

  it('4th free swap hits SWAP_CAP', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const d = { day: dayKeyChina(now), used: 3, rewardExtra: 0, rewardWatches: 0 }
    const r = canConsumeFreeSwap({ isMember: false, swapDaily: d, nowMs: now })
    assert.equal(r.error, 'SWAP_CAP')
    assert.equal(r.ok, false)
    assert.equal(r.used, 3)
    assert.equal(r.limit, FREE_SWAP_LIMIT)
    assert.equal('plans' in r, false)
  })

  it('free swap under the cap consumes one and keeps the base limit', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const d = { day: dayKeyChina(now), used: 2, rewardExtra: 0, rewardWatches: 0 }
    const r = canConsumeFreeSwap({ isMember: false, swapDaily: d, nowMs: now })
    assert.deepEqual(r, { ok: true, consume: true, used: 2, limit: FREE_SWAP_LIMIT })
    assert.equal(d.used, 2)
  })

  it('rewardExtra raises how many free swaps are allowed without a video grant helper', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const day = dayKeyChina(now)
    const allowed = canConsumeFreeSwap({
      isMember: false,
      swapDaily: { day, used: 3, rewardExtra: 1, rewardWatches: 1 },
      nowMs: now
    })
    assert.deepEqual(allowed, { ok: true, consume: true, used: 3, limit: FREE_SWAP_LIMIT })
    const blocked = canConsumeFreeSwap({
      isMember: false,
      swapDaily: { day, used: 4, rewardExtra: 1, rewardWatches: 1 },
      nowMs: now
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'SWAP_CAP')
    assert.equal(blocked.limit, FREE_SWAP_LIMIT)
  })

  it('a previous Shanghai day does not keep yesterday’s used count', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const r = canConsumeFreeSwap({
      isMember: false,
      swapDaily: { day: '2000-01-01', used: 3, rewardExtra: 2, rewardWatches: 2 },
      nowMs: now
    })
    assert.deepEqual(r, { ok: true, consume: true, used: 0, limit: FREE_SWAP_LIMIT })
  })

  it('member does not consume', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const r = canConsumeFreeSwap({
      isMember: true,
      swapDaily: { day: '2099-01-01', used: 99 },
      nowMs: now
    })
    assert.equal(r.consume, false)
    assert.equal(r.ok, true)
    assert.equal(r.limit, null)
    assert.equal(r.used, 0)

    const today = canConsumeFreeSwap({
      isMember: true,
      swapDaily: { day: dayKeyChina(now), used: 99, rewardExtra: 0, rewardWatches: 0 },
      nowMs: now
    })
    assert.deepEqual(today, { ok: true, consume: false, used: 99, limit: null })
  })

  it('applySwapConsume increments used and resets counters when the day changes', () => {
    const now = Date.parse('2026-06-01T03:00:00.000Z')
    const day = dayKeyChina(now)
    const raw = { day, used: 1, rewardExtra: 2, rewardWatches: 1 }
    const next = applySwapConsume(raw, now)
    assert.deepEqual(next, { day, used: 2, rewardExtra: 2, rewardWatches: 1 })
    assert.equal(raw.used, 1)

    const rolled = applySwapConsume(
      { day: '2000-01-01', used: 3, rewardExtra: 2, rewardWatches: 2 },
      now
    )
    assert.deepEqual(rolled, {
      day,
      used: 1,
      rewardExtra: 0,
      rewardWatches: 0
    })
  })

  it('checkSwapRateLimit allows fewer than 20 hits in 60s and blocks the 21st', () => {
    const now = 1_700_000_000_000
    const inside = now - SWAP_RATE_WINDOW_MS + 1
    const stale = now - SWAP_RATE_WINDOW_MS
    const nineteen = Array.from({ length: 19 }, () => inside)
    const allowed = checkSwapRateLimit([...nineteen, stale], now)
    assert.equal(allowed.ok, true)
    assert.deepEqual(allowed.nextTimestamps, [...nineteen, now])

    const blocked = checkSwapRateLimit(Array.from({ length: 20 }, () => inside), now)
    assert.deepEqual(blocked, { ok: false, error: 'SWAP_RATE_LIMIT' })

    const futureIgnored = checkSwapRateLimit(
      [...nineteen, now + 60 * 60 * 1000],
      now
    )
    assert.equal(futureIgnored.ok, true)
    assert.equal(futureIgnored.nextTimestamps.length, 20)

    const empty = checkSwapRateLimit(null, now)
    assert.deepEqual(empty, { ok: true, nextTimestamps: [now] })
  })
})
