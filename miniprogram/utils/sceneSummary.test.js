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
  it('keeps a clean N顿 summary on line 2', () => {
    const { line2 } = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '3顿',
      mealSlots: [{ label: '第1顿' }, { label: '第2顿' }, { label: '第3顿' }]
    })
    assert.equal(line2, '5荤4素2汤 · 3顿')
  })

  it('ignores summaries that contain 午 or 晚 and uses slots.length as N顿', () => {
    const slots = [
      { meal: 'lunch', label: '午饭①' },
      { meal: 'dinner', label: '晚饭①' }
    ]
    const dinner = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '一顿晚饭',
      mealSlots: slots
    })
    assert.equal(dinner.line2, '5荤4素2汤 · 2顿')
    assert.equal(dinner.line2.includes('晚'), false)
    assert.equal(dinner.line2.includes('午'), false)

    const mixed = formatSceneSummaryLines({
      ...dailyBase,
      mealSlotsSummary: '1午+1晚',
      mealSlots: slots
    })
    assert.equal(mixed.line2, '5荤4素2汤 · 2顿')
  })

  it('falls back to N顿 from slots.length and never joins lunch/dinner labels', () => {
    const { line2 } = formatSceneSummaryLines({
      ...dailyBase,
      mealSlots: [
        { meal: 'lunch', label: '午饭' },
        { meal: 'dinner', label: '晚饭' }
      ]
    })
    assert.equal(line2, '5荤4素2汤 · 2顿')
    assert.equal(line2.includes('午饭'), false)
    assert.equal(line2.includes('晚饭'), false)
    assert.equal(line2.includes('、'), false)
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

  it('joins single-line summary with 3顿 not lunch/dinner copy', () => {
    const text = formatSceneSummary({
      ...dailyBase,
      mealSlotsSummary: '一顿晚饭',
      mealSlots: [{ label: '第1顿' }, { label: '第2顿' }, { label: '第3顿' }]
    })
    assert.ok(text.includes('5荤4素2汤 · 3顿'))
    assert.equal(text.includes('晚饭'), false)
  })
})

describe('sceneSummary source comments', () => {
  it('documents line 2 as 5荤4素2汤 · 3顿', () => {
    const src = fs.readFileSync(path.join(__dirname, 'sceneSummary.js'), 'utf8')
    assert.match(src, /5荤4素2汤 · 3顿/)
    assert.equal(src.includes('一顿晚饭'), false)
  })
})
