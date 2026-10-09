'use strict'

const PAGE_SIZE = 7

function toMs(v) {
  if (!v) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  if (typeof v.valueOf === 'function') {
    const n = Number(v.valueOf())
    if (Number.isFinite(n)) return n
  }
  return null
}

function normalizeDishName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
}

function collectAteNamesByRequestId(mealLogs) {
  const map = new Map()
  for (const log of mealLogs || []) {
    const requestId = log && log.requestId
    if (!requestId) continue
    if (!map.has(requestId)) {
      map.set(requestId, new Set())
    }
    const set = map.get(requestId)
    for (const raw of log.dishNames || []) {
      const n = normalizeDishName(raw)
      if (n) set.add(n)
    }
  }
  return map
}

function shapeAcceptedItem(doc, ateNamesSet) {
  if (!doc || doc.accepted !== true) return null
  const planIndex = doc.acceptedPlanIndex
  const plan =
    doc.plans && planIndex != null ? doc.plans[planIndex] : null
  if (!plan) return null

  const ate = ateNamesSet || new Set()
  const dishes = []
  const ateDishNames = []

  for (const meal of plan.meals || []) {
    for (const dish of meal.dishes || []) {
      if (!dish) continue
      const name = dish.name != null ? String(dish.name) : ''
      const normalized = normalizeDishName(name)
      const didAte = normalized && ate.has(normalized)
      dishes.push({
        recipeId: dish.recipeId,
        name,
        meatVeg: dish.meatVeg,
        ate: !!didAte
      })
      if (didAte && name) {
        ateDishNames.push(name)
      }
    }
  }

  return {
    recommendationId: doc._id,
    requestId: doc.requestId,
    acceptedAt: doc.acceptedAt,
    scene: doc.scene || null,
    plan,
    dishes,
    ateDishNames
  }
}

function applyAcceptedCursor(rows, cursor) {
  const list = rows || []
  if (!cursor) {
    return list.slice(0, PAGE_SIZE)
  }

  const cursorAtMs = toMs(cursor.acceptedAt)
  const cursorId = cursor.recommendationId

  const filtered = list.filter((row) => {
    const atMs = toMs(row.acceptedAt)
    if (cursorAtMs != null && atMs != null && atMs > cursorAtMs) {
      return false
    }
    if (
      cursorAtMs != null &&
      atMs != null &&
      atMs === cursorAtMs &&
      row._id >= cursorId
    ) {
      return false
    }
    return true
  })

  return filtered.slice(0, PAGE_SIZE)
}

module.exports = {
  PAGE_SIZE,
  normalizeDishName,
  collectAteNamesByRequestId,
  shapeAcceptedItem,
  applyAcceptedCursor
}
