'use strict'
const cloud = require('wx-server-sdk')
// Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
// Source of truth for tests: cloudfunctions/_shared/homePlans.js — keep in sync when changing.
const { buildHomePlans } = require('./homePlans.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX = 500

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

async function resolveUid(openid) {
  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

exports.main = async (event) => {
  const action = (event && event.action) || 'create'
  if (action !== 'create') {
    return { ok: false, error: 'UNSUPPORTED_ACTION' }
  }

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  const uid = await resolveUid(openid)
  if (!uid) return { ok: false, error: 'USER_NOT_FOUND' }

  const userRes = await db.collection('users').where({ uid }).limit(1).get()
  const user = userRes.data[0]
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }

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

  const [recipesRes, ingredientsRes] = await Promise.all([
    db.collection('recipes').limit(MAX).get(),
    db.collection('ingredients').limit(MAX).get()
  ])

  const recipes = normalizeRecipes(recipesRes.data)
  const ingredientsByName = buildIngredientsByName(ingredientsRes.data)
  const selectedNames = selected.map((x) => x && x.name).filter(Boolean)

  const built = buildHomePlans({
    recipes,
    ingredientsByName,
    selectedNames,
    scene,
    familyAvoids: user.familyAvoids || [],
    excludedDishIds: [],
    maxPlans: 3
  })

  const requestId = makeRequestId()
  const now = db.serverDate()
  const plans = built.plans || []

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
  if (built.emptyReason) out.emptyReason = built.emptyReason
  return out
}
