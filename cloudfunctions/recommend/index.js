'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/homePlans.js
const { buildHomePlans } = require('./homePlans.js')
const {
  buildUnconventionalPlan,
  mergePlansWithUnconventional
} = require('./unconventionalPlans.js')
// Vendored: keep in sync with cloudfunctions/_shared/listAccepted.js
const {
  PAGE_SIZE,
  collectAteNamesByRequestId,
  shapeAcceptedItem,
  applyAcceptedCursor
} = require('./listAccepted.js')

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

async function loadRecentMealSignals(uid) {
  const since = new Date(Date.now() - RECENT_MEAL_DAYS * 24 * 60 * 60 * 1000)
  const dishNames = []
  const ingredientNames = []
  try {
    const res = await db.collection('meal_logs')
      .where({
        uid,
        createdAt: _.gte(since)
      })
      .limit(MAX)
      .get()
    for (const row of res.data || []) {
      for (const n of row.dishNames || []) {
        if (n) dishNames.push(n)
      }
      for (const n of row.ingredientNames || []) {
        if (n) ingredientNames.push(n)
      }
    }
  } catch (e) {
    // collection may not exist yet
  }
  return { recentDishNames: dishNames, recentIngredientNames: ingredientNames }
}

async function loadMemberAvoids(uid) {
  try {
    const res = await db.collection('members').where({ uid }).limit(50).get()
    const set = new Set()
    for (const m of res.data || []) {
      for (const a of m.avoids || []) {
        if (a) set.add(a)
      }
    }
    return Array.from(set)
  } catch (e) {
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
    cuisinePrefs: user.cuisinePrefs || {},
    excludedDishIds,
    downrankedIds,
    recentDishNames: doc._recentDishNames || [],
    memberAvoids: doc._memberAvoids || [],
    recentIngredientNames: doc._recentIngredientNames || [],
    maxPlans: 3
  })
  const unc = buildUnconventionalPlan({
    recipes: doc._recipes,
    selectedNames,
    dishFormPrefs: user.dishFormPrefs || {},
    mealSlots: (doc.scene && doc.scene.mealSlots) || [],
    scene: doc.scene,
    familyAvoids: user.familyAvoids || [],
    cuisinePrefs: user.cuisinePrefs || {}
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
  const slotLen = scene.mealSlots.length
  const maxSlots = scene.mealType === 'daily' ? 14 : 7
  if (slotLen > maxSlots) {
    return { ok: false, error: '顿数过多', code: 'MEAL_SLOTS_TOO_MANY' }
  }
  if (scene.mealType !== 'daily' && typeof scene.peopleCount !== 'number') {
    return { ok: false, error: 'PEOPLE_COUNT_REQUIRED' }
  }

  const catalog = await loadCatalog()
  const recent = await loadRecentMealSignals(uid)
  const memberAvoids = await loadMemberAvoids(uid)
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
    cuisinePrefs: user.cuisinePrefs || {},
    excludedDishIds: [],
    downrankedIds,
    recentDishNames: recent.recentDishNames,
    memberAvoids,
    recentIngredientNames: recent.recentIngredientNames,
    maxPlans: 3
  })

  const unc = buildUnconventionalPlan({
    recipes: catalog.recipes,
    selectedNames,
    dishFormPrefs: user.dishFormPrefs || {},
    mealSlots: scene.mealSlots,
    scene,
    familyAvoids: user.familyAvoids || [],
    cuisinePrefs: user.cuisinePrefs || {}
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
  const recent = await loadRecentMealSignals(uid)
  doc._recentDishNames = recent.recentDishNames
  doc._recentIngredientNames = recent.recentIngredientNames
  doc._memberAvoids = await loadMemberAvoids(uid)

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

function listAcceptedQueryDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isFinite(t) ? new Date(t) : null
  }
  if (typeof value === 'object') {
    if (typeof value.$date === 'number') return new Date(value.$date)
    if (typeof value.valueOf === 'function') {
      const n = Number(value.valueOf())
      if (Number.isFinite(n)) return new Date(n)
    }
  }
  return null
}

async function handleListAccepted(event, uid) {
  const cursor = (event && event.cursor) || null
  const fetchLimit = Math.min(20, Number(event && event.limit) || PAGE_SIZE) + 5

  const where = { uid, accepted: true }
  if (cursor && cursor.acceptedAt != null && cursor.acceptedAt !== '') {
    const cursorAt = listAcceptedQueryDate(cursor.acceptedAt)
    where.acceptedAt = _.lte(cursorAt || cursor.acceptedAt)
  }

  let rows = []
  try {
    const recRes = await db.collection('recommendations')
      .where(where)
      .orderBy('acceptedAt', 'desc')
      .orderBy('_id', 'desc') // tie-break matches applyAcceptedCursor string _id compare
      .limit(fetchLimit)
      .get()
    rows = recRes.data || []
  } catch (e) {
    if (!where.acceptedAt) throw e
    const recRes = await db.collection('recommendations')
      .where({ uid, accepted: true })
      .orderBy('acceptedAt', 'desc')
      .orderBy('_id', 'desc') // tie-break matches applyAcceptedCursor string _id compare
      .limit(fetchLimit)
      .get()
    rows = recRes.data || []
  }

  const pageDocs = applyAcceptedCursor(rows, cursor)

  const requestIds = []
  const seenReq = new Set()
  for (const doc of pageDocs) {
    if (!doc || !doc.requestId || seenReq.has(doc.requestId)) continue
    seenReq.add(doc.requestId)
    requestIds.push(doc.requestId)
  }

  let mealLogs = []
  if (requestIds.length) {
    try {
      const logRes = await db.collection('meal_logs')
        .where({
          uid,
          requestId: _.in(requestIds.slice(0, 10))
        })
        .limit(MAX)
        .get()
      mealLogs = logRes.data || []
    } catch (e) {
      mealLogs = []
    }
  }

  const ateMap = collectAteNamesByRequestId(mealLogs)
  const items = []
  for (const doc of pageDocs) {
    const item = shapeAcceptedItem(doc, ateMap.get(doc.requestId))
    if (item) items.push(item)
  }

  let nextCursor = null
  if (pageDocs.length === PAGE_SIZE) {
    const lastDoc = pageDocs[pageDocs.length - 1]
    const rest = applyAcceptedCursor(rows, {
      acceptedAt: lastDoc.acceptedAt,
      recommendationId: lastDoc._id
    })
    if (rest.length > 0 || rows.length >= fetchLimit) {
      const lastItem = items[items.length - 1]
      nextCursor = {
        acceptedAt: (lastItem && lastItem.acceptedAt) || lastDoc.acceptedAt,
        recommendationId: (lastItem && lastItem.recommendationId) || lastDoc._id
      }
    }
  }

  return { ok: true, items, nextCursor }
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
  if (action === 'listAccepted') return handleListAccepted(event, uid)
  if (action === 'engage') return handleEngage(event, uid)
  return { ok: false, error: 'UNSUPPORTED_ACTION' }
}
