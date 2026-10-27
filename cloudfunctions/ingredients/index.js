'use strict'
const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')
// Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
// Source of truth for tests: cloudfunctions/_shared/confirmList.js — keep in sync when changing.
const { buildConfirmList } = require('./confirmList.js')
// Vendored: keep in sync with cloudfunctions/_shared/confirmListFromScale.js
const { flattenScaleBucket } = require('./confirmListFromScale.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX = 500
const VALID_SCALES = new Set(['small', 'medium', 'large'])

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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  let city = (event && event.city) || null
  let user = null
  if (!city || !(event && event.scale)) {
    user = await loadUserForOpenid(openid)
    if (!city) city = (user && user.city) || null
  }

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
  return { ok: true, scale, ...built }
}
