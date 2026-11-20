'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  formatSceneSummary,
  formatSceneSummaryLines
} = require('./sceneSummary.js')

const dailyBase = {
  mealType: 'daily',
  peopleCount: 2,
  combo: { meat: 5, veg: 4, soup: 2 },
  householdCounts: { adult: 1, child: 0, elder: 1 }
}

describe('formatSceneSummaryLines meal slots', () => {
  it('keeps a clean N餐 summary on line 2', () => {
    const { line2 } = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '3餐',
      mealSlots: [{ label: '第1餐' }, { label: '第2餐' }, { label: '第3餐' }]
    })
    assert.equal(line2, '5荤4素2汤 · 3餐')
  })

  it('ignores summaries with 午/晚/顿 and uses slots.length as N餐', () => {
    const slots = [
      { meal: 'lunch', label: '午饭①' },
      { meal: 'dinner', label: '晚饭①' }
    ]
    const dinner = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '一顿晚饭',
      mealSlots: slots
    })
    assert.equal(dinner.line2, '5荤4素2汤 · 2餐')
    assert.equal(dinner.line2.includes('晚'), false)

    const oldDun = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '3顿',
      mealSlots: [{ label: '第1顿' }, { label: '第2顿' }, { label: '第3顿' }]
    })
    assert.equal(oldDun.line2, '5荤4素2汤 · 3餐')
  })

  it('falls back to N餐 from slots.length and never joins lunch/dinner labels', () => {
    const { line2 } = formatSceneSummaryLines({
      ...dailyBase,
      mealSlots: [
        { meal: 'lunch', label: '午饭' },
        { meal: 'dinner', label: '晚饭' }
      ]
    })
    assert.equal(line2, '5荤4素2汤 · 2餐')
    assert.equal(line2.includes('午饭'), false)
  })

  it('omits slot summary when omitSlots is set', () => {
    const { line2 } = formatSceneSummaryLines(
      {
        ...dailyBase,
        mealSlotsSummary: '一顿晚饭',
        mealSlots: [{ label: '晚饭' }]
      },
      { omitSlots: true }
    )
    assert.equal(line2, '5荤4素2汤')
  })

  it('joins single-line summary with 3餐', () => {
    const text = formatSceneSummary({
      ...dailyBase,
      mealSlotsSummary: '一顿晚饭',
      mealSlots: [{ label: '第1餐' }, { label: '第2餐' }, { label: '第3餐' }]
    })
    assert.ok(text.includes('5荤4素2汤 · 3餐'))
  })

  it('keeps one-slot party line2 as 本场', () => {
    const { line2 } = formatSceneSummaryLines({
      mealType: 'friends_party',
      peopleCount: 8,
      partyCounts: { adult: 6, child: 2, elder: 0 },
      mealSlots: [{ meal: 'other', label: '本场' }]
    })
    assert.equal(line2, '本场')
  })
})

describe('sceneSummary source comments', () => {
  it('documents line 2 as 5荤4素2汤 · 3餐', () => {
    const src = fs.readFileSync(path.join(__dirname, 'sceneSummary.js'), 'utf8')
    assert.match(src, /5荤4素2汤 · 3餐/)
  })
})
