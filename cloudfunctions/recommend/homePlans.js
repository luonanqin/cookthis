'use strict'

const {
  normalizeIngredientName,
  computeFreshPenalty
} = require('./freshness.js')
const {
  recipeBlockedByCuisine,
  cuisineSoftDelta
} = require('./cuisinePrefs.js')
const { dinerSoftPenalty } = require('./members.js')

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

/** 非常规菜式不进家常荤素汤搭配（面/饺/火锅由 unconventional 单独出） */
function isUnconventionalRecipe(recipe) {
  if (!recipe) return false
  if (recipe.meatVeg === 'staple') return true
  const forms = [
    ...(recipe.dishForms || []),
    ...(recipe.stapleForms || [])
  ]
  return forms.some((t) => t === 'hotpot' || t === 'noodle' || t === 'dumpling')
}

function isCandidate(recipe, selectedNames) {
  if (recipe.enabled === false) return false
  if (isUnconventionalRecipe(recipe)) return false
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

function recipeMainKeys(recipe) {
  const keys = []
  const seen = new Set()
  for (const raw of (recipe && recipe.mainIngredients) || []) {
    const key = normalizeIngredientName(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

function overlapsUsedMains(recipe, usedMains) {
  if (!usedMains || usedMains.size === 0) return false
  for (const key of recipeMainKeys(recipe)) {
    if (usedMains.has(key)) return true
  }
  return false
}

/**
 * 从桶中取 count 道菜：硬去重菜名/主料签名/近义名；软偏好避开已用主料与跨方案已用菜，不够再放宽。
 */
function pickFromBucket(
  bucket,
  count,
  usedIds,
  usedNames,
  usedSignatures,
  usedNearKeys,
  usedMains,
  startOffset,
  preferAvoidIds
) {
  if (count <= 0) return []
  if (!bucket || bucket.length < count) return null
  const picked = []
  const localIds = new Set()
  const n = bucket.length
  const avoid = preferAvoidIds || null

  function commit(r) {
    picked.push(r)
    localIds.add(r.id)
    if (r.id != null) usedIds.add(r.id)
    const name = normalizeDishName(r.name)
    if (name) usedNames.add(name)
    const sig = recipeMainSignature(r)
    if (sig) usedSignatures.add(sig)
    const near = nearDishNameKey(r.name)
    if (near) usedNearKeys.add(near)
    for (const key of recipeMainKeys(r)) usedMains.add(key)
  }

  function blockedHard(r) {
    if (!r || usedIds.has(r.id) || localIds.has(r.id)) return true
    const name = normalizeDishName(r.name)
    if (name && usedNames.has(name)) return true
    const sig = recipeMainSignature(r)
    if (sig && usedSignatures.has(sig)) return true
    const near = nearDishNameKey(r.name)
    if (near && usedNearKeys.has(near)) return true
    return false
  }

  function tryPick(preferDiverse, preferCross) {
    for (let i = 0; i < n && picked.length < count; i++) {
      const r = bucket[(startOffset + i) % n]
      if (blockedHard(r)) continue
      if (preferCross && avoid && avoid.has(r.id)) continue
      if (preferDiverse && overlapsUsedMains(r, usedMains)) continue
      commit(r)
    }
  }

  tryPick(true, true)
  if (picked.length < count) tryPick(false, true)
  if (picked.length < count) tryPick(true, false)
  if (picked.length < count) tryPick(false, false)
  return picked.length === count ? picked : null
}

function fillMeals(buckets, combo, mealSlots, planOffset, preferAvoidIds) {
  const usedIds = new Set()
  const usedNames = new Set()
  const usedSignatures = new Set()
  const usedNearKeys = new Set()
  const usedMains = new Set()
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
      const picked = pickFromBucket(
        buckets[type] || [],
        count,
        usedIds,
        usedNames,
        usedSignatures,
        usedNearKeys,
        usedMains,
        offset,
        preferAvoidIds
      )
      if (!picked) return null
      for (const r of picked) dishes.push(toDish(r))
    }
    meals.push({ slot, dishes })
  }
  return meals
}

/** recipeId 优先；无 id 时用去空白菜名 */
function dishKey(dish) {
  if (!dish) return ''
  const id = dish.recipeId != null ? String(dish.recipeId).trim() : ''
  if (id) return 'id:' + id
  const name = String(dish.name || '').replace(/\s+/g, '').trim()
  return name ? 'name:' + name : ''
}

function collectDishKeys(meals) {
  const keys = []
  for (const m of meals || []) {
    for (const d of (m && m.dishes) || []) {
      const k = dishKey(d)
      if (k) keys.push(k)
    }
  }
  return keys
}

function planDishCount(meals) {
  return collectDishKeys(meals).length
}

/**
 * 两套 home 方案允许的相同菜上限（§3.0.6）。
 * 以两套中较大菜道数查表：少于 5 → 0；5～7 → 1；≥8 → 2。
 */
function overlapLimit(countA, countB) {
  const n = Math.max(Number(countA) || 0, Number(countB) || 0)
  if (n < 5) return 0
  if (n < 8) return 1
  return 2
}

function flattenDishes(meals) {
  const out = []
  for (const m of meals || []) {
    for (const d of (m && m.dishes) || []) {
      if (d) out.push(d)
    }
  }
  return out
}

function normalizeDishName(name) {
  return String(name || '').replace(/\s+/g, '').trim()
}

function recipeMainSignature(recipe) {
  const keys = recipeMainKeys(recipe).slice().sort()
  return keys.join('\0')
}

const COOK_VERBS = ['红烧', '烧', '炖', '炒', '爆', '焖', '煮', '蒸', '拌', '煎', '烤']

function nearDishNameKey(name) {
  let s = normalizeDishName(name)
  if (!s) return ''
  for (const v of COOK_VERBS) {
    if (!v) continue
    s = s.split(v).join('')
  }
  return s
}

/**
 * 相同：同 recipeId，或去空白菜名相同（一边无 id 仍可按菜名撞上）。
 */
function countSharedDishes(mealsA, mealsB) {
  const idsA = new Set()
  const namesA = new Set()
  for (const d of flattenDishes(mealsA)) {
    const id = d.recipeId != null ? String(d.recipeId).trim() : ''
    if (id) idsA.add(id)
    const name = normalizeDishName(d.name)
    if (name) namesA.add(name)
  }
  let n = 0
  const counted = new Set()
  for (const d of flattenDishes(mealsB)) {
    const id = d.recipeId != null ? String(d.recipeId).trim() : ''
    const name = normalizeDishName(d.name)
    const token = id ? 'id:' + id : name ? 'name:' + name : ''
    if (!token || counted.has(token)) continue
    const hit = (id && idsA.has(id)) || (name && namesA.has(name))
    if (!hit) continue
    counted.add(token)
    if (name) counted.add('name:' + name)
    if (id) counted.add('id:' + id)
    n++
  }
  return n
}

/** 候选套与已收录各套两两满足 §3.0.6 上限 */
function withinHomeOverlapCaps(candidateMeals, existingPlans) {
  const candCount = planDishCount(candidateMeals)
  for (const p of existingPlans || []) {
    const other = p && p.meals
    const limit = overlapLimit(candCount, planDishCount(other))
    if (countSharedDishes(candidateMeals, other) > limit) return false
  }
  return true
}

function collectRecipeIdsFromPlans(plans) {
  const ids = new Set()
  for (const p of plans || []) {
    for (const m of (p && p.meals) || []) {
      for (const d of (m && m.dishes) || []) {
        if (d && d.recipeId != null && String(d.recipeId)) {
          ids.add(d.recipeId)
        }
      }
    }
  }
  return ids
}

function planFingerprint(meals) {
  return meals
    .map((m) => m.dishes.map((d) => d.recipeId).join(','))
    .join('|')
}

function softPenalty(recipe, ctx) {
  let score = 0
  if (ctx.downranked.has(recipe.id)) score += 100
  if (ctx.diners && ctx.diners.length) {
    // §3.0.8 用餐人软分（忌口/小老/口味）
    score += dinerSoftPenalty(recipe, ctx.diners, ctx.ingredientsByName)
  } else {
    // 兼容旧入参：成员忌口并集
    const tags = recipeAvoidTags(recipe, ctx.ingredientsByName)
    if (intersects(tags, ctx.memberAvoids)) score += 40
  }
  score += computeFreshPenalty(recipe.mainIngredients || [], ctx.recentIngredientDays)
  score += cuisineSoftDelta(recipe, ctx.cuisinePrefs || {})
  return score
}

/** @returns {Record<string, number>} */
function resolveRecentIngredientDays(input) {
  const map = {}
  const daysObj = input && input.recentIngredientDays
  if (daysObj && typeof daysObj === 'object' && !Array.isArray(daysObj)) {
    for (const [k, v] of Object.entries(daysObj)) {
      const name = normalizeIngredientName(k)
      if (!name) continue
      const days = Number(v)
      if (!Number.isFinite(days) || days < 0) continue
      if (map[name] == null || days < map[name]) map[name] = days
    }
  }
  // 兼容旧入参：仅有名字时视为「今天刚吃」(系数 1.0)
  for (const n of (input && input.recentIngredientNames) || []) {
    const name = normalizeIngredientName(n)
    if (!name) continue
    if (map[name] == null) map[name] = 0
  }
  return map
}

/** FNV-1a 32-bit；同 seed 可复现 */
function hashSessionSeed(seed) {
  const s = String(seed == null ? '' : seed)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rotateArray(arr, n) {
  const list = Array.isArray(arr) ? arr : []
  if (list.length <= 1) return list.slice()
  const k = ((n % list.length) + list.length) % list.length
  if (k === 0) return list.slice()
  return list.slice(k).concat(list.slice(0, k))
}

/**
 * 软惩罚升序后，对「同分」连续带分别旋转，避免高惩罚菜被整桶旋到前面。
 */
function rotateEqualPenaltyBands(bucket, penaltyFn, seed) {
  const list = Array.isArray(bucket) ? bucket : []
  if (list.length <= 1) return list.slice()
  const out = []
  let i = 0
  let bandIdx = 0
  while (i < list.length) {
    const p = penaltyFn(list[i])
    let j = i + 1
    while (j < list.length && penaltyFn(list[j]) === p) j++
    const band = list.slice(i, j)
    out.push(...rotateArray(band, seed + bandIdx * 17))
    bandIdx++
    i = j
  }
  return out
}

function buildHomePlans(input) {
  const {
    recipes = [],
    ingredientsByName,
    selectedNames = [],
    scene,
    familyAvoids = [],
    cuisinePrefs = {},
    excludedDishIds = [],
    downrankedIds = [],
    recentDishNames = [],
    memberAvoids = [],
    diners = null,
    recentIngredientNames = [],
    recentIngredientDays = null,
    maxPlans = 3,
    sessionSeed = ''
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
  const recentDays = resolveRecentIngredientDays({
    recentIngredientDays,
    recentIngredientNames
  })

  const candidates = []
  for (const recipe of recipes) {
    if (!isCandidate(recipe, selectedNames)) continue
    if (excluded.has(recipe.id)) continue
    const nameKey = String(recipe.name || '').replace(/\s+/g, '').trim()
    if (nameKey && recentDishes.has(nameKey)) continue
    const tags = recipeAvoidTags(recipe, ingredientsByName)
    if (intersects(tags, avoids)) continue
    if (recipeBlockedByCuisine(recipe, cuisinePrefs)) continue
    candidates.push(recipe)
  }

  const buckets = { meat: [], veg: [], soup: [] }
  for (const r of candidates) {
    if (buckets[r.meatVeg]) buckets[r.meatVeg].push(r)
  }

  const ctx = {
    downranked,
    memberAvoids: memberAvoidSet,
    diners: Array.isArray(diners) ? diners : null,
    recentIngredientDays: recentDays,
    ingredientsByName,
    cuisinePrefs
  }
  const seedBase = hashSessionSeed(sessionSeed)
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => softPenalty(a, ctx) - softPenalty(b, ctx))
    const bucketSeed = seedBase ^ hashSessionSeed(key)
    buckets[key] = rotateEqualPenaltyBands(
      buckets[key],
      (r) => softPenalty(r, ctx),
      bucketSeed
    )
  }

  const plans = []
  const seen = new Set()
  const limit = Math.max(1, Number(maxPlans) || 3)
  // 多套差异化可能要跳过若干 offset；放宽尝试次数
  const maxAttempts = Math.max(limit * 12, 24)
  for (let offset = 0; offset < maxAttempts && plans.length < limit; offset++) {
    const preferAvoidIds = plans.length ? collectRecipeIdsFromPlans(plans) : null
    const meals = fillMeals(buckets, combo, mealSlots, offset, preferAvoidIds)
    if (!meals) {
      if (plans.length === 0) break
      continue
    }
    const fp = planFingerprint(meals)
    if (seen.has(fp)) continue
    // §3.0.6：与已收录 home 方案两两重复不得超过上限；凑不出则少出套数
    if (plans.length > 0 && !withinHomeOverlapCaps(meals, plans)) continue
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

module.exports = {
  buildHomePlans,
  isUnconventionalRecipe,
  softPenalty,
  hashSessionSeed,
  rotateArray,
  rotateEqualPenaltyBands,
  resolveRecentIngredientDays,
  dishKey,
  planDishCount,
  overlapLimit,
  countSharedDishes,
  withinHomeOverlapCaps,
  normalizeDishName,
  recipeMainSignature,
  nearDishNameKey
}
