'use strict'

const HISTORY_MAX = 30
const RELOCATE_MIN_METERS = 1000
const RELOCATE_COOLDOWN_MS = 30 * 60 * 1000

const EARTH_RADIUS_M = 6371000

/**
 * @param {string} choice
 * @returns {'small'|'medium'|'large'}
 */
function effectiveFromChoice(choice) {
  if (choice === 'small' || choice === 'large') return choice
  if (choice === 'medium' || choice === 'default_medium') return 'medium'
  return 'medium'
}

/**
 * @param {string} choice
 * @returns {string}
 */
function labelForChoice(choice) {
  switch (choice) {
    case 'small':
      return '小菜场'
    case 'large':
      return '大菜场'
    case 'default_medium':
      return '默认中菜场'
    case 'medium':
    default:
      return '中菜场'
  }
}

/**
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
function haversineMeters(a, b) {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * @param {string|number|Date|null|undefined} chosenAt
 * @returns {number|null}
 */
function chosenAtToMs(chosenAt) {
  if (chosenAt == null || chosenAt === '') return null
  if (typeof chosenAt === 'number' && Number.isFinite(chosenAt)) return chosenAt
  if (chosenAt instanceof Date) {
    const t = chosenAt.getTime()
    return Number.isNaN(t) ? null : t
  }
  const t = Date.parse(String(chosenAt))
  return Number.isNaN(t) ? null : t
}

/**
 * @param {{
 *   hasFix: boolean,
 *   fix?: { lat: number, lng: number },
 *   anchor?: { lat: number, lng: number } | null,
 *   chosenAt?: string|number|Date|null,
 *   now?: number,
 *   sessionShown?: boolean
 * }} opts
 * @returns {{ show: boolean, reason?: 'first'|'relocate' }}
 */
function shouldShowMarketScaleSheet(opts) {
  const {
    hasFix,
    fix,
    anchor,
    chosenAt,
    now = Date.now(),
    sessionShown = false
  } = opts || {}

  if (!hasFix || !fix || typeof fix.lat !== 'number' || typeof fix.lng !== 'number') {
    return { show: false }
  }
  if (sessionShown) {
    return { show: false }
  }

  const chosenMs = chosenAtToMs(chosenAt)
  if (chosenMs == null) {
    return { show: true, reason: 'first' }
  }

  if (
    anchor &&
    typeof anchor.lat === 'number' &&
    typeof anchor.lng === 'number' &&
    now - chosenMs >= RELOCATE_COOLDOWN_MS &&
    haversineMeters(fix, anchor) >= RELOCATE_MIN_METERS
  ) {
    return { show: true, reason: 'relocate' }
  }

  return { show: false }
}

/**
 * @param {Array<object>} list
 * @param {object} item
 * @returns {Array<object>}
 */
function appendHistory(list, item) {
  const base = Array.isArray(list) ? list.slice() : []
  base.push(item)
  if (base.length <= HISTORY_MAX) return base
  return base.slice(base.length - HISTORY_MAX)
}

module.exports = {
  effectiveFromChoice,
  labelForChoice,
  haversineMeters,
  chosenAtToMs,
  shouldShowMarketScaleSheet,
  appendHistory,
  HISTORY_MAX,
  RELOCATE_MIN_METERS,
  RELOCATE_COOLDOWN_MS
}
