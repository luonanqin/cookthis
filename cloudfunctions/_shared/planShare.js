'use strict'

const {
  buildShoppingList,
  categoryLabel,
  flattenShoppingList
} = require('./shoppingList.js')

const SHARE_CARD_TITLE_MAX = 30

/**
 * @returns {string}
 */
function makeShareId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `sh_${Date.now()}${rand}`
}

/**
 * @param {object} plan
 * @returns {Array<{ name: string, mealLabel?: string }>}
 */
function buildDishesFromPlan(plan) {
  const out = []
  for (const meal of (plan && plan.meals) || []) {
    const slot = meal.slot || {}
    const mealLabel = slot.label || undefined
    for (const dish of meal.dishes || []) {
      if (!dish) continue
      const name = dish.name != null ? String(dish.name) : ''
      const row = { name }
      if (mealLabel) row.mealLabel = mealLabel
      out.push(row)
    }
  }
  return out
}

/**
 * @param {object} plan
 * @param {Record<string, string>} [categoryByName]
 * @returns {Array<{ category: string, name: string, displayName?: string }>}
 */
function buildIngredientsFromPlan(plan, categoryByName) {
  const result = buildShoppingList({
    plan,
    categoryByName: categoryByName || {}
  })
  const flat = flattenShoppingList(result)
  return flat.map((item) => ({
    category: categoryLabel(item.category),
    name: item.name
  }))
}

/**
 * @param {{
 *   plan: object,
 *   uid: string,
 *   requestId: string,
 *   planIndex: number,
 *   categoryByName?: Record<string, string>,
 *   sharerNickname?: string
 * }} input
 * @returns {object}
 */
function buildSnapshotPayload(input) {
  const plan = input && input.plan
  const uid = input && input.uid
  const requestId = input && input.requestId
  const planIndex = input && input.planIndex
  const categoryByName = (input && input.categoryByName) || {}
  const sharerNickname = input && input.sharerNickname

  const payload = {
    shareId: makeShareId(),
    createdAt: new Date().toISOString(),
    createdBy: uid,
    sourceRequestId: requestId,
    sourcePlanIndex: planIndex,
    dishes: buildDishesFromPlan(plan),
    ingredients: buildIngredientsFromPlan(plan, categoryByName)
  }

  if (sharerNickname != null && String(sharerNickname).trim() !== '') {
    payload.sharerNickname = String(sharerNickname).trim()
  }

  return payload
}

/**
 * @param {object} doc
 * @returns {object|null}
 */
function shapeShareView(doc) {
  if (!doc) return null
  return {
    shareId: doc.shareId,
    dishes: Array.isArray(doc.dishes) ? doc.dishes : [],
    ingredients: Array.isArray(doc.ingredients) ? doc.ingredients : [],
    sharerNickname: doc.sharerNickname || null,
    createdBy: doc.createdBy || null
  }
}

/**
 * @param {Array<{ name: string }>} dishes
 * @returns {string}
 */
function shareCardTitle(dishes) {
  const list = Array.isArray(dishes) ? dishes : []
  const joined = list
    .map((d) => (d && d.name != null ? String(d.name).trim() : ''))
    .filter(Boolean)
    .join('、')
  if (!joined) return ''
  if (joined.length <= SHARE_CARD_TITLE_MAX) return joined
  return joined.slice(0, SHARE_CARD_TITLE_MAX) + '…'
}

module.exports = {
  makeShareId,
  buildDishesFromPlan,
  buildIngredientsFromPlan,
  buildSnapshotPayload,
  shapeShareView,
  shareCardTitle
}
