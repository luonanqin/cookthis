'use strict'

const CATEGORY_ORDER = [
  'meat',
  'seafood',
  'egg_dairy',
  'tofu',
  'leaf',
  'root',
  'fruit_veg',
  'bean',
  'mushroom',
  'seasoning',
  'other'
]

const CATEGORY_LABEL = {
  meat: '肉类',
  seafood: '水产',
  egg_dairy: '蛋奶',
  tofu: '豆制品',
  leaf: '叶菜',
  root: '根茎',
  fruit_veg: '茄果',
  bean: '豆类',
  mushroom: '菌菇',
  seasoning: '调味',
  other: '其他'
}

/**
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  return CATEGORY_LABEL[category] || CATEGORY_LABEL.other
}

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
 * 购买清单：按食材分类分组；不含「已有/主料/调味」标签逻辑。
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
        const category = categoryByName[name] || 'other'
        byName.set(name, { name, category })
      }
      for (const name of dish.seasonings || []) {
        if (!name || byName.has(name)) continue
        const category = categoryByName[name] || 'seasoning'
        byName.set(name, { name, category })
      }
    }
  }

  const buckets = new Map()
  for (const item of byName.values()) {
    const c = item.category || 'other'
    if (!buckets.has(c)) buckets.set(c, [])
    buckets.get(c).push(item)
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
    groups.push({
      category,
      label: categoryLabel(category),
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
  flattenShoppingList
}
