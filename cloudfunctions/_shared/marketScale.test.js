'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  effectiveFromChoice,
  labelForChoice,
  haversineMeters,
  shouldShowMarketScaleSheet,
  appendHistory,
  HISTORY_MAX,
  RELOCATE_MIN_METERS,
  RELOCATE_COOLDOWN_MS
} = require('./marketScale.js')

const ANCHOR = { lat: 39.9042, lng: 116.4074 }
const THIRTY_ONE_MIN_MS = RELOCATE_COOLDOWN_MS + 60 * 1000

function fixNorthOfAnchor(meters) {
  const deltaLat = meters / 111320
  return { lat: ANCHOR.lat + deltaLat, lng: ANCHOR.lng }
}

describe('marketScale', () => {
  describe('effectiveFromChoice', () => {
    it('maps explicit scales', () => {
      assert.equal(effectiveFromChoice('small'), 'small')
      assert.equal(effectiveFromChoice('medium'), 'medium')
      assert.equal(effectiveFromChoice('large'), 'large')
    })

    it('maps default_medium to medium', () => {
      assert.equal(effectiveFromChoice('default_medium'), 'medium')
    })

    it('falls back to medium for unknown', () => {
      assert.equal(effectiveFromChoice(''), 'medium')
      assert.equal(effectiveFromChoice(undefined), 'medium')
    })
  })

  describe('labelForChoice', () => {
    it('distinguishes default_medium from medium', () => {
      assert.equal(labelForChoice('medium'), '中菜场')
      assert.equal(labelForChoice('default_medium'), '默认中菜场')
    })

    it('labels small and large', () => {
      assert.equal(labelForChoice('small'), '小菜场')
      assert.equal(labelForChoice('large'), '大菜场')
    })
  })

  describe('haversineMeters', () => {
    it('returns 0 for same point', () => {
      assert.equal(haversineMeters(ANCHOR, ANCHOR), 0)
    })

    it('approximates known separation', () => {
      const fix = fixNorthOfAnchor(1200)
      const d = haversineMeters(ANCHOR, fix)
      assert.ok(d >= RELOCATE_MIN_METERS)
      assert.ok(d < 1400)
    })
  })

  describe('shouldShowMarketScaleSheet', () => {
    const base = {
      hasFix: true,
      fix: fixNorthOfAnchor(1200),
      anchor: ANCHOR,
      chosenAt: '2026-10-27T10:00:00.000Z',
      now: new Date('2026-10-27T10:31:00.000Z').getTime(),
      sessionShown: false
    }

    it('returns false without location fix', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({ ...base, hasFix: false }),
        { show: false }
      )
    })

    it('returns false when session already showed sheet', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({ ...base, sessionShown: true }),
        { show: false }
      )
    })

    it('shows first when never chosen and has fix', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({
          hasFix: true,
          fix: ANCHOR,
          anchor: null,
          chosenAt: null,
          now: Date.now(),
          sessionShown: false
        }),
        { show: true, reason: 'first' }
      )
    })

    it('shows relocate when far enough and past cooldown', () => {
      assert.deepEqual(shouldShowMarketScaleSheet(base), {
        show: true,
        reason: 'relocate'
      })
    })

    it('does not relocate within cooldown even if far', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({
          ...base,
          now: new Date('2026-10-27T10:15:00.000Z').getTime()
        }),
        { show: false }
      )
    })

    it('does not relocate when within 1km even after cooldown', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({
          ...base,
          fix: fixNorthOfAnchor(500),
          now: new Date('2026-10-27T11:00:00.000Z').getTime()
        }),
        { show: false }
      )
    })

    it('does not relocate without anchor', () => {
      assert.deepEqual(
        shouldShowMarketScaleSheet({
          ...base,
          anchor: null,
          chosenAt: base.chosenAt,
          now: new Date('2026-10-27T11:00:00.000Z').getTime()
        }),
        { show: false }
      )
    })

    it('accepts chosenAt as epoch ms', () => {
      const chosenMs = new Date('2026-10-27T10:00:00.000Z').getTime()
      assert.deepEqual(
        shouldShowMarketScaleSheet({
          ...base,
          chosenAt: chosenMs,
          now: chosenMs + THIRTY_ONE_MIN_MS
        }),
        { show: true, reason: 'relocate' }
      )
    })
  })

  describe('appendHistory', () => {
    it('appends and keeps newest at end', () => {
      const a = { choice: 'small', at: 't1' }
      const b = { choice: 'medium', at: 't2' }
      assert.deepEqual(appendHistory([a], b), [a, b])
    })

    it('drops oldest when exceeding HISTORY_MAX', () => {
      const list = []
      for (let i = 0; i < HISTORY_MAX; i++) {
        list.push({ at: `t${i}` })
      }
      const next = appendHistory(list, { at: 'tNew' })
      assert.equal(next.length, HISTORY_MAX)
      assert.equal(next[0].at, 't1')
      assert.equal(next[HISTORY_MAX - 1].at, 'tNew')
    })
  })
})
