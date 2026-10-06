'use strict'

function truncateSeasonal(list, perCat = 8, maxTotal = 60) {
  const byCat = new Map()
  const sorted = [...list].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
  const out = []
  for (const item of sorted) {
    const c = item.category || 'other'
    const n = byCat.get(c) || 0
    if (n >= perCat) continue
    if (out.length >= maxTotal) break
    byCat.set(c, n + 1)
    out.push(item)
  }
  return out
}

function isNational(item) {
  return !item.cities || item.cities.length === 0
}

function isCitySpecific(item, city) {
  return item.cities && item.cities.length > 0 && item.cities.includes(city)
}

function isVisibleForCity(item, city) {
  if (!city) return isNational(item)
  return isNational(item) || isCitySpecific(item, city)
}

/**
 * @param {object[]} ingredients
 * @param {string | null | undefined} [city]
 * @returns {{ seasonal: object[], yearRound: object[], fallback?: 'national' }}
 */
function buildConfirmList(ingredients, city) {
  const mains = (ingredients || []).filter((x) => x.kind !== 'seasoning')

  let visible = mains
  let fallback

  const cityKey = city && String(city).trim() ? String(city).trim() : null

  if (cityKey) {
    const citySpecificCount = mains.filter((x) => isCitySpecific(x, cityKey)).length
    if (citySpecificCount < 3) {
      visible = mains.filter(isNational)
      fallback = 'national'
    } else {
      visible = mains.filter((x) => isVisibleForCity(x, cityKey))
    }
  } else {
    visible = mains.filter(isNational)
  }

  const yearRound = visible.filter(
    (x) => x.kind === 'main' && x.availability === 'year_round'
  )

  const seasonalRaw = visible.filter(
    (x) =>
      x.kind === 'main' &&
      x.availability === 'seasonal' &&
      x.onConfirmPage === true
  )

  const seasonal = truncateSeasonal(seasonalRaw)

  const result = { seasonal, yearRound }
  if (fallback) result.fallback = fallback
  return result
}

module.exports = { buildConfirmList }
