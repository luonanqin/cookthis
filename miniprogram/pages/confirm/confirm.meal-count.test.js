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
  it('wires 1-6 count presets plus custom chip, not lunch/dinner copy', () => {
    assert.match(js, /DAILY_MEAL_COUNT_PRESETS/)
    assert.match(js, /dailyMealCountPresets/)
    assert.match(js, /dailySlotPresetId:\s*'count_1'/)
    assert.match(js, /buildDailySlotsByCount\(1\)/)
    assert.match(js, /onPickDailyMealCount/)
    assert.match(js, /onOpenCustomMealCount/)
    assert.match(wxml, /dailyMealCountPresets/)
    assert.match(wxml, /bindtap="onPickDailyMealCount"/)
    assert.match(wxml, /bindtap="onOpenCustomMealCount"/)
    assert.match(wxml, /\{\{customChipLabel\}\}/)
    assert.equal(js.includes('一顿晚饭'), false)
    assert.equal(js.includes('一顿午饭'), false)
    assert.equal(js.includes('1午+1晚'), false)
    assert.equal(wxml.includes('午饭'), false)
    assert.equal(wxml.includes('晚饭'), false)
    assert.doesNotMatch(js, /DAILY_SLOT_PRESETS/)
    assert.doesNotMatch(js, /onDailySlotPreset/)
    assert.doesNotMatch(js, /customLunchCount/)
    assert.doesNotMatch(js, /customDinnerCount/)
    assert.doesNotMatch(js, /draftLunchCount/)
    assert.doesNotMatch(js, /draftDinnerCount/)
  })

  it('keeps party slot options 1-3 and does not apply daily 6/10 caps', () => {
    assert.match(js, /partySlotOptions:\s*\[1,\s*2,\s*3\]/)
    const party = js.slice(js.indexOf('function buildPartySlots'), js.indexOf('function pad2'))
    assert.match(party, /Math\.min\(3,/)
    assert.doesNotMatch(party, /FREE_DAILY_MEAL_MAX|MEMBER_DAILY_MEAL_MAX/)
    assert.match(wxml, /bindtap="onPartySlotPick"/)
    assert.match(wxml, /partySlotOptions/)
  })
})

describe('confirm custom meal gate and single-axis stepper', () => {
  it('gates custom behind member/unlock and opens a 1-10 stepper', () => {
    assert.match(js, /_canCustomDailyMeals\(\)/)
    assert.match(js, /showMealGate/)
    assert.match(js, /AD_REWARD_ENABLED/)
    assert.match(js, /customDraftCount/)
    assert.match(js, /customMealCount/)
    assert.match(js, /onConfirmCustomMealCount/)
    assert.match(js, /clampDailyMealCount/)
    assert.match(js, /canUseDailyMealCount/)
    assert.match(js, /formatMealCountChipLabel/)
    assert.match(js, /FREE_DAILY_MEAL_MAX/)
    assert.match(js, /MEMBER_DAILY_MEAL_MAX/)
    assert.match(js, /track\('daily_meal_custom_gate_show'/)
    assert.match(js, /track\('confirm_slot_pick'/)
    assert.match(js, /开通会员或看广告后可选更多顿/)
    assert.match(wxml, /showMealGate/)
    assert.match(wxml, /开通会员/)
    assert.match(wxml, /看广告解锁/)
    assert.match(wxml, /adRewardEnabled/)
    assert.match(
      js,
      /pages\/membership\/index\?from=daily_meal_custom/
    )
    assert.match(wxml, /custom-slot-name">顿数</)
    assert.match(wxml, /bindtap="onConfirmCustomMealCount"/)
    assert.match(wxml, /\{\{customDraftCount\}\}/)
    assert.doesNotMatch(wxml, /data-which="lunch"/)
    assert.doesNotMatch(wxml, /data-which="dinner"/)
    assert.match(wxss, /custom-slots-panel/)
  })

  it('loads membership getStatus onShow into isMember and dailyMealUnlockedToday', () => {
    assert.match(js, /require\('\.\.\/\.\.\/services\/membership\.js'\)/)
    assert.match(js, /getStatus/)
    assert.match(js, /onShow\(\)\s*\{[\s\S]*?getStatus\s*\(/)
    assert.match(js, /isMember/)
    assert.match(js, /dailyMealUnlockedToday/)
    assert.match(js, /dailyMealCustomUnlockDay/)
  })

  it('summarizes slots as N顿 and tracks mealCount only', () => {
    assert.match(js, /formatMealSlotsSummary/)
    assert.match(js, /scene\.mealSlotsSummary\s*=\s*formatMealSlotsSummary\(mealSlots\)/)
    const confirm = js.slice(js.indexOf('onConfirm()'), js.indexOf('onProfileLiteSkip()'))
    assert.match(confirm, /mealCount:\s*\(scene\.mealSlots \|\| \[\]\)\.length/)
    assert.doesNotMatch(confirm, /lunchCount/)
    assert.doesNotMatch(confirm, /dinnerCount/)
  })
})
