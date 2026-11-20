'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'confirm.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'confirm.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'confirm.wxss'), 'utf8')

describe('confirm daily meal count chips', () => {
  it('wires 1-6 digit presets plus 更多 chip, not lunch/dinner copy', () => {
    assert.match(js, /DAILY_MEAL_COUNT_PRESETS/)
    assert.match(js, /label:\s*String\(n\)/)
    assert.match(js, /customChipLabel:\s*'更多'/)
    assert.match(js, /onPickDailyMealCount/)
    assert.match(js, /onOpenCustomMealCount/)
    assert.match(wxml, /几餐/)
    assert.match(wxml, /chip--meal-count/)
    assert.match(wxml, /\{\{customChipLabel\}\}/)
    assert.equal(js.includes('一顿晚饭'), false)
    assert.equal(wxml.includes('午饭'), false)
    assert.equal(wxml.includes('晚饭'), false)
    assert.doesNotMatch(js, /customLunchCount/)
  })

  it('keeps party slot options 1-3', () => {
    assert.match(js, /partySlotOptions:\s*\[1,\s*2,\s*3\]/)
    assert.match(wxml, /bindtap="onPartySlotPick"/)
  })
})

describe('confirm more-meals sheet and gate', () => {
  it('opens 7-10 chip sheet when unlocked; otherwise gate with ad primary', () => {
    assert.match(js, /_canCustomDailyMeals\(\)/)
    assert.match(js, /canAccessMoreDailyMeals/)
    assert.match(js, /isMealGateActionTooSoon/)
    assert.match(js, /_mealGateOpenedAt\s*=\s*Date\.now\(\)/)
    assert.match(js, /showMoreMeals/)
    assert.match(js, /MORE_MEAL_COUNTS/)
    assert.match(js, /onPickMoreMealCount/)
    assert.match(js, /clampMoreMealCount/)
    assert.match(js, /unlockDailyMealCustom/)
    assert.match(js, /_watchDailyMealUnlockAd/)
    assert.match(js, /canOfferDailyMealRewardAd/)
    assert.match(js, /MEMBERSHIP_ENABLED/)
    assert.match(js, /membershipEnabled/)
    assert.match(js, /更多餐暂未开放/)
    assert.match(js, /track\('daily_meal_custom_gate_show'/)
    assert.match(js, /开通会员或看广告后可选更多餐/)
    assert.match(wxml, /showMoreMeals/)
    assert.match(wxml, /moreMealCounts/)
    assert.match(wxml, /看广告解锁/)
    assert.match(wxml, /wx:if="\{\{membershipEnabled\}\}"/)
    assert.match(wxml, /开通会员/)
    assert.match(wxml, /解锁更多餐/)
    assert.doesNotMatch(wxml, /customDraftCount/)
    assert.doesNotMatch(wxml, /bumpCustomDraftCount/)
    assert.match(wxss, /chip--meal-count/)
  })

  it('loads membership getStatus onShow into isMember and dailyMealUnlockedToday', () => {
    assert.match(js, /getStatus/)
    assert.match(js, /dailyMealUnlockedToday/)
    assert.match(js, /dailyMealCustomUnlockDay/)
  })

  it('summarizes slots as N餐 and tracks mealCount only', () => {
    assert.match(js, /formatMealSlotsSummary/)
    const confirm = js.slice(js.indexOf('onConfirm()'), js.indexOf('onProfileLiteSkip()'))
    assert.match(confirm, /mealCount:\s*\(scene\.mealSlots \|\| \[\]\)\.length/)
    assert.doesNotMatch(confirm, /lunchCount/)
  })

  it('toasts MEAL_COUNT_GATE on create and rolls back to ≤6', () => {
    const submit = js.slice(js.indexOf('_submitRecommend('), js.indexOf('onEmptyDialogOk'))
    assert.match(submit, /err\.error === 'MEAL_COUNT_GATE'/)
    assert.match(submit, /多餐需会员或看广告解锁/)
    assert.match(submit, /buildDailySlotsByCount\(FREE_DAILY_MEAL_MAX\)/)
  })
})
