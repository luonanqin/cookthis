'use strict'

const {
  CATEGORY_ORDER,
  categoryLabel,
  normalizeCategory
} = require('./categoryTaxonomy.js')

/**
 * 将 items 两两一行。
 * @param {{ name: string }[]} items
 * @returns {{ name: string }[][]}
 */
function pairRows(items) {
  const list = Array.isArray(items) ? items : []
  const rows = []
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2))
  }
  return rows
}

/**
 * 购买清单：按中文食材分类分组；不含「已有/主料/调味」标签逻辑。
 * @param {{
 *   plan: object,
 *   categoryByName?: Record<string, string>
 * }} input
 * @returns {{
 *   groups: Array<{
 *     category: string,
 *     label: string,
 *     items: Array<{ name: string, category: string }>,
 *     rows: Array<Array<{ name: string, category: string }>>
 *   }>
 * }}
 */
function buildShoppingList(input) {
  const plan = input && input.plan
  const categoryByName = (input && input.categoryByName) || {}
  const byName = new Map()

  const meals = (plan && plan.meals) || []
  for (const meal of meals) {
    for (const dish of meal.dishes || []) {
      for (const name of dish.mainIngredients || []) {
        if (!name || byName.has(name)) continue
        const category = normalizeCategory(categoryByName[name], '其他')
        byName.set(name, { name, category })
      }
      for (const name of dish.seasonings || []) {
        if (!name || byName.has(name)) continue
        const category = normalizeCategory(categoryByName[name], '调味')
        byName.set(name, { name, category })
      }
    }
  }

  const buckets = new Map()
  for (const item of byName.values()) {
    const c = normalizeCategory(item.category, '其他')
    if (!buckets.has(c)) buckets.set(c, [])
    buckets.get(c).push({ name: item.name, category: c })
  }

  for (const items of buckets.values()) {
    items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
  }

  const groups = []
  for (const category of CATEGORY_ORDER) {
    const items = buckets.get(category)
    if (!items || !items.length) continue
    groups.push({
      category,
      label: categoryLabel(category),
      items,
      rows: pairRows(items)
    })
    buckets.delete(category)
  }
  for (const [category, items] of buckets.entries()) {
    if (!items.length) continue
    const c = normalizeCategory(category, '其他')
    groups.push({
      category: c,
      label: categoryLabel(c),
      items,
      rows: pairRows(items)
    })
  }

  return { groups }
}

function flattenShoppingList(result) {
  const groups = (result && result.groups) || []
  const out = []
  for (const g of groups) {
    for (const it of g.items || []) out.push(it)
  }
  return out
}

module.exports = {
  buildShoppingList,
  pairRows,
  categoryLabel,
  CATEGORY_ORDER,
  flattenShoppingList,
  normalizeCategory
}
