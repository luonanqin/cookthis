'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  FREE_DAILY_MEAL_MAX,
  CUSTOM_DAILY_MEAL_MIN,
  MEMBER_DAILY_MEAL_MAX,
  MORE_MEAL_COUNTS,
  clampDailyMealCount,
  clampMoreMealCount,
  buildDailySlotsByCount,
  formatMealCountChipLabel,
  formatMealSlotsSummary,
  normalizeMealSlotLabel,
  canUseDailyMealCount
} = require('./dailyMealSlots.js')

describe('dailyMealSlots', () => {
  it('exports free / more / member bounds', () => {
    assert.equal(FREE_DAILY_MEAL_MAX, 5)
    assert.equal(CUSTOM_DAILY_MEAL_MIN, 6)
    assert.equal(MEMBER_DAILY_MEAL_MAX, 10)
    assert.deepEqual(MORE_MEAL_COUNTS, [6, 7, 8, 9, 10])
  })

  it('clampDailyMealCount keeps integers in 1..max and maps illegal to 1', () => {
    assert.equal(clampDailyMealCount(3, 10), 3)
    assert.equal(clampDailyMealCount(0, 10), 1)
    assert.equal(clampDailyMealCount(11, 10), 10)
  })

  it('clampMoreMealCount keeps 6..10', () => {
    assert.equal(clampMoreMealCount(6), 6)
    assert.equal(clampMoreMealCount(10), 10)
    assert.equal(clampMoreMealCount(5), 6)
    assert.equal(clampMoreMealCount(11), 10)
    assert.equal(clampMoreMealCount(NaN), 6)
  })

  it('buildDailySlotsByCount 3 uses 第N餐', () => {
    assert.deepEqual(buildDailySlotsByCount(3), [
      { meal: 'other', label: '第1餐' },
      { meal: 'other', label: '第2餐' },
      { meal: 'other', label: '第3餐' }
    ])
  })

  it('formatMealCountChipLabel shows digit for 6-10 else 更多', () => {
    assert.equal(formatMealCountChipLabel(6), '6')
    assert.equal(formatMealCountChipLabel(10), '10')
    assert.equal(formatMealCountChipLabel(3), '更多')
    assert.equal(formatMealCountChipLabel(0), '更多')
  })

  it('formatMealSlotsSummary uses N餐', () => {
    assert.equal(formatMealSlotsSummary(3), '3餐')
    assert.equal(formatMealSlotsSummary(buildDailySlotsByCount(4)), '4餐')
  })

  it('normalizeMealSlotLabel keeps 第N餐 and rewrites 顿/午饭/晚饭', () => {
    assert.equal(normalizeMealSlotLabel({ label: '第3餐' }, 0), '第3餐')
    assert.equal(normalizeMealSlotLabel({ label: '第2顿' }, 0), '第2餐')
    assert.equal(normalizeMealSlotLabel({ meal: 'lunch', label: '午饭①' }, 0), '第1餐')
    assert.equal(normalizeMealSlotLabel({ meal: 'dinner', label: '晚饭' }, 1), '第2餐')
  })

  it('canUseDailyMealCount gates 6 for free', () => {
    assert.equal(canUseDailyMealCount(6, { isMember: false, unlockedToday: false }).ok, false)
    assert.equal(canUseDailyMealCount(6, { isMember: true }).ok, true)
    assert.equal(canUseDailyMealCount(6, { unlockedToday: true }).ok, true)
    assert.equal(canUseDailyMealCount(5, { isMember: false }).ok, true)
    assert.equal(canUseDailyMealCount(11, { isMember: true }).ok, false)
    assert.equal(
      canUseDailyMealCount(8, { isMember: false, unlockedToday: false, monetizationOff: true }).ok,
      true
    )
  })
})
