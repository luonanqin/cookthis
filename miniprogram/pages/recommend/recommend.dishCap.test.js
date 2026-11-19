'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'recommend.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'recommend.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'recommend.wxss'), 'utf8')

describe('recommend daily dish soft cap UI', () => {
  it('greys out softLocked dishes and labels them 会员可展开 when enabled', () => {
    assert.match(wxml, /dish\.softLocked/)
    assert.match(wxml, /membershipEnabled && dish\.softLocked/)
    assert.match(wxml, /会员可展开/)
    assert.match(wxss, /\.dish-name--locked/)
    assert.match(wxss, /\.dish-locked-hint/)
  })

  it('shows a membership tip from=dish_cap and does not block 去买菜', () => {
    assert.match(wxml, /membershipEnabled && showDishCapTip/)
    assert.match(wxml, /今日菜数较多，开通会员可一次看全/)
    assert.match(wxml, /bindtap="onDishCapGoMember"/)
    assert.match(
      js,
      /onDishCapGoMember\(\)\s*\{[\s\S]*?pages\/membership\/index\?from=dish_cap/
    )
    assert.match(js, /showDishCapTip/)
    assert.match(js, /dishSoftCap/)
    const accept = wxml.slice(
      wxml.indexOf('class="plan-accept"'),
      wxml.indexOf('bindtap="onAccept"')
    )
    assert.match(accept, /disabled="\{\{busy\}\}"/)
    assert.doesNotMatch(accept, /softLocked|dishSoftCap|showDishCapTip/)
    assert.doesNotMatch(js, /filter\([^\)]*softLocked/)
  })

  it('onAccept snap keeps dishSoftCap from the accept response', () => {
    const accept = js.slice(js.indexOf('onAccept(e)'), js.indexOf('onSwapCapGoShopping'))
    assert.match(accept, /writeSnap/)
    assert.match(accept, /plans:\s*result\.plans/)
    assert.match(accept, /dishSoftCap:\s*result\.dishSoftCap/)
  })

  it('applies lock opacity to the dish name, not 会员可展开', () => {
    const lockedAt = wxss.indexOf('.dish-name--locked')
    const lockedBlockEnd = wxss.indexOf('}', lockedAt)
    const lockedBlock = wxss.slice(lockedAt, lockedBlockEnd + 1)
    assert.doesNotMatch(lockedBlock, /opacity/)
    assert.match(wxss, /\.dish-name--locked\s+\.dish-name-text[\s\S]*?opacity/)
    assert.match(wxml, /class="dish-name-text"/)
  })
})
