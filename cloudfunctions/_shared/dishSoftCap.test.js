'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  FREE_DAILY_DISH_LIMIT,
  countPlanDishes,
  applyDailyDishSoftLock
} = require('./dishSoftCap.js')

function dish(id) {
  return { recipeId: id, name: '菜' + id }
}

function planWithIds(ids) {
  return { meals: [{ slot: 'lunch', dishes: ids.map(dish) }] }
}

function plansWithCount(n) {
  return [planWithIds(Array.from({ length: n }, (_, i) => 'r' + i))]
}

describe('dishSoftCap', () => {
  it('exports the free daily dish limit', () => {
    assert.equal(FREE_DAILY_DISH_LIMIT, 12)
  })

  it('countPlanDishes sums dish cards across plans and meals', () => {
    const plans = [
      {
        meals: [
          { slot: 'breakfast', dishes: [dish('a'), dish('b')] },
          { slot: 'lunch', dishes: [dish('c')] }
        ]
      },
      { meals: [{ slot: 'dinner', dishes: [dish('d'), dish('e')] }] }
    ]
    assert.equal(countPlanDishes(plans), 5)
    assert.equal(countPlanDishes(null), 0)
    assert.equal(countPlanDishes([]), 0)
  })

  it('party and member plans are returned unchanged', () => {
    const plans = plansWithCount(15)
    const party = applyDailyDishSoftLock(plans, { isMember: false, mealType: 'party' })
    assert.equal(party.plans, plans)
    assert.deepEqual(party, { plans, softCapped: false })
    assert.equal(party.plans[0].meals[0].dishes[12].softLocked, undefined)

    const member = applyDailyDishSoftLock(plans, { isMember: true, mealType: 'daily' })
    assert.equal(member.plans, plans)
    assert.equal(member.softCapped, false)

    const other = applyDailyDishSoftLock(plans, { isMember: false, mealType: 'gathering' })
    assert.equal(other.plans, plans)
    assert.equal(other.softCapped, false)
  })

  it('daily non-member keeps the first 12 usable and soft-locks the rest in global order', () => {
    const plans = [
      {
        id: 'p0',
        meals: [
          { slot: 'breakfast', dishes: Array.from({ length: 10 }, (_, i) => dish('a' + i)) },
          { slot: 'lunch', dishes: [dish('b0'), dish('b1'), dish('b2')] }
        ]
      },
      {
        id: 'p1',
        meals: [{ slot: 'dinner', dishes: [dish('c0'), dish('c1')] }]
      }
    ]
    const before = JSON.parse(JSON.stringify(plans))
    const locked = applyDailyDishSoftLock(plans, { isMember: false, mealType: 'daily' })

    assert.equal(countPlanDishes(locked.plans), 15)
    assert.equal(locked.softCapped, true)
    assert.equal(locked.lockedCount, 3)
    assert.equal(locked.limit, 12)
    assert.deepEqual(plans, before)

    const flat = []
    for (const plan of locked.plans) {
      for (const meal of plan.meals) flat.push(...meal.dishes)
    }
    flat.slice(0, 12).forEach((d) => assert.equal(d.softLocked, undefined))
    flat.slice(12).forEach((d) => assert.equal(d.softLocked, true))
    assert.equal(flat[12].recipeId, 'b2')
    assert.equal(flat[13].recipeId, 'c0')
    assert.equal(locked.plans[0].id, 'p0')
  })

  it('daily non-member at or under 12 is not soft-capped and still returns every dish', () => {
    const plans = plansWithCount(12)
    const result = applyDailyDishSoftLock(plans, { isMember: false, mealType: 'daily' })
    assert.equal(result.softCapped, false)
    assert.equal(result.lockedCount, 0)
    assert.equal(result.limit, 12)
    assert.equal(countPlanDishes(result.plans), 12)
    assert.equal(
      result.plans[0].meals[0].dishes.some((d) => d.softLocked),
      false
    )
    assert.deepEqual(plans, plansWithCount(12))
  })

  it('re-applying the lock clears softLocked on dishes that fall back inside the first 12', () => {
    const plans = plansWithCount(13)
    plans[0].meals[0].dishes[0].softLocked = true
    const result = applyDailyDishSoftLock(plans, { isMember: false, mealType: 'daily' })
    assert.equal(result.plans[0].meals[0].dishes[0].softLocked, undefined)
    assert.equal(result.plans[0].meals[0].dishes[12].softLocked, true)
    assert.equal(plans[0].meals[0].dishes[0].softLocked, true)
  })
})
