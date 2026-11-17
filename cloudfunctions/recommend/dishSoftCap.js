'use strict'
// Vendored: keep in sync with cloudfunctions/_shared/dishSoftCap.js

const FREE_DAILY_DISH_LIMIT = 12

function countPlanDishes(plans) {
  let n = 0
  for (const plan of plans || []) {
    for (const meal of (plan && plan.meals) || []) {
      n += ((meal && meal.dishes) || []).length
    }
  }
  return n
}

function applyDailyDishSoftLock(plans, options) {
  const opts = options || {}
  if (opts.mealType !== 'daily' || opts.isMember) {
    return { plans, softCapped: false }
  }

  const list = Array.isArray(plans) ? plans : []
  let index = 0
  let lockedCount = 0
  const next = list.map((plan) => {
    const meals = ((plan && plan.meals) || []).map((meal) => {
      const dishes = ((meal && meal.dishes) || []).map((item) => {
        const copy = Object.assign({}, item)
        if (index < FREE_DAILY_DISH_LIMIT) {
          delete copy.softLocked
        } else {
          copy.softLocked = true
          lockedCount += 1
        }
        index += 1
        return copy
      })
      return Object.assign({}, meal, { dishes })
    })
    return Object.assign({}, plan, { meals })
  })

  return {
    plans: next,
    softCapped: lockedCount > 0,
    lockedCount,
    limit: FREE_DAILY_DISH_LIMIT
  }
}

module.exports = {
  FREE_DAILY_DISH_LIMIT,
  countPlanDishes,
  applyDailyDishSoftLock
}
