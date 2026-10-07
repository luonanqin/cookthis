'use strict'

/**
 * @param {{ plan: object, selectedNames?: string[] }} input
 * @returns {{ name: string, kind: 'main'|'seasoning', alreadyHave: boolean }[]}
 */
function buildShoppingList(input) {
  const plan = input && input.plan
  const selected = new Set((input && input.selectedNames) || [])
  const mains = new Map()
  const seasonings = new Map()

  const meals = (plan && plan.meals) || []
  for (const meal of meals) {
    for (const dish of meal.dishes || []) {
      for (const name of dish.mainIngredients || []) {
        if (!name || mains.has(name)) continue
        mains.set(name, {
          name,
          kind: 'main',
          alreadyHave: selected.has(name)
        })
      }
      for (const name of dish.seasonings || []) {
        if (!name || seasonings.has(name)) continue
        seasonings.set(name, {
          name,
          kind: 'seasoning',
          alreadyHave: selected.has(name)
        })
      }
    }
  }

  const mainList = Array.from(mains.values())
  mainList.sort((a, b) => {
    if (a.alreadyHave === b.alreadyHave) return 0
    return a.alreadyHave ? 1 : -1
  })
  return mainList.concat(Array.from(seasonings.values()))
}

module.exports = { buildShoppingList }
