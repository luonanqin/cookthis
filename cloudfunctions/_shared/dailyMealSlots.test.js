'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildDailySlotsFromCounts,
  formatCustomChipLabel,
  clampMealCount,
  canIncrement
} = require('./dailyMealSlots.js')

describe('dailyMealSlots', () => {
  it('buildDailySlotsFromCounts orders lunch then dinner with labels', () => {
    const slots = buildDailySlotsFromCounts(2, 1)
    assert.deepEqual(slots, [
      { meal: 'lunch', label: '午饭①' },
      { meal: 'lunch', label: '午饭②' },
      { meal: 'dinner', label: '晚饭①' }
    ])
  })

  it('buildDailySlotsFromCounts 0+0 yields empty', () => {
    assert.deepEqual(buildDailySlotsFromCounts(0, 0), [])
  })

  it('formatCustomChipLabel', () => {
    assert.equal(formatCustomChipLabel(0, 0), '自定义')
    assert.equal(formatCustomChipLabel(0, 3), '3晚')
    assert.equal(formatCustomChipLabel(2, 0), '2午')
    assert.equal(formatCustomChipLabel(1, 2), '1午+2晚')
  })

  it('clampMealCount and canIncrement respect 0-7 and sum<=14', () => {
    assert.equal(clampMealCount(-1), 0)
    assert.equal(clampMealCount(8), 7)
    assert.equal(canIncrement(7, 0, 'lunch'), false)
    assert.equal(canIncrement(7, 7, 'dinner'), false)
    assert.equal(canIncrement(6, 7, 'lunch'), true)
    assert.equal(canIncrement(7, 6, 'dinner'), true)
  })
})
