'use strict'

function lookupIngredient(ingredientsByName, name) {
  if (!ingredientsByName) return undefined
  if (typeof ingredientsByName.get === 'function') {
    return ingredientsByName.get(name)
  }
  return ingredientsByName[name]
}

function recipeAvoidTags(recipe, ingredientsByName) {
  const names = [
    ...(recipe.mainIngredients || []),
    ...(recipe.seasonings || [])
  ]
  const tags = new Set()
  for (const name of names) {
    const meta = lookupIngredient(ingredientsByName, name)
    for (const t of (meta && meta.avoidTags) || []) tags.add(t)
  }
  return tags
}

function intersects(a, b) {
  const setB = new Set(b)
  for (const x of a) {
    if (setB.has(x)) return true
  }
  return false
}

function isCandidate(recipe, selectedNames) {
  if (recipe.enabled === false) return false
  const mains = recipe.mainIngredients || []
  if (mains.length === 0) return false
  const selected = new Set(selectedNames)
  return mains.every((name) => selected.has(name))
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

function pickFromBucket(bucket, count, usedIds, startOffset) {
  if (count <= 0) return []
  if (bucket.length < count) return null
  const picked = []
  const n = bucket.length
  for (let i = 0; i < n && picked.length < count; i++) {
    const r = bucket[(startOffset + i) % n]
    if (usedIds.has(r.id)) continue
    picked.push(r)
  }
  if (picked.length < count) {
    for (let i = 0; i < n && picked.length < count; i++) {
      const r = bucket[(startOffset + i) % n]
      if (picked.find((p) => p.id === r.id)) continue
      picked.push(r)
    }
  }
  return picked.length === count ? picked : null
}

function fillMeals(buckets, combo, mealSlots, planOffset) {
  const usedIds = new Set()
  const meals = []
  for (let s = 0; s < mealSlots.length; s++) {
    const slot = mealSlots[s]
    const dishes = []
    const types = [
      ['meat', combo.meat || 0],
      ['veg', combo.veg || 0],
      ['soup', combo.soup || 0]
    ]
    for (const [type, count] of types) {
      const offset = planOffset + s
      const picked = pickFromBucket(buckets[type] || [], count, usedIds, offset)
      if (!picked) return null
      for (const r of picked) {
        usedIds.add(r.id)
        dishes.push(toDish(r))
      }
    }
    meals.push({ slot, dishes })
  }
  return meals
}

function planFingerprint(meals) {
  return meals
    .map((m) => m.dishes.map((d) => d.recipeId).join(','))
    .join('|')
}

function softPenalty(recipe, ctx) {
  let score = 0
  if (ctx.downranked.has(recipe.id)) score += 100
  const tags = recipeAvoidTags(recipe, ctx.ingredientsByName)
  if (intersects(tags, ctx.memberAvoids)) score += 40
  let overlap = 0
  for (const name of recipe.mainIngredients || []) {
    if (ctx.recentIngredients.has(name)) overlap += 1
  }
  score += overlap * 10
  return score
}

function buildHomePlans(input) {
  const {
    recipes = [],
    ingredientsByName,
    selectedNames = [],
    scene,
    familyAvoids = [],
    excludedDishIds = [],
    downrankedIds = [],
    recentDishNames = [],
    memberAvoids = [],
    recentIngredientNames = [],
    maxPlans = 3
  } = input || {}

  const combo = (scene && scene.combo) || { meat: 0, veg: 0, soup: 0 }
  const mealSlots = (scene && scene.mealSlots) || []
  const mealType = scene && scene.mealType
  const avoids =
    mealType === 'daily' ? familyAvoids || [] : (scene && scene.partyAvoids) || []
  const excluded = new Set(excludedDishIds || [])
  const downranked = new Set(downrankedIds || [])
  const recentDishes = new Set(
    (recentDishNames || []).map((n) => String(n || '').replace(/\s+/g, '').trim()).filter(Boolean)
  )
  const memberAvoidSet = new Set(memberAvoids || [])
  const recentIngredients = new Set((recentIngredientNames || []).filter(Boolean))

  const candidates = []
  for (const recipe of recipes) {
    if (!isCandidate(recipe, selectedNames)) continue
    if (excluded.has(recipe.id)) continue
    const nameKey = String(recipe.name || '').replace(/\s+/g, '').trim()
    if (nameKey && recentDishes.has(nameKey)) continue
    const tags = recipeAvoidTags(recipe, ingredientsByName)
    if (intersects(tags, avoids)) continue
    candidates.push(recipe)
  }

  const buckets = { meat: [], veg: [], soup: [] }
  for (const r of candidates) {
    if (buckets[r.meatVeg]) buckets[r.meatVeg].push(r)
  }

  const ctx = {
    downranked,
    memberAvoids: memberAvoidSet,
    recentIngredients,
    ingredientsByName
  }
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => softPenalty(a, ctx) - softPenalty(b, ctx))
  }

  const plans = []
  const seen = new Set()
  const limit = Math.max(1, Number(maxPlans) || 3)
  const maxAttempts = Math.max(limit * 3, 6)
  for (let offset = 0; offset < maxAttempts && plans.length < limit; offset++) {
    const meals = fillMeals(buckets, combo, mealSlots, offset)
    if (!meals) {
      if (plans.length === 0) break
      continue
    }
    const fp = planFingerprint(meals)
    if (seen.has(fp)) continue
    seen.add(fp)
    plans.push({
      planIndex: plans.length,
      planKind: 'home',
      meals
    })
  }

  if (plans.length === 0) {
    return { plans: [], emptyReason: 'cannot_fill_combo' }
  }
  return { plans }
}

module.exports = { buildHomePlans }
