'use strict'

const PAGE_SIZE = 10

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

function shapeMealListItem(row) {
  if (!row) return null
  return {
    logId: row.logId,
    date: row.date,
    meal: row.meal,
    dishNames: row.dishNames || [],
    source: row.source,
    createdAt: row.createdAt
  }
}

/**
 * createdAt desc；游标为上一页最后一条的 createdAt + logId。
 * @param {object[]} rows
 * @param {{ createdAt?: *, logId?: string }|null} cursor
 * @param {number} [limit]
 */
function applyMealListCursor(rows, cursor, limit) {
  const pageSize =
    typeof limit === 'number' && limit > 0 ? limit : PAGE_SIZE
  let list = rows || []
  if (cursor && (cursor.createdAt != null || cursor.logId)) {
    const cursorAtMs = toMs(cursor.createdAt)
    const cursorId = String(cursor.logId || '')
    list = list.filter((row) => {
      const atMs = toMs(row.createdAt)
      if (cursorAtMs != null && atMs != null) {
        if (atMs < cursorAtMs) return true
        if (atMs > cursorAtMs) return false
        return String(row.logId || '') < cursorId
      }
      if (cursorId && String(row.logId || '') === cursorId) return false
      return true
    })
  }
  return list.slice(0, pageSize)
}

function nextMealListCursor(pageItems) {
  if (!pageItems || !pageItems.length) return null
  const last = pageItems[pageItems.length - 1]
  if (!last || !last.logId) return null
  return {
    createdAt: last.createdAt,
    logId: last.logId
  }
}

module.exports = {
  PAGE_SIZE,
  toMs,
  shapeMealListItem,
  applyMealListCursor,
  nextMealListCursor
}
