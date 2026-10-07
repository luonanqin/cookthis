'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/homePlans.js
const { buildHomePlans } = require('./homePlans.js')
const {
  buildUnconventionalPlan,
  mergePlansWithUnconventional
} = require('./unconventionalPlans.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX = 500
const RECENT_MEAL_DAYS = 7

function isComboPresent(combo) {
  if (!combo || typeof combo !== 'object') return false
  const meat = Number(combo.meat) || 0
  const veg = Number(combo.veg) || 0
  const soup = Number(combo.soup) || 0
  return meat + veg + soup > 0
}

function makeRequestId() {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function normalizeRecipes(rows) {
  return (rows || []).map((r) => ({
    ...r,
    id: r.id || r._id
  }))
}

function buildIngredientsByName(rows) {
  const map = new Map()
  for (const row of rows || []) {
    if (!row || !row.name) continue
    map.set(row.name, { avoidTags: row.avoidTags || [] })
  }
  return map
}

function collectPlanRecipeIds(plans) {
  const ids = []
  for (const plan of plans || []) {
    for (const meal of plan.meals || []) {
      for (const dish of meal.dishes || []) {
        if (dish.recipeId) ids.push(dish.recipeId)
      }
    }
  }
  return ids
}

async function resolveUid(openid) {
  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

async function loadUser(uid) {
  const userRes = await db.collection('users').where({ uid }).limit(1).get()
  return userRes.data[0] || null
}

async function findRecommendation(uid, requestId) {
  const res = await db.collection('recommendations')
    .where({ uid, requestId })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function loadCatalog() {
  const [recipesRes, ingredientsRes] = await Promise.all([
    db.collection('recipes').limit(MAX).get(),
    db.collection('ingredients').limit(MAX).get()
  ])
  return {
    recipes: normalizeRecipes(recipesRes.data),
    ingredientsByName: buildIngredientsByName(ingredientsRes.data)
  }
}

async function loadRecentDishNames(uid) {
  const since = new Date(Date.now() - RECENT_MEAL_DAYS * 24 * 60 * 60 * 1000)
  try {
    const res = await db.collection('meal_logs')
      .where({
        uid,
        createdAt: _.gte(since)
      })
      .limit(MAX)
      .get()
    const names = []
    for (const row of res.data || []) {
      for (const n of row.dishNames || []) {
        if (n) names.push(n)
      }
    }
    return names
  } catch (e) {
    // collection may not exist yet in early envs
    return []
  }
}

function rebuildPlans(user, doc, excludedDishIds) {
  const selected = doc.selectedIngredients || []
  const selectedNames = selected.map((x) => x && x.name).filter(Boolean)
  const downrankedIds = (user.rejectDownranks || []).map((x) =>
    typeof x === 'string' ? x : x && x.recipeId
  ).filter(Boolean)
  const built = buildHomePlans({
    recipes: doc._recipes,
    ingredientsByName: doc._ingredientsByName,
    selectedNames,
    scene: doc.scene,
    familyAvoids: user.familyAvoids || [],
    excludedDishIds,
    downrankedIds,
    recentDishNames: doc._recentDishNames || [],
    maxPlans: 3
  })
  const unc = buildUnconventionalPlan({
    recipes: doc._recipes,
    selectedNames,
    dishFormPrefs: user.dishFormPrefs || {},
    mealSlots: (doc.scene && doc.scene.mealSlots) || [],
    scene: doc.scene,
    familyAvoids: user.familyAvoids || []
  })
  const plans = mergePlansWithUnconventional(built.plans || [], unc, 3)
  const out = { plans }
  if (built.emptyReason && plans.length === 0) out.emptyReason = built.emptyReason
  return out
}

async function handleCreate(event, uid, user) {
  const selected = (event && event.selected) || []
  const scene = (event && event.scene) || null

  if (!Array.isArray(selected) || selected.length < 1) {
    return { ok: false, error: 'SELECTED_REQUIRED' }
  }
  if (!scene || typeof scene !== 'object') {
    return { ok: false, error: 'SCENE_REQUIRED' }
  }
  if (!isComboPresent(scene.combo)) {
    return { ok: false, error: 'COMBO_REQUIRED' }
  }
  if (!Array.isArray(scene.mealSlots) || scene.mealSlots.length < 1) {
    return { ok: false, error: 'MEAL_SLOTS_REQUIRED' }
  }
  if (scene.mealType !== 'daily' && typeof scene.peopleCount !== 'number') {
    return { ok: false, error: 'PEOPLE_COUNT_REQUIRED' }
  }

  const catalog = await loadCatalog()
  const recentDishNames = await loadRecentDishNames(uid)
  const selectedNames = selected.map((x) => x && x.name).filter(Boolean)
  const downrankedIds = (user.rejectDownranks || []).map((x) =>
    typeof x === 'string' ? x : x && x.recipeId
  ).filter(Boolean)

  const built = buildHomePlans({
    recipes: catalog.recipes,
    ingredientsByName: catalog.ingredientsByName,
    selectedNames,
    scene,
    familyAvoids: user.familyAvoids || [],
    excludedDishIds: [],
    downrankedIds,
    recentDishNames,
    maxPlans: 3
  })

  const unc = buildUnconventionalPlan({
    recipes: catalog.recipes,
    selectedNames,
    dishFormPrefs: user.dishFormPrefs || {},
    mealSlots: scene.mealSlots,
    scene,
    familyAvoids: user.familyAvoids || []
  })
  const requestId = makeRequestId()
  const now = db.serverDate()
  const plans = mergePlansWithUnconventional(built.plans || [], unc, 3)

  await db.collection('recommendations').add({
    data: {
      uid,
      requestId,
      scene,
      selectedIngredients: selected,
      plans,
      accepted: false,
      swapCount: 0,
      excludedDishIds: [],
      feedback: [],
      createdAt: now,
      updatedAt: now
    }
  })

  const out = { ok: true, requestId, plans }
  if (built.emptyReason && plans.length === 0) out.emptyReason = built.emptyReason
  return out
}

async function handleSwapOrReject(event, uid, user, kind) {
  const requestId = event && event.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }

  const doc = await findRecommendation(uid, requestId)
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }

  const catalog = await loadCatalog()
  doc._recipes = catalog.recipes
  doc._ingredientsByName = catalog.ingredientsByName
  doc._recentDishNames = await loadRecentDishNames(uid)

  const fromPlans = collectPlanRecipeIds(doc.plans)
  const excluded = Array.from(new Set([...(doc.excludedDishIds || []), ...fromPlans]))
  const now = new Date().toISOString()
  const feedback = Array.isArray(doc.feedback) ? doc.feedback.slice() : []
  const entry = { type: kind, at: now }
  if (kind === 'reject') {
    if (event.reason) entry.reason = event.reason
    if (typeof event.planIndex === 'number') entry.planIndex = event.planIndex
  }
  feedback.push(entry)

  if (kind === 'reject' && fromPlans.length) {
    const existing = (user.rejectDownranks || []).map((x) =>
      typeof x === 'string' ? x : x && x.recipeId
    ).filter(Boolean)
    const merged = Array.from(new Set(existing.concat(fromPlans)))
    const rejectDownranks = merged.map((recipeId) => ({ recipeId, at: now }))
    await db.collection('users').where({ uid }).update({
      data: {
        rejectDownranks,
        updatedAt: db.serverDate()
      }
    })
    user.rejectDownranks = rejectDownranks
  }

  const built = rebuildPlans(user, doc, excluded)
  const plans = built.plans || []
  const swapCount = (doc.swapCount || 0) + 1

  await db.collection('recommendations').doc(doc._id).update({
    data: {
      plans,
      excludedDishIds: excluded,
      swapCount,
      feedback,
      updatedAt: db.serverDate()
    }
  })

  const out = { ok: true, requestId, plans, swapCount }
  if (built.emptyReason && (out.plans || []).length === 0) out.emptyReason = built.emptyReason
  return out
}

async function handleAccept(event, uid, user) {
  const requestId = event && event.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }
  const planIndex = typeof event.planIndex === 'number' ? event.planIndex : 0

  const doc = await findRecommendation(uid, requestId)
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }

  await db.collection('recommendations').doc(doc._id).update({
    data: {
      accepted: true,
      acceptedAt: db.serverDate(),
      acceptedPlanIndex: planIndex,
      updatedAt: db.serverDate()
    }
  })

  const scene = doc.scene || {}
  if (scene.mealType === 'daily') {
    const data = { updatedAt: db.serverDate() }
    if (typeof scene.peopleCount === 'number') data.defaultPeopleCount = scene.peopleCount
    if (scene.combo) data.defaultCombo = scene.combo
    await db.collection('users').where({ uid }).update({ data })
  }

  return {
    ok: true,
    requestId,
    accepted: true,
    acceptedPlanIndex: planIndex
  }
}

async function handleEngage(event, uid) {
  const requestId = event && event.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }
  const dwellMs = Number(event.dwellMs) || 0
  const planIndex = typeof event.planIndex === 'number' ? event.planIndex : 0

  const doc = await findRecommendation(uid, requestId)
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }

  const patch = {
    dwellMs,
    updatedAt: db.serverDate()
  }
  if (!doc.engagedAt && dwellMs >= 30000) {
    patch.engagedAt = db.serverDate()
    patch.engagedPlanIndex = planIndex
  }

  await db.collection('recommendations').doc(doc._id).update({ data: patch })
  return {
    ok: true,
    requestId,
    engaged: !!(doc.engagedAt || dwellMs >= 30000),
    dwellMs
  }
}

exports.main = async (event) => {
  const action = (event && event.action) || 'create'
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  const uid = await resolveUid(openid)
  if (!uid) return { ok: false, error: 'USER_NOT_FOUND' }

  const user = await loadUser(uid)
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }

  if (action === 'create') return handleCreate(event, uid, user)
  if (action === 'swap') return handleSwapOrReject(event, uid, user, 'swap')
  if (action === 'reject') return handleSwapOrReject(event, uid, user, 'reject')
  if (action === 'accept') return handleAccept(event, uid, user)
  if (action === 'engage') return handleEngage(event, uid)
  return { ok: false, error: 'UNSUPPORTED_ACTION' }
}
