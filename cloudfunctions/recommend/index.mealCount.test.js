'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const indexJs = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')

function handleCreateSource() {
  const start = indexJs.indexOf('async function handleCreate')
  const end = indexJs.indexOf('async function handleSwapOrReject')
  assert.ok(start >= 0 && end > start)
  return indexJs.slice(start, end)
}

describe('recommend.create daily meal count gate', () => {
  it('vendors dailyMealSlots and uses membership helpers already in recommend', () => {
    assert.ok(fs.existsSync(path.join(dir, 'dailyMealSlots.js')), 'dailyMealSlots.js')
    assert.match(indexJs, /require\('\.\/dailyMealSlots\.js'\)/)
    assert.match(indexJs, /canUseDailyMealCount/)
    assert.match(indexJs, /normalizeMealSlotLabel/)
    assert.match(indexJs, /FREE_DAILY_MEAL_MAX/)
    assert.match(indexJs, /MEMBER_DAILY_MEAL_MAX/)
    assert.match(indexJs, /require\('\.\/membershipLogic\.js'\)/)
    assert.match(indexJs, /isMemberActive/)
    assert.match(indexJs, /dayKeyChina/)
  })

  it('gates daily mealSlots after validation and before recipe load', () => {
    const src = handleCreateSource()
    const slotsAt = src.indexOf("error: 'MEAL_SLOTS_REQUIRED'")
    const gateAt = src.indexOf('canUseDailyMealCount')
    const recipeAt = src.indexOf('loadRecipeBatch')
    assert.ok(slotsAt >= 0, 'mealSlots required check')
    assert.ok(gateAt > slotsAt, 'gate after mealSlots validation')
    assert.ok(recipeAt > gateAt, 'gate before recipe load')
    assert.match(src, /scene\.mealType === 'daily'/)
    assert.match(src, /loadMembership\(uid\)/)
    assert.match(src, /dailyMealCustomUnlockDay/)
    assert.match(src, /isMemberActive\(membership/)
    assert.match(src, /error:\s*'MEAL_COUNT_GATE'/)
    assert.match(src, /limit:\s*FREE_DAILY_MEAL_MAX/)
    assert.match(src, /max:\s*MEMBER_DAILY_MEAL_MAX/)
  })

  it('caps daily at MEMBER_DAILY_MEAL_MAX and keeps party at 7', () => {
    const src = handleCreateSource()
    assert.match(
      src,
      /maxSlots = scene\.mealType === 'daily' \? MEMBER_DAILY_MEAL_MAX : 7/
    )
    assert.doesNotMatch(src, /daily' \? 14/)
    assert.doesNotMatch(src, /daily' \? 6/)
  })

  it('normalizes daily slot labels to 第N顿 / meal:other', () => {
    const src = handleCreateSource()
    assert.match(src, /normalizeMealSlotLabel/)
    assert.match(src, /meal:\s*'other'/)
    assert.match(src, /label:\s*normalizeMealSlotLabel/)
  })

  it('rejects non-member forging 7 daily slots with MEAL_COUNT_GATE', () => {
    const {
      canUseDailyMealCount,
      FREE_DAILY_MEAL_MAX
    } = require('./dailyMealSlots.js')
    const { isMemberActive } = require('./membershipLogic.js')
    const { dayKeyChina } = require('./swapQuota.js')
    const n = 7
    const now = Date.now()
    const user = {}
    const membership = null
    const unlockedToday = user.dailyMealCustomUnlockDay === dayKeyChina(now)
    const gate = canUseDailyMealCount(n, {
      isMember: isMemberActive(membership, now),
      unlockedToday
    })
    assert.equal(n > FREE_DAILY_MEAL_MAX, true)
    assert.equal(gate.ok, false)
    assert.equal(gate.error, 'MEAL_COUNT_GATE')
    const src = handleCreateSource()
    assert.match(src, /canUseDailyMealCount\(/)
    assert.match(src, /error:\s*'MEAL_COUNT_GATE'/)
  })
})
