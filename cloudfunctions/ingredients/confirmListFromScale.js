'use strict'

const VALID_SCALES = new Set(['small', 'medium', 'large'])

/**
 * @param {object|null|undefined} scaleDoc  full ingredients-by-scale.json
 * @param {string|null|undefined} effective  small|medium|large
 * @returns {{ seasonal: object[], yearRound: object[] }}
 */
function flattenScaleBucket(scaleDoc, effective) {
  const key = VALID_SCALES.has(effective) ? effective : 'medium'
  const bucket =
    (scaleDoc && scaleDoc.scales && scaleDoc.scales[key]) || null
  return {
    seasonal: flattenBucketSide(bucket && bucket.seasonal),
    yearRound: flattenBucketSide(bucket && bucket.yearRound)
  }
}

/**
 * Expand category map in JSON key order; skip empty categories.
 * @param {object|null|undefined} byCat
 * @returns {object[]}
 */
function flattenBucketSide(byCat) {
  const out = []
  if (!byCat || typeof byCat !== 'object') return out
  let sort = 0
  for (const category of Object.keys(byCat)) {
    const arr = byCat[category]
    if (!Array.isArray(arr) || arr.length === 0) continue
    for (let i = 0; i < arr.length; i++) {
      const raw = arr[i]
      if (!raw || typeof raw !== 'object') continue
      const name = String(raw.name || '').trim()
      if (!name) continue
      const displayName = String(raw.displayName || name).trim() || name
      out.push({
        id: name,
        name,
        displayName,
        category,
        sort: sort++
      })
    }
  }
  return out
}

module.exports = { flattenScaleBucket }
