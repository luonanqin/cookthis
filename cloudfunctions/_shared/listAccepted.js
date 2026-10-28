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
    source: 'own',
    recommendationId: doc._id,
    requestId: doc.requestId,
    acceptedAt: doc.acceptedAt,
    scene: doc.scene || null,
    plan,
    dishes,
    ateDishNames
  }
}

/**
 * Shared received_plans row for listAccepted. No meal_logs / ate.
 * Dishes prefer shareDoc.dishes; else receivedDoc.dishNamesSummary.
 */
function shapeSharedListItem(receivedDoc, shareDoc) {
  if (!receivedDoc || !receivedDoc.shareId) return null

  let dishes = []
  if (shareDoc && Array.isArray(shareDoc.dishes) && shareDoc.dishes.length) {
    dishes = shareDoc.dishes.map((d) => ({
      name: d && d.name != null ? String(d.name) : '',
      ate: false
    }))
  } else {
    dishes = (receivedDoc.dishNamesSummary || []).map((name) => ({
      name: name != null ? String(name) : '',
      ate: false
    }))
  }

  const sharerNickname =
    (receivedDoc.sharerNickname != null && receivedDoc.sharerNickname !== ''
      ? receivedDoc.sharerNickname
      : null) ||
    (shareDoc && shareDoc.sharerNickname) ||
    null

  return {
    source: 'shared',
    shareId: receivedDoc.shareId,
    savedAt: receivedDoc.savedAt,
    recommendationId: null,
    requestId: null,
    scene: null,
    badge: '分享',
    dishes,
    ateDishNames: [],
    sharerNickname,
    plan: null
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

function listItemSortAt(item) {
  if (!item) return null
  if (item.source === 'shared') return item.savedAt != null ? item.savedAt : null
  return item.acceptedAt != null ? item.acceptedAt : null
}

function listItemCursorId(item) {
  if (!item) return ''
  if (item.source === 'shared') return String(item.shareId || '')
  return String(item.recommendationId || '')
}

function listItemKind(item) {
  return item && item.source === 'shared' ? 'shared' : 'own'
}

/**
 * Desc by sortAt; tie-break kind then id (string desc) for stable merge.
 */
function compareListItemsDesc(a, b) {
  const aMs = toMs(listItemSortAt(a))
  const bMs = toMs(listItemSortAt(b))
  if (aMs != null && bMs != null && aMs !== bMs) return bMs - aMs
  if (aMs != null && bMs == null) return -1
  if (aMs == null && bMs != null) return 1
  const kindCmp = String(listItemKind(b)).localeCompare(String(listItemKind(a)))
  if (kindCmp !== 0) return kindCmp
  return String(listItemCursorId(b)).localeCompare(String(listItemCursorId(a)))
}

function normalizeMergeCursor(cursor) {
  if (!cursor) return null
  if (cursor.sortAt != null) {
    return {
      sortAt: cursor.sortAt,
      kind: cursor.kind === 'shared' ? 'shared' : 'own',
      id: String(cursor.id || '')
    }
  }
  // Legacy own-only cursor from older clients
  if (cursor.acceptedAt != null) {
    return {
      sortAt: cursor.acceptedAt,
      kind: 'own',
      id: String(cursor.recommendationId || '')
    }
  }
  return null
}

function isAfterMergeCursor(item, cursor) {
  if (!cursor) return true
  const itemMs = toMs(listItemSortAt(item))
  const cursorMs = toMs(cursor.sortAt)
  if (itemMs != null && cursorMs != null) {
    if (itemMs < cursorMs) return true
    if (itemMs > cursorMs) return false
  } else if (itemMs == null && cursorMs != null) {
    return true
  } else if (itemMs != null && cursorMs == null) {
    return false
  }
  const kind = listItemKind(item)
  const kindCmp = String(kind).localeCompare(String(cursor.kind || 'own'))
  if (kindCmp < 0) return true
  if (kindCmp > 0) return false
  return String(listItemCursorId(item)) < String(cursor.id || '')
}

/**
 * MVP pagination (own + shared):
 * - First page: take latest N from each side, merge-sort by sortAt desc, slice PAGE_SIZE;
 *   nextCursor = last item { sortAt, kind, id }.
 * - Next page: filter both sides with cursor, merge again (meal-list style; volume is small).
 */
function mergeOwnAndSharedPage(ownItems, sharedItems, cursor, pageSize) {
  const limit =
    typeof pageSize === 'number' && pageSize > 0 ? pageSize : PAGE_SIZE
  const mergedCursor = normalizeMergeCursor(cursor)
  const combined = []
    .concat(ownItems || [])
    .concat(sharedItems || [])
    .filter((item) => item && isAfterMergeCursor(item, mergedCursor))
  combined.sort(compareListItemsDesc)
  const items = combined.slice(0, limit)
  let nextCursor = null
  if (items.length === limit && combined.length > limit) {
    const last = items[items.length - 1]
    nextCursor = {
      sortAt: listItemSortAt(last),
      kind: listItemKind(last),
      id: listItemCursorId(last)
    }
  }
  return { items, nextCursor }
}

module.exports = {
  PAGE_SIZE,
  normalizeDishName,
  collectAteNamesByRequestId,
  shapeAcceptedItem,
  shapeSharedListItem,
  applyAcceptedCursor,
  listItemSortAt,
  listItemCursorId,
  listItemKind,
  normalizeMergeCursor,
  mergeOwnAndSharedPage,
  toMs
}
