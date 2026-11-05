'use strict'
const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')
// Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
// Source of truth for tests: cloudfunctions/_shared/confirmList.js — keep in sync when changing.
const { buildConfirmList } = require('./confirmList.js')
// Vendored: keep in sync with cloudfunctions/_shared/confirmListFromScale.js
const { flattenScaleBucket } = require('./confirmListFromScale.js')
// Vendored: keep in sync with cloudfunctions/_shared/categoryTaxonomy.js
const {
  normalizeCategory,
  needsCategoryMigration
} = require('./categoryTaxonomy.js')
// Vendored: keep in sync with cloudfunctions/_shared/accessGuard.js
const {
  resolveIngredientsCity,
  consumeIngredientsCall
} = require('./accessGuard.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX = 500
const VALID_SCALES = new Set(['small', 'medium', 'large'])
const MIGRATE_CONFIRM = 'YES_MIGRATE_CATEGORIES_ZH'

let normalizeCityKey
try {
  normalizeCityKey = require('./aliasMatch.js').normalizeCityKey
} catch (_) {
  normalizeCityKey = function normalizeCityKeyFallback(city) {
    let s = String(city || '').trim()
    if (!s) return ''
    const suffixes = ['特别行政区', '自治区', '省', '市']
    for (let i = 0; i < suffixes.length; i++) {
      const suf = suffixes[i]
      if (s.length > suf.length && s.endsWith(suf)) {
        s = s.slice(0, -suf.length)
        break
      }
    }
    return s
  }
}

function resolveScale(eventScale, user) {
  const raw =
    (eventScale != null && eventScale !== '' ? eventScale : null) ||
    (user && user.marketScaleEffective) ||
    'medium'
  const s = String(raw)
  return VALID_SCALES.has(s) ? s : 'medium'
}

function loadCityScaleDoc(cityKey) {
  if (!cityKey) return null
  const filePath = path.join(
    __dirname,
    'data',
    'cities',
    cityKey,
    'ingredients-by-scale.json'
  )
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.warn(
      'ingredients: failed to read city scale file',
      cityKey,
      err && err.message
    )
    return null
  }
}

function enrichAvoidTags(built, ingredients) {
  const byName = new Map()
  for (const ing of ingredients || []) {
    if (!ing || !ing.name) continue
    byName.set(String(ing.name), ing)
  }
  const apply = (list) => {
    for (const item of list || []) {
      const hit = byName.get(item.name)
      item.avoidTags = (hit && Array.isArray(hit.avoidTags) && hit.avoidTags) || []
      if (hit && hit.id) item.id = hit.id
    }
  }
  apply(built.seasonal)
  apply(built.yearRound)
}

async function loadUserForOpenid(openid) {
  const idRes = await db
    .collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  const u = await db
    .collection('users')
    .where({ uid: idRes.data[0].uid })
    .limit(1)
    .get()
  return u.data[0] || null
}

/**
 * 一次性：把云库英文 category 改成中文。
 * 云函数测试入参：
 * { "action": "migrateCategoriesZh", "confirm": "YES_MIGRATE_CATEGORIES_ZH", "scope": "ingredients" }
 * scope: ingredients | recommendations | all
 */
async function handleMigrateCategoriesZh(event) {
  if ((event && event.confirm) !== MIGRATE_CONFIRM) {
    return {
      ok: false,
      error: 'CONFIRM_REQUIRED',
      hint: `传 confirm: "${MIGRATE_CONFIRM}"`
    }
  }
  const scope = String((event && event.scope) || 'all')
  const doIng = scope === 'all' || scope === 'ingredients'
  const doRec = scope === 'all' || scope === 'recommendations'
  const out = {
    ok: true,
    ingredientsUpdated: 0,
    ingredientsScanned: 0,
    recommendationsUpdated: 0,
    recommendationsScanned: 0
  }

  if (doIng) {
    let skip = 0
    for (;;) {
      const res = await db
        .collection('ingredients')
        .skip(skip)
        .limit(100)
        .get()
      const rows = res.data || []
      if (!rows.length) break
      out.ingredientsScanned += rows.length
      for (const row of rows) {
        if (!needsCategoryMigration(row.category)) continue
        const next = normalizeCategory(row.category)
        await db.collection('ingredients').doc(row._id).update({
          data: { category: next }
        })
        out.ingredientsUpdated++
      }
      skip += rows.length
      if (rows.length < 100) break
    }
  }

  if (doRec) {
    let skip = 0
    for (;;) {
      const res = await db
        .collection('recommendations')
        .skip(skip)
        .limit(50)
        .get()
      const rows = res.data || []
      if (!rows.length) break
      out.recommendationsScanned += rows.length
      for (const row of rows) {
        const selected = row.selectedIngredients
        if (!Array.isArray(selected) || !selected.length) continue
        let changed = false
        const nextSelected = selected.map((item) => {
          if (!item || typeof item !== 'object') return item
          if (!needsCategoryMigration(item.category)) return item
          changed = true
          return Object.assign({}, item, {
            category: normalizeCategory(item.category, '其他')
          })
        })
        if (!changed) continue
        await db.collection('recommendations').doc(row._id).update({
          data: {
            selectedIngredients: nextSelected,
            updatedAt: db.serverDate()
          }
        })
        out.recommendationsUpdated++
      }
      skip += rows.length
      if (rows.length < 50) break
    }
  }

  return out
}

exports.main = async (event) => {
  // 控制台「云函数测试」没有 OPENID；迁移必须在登录校验之前分支
  const action = event && (event.action || (event.data && event.data.action))
  if (action === 'migrateCategoriesZh') {
    const payload =
      event && event.data && event.data.action ? event.data : event
    return handleMigrateCategoriesZh(payload)
  }

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  // #1：城市只信账号；#3：按 uid 日上限 + 弱间隔
  const user = await loadUserForOpenid(openid)
  if (!user || !user._id) return { ok: false, error: 'NO_USER' }

  const nowMs = Date.now()
  const consumed = consumeIngredientsCall(user.accessGuard, nowMs)
  if (!consumed.ok) return { ok: false, error: consumed.error }
  await db.collection('users').doc(user._id).update({
    data: {
      accessGuard: consumed.next,
      updatedAt: db.serverDate()
    }
  })

  const city = resolveIngredientsCity({
    eventCity: event && event.city,
    userCity: user.city
  })
  const scale = resolveScale(event && event.scale, user)
  const cityKey = normalizeCityKey(city)
  const scaleDoc = loadCityScaleDoc(cityKey)

  const res = await db.collection('ingredients').limit(MAX).get()

  if (scaleDoc) {
    const built = flattenScaleBucket(scaleDoc, scale)
    enrichAvoidTags(built, res.data)
    return { ok: true, scale, ...built }
  }

  console.warn('ingredients: no city scale file, fallback buildConfirmList', {
    city,
    cityKey,
    scale
  })
  const built = buildConfirmList(res.data, city)
  // fallback 路径：把库里英文 category 即时映射成中文再返回
  for (const list of [built.seasonal, built.yearRound]) {
    for (const item of list || []) {
      if (item) item.category = normalizeCategory(item.category, '其他')
    }
  }
  return { ok: true, scale, ...built }
}
