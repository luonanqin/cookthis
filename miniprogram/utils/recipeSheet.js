'use strict'

/**
 * 单道菜内食材排序：主料 → 调味；主料内肉类 → 水产 → 其他；同段按名称。
 * @param {{ name: string, kind: 'main'|'seasoning', category: string }} a
 * @param {{ name: string, kind: 'main'|'seasoning', category: string }} b
 */
function compareDishIngredients(a, b) {
  const kindRank = (k) => (k === 'seasoning' ? 1 : 0)
  const dk = kindRank(a.kind) - kindRank(b.kind)
  if (dk !== 0) return dk

  if (a.kind !== 'seasoning') {
    const mainRank = (c) => {
      if (c === 'meat') return 0
      if (c === 'seafood') return 1
      return 2
    }
    const dr = mainRank(a.category) - mainRank(b.category)
    if (dr !== 0) return dr
  }

  return String(a.name).localeCompare(String(b.name), 'zh')
}

/**
 * 购买页「按菜看食材」弹层数据。
 * @param {{ plan: object, categoryByName?: Record<string, string> }} input
 * @returns {{
 *   meals: Array<{
 *     label: string,
 *     dishes: Array<{
 *       recipeId: string,
 *       name: string,
 *       ingredients: Array<{ name: string, kind: 'main'|'seasoning', category: string }>
 *     }>
 *   }>
 * }}
 */
function buildRecipeSheet(input) {
  const plan = input && input.plan
  const categoryByName = (input && input.categoryByName) || {}
  const meals = (plan && plan.meals) || []
  const out = []

  for (const meal of meals) {
    const slot = meal.slot || {}
    const label = slot.label || slot.meal || ''
    const dishes = []
    for (const dish of meal.dishes || []) {
      const ingredients = []
      for (const name of dish.mainIngredients || []) {
        if (!name) continue
        ingredients.push({
          name,
          kind: 'main',
          category: categoryByName[name] || 'other'
        })
      }
      for (const name of dish.seasonings || []) {
        if (!name) continue
        ingredients.push({
          name,
          kind: 'seasoning',
          category: categoryByName[name] || 'seasoning'
        })
      }
      ingredients.sort(compareDishIngredients)
      dishes.push({
        recipeId: dish.recipeId || '',
        name: dish.name || '',
        ingredients
      })
    }
    out.push({ label, dishes })
  }

  return { meals: out }
}

module.exports = { buildRecipeSheet, compareDishIngredients }
