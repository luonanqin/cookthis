'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'acceptedPlans.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'acceptedPlans.wxml'), 'utf8')

function groupDishesByMealSource() {
  const start = js.indexOf('function groupDishesByMeal')
  const end = js.indexOf('function mapItem')
  assert.ok(start >= 0 && end > start)
  return js.slice(start, end)
}

describe('acceptedPlans meal group labels', () => {
  it('normalizes displayLabel to 第N餐 by group order and keeps 本餐 for empty', () => {
    const src = groupDishesByMealSource()
    assert.match(js, /normalizeMealSlotLabel/)
    assert.match(js, /require\('\.\.\/\.\.\/utils\/dailyMealSlots\.js'\)/)
    assert.match(
      src,
      /displayLabel:\s*mealLabel\s*\?\s*normalizeMealSlotLabel\(\s*\{\s*label:\s*mealLabel\s*\},\s*groups\.length\s*\)\s*:\s*'本餐'/
    )
    assert.match(wxml, /g\.displayLabel/)
    assert.equal(js.includes('午饭'), false)
    assert.equal(js.includes('晚饭'), false)
    assert.equal(wxml.includes('午饭'), false)
    assert.equal(wxml.includes('晚饭'), false)
  })
})
