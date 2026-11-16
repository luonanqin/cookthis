'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  REVEAL_DURATION_MS,
  shouldAnimateUserNoReveal,
  revealTick,
  revealStartValue,
  easeOutCubic
} = require('./userNoReveal.js')

describe('shouldAnimateUserNoReveal', () => {
  it('defaults to true when info is missing or has no reduced-motion field', () => {
    assert.equal(shouldAnimateUserNoReveal(), true)
    assert.equal(shouldAnimateUserNoReveal({}), true)
    assert.equal(shouldAnimateUserNoReveal(null), true)
    assert.equal(shouldAnimateUserNoReveal({ fontSizeSetting: 16 }), true)
  })

  it('returns false when reducedMotion or prefersReducedMotion is true', () => {
    assert.equal(shouldAnimateUserNoReveal({ reducedMotion: true }), false)
    assert.equal(shouldAnimateUserNoReveal({ prefersReducedMotion: true }), false)
  })

  it('returns true when those flags are explicitly false', () => {
    assert.equal(shouldAnimateUserNoReveal({ reducedMotion: false }), true)
    assert.equal(shouldAnimateUserNoReveal({ prefersReducedMotion: false }), true)
  })

  it('reads wx.getAppBaseInfo, then getSystemInfoSync, when called with no argument', () => {
    const prev = global.wx
    global.wx = { getAppBaseInfo: () => ({ reducedMotion: true }) }
    try {
      assert.equal(shouldAnimateUserNoReveal(), false)
    } finally {
      global.wx = prev
    }

    global.wx = { getSystemInfoSync: () => ({ prefersReducedMotion: true }) }
    try {
      assert.equal(shouldAnimateUserNoReveal(), false)
    } finally {
      global.wx = prev
    }
  })
})

describe('revealTick', () => {
  it('uses a 1500ms duration', () => {
    assert.equal(REVEAL_DURATION_MS, 1500)
  })

  it('starts at revealStartValue and ends at N with easeOutCubic', () => {
    const n = 100
    const start = revealStartValue(n)
    assert.equal(start, 50)

    const at0 = revealTick(n, 0)
    assert.equal(at0.display, start)
    assert.equal(at0.done, false)

    const atHalf = revealTick(n, 750)
    assert.equal(atHalf.display, Math.round(start + (n - start) * easeOutCubic(0.5)))
    assert.equal(atHalf.display, 94)
    assert.equal(atHalf.done, false)

    const atEnd = revealTick(n, 1500)
    assert.equal(atEnd.display, n)
    assert.equal(atEnd.done, true)

    const after = revealTick(n, 2000)
    assert.equal(after.display, n)
    assert.equal(after.done, true)
  })

  it('returns display 0 and done for an illegal userNo', () => {
    assert.deepEqual(revealTick(0, 0), { display: 0, done: true })
    assert.deepEqual(revealTick(null, 800), { display: 0, done: true })
    assert.deepEqual(revealTick('8', 1500), { display: 0, done: true })
  })
})
