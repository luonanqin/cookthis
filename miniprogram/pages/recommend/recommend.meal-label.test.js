'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'recommend.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'recommend.wxml'), 'utf8')

describe('recommend meal-label display', () => {
  it('shows meal.slot.label only when there are multiple meals', () => {
    assert.match(
      wxml,
      /wx:if="\{\{item\.meals\.length > 1\}\}" class="meal-label">\{\{meal\.slot\.label \|\| meal\.slot\.meal\}\}/
    )
    assert.equal(wxml.includes('午饭'), false)
    assert.equal(wxml.includes('晚饭'), false)
    assert.equal(js.includes('午饭'), false)
    assert.equal(js.includes('晚饭'), false)
  })
})
