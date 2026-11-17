'use strict'

const MEAT_VEG_ORDER = ['meat', 'veg', 'soup']
const MEAT_VEG_LABELS = { meat: '荤', veg: '素', soup: '汤' }

function dishKey(dish) {
  if (!dish) return ''
  if (dish.recipeId != null && String(dish.recipeId) !== '') {
    return String(dish.recipeId)
  }
  return String(dish.name || '')
    .replace(/\s+/g, '')
    .trim()
}

/**
 * Largest-remainder quotas so sum(quotas) === limit (or less if total < limit).
 * @param {number[]} sizes
 * @param {number} limit
 * @returns {number[]}
 */
function allocateQuotas(sizes, limit) {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total <= 0 || limit <= 0) return sizes.map(() => 0)
  const cap = Math.min(limit, total)
  const exact = sizes.map((s) => (s / total) * cap)
  const floors = exact.map((x) => Math.floor(x))
  let remain = cap - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const quotas = floors.slice()
  for (let k = 0; k < order.length && remain > 0; k++) {
    const idx = order[k].i
    if (quotas[idx] < sizes[idx]) {
      quotas[idx]++
      remain--
    }
  }
  // If remain left because some buckets full, give to others
  while (remain > 0) {
    let progressed = false
    for (let i = 0; i < quotas.length && remain > 0; i++) {
      if (quotas[i] < sizes[i]) {
        quotas[i]++
        remain--
        progressed = true
      }
    }
    if (!progressed) break
  }
  return quotas
}

/**
 * @param {object[]} plans
 * @param {{ limit?: number }} [opts]
 * @returns {{ recipeId: string|null, name: string, meatVeg: string, typeLabel: string, key: string }[]}
 */
function buildRejectDishPool(plans, opts) {
  const limit =
    opts && typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 10
  const seen = Object.create(null)
  const buckets = { meat: [], veg: [], soup: [] }

  for (const plan of plans || []) {
    for (const meal of (plan && plan.meals) || []) {
      for (const dish of (meal && meal.dishes) || []) {
        if (!dish) continue
        const meatVeg = dish.meatVeg
        if (meatVeg !== 'meat' && meatVeg !== 'veg' && meatVeg !== 'soup') {
          continue
        }
        const key = dishKey(dish)
        if (!key || seen[key]) continue
        seen[key] = true
        buckets[meatVeg].push({
          key,
          recipeId: dish.recipeId != null ? String(dish.recipeId) : null,
          name: dish.name != null ? String(dish.name) : '',
          meatVeg,
          typeLabel: MEAT_VEG_LABELS[meatVeg]
        })
      }
    }
  }

  const sizes = MEAT_VEG_ORDER.map((k) => buckets[k].length)
  const quotas = allocateQuotas(sizes, limit)
  const out = []
  for (let i = 0; i < MEAT_VEG_ORDER.length; i++) {
    const k = MEAT_VEG_ORDER[i]
    const take = quotas[i]
    for (let j = 0; j < take; j++) {
      out.push(buckets[k][j])
    }
  }
  return out
}

module.exports = {
  buildRejectDishPool,
  allocateQuotas,
  MEAT_VEG_LABELS
}
