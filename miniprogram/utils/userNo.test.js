'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const shared = require('../../cloudfunctions/_shared/userNo.js')
const local = require('./userNo.js')

describe('miniprogram userNo vendor', () => {
  it('matches _shared format, validity, start, and ease helpers', () => {
    const samples = [1, 30, 50, 51, 80, 81, 100, 200]
    for (const n of samples) {
      assert.equal(local.isValidUserNo(n), shared.isValidUserNo(n))
      assert.equal(local.formatUserNoLabel(n), shared.formatUserNoLabel(n))
      assert.equal(local.revealStartValue(n), shared.revealStartValue(n))
    }
    assert.equal(local.formatUserNoLabel(1), '第 1 位大厨')
    assert.equal(local.formatUserNoLabel(0), '')
    assert.equal(local.formatUserNoLabel(null), '')
    assert.equal(local.easeOutCubic(0), shared.easeOutCubic(0))
    assert.equal(local.easeOutCubic(0.5), shared.easeOutCubic(0.5))
    assert.equal(local.easeOutCubic(1), shared.easeOutCubic(1))
    assert.equal(local.revealStartValue(200, 40), shared.revealStartValue(200, 40))
    assert.equal(local.revealStartValue(200, 10), shared.revealStartValue(200, 10))
  })
})
