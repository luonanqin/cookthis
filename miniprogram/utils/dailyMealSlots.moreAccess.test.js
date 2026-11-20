'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  canAccessMoreDailyMeals,
  isMealGateActionTooSoon,
  MEAL_GATE_ACTION_GRACE_MS
} = require('./dailyMealSlots.js')

describe('more-meals access + gate tap-through guard', () => {
  it('canAccessMoreDailyMeals requires member or unlockedToday', () => {
    assert.equal(canAccessMoreDailyMeals({}), false)
    assert.equal(canAccessMoreDailyMeals({ isMember: false, unlockedToday: false }), false)
    assert.equal(canAccessMoreDailyMeals({ isMember: true }), true)
    assert.equal(canAccessMoreDailyMeals({ unlockedToday: true }), true)
  })

  it('isMealGateActionTooSoon blocks actions in the grace window after open', () => {
    assert.ok(MEAL_GATE_ACTION_GRACE_MS >= 300)
    const opened = 1_000_000
    assert.equal(isMealGateActionTooSoon(opened, opened + 50), true)
    assert.equal(isMealGateActionTooSoon(opened, opened + MEAL_GATE_ACTION_GRACE_MS - 1), true)
    assert.equal(isMealGateActionTooSoon(opened, opened + MEAL_GATE_ACTION_GRACE_MS), false)
    assert.equal(isMealGateActionTooSoon(opened, opened + 5_000), false)
  })
})
