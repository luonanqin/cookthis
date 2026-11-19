'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  FREE_DAILY_MEAL_MAX,
  MEMBER_DAILY_MEAL_MAX,
  clampDailyMealCount,
  buildDailySlotsByCount,
  formatMealCountChipLabel,
  formatMealSlotsSummary,
  normalizeMealSlotLabel,
  canUseDailyMealCount
} = require('./dailyMealSlots.js')

describe('dailyMealSlots', () => {
  it('exports free and member maxima', () => {
    assert.equal(FREE_DAILY_MEAL_MAX, 6)
    assert.equal(MEMBER_DAILY_MEAL_MAX, 10)
  })

  it('clampDailyMealCount keeps integers in 1..max and maps illegal to 1', () => {
    assert.equal(clampDailyMealCount(3, 10), 3)
    assert.equal(clampDailyMealCount(1, 6), 1)
    assert.equal(clampDailyMealCount(10, 10), 10)
    assert.equal(clampDailyMealCount(11, 10), 10)
    assert.equal(clampDailyMealCount(9, FREE_DAILY_MEAL_MAX), 6)
    assert.equal(clampDailyMealCount(0, 10), 1)
    assert.equal(clampDailyMealCount(-4, 10), 1)
    assert.equal(clampDailyMealCount(3.9, 10), 3)
    assert.equal(clampDailyMealCount('5', 6), 5)
    assert.equal(clampDailyMealCount(NaN, 10), 1)
    assert.equal(clampDailyMealCount(undefined, 10), 1)
    assert.equal(clampDailyMealCount(null, 10), 1)
    assert.equal(clampDailyMealCount('abc', 10), 1)
  })

  it('buildDailySlotsByCount 3', () => {
    assert.deepEqual(buildDailySlotsByCount(3), [
      { meal: 'other', label: '第1顿' },
      { meal: 'other', label: '第2顿' },
      { meal: 'other', label: '第3顿' }
    ])
  })

  it('buildDailySlotsByCount clamps length to max and defaults to member max', () => {
    assert.equal(buildDailySlotsByCount(0).length, 1)
    assert.equal(buildDailySlotsByCount(0)[0].label, '第1顿')
    assert.equal(buildDailySlotsByCount(12).length, MEMBER_DAILY_MEAL_MAX)
    assert.equal(buildDailySlotsByCount(12)[9].label, '第10顿')
    const capped = buildDailySlotsByCount(8, FREE_DAILY_MEAL_MAX)
    assert.equal(capped.length, 6)
    assert.deepEqual(capped[0], { meal: 'other', label: '第1顿' })
    assert.deepEqual(capped[5], { meal: 'other', label: '第6顿' })
    assert.equal(buildDailySlotsByCount(4, 6).length, 4)
  })

  it('formatMealCountChipLabel uses N顿 and 自定义 when invalid', () => {
    assert.equal(formatMealCountChipLabel(3), '3顿')
    assert.equal(formatMealCountChipLabel(1), '1顿')
    assert.equal(formatMealCountChipLabel(10), '10顿')
    assert.equal(formatMealCountChipLabel(0), '自定义')
    assert.equal(formatMealCountChipLabel(-1), '自定义')
    assert.equal(formatMealCountChipLabel(1.5), '自定义')
    assert.equal(formatMealCountChipLabel(NaN), '自定义')
    assert.equal(formatMealCountChipLabel(undefined), '自定义')
    assert.equal(formatMealCountChipLabel('abc'), '自定义')
  })

  it('formatMealSlotsSummary formats a count or a slot array as N顿', () => {
    assert.equal(formatMealSlotsSummary(3), '3顿')
    assert.equal(formatMealSlotsSummary(1), '1顿')
    assert.equal(formatMealSlotsSummary(0), '0顿')
    assert.equal(formatMealSlotsSummary(buildDailySlotsByCount(4)), '4顿')
    assert.equal(formatMealSlotsSummary([]), '0顿')
    assert.equal(
      formatMealSlotsSummary([{ meal: 'other', label: '第1顿' }, { meal: 'other', label: '第2顿' }]),
      '2顿'
    )
  })

  it('normalizeMealSlotLabel keeps 第N顿 and rewrites lunch/dinner labels by index', () => {
    assert.equal(
      normalizeMealSlotLabel({ meal: 'other', label: '第3顿' }, 0),
      '第3顿'
    )
    assert.equal(
      normalizeMealSlotLabel({ meal: 'lunch', label: '第5顿' }, 0),
      '第5顿'
    )
    assert.equal(
      normalizeMealSlotLabel({ meal: 'lunch', label: '午饭①' }, 0),
      '第1顿'
    )
    assert.equal(
      normalizeMealSlotLabel({ meal: 'dinner', label: '晚饭②' }, 1),
      '第2顿'
    )
    assert.equal(normalizeMealSlotLabel({ label: '午饭' }, 2), '第3顿')
    assert.equal(normalizeMealSlotLabel({ meal: 'dinner' }, 4), '第5顿')
    assert.equal(normalizeMealSlotLabel({ label: '第1顿午饭' }, 0), '第1顿')
    assert.equal(
      normalizeMealSlotLabel({ meal: 'other', label: '加餐' }, 1),
      '加餐'
    )
  })

  it('canUseDailyMealCount gates 7 for free', () => {
    assert.equal(canUseDailyMealCount(7, { isMember: false, unlockedToday: false }).ok, false)
    assert.equal(canUseDailyMealCount(7, { isMember: true }).ok, true)
    assert.equal(canUseDailyMealCount(6, { isMember: false }).ok, true)
  })

  it('canUseDailyMealCount allows unlock through 10 and rejects above member max', () => {
    assert.equal(canUseDailyMealCount(1, {}).ok, true)
    assert.equal(canUseDailyMealCount(6, {}).ok, true)
    assert.deepEqual(
      canUseDailyMealCount(7, { isMember: false, unlockedToday: false }),
      { ok: false, error: 'MEAL_COUNT_GATE' }
    )
    assert.equal(canUseDailyMealCount(7, { isMember: false, unlockedToday: true }).ok, true)
    assert.equal(canUseDailyMealCount(10, { isMember: true, unlockedToday: false }).ok, true)
    assert.equal(canUseDailyMealCount(10, { unlockedToday: true }).ok, true)
    assert.deepEqual(
      canUseDailyMealCount(10, { isMember: false, unlockedToday: false }),
      { ok: false, error: 'MEAL_COUNT_GATE' }
    )
    assert.deepEqual(
      canUseDailyMealCount(11, { isMember: true, unlockedToday: true }),
      { ok: false, error: 'MEAL_COUNT_GATE' }
    )
  })

  it('does not export lunch/dinner slot builders', () => {
    const api = require('./dailyMealSlots.js')
    assert.equal(api.buildDailySlotsFromCounts, undefined)
    assert.equal(api.formatCustomChipLabel, undefined)
    assert.equal(api.canIncrement, undefined)
    assert.equal(api.clampMealCount, undefined)
  })
})
