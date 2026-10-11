'use strict'

const { recipeBlockedByCuisine } = require('./cuisinePrefs.js')
const { hashSessionSeed, rotateArray } = require('./homePlans.js')

const KIND_TAGS = ['hotpot', 'noodle', 'dumpling']

function hasForm(recipe, tag) {
  return Array.isArray(recipe.dishForms) && recipe.dishForms.includes(tag)
}

function toDish(recipe) {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    meatVeg: recipe.meatVeg,
    mainIngredients: recipe.mainIngredients || [],
    seasonings: recipe.seasonings || []
  }
}

/**
 * Carrier recipes (soup base / noodle / wrapper) may omit selected mains.
 * For MVP: if tag is hotpot and meatVeg===soup → carrier; noodle/dumpling any matching form is ok with partial mains.
 */
function mainsOk(recipe, selectedSet, tag) {
  const mains = recipe.mainIngredients || []
  if (mains.length === 0) return false
  const isCarrier =
    (tag === 'hotpot' && recipe.meatVeg === 'soup') ||
    tag === 'noodle' ||
    tag === 'dumpling'
  if (isCarrier) {
    // at least one main in selected OR allow carrier with empty overlap for soup base named
    return mains.some((n) => selectedSet.has(n)) || recipe.meatVeg === 'soup'
  }
  return mains.every((n) => selectedSet.has(n))
}

function scoreKind(tag, scene) {
  let score = 1
  const people = scene && scene.peopleCount
  const mealType = scene && scene.mealType
  if (tag === 'hotpot' && (mealType === 'friends_party' || mealType === 'family_party')) {
    score += 2
  }
  if (tag === 'hotpot' && typeof people === 'number' && people >= 4) score += 1
  return score
}

function pickKind(dishFormPrefs) {
  const prefs = dishFormPrefs || {}
  const candidates = []
  for (const tag of KIND_TAGS) {
    if (prefs[tag] === 'prefer') candidates.push(tag)
  }
  return candidates
}

function buildForTag(tag, recipes, selectedNames, mealSlots, familyAvoids, cuisinePrefs, sessionSeed) {
  void familyAvoids
  const selectedSet = new Set(selectedNames || [])
  let pool = (recipes || []).filter((r) => {
    if (!r || r.enabled === false) return false
    if (!hasForm(r, tag)) return false
    if (!mainsOk(r, selectedSet, tag)) return false
    if (recipeBlockedByCuisine(r, cuisinePrefs)) return false
    return true
  })
  if (pool.length === 0) return null

  const seed = hashSessionSeed(String(sessionSeed || '') + ':' + tag)
  pool = rotateArray(pool, seed)

  const dishes = []
  const used = new Set()

  if (tag === 'hotpot') {
    const soup = pool.find((r) => r.meatVeg === 'soup')
    if (!soup) return null
    dishes.push(toDish(soup))
    used.add(soup.id)
    for (const r of pool) {
      if (used.has(r.id)) continue
      if (r.meatVeg === 'meat' || r.meatVeg === 'veg') {
        dishes.push(toDish(r))
        used.add(r.id)
      }
      if (dishes.length >= 3) break
    }
    if (dishes.length < 2) return null
  } else {
    // noodle / dumpling: 单品一顿，不再搭炒菜/素菜
    dishes.push(toDish(pool[0]))
  }

  const slots = Array.isArray(mealSlots) && mealSlots.length ? mealSlots : [{ meal: 'dinner', label: '晚饭' }]
  // Only first slot is unconventional; remaining slots omitted in this plan (single-meal plan)
  return {
    planKind: tag,
    meals: [{ slot: slots[0], dishes }]
  }
}

/**
 * @returns {null | { planKind: string, meals: object[] }}
 */
function buildUnconventionalPlan(input) {
  const {
    recipes = [],
    selectedNames = [],
    dishFormPrefs = {},
    mealSlots = [],
    scene = null,
    familyAvoids = [],
    cuisinePrefs = {},
    sessionSeed = ''
  } = input || {}

  // familyAvoids reserved for future; home engine already hard-filters most
  void familyAvoids

  const kinds = pickKind(dishFormPrefs)
  if (!kinds.length) return null

  let best = null
  let bestScore = -1
  for (const tag of kinds) {
    const plan = buildForTag(
      tag,
      recipes,
      selectedNames,
      mealSlots,
      familyAvoids,
      cuisinePrefs,
      sessionSeed
    )
    if (!plan) continue
    const score = scoreKind(tag, scene)
    if (score > bestScore) {
      bestScore = score
      best = plan
    }
  }
  return best
}

/**
 * Merge home plans with at most one unconventional; maxPlans cap.
 */
function mergePlansWithUnconventional(homePlans, unconventional, maxPlans) {
  const limit = Math.max(1, Number(maxPlans) || 3)
  const homes = Array.isArray(homePlans) ? homePlans.slice() : []
  if (!unconventional) {
    return homes.slice(0, limit).map((p, i) => Object.assign({}, p, { planIndex: i }))
  }
  const unc = Object.assign({}, unconventional)
  if (homes.length < limit) {
    const merged = homes.concat([unc])
    return merged.map((p, i) => Object.assign({}, p, { planIndex: i }))
  }
  const merged = homes.slice(0, limit - 1).concat([unc])
  return merged.map((p, i) => Object.assign({}, p, { planIndex: i }))
}

module.exports = {
  buildUnconventionalPlan,
  mergePlansWithUnconventional,
  KIND_TAGS
}
