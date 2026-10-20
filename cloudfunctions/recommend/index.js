'use strict'
const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/homePlans.js
const { buildHomePlans } = require('./homePlans.js')
const {
  loadAliases,
  buildAliasIndex
} = require('./aliasMatch.js')
const { expandMealDiners } = require('./members.js')
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
// Vendored: keep in sync with cloudfunctions/_shared/recipePool.js
const {
  RECIPE_BATCH_SIZE,
  pickRecipeBatch,
  isRecipePoolExhausted,
  recipeDocId
} = require('./recipePool.js')
// Vendored: keep in sync with cloudfunctions/_shared/suggestCombo.js
const { suggestPartyCombo } = require('./suggestCombo.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX = 500
const RECENT_MEAL_DAYS = 7
const RECIPE_PAGE = 100
const RECIPE_MAX_PAGES = 5
const RECIPE_REFILL_MAX = 3
const IN_QUERY_CHUNK = 10

/** @type {Map|null} */
let _ingredientsCache = null
/** @type {Promise<Map>|null} */
let _ingredientsLoading = null

/** @type {ReturnType<buildAliasIndex>|null} */
let _aliasIndex = null
function getAliasIndex() {
  if (_aliasIndex) return _aliasIndex
  const p = path.join(__dirname, 'data', 'aliases.json')
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  _aliasIndex = buildAliasIndex(loadAliases(raw))
  return _aliasIndex
}

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

async function loadIngredientsCached() {
  if (_ingredientsCache) return _ingredientsCache
  if (_ingredientsLoading) return _ingredientsLoading
  _ingredientsLoading = db
    .collection('ingredients')
    .limit(MAX)
    .get()
    .then((res) => {
      _ingredientsCache = buildIngredientsByName(res.data)
      _ingredientsLoading = null
      return _ingredientsCache
    })
    .catch((err) => {
      _ingredientsLoading = null
      throw err
    })
  return _ingredientsLoading
}

async function queryRecipesPage(where, skip, limit) {
  let q = db.collection('recipes').where(where)
  if (skip > 0) q = q.skip(skip)
  const res = await q.limit(limit).get()
  return normalizeRecipes(res.data)
}

/**
 * 城内优先再补全国，凑满一批（默认 50），跳过 excludeIds。
 * @returns {{ recipes: object[], exhausted: boolean }}
 */
async function loadRecipeBatch({ city, excludeIds }) {
  const exclude = excludeIds || []
  const cityKey =
    city && String(city).trim() ? String(city).trim() : null
  const collected = []

  if (cityKey) {
    for (let page = 0; page < RECIPE_MAX_PAGES; page++) {
      const rows = await queryRecipesPage(
        { cities: cityKey },
        page * RECIPE_PAGE,
        RECIPE_PAGE
      )
      collected.push(...rows)
      const picked = pickRecipeBatch(collected, {
        city: cityKey,
        excludeIds: exclude,
        limit: RECIPE_BATCH_SIZE
      })
      if (picked.length >= RECIPE_BATCH_SIZE) {
        return { recipes: picked, exhausted: false }
      }
      if (rows.length < RECIPE_PAGE) break
    }
  }

  let nationalEnded = false
  for (let page = 0; page < RECIPE_MAX_PAGES; page++) {
    const rows = await queryRecipesPage(
      { cities: [] },
      page * RECIPE_PAGE,
      RECIPE_PAGE
    )
    collected.push(...rows)
    if (rows.length < RECIPE_PAGE) nationalEnded = true
    const picked = pickRecipeBatch(collected, {
      city: cityKey,
      excludeIds: exclude,
      limit: RECIPE_BATCH_SIZE
    })
    if (picked.length >= RECIPE_BATCH_SIZE) {
      return { recipes: picked, exhausted: false }
    }
    if (nationalEnded) break
  }

  const picked = pickRecipeBatch(collected, {
    city: cityKey,
    excludeIds: exclude,
    limit: RECIPE_BATCH_SIZE
  })
  return { recipes: picked, exhausted: picked.length === 0 }
}

async function loadRecipesByIds(ids) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)))
  if (!unique.length) return []
  const out = []
  const seen = new Set()
  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK) {
    const chunk = unique.slice(i, i + IN_QUERY_CHUNK)
    const res = await db
      .collection('recipes')
      .where({ id: _.in(chunk) })
      .limit(chunk.length)
      .get()
    for (const row of normalizeRecipes(res.data)) {
      const id = recipeDocId(row)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(row)
    }
  }
  return out
}

function mergeRecipeBatch(list, ids, batchRecipes) {
  const nextList = list.slice()
  const nextIds = ids.slice()
  for (const row of batchRecipes || []) {
    const id = recipeDocId(row)
    if (!id || nextIds.includes(id)) continue
    nextIds.push(id)
    nextList.push(row)
  }
  return { list: nextList, ids: nextIds }
}

/**
 * 组不出方案或池已被 exclude 耗尽时，按批续拉（最多 extraBatches 次）。
 * @param {boolean} [alreadyExhausted]
 */
async function refillRecipePool(city, poolIds, recipes, buildOnce, extraBatches, alreadyExhausted) {
  let ids = Array.isArray(poolIds) ? poolIds.slice() : []
  let list = Array.isArray(recipes) ? recipes.slice() : []
  let exhausted = !!alreadyExhausted
  let built = buildOnce(list)
  const maxExtra = typeof extraBatches === 'number' ? extraBatches : RECIPE_REFILL_MAX

  for (let i = 0; i < maxExtra; i++) {
    if ((built.plans || []).length > 0) break
    if (exhausted) break
    const batch = await loadRecipeBatch({ city, excludeIds: ids })
    exhausted = batch.exhausted
    if (!(batch.recipes || []).length) break
    const merged = mergeRecipeBatch(list, ids, batch.recipes)
    list = merged.list
    ids = merged.ids
    built = buildOnce(list)
  }

  return {
    recipes: list,
    recipePoolIds: ids,
    recipePoolExhausted: exhausted,
    built
  }
}

function createdAtMs(v) {
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

function normalizeIngName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
}

async function loadRecentMealSignals(uid) {
  const now = Date.now()
  const since = new Date(now - RECENT_MEAL_DAYS * 24 * 60 * 60 * 1000)
  const dishNames = []
  /** @type {Record<string, number>} 食材 → 距今天数（只保留最近一次） */
  const recentIngredientDays = {}
  try {
    const res = await db.collection('meal_logs')
      .where({
        uid,
        createdAt: _.gte(since)
      })
      .limit(MAX)
      .get()
    const dayMs = 24 * 60 * 60 * 1000
    for (const row of res.data || []) {
      for (const n of row.dishNames || []) {
        if (n) dishNames.push(n)
      }
      const created = createdAtMs(row.createdAt)
      const daysAgo =
        created == null ? 0 : Math.max(0, Math.floor((now - created) / dayMs))
      for (const n of row.ingredientNames || []) {
        const key = normalizeIngName(n)
        if (!key) continue
        if (recentIngredientDays[key] == null || daysAgo < recentIngredientDays[key]) {
          recentIngredientDays[key] = daysAgo
        }
      }
    }
  } catch (e) {
    // collection may not exist yet
  }
  return { recentDishNames: dishNames, recentIngredientDays }
}

async function loadMembers(uid) {
  try {
    const res = await db.collection('members').where({ uid }).limit(50).get()
    return res.data || []
  } catch (e) {
    return []
  }
}

/** 日常 = members∪访客；非日常 = 仅 partyCounts 档位默认（忽略 members 个人忌口） */
function dinersForScene(members, scene) {
  return expandMealDiners(members || [], scene || {})
}

function rebuildPlans(user, doc, excludedDishIds) {
  const selected = doc.selectedIngredients || []
  const selectedNames = selected.map((x) => x && x.name).filter(Boolean)
  const downrankedIds = (user.rejectDownranks || []).map((x) =>
    typeof x === 'string' ? x : x && x.recipeId
  ).filter(Boolean)
  const swapCount = doc.swapCount || 0
  const sessionSeed = String(doc.requestId || '') + ':' + String(swapCount)
  const built = buildHomePlans({
    recipes: doc._recipes,
    ingredientsByName: doc._ingredientsByName,
    selectedNames,
    aliasIndex: getAliasIndex(),
    scene: doc.scene,
    familyAvoids: user.familyAvoids || [],
    cuisinePrefs: user.cuisinePrefs || {},
    excludedDishIds,
    downrankedIds,
    recentDishNames: doc._recentDishNames || [],
    diners: doc._diners || [],
    recentIngredientDays: doc._recentIngredientDays || {},
    maxPlans: 3,
    sessionSeed
  })
  const unc = buildUnconventionalPlan({
    recipes: doc._recipes,
    selectedNames,
    dishFormPrefs: user.dishFormPrefs || {},
    mealSlots: (doc.scene && doc.scene.mealSlots) || [],
    scene: doc.scene,
    familyAvoids: user.familyAvoids || [],
    cuisinePrefs: user.cuisinePrefs || {},
    sessionSeed
  })
  const plans = mergePlansWithUnconventional(built.plans || [], unc, 3)
  const out = { plans }
  if (built.emptyReason && plans.length === 0) out.emptyReason = built.emptyReason
  return out
}

async function handleCreate(event, uid, user) {
  const selected = (event && event.selected) || []
  const sceneIn = (event && event.scene) || null

  if (!Array.isArray(selected) || selected.length < 1) {
    return { ok: false, error: 'SELECTED_REQUIRED' }
  }
  if (!sceneIn || typeof sceneIn !== 'object') {
    return { ok: false, error: 'SCENE_REQUIRED' }
  }

  const scene = Object.assign({}, sceneIn)
  const requestId = makeRequestId()

  // 聚会：权威 combo 用 requestId 稳定重算（与客户端预览种子可不同，同会话以服务端为准）
  if (scene.mealType !== 'daily') {
    const partyCombo = suggestPartyCombo(scene.partyCounts, requestId)
    if (!partyCombo) {
      return { ok: false, error: 'PEOPLE_COUNT_REQUIRED' }
    }
    scene.combo = partyCombo
    const pc = scene.partyCounts || {}
    scene.peopleCount =
      (Number(pc.adult) || 0) + (Number(pc.child) || 0) + (Number(pc.elder) || 0)
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
  if (scene.mealType !== 'daily' && !(typeof scene.peopleCount === 'number' && scene.peopleCount >= 1)) {
    return { ok: false, error: 'PEOPLE_COUNT_REQUIRED' }
  }

  const city = user.city || null
  const [batch, ingredientsByName, recent, members] = await Promise.all([
    loadRecipeBatch({ city, excludeIds: [] }),
    loadIngredientsCached(),
    loadRecentMealSignals(uid),
    loadMembers(uid)
  ])

  const diners = dinersForScene(members, scene)
  const selectedNames = selected.map((x) => x && x.name).filter(Boolean)
  const downrankedIds = (user.rejectDownranks || []).map((x) =>
    typeof x === 'string' ? x : x && x.recipeId
  ).filter(Boolean)

  const sessionSeed = requestId + ':0'

  const buildOnce = (recipes) => {
    const home = buildHomePlans({
      recipes,
      ingredientsByName,
      selectedNames,
      aliasIndex: getAliasIndex(),
      scene,
      familyAvoids: user.familyAvoids || [],
      cuisinePrefs: user.cuisinePrefs || {},
      excludedDishIds: [],
      downrankedIds,
      recentDishNames: recent.recentDishNames,
      diners,
      recentIngredientDays: recent.recentIngredientDays || {},
      maxPlans: 3,
      sessionSeed
    })
    const unc = buildUnconventionalPlan({
      recipes,
      selectedNames,
      dishFormPrefs: user.dishFormPrefs || {},
      mealSlots: scene.mealSlots,
      scene,
      familyAvoids: user.familyAvoids || [],
      cuisinePrefs: user.cuisinePrefs || {},
      sessionSeed
    })
    const plans = mergePlansWithUnconventional(home.plans || [], unc, 3)
    const out = { plans }
    if (home.emptyReason && plans.length === 0) out.emptyReason = home.emptyReason
    return out
  }

  let recipes = batch.recipes || []
  let recipePoolIds = recipes.map(recipeDocId).filter(Boolean)
  let recipePoolExhausted = !!batch.exhausted
  let built = buildOnce(recipes)

  if ((built.plans || []).length === 0 && !recipePoolExhausted) {
    const refilled = await refillRecipePool(
      city,
      recipePoolIds,
      recipes,
      buildOnce,
      RECIPE_REFILL_MAX,
      recipePoolExhausted
    )
    recipes = refilled.recipes
    recipePoolIds = refilled.recipePoolIds
    recipePoolExhausted = refilled.recipePoolExhausted
    built = refilled.built
  }

  const plans = built.plans || []

  // 凑不出：不写 recommendations，由确认页弹窗「食材不够出菜了」（与推荐页同款）
  if (!plans.length) {
    return {
      ok: true,
      requestId,
      plans: [],
      emptyReason: built.emptyReason || 'cannot_fill_combo'
    }
  }

  const now = db.serverDate()
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
      recipePoolIds,
      recipePoolExhausted,
      feedback: [],
      createdAt: now,
      updatedAt: now
    }
  })

  return { ok: true, requestId, plans }
}

async function handleSwapOrReject(event, uid, user, kind) {
  const requestId = event && event.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }

  const doc = await findRecommendation(uid, requestId)
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }

  const city = user.city || null
  let recipePoolIds = Array.isArray(doc.recipePoolIds) ? doc.recipePoolIds.slice() : []
  let recipePoolExhausted = !!doc.recipePoolExhausted

  const [poolRecipes, ingredientsByName, recent, members] = await Promise.all([
    recipePoolIds.length
      ? loadRecipesByIds(recipePoolIds)
      : loadRecipeBatch({ city, excludeIds: [] }).then((b) => {
          recipePoolExhausted = b.exhausted
          recipePoolIds = (b.recipes || []).map(recipeDocId).filter(Boolean)
          return b.recipes || []
        }),
    loadIngredientsCached(),
    loadRecentMealSignals(uid),
    loadMembers(uid)
  ])

  let recipes = poolRecipes || []
  doc._recipes = recipes
  doc._ingredientsByName = ingredientsByName
  doc._recentDishNames = recent.recentDishNames
  doc._recentIngredientDays = recent.recentIngredientDays || {}
  doc._diners = dinersForScene(members, doc.scene)

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

  const swapCount = (doc.swapCount || 0) + 1
  const buildOnce = (recipeList) =>
    rebuildPlans(
      user,
      Object.assign({}, doc, {
        swapCount,
        _recipes: recipeList,
        _ingredientsByName: ingredientsByName
      }),
      excluded
    )

  let built = buildOnce(recipes)

  if (
    ((built.plans || []).length === 0 || isRecipePoolExhausted(recipePoolIds, excluded)) &&
    !recipePoolExhausted
  ) {
    // 池耗尽时先拉下一批再组；组空时也续拉
    if (isRecipePoolExhausted(recipePoolIds, excluded)) {
      const batch = await loadRecipeBatch({ city, excludeIds: recipePoolIds })
      recipePoolExhausted = batch.exhausted
      const merged = mergeRecipeBatch(recipes, recipePoolIds, batch.recipes)
      recipes = merged.list
      recipePoolIds = merged.ids
      built = buildOnce(recipes)
    }
    if ((built.plans || []).length === 0 && !recipePoolExhausted) {
      const refilled = await refillRecipePool(
        city,
        recipePoolIds,
        recipes,
        buildOnce,
        RECIPE_REFILL_MAX,
        recipePoolExhausted
      )
      recipes = refilled.recipes
      recipePoolIds = refilled.recipePoolIds
      recipePoolExhausted = refilled.recipePoolExhausted
      built = refilled.built
    }
  }

  const plans = built.plans || []

  // 凑不出新方案：保留当前展示方案，不推进 exclude/swap（弹窗告知即可）
  if (!plans.length) {
    return {
      ok: true,
      requestId,
      plans: doc.plans || [],
      swapCount: doc.swapCount || 0,
      emptyReason: built.emptyReason || 'cannot_fill_combo',
      noNewPlans: true
    }
  }

  await db.collection('recommendations').doc(doc._id).update({
    data: {
      plans,
      excludedDishIds: excluded,
      swapCount,
      feedback,
      recipePoolIds,
      recipePoolExhausted,
      updatedAt: db.serverDate()
    }
  })

  return { ok: true, requestId, plans, swapCount }
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
  // 日常写回只写 combo；人数缓存由成员表维护，禁止把访客人数写入 defaultPeopleCount
  if (scene.mealType === 'daily' && scene.combo) {
    await db.collection('users').where({ uid }).update({
      data: {
        defaultCombo: scene.combo,
        updatedAt: db.serverDate()
      }
    })
  }

  return {
    ok: true,
    requestId,
    accepted: true,
    acceptedPlanIndex: planIndex,
    // 带回完整 plan，避免客户端 Storage 缺 mainIngredients 时清单空白
    plans: doc.plans || [],
    scene,
    plan: (doc.plans || [])[planIndex] || (doc.plans || [])[0] || null
  }
}

async function handleGet(event, uid) {
  const requestId = event && event.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }
  const doc = await findRecommendation(uid, requestId)
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }
  return {
    ok: true,
    requestId,
    plans: doc.plans || [],
    scene: doc.scene || null,
    accepted: !!doc.accepted,
    acceptedPlanIndex: doc.acceptedPlanIndex
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
  if (action === 'get') return handleGet(event, uid)
  if (action === 'listAccepted') return handleListAccepted(event, uid)
  if (action === 'engage') return handleEngage(event, uid)
  return { ok: false, error: 'UNSUPPORTED_ACTION' }
}
