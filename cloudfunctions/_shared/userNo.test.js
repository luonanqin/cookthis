'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  isValidUserNo,
  formatUserNoLabel,
  revealStartValue,
  easeOutCubic,
} = require('./userNo.js')

describe('isValidUserNo', () => {
  it('accepts positive integers', () => {
    assert.equal(isValidUserNo(1), true)
    assert.equal(isValidUserNo(128), true)
  })

  it('rejects non-positive, non-integer, and non-number values', () => {
    assert.equal(isValidUserNo(0), false)
    assert.equal(isValidUserNo(-1), false)
    assert.equal(isValidUserNo(1.5), false)
    assert.equal(isValidUserNo(Number.NaN), false)
    assert.equal(isValidUserNo(Number.POSITIVE_INFINITY), false)
    assert.equal(isValidUserNo(null), false)
    assert.equal(isValidUserNo(undefined), false)
    assert.equal(isValidUserNo('1'), false)
  })
})

describe('formatUserNoLabel', () => {
  it('formats a valid serial as 第 N 位大厨', () => {
    assert.equal(formatUserNoLabel(1), '第 1 位大厨')
    assert.equal(formatUserNoLabel(128), '第 128 位大厨')
  })

  it('returns empty string for illegal values', () => {
    assert.equal(formatUserNoLabel(0), '')
    assert.equal(formatUserNoLabel(-3), '')
    assert.equal(formatUserNoLabel(1.2), '')
    assert.equal(formatUserNoLabel(null), '')
    assert.equal(formatUserNoLabel(undefined), '')
    assert.equal(formatUserNoLabel('8'), '')
  })
})

describe('revealStartValue', () => {
  it('returns 0 for an illegal userNo', () => {
    assert.equal(revealStartValue(0), 0)
    assert.equal(revealStartValue(-1), 0)
    assert.equal(revealStartValue(1.5), 0)
    assert.equal(revealStartValue(null), 0)
    assert.equal(revealStartValue('10'), 0)
  })

  it('starts at 0 when n is within the span, otherwise n - span', () => {
    assert.equal(revealStartValue(1), 0)
    assert.equal(revealStartValue(50), 0)
    assert.equal(revealStartValue(51), 1)
    assert.equal(revealStartValue(100), 50)
    assert.equal(revealStartValue(200, 40), 160)
  })

  it('clamps the preferred span to 30–80 after flooring', () => {
    assert.equal(revealStartValue(200, 10), 170)
    assert.equal(revealStartValue(200, -5), 170)
    assert.equal(revealStartValue(200, 200), 120)
    assert.equal(revealStartValue(80, 80), 0)
    assert.equal(revealStartValue(81, 80), 1)
    assert.equal(revealStartValue(100, 50.9), 50)
    assert.equal(revealStartValue(200, 30.2), 170)
    assert.equal(revealStartValue(40, 30), 10)
    assert.equal(revealStartValue(30, 30), 0)
  })

  it('uses span 50 when the preferred span is omitted or not finite', () => {
    assert.equal(revealStartValue(100, undefined), 50)
    assert.equal(revealStartValue(100, Number.NaN), 50)
    assert.equal(revealStartValue(100, Number.POSITIVE_INFINITY), 50)
    assert.equal(revealStartValue(100, 'foo'), 50)
  })

  it('treats a finite numeric string as a span, and null as 0 then clamped', () => {
    assert.equal(revealStartValue(100, '40'), 60)
    assert.equal(revealStartValue(100, null), 70)
  })
})

describe('easeOutCubic', () => {
  it('maps 0 and 1 to the endpoints and 0.5 to 0.875', () => {
    assert.equal(easeOutCubic(0), 0)
    assert.equal(easeOutCubic(1), 1)
    assert.equal(easeOutCubic(0.5), 0.875)
  })

  it('clamps t into 0..1 and treats non-finite input as 0', () => {
    assert.equal(easeOutCubic(-1), 0)
    assert.equal(easeOutCubic(2), 1)
    assert.equal(easeOutCubic(Number.NaN), 0)
    assert.equal(easeOutCubic(undefined), 0)
    assert.equal(easeOutCubic(null), 0)
    assert.equal(easeOutCubic('0.5'), 0.875)
  })
})
