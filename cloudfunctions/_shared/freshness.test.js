'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  ingredientBaseScore,
  decayFactor,
  computeFreshPenalty
} = require('./freshness.js')

describe('freshness', () => {
  it('tiers A/B/C and default B', () => {
    assert.equal(ingredientBaseScore('猪肉'), 24)
    assert.equal(ingredientBaseScore('鸡蛋'), 12)
    assert.equal(ingredientBaseScore('土豆'), 4)
    assert.equal(ingredientBaseScore('未知菜'), 12)
  })

  it('decay windows', () => {
    assert.equal(decayFactor(0), 1)
    assert.equal(decayFactor(1), 1)
    assert.equal(decayFactor(2), 0.6)
    assert.equal(decayFactor(3), 0.6)
    assert.equal(decayFactor(4), 0.3)
    assert.equal(decayFactor(6), 0.3)
    assert.equal(decayFactor(7), 0)
    assert.equal(decayFactor(8), 0)
  })

  it('example: yesterday 土豆烧肉 → 青椒炒肉 24, 清炒土豆丝 4', () => {
    const recent = { 猪肉: 0, 土豆: 0 }
    assert.equal(computeFreshPenalty(['猪肉', '青椒'], recent), 24)
    assert.equal(computeFreshPenalty(['土豆'], recent), 4)
    assert.equal(computeFreshPenalty(['番茄', '鸡蛋'], recent), 0)
  })

  it('time decay rounds pork-only dish', () => {
    assert.equal(computeFreshPenalty(['猪肉', '青椒'], { 猪肉: 0 }), 24)
    assert.equal(computeFreshPenalty(['猪肉', '青椒'], { 猪肉: 3 }), 14) // 24*0.6=14.4 → 14
    assert.equal(computeFreshPenalty(['猪肉', '青椒'], { 猪肉: 5 }), 7) // 24*0.3=7.2 → 7
    assert.equal(computeFreshPenalty(['猪肉', '青椒'], { 猪肉: 8 }), 0)
  })

  it('caps at 60 and uses each ingredient once', () => {
    const recent = { 羊肉: 0, 牛肉: 0, 小白菜: 0, 猪肉: 0, 鸡肉: 0 }
    const p = computeFreshPenalty(['羊肉', '牛肉', '小白菜', '猪肉', '鸡肉'], recent)
    assert.equal(p, 60)
    assert.equal(computeFreshPenalty(['猪肉', '猪肉'], { 猪肉: 0 }), 24)
  })
})
