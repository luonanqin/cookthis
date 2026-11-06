'use strict'
const cloud = require('wx-server-sdk')
const aliasesRaw = require('./data/aliases.js')
const cityShelves = require('./data/city-shelves.js')
const { normalizeCityKey } = require('./normalizeCityKey.js')
// Vendored: keep in sync with cloudfunctions/_shared/accessGuard.js
const {
  consumeCatalogAliasesCall,
  consumeCatalogShelfCall
} = require('./accessGuard.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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

async function persistGuard(user, next) {
  await db.collection('users').doc(user._id).update({
    data: {
      accessGuard: next,
      updatedAt: db.serverDate()
    }
  })
}

function stripAliasesMeta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const k of Object.keys(src)) {
    if (!k || k.charAt(0) === '_') continue
    const v = src[k]
    if (!Array.isArray(v)) continue
    out[k] = v.map(String)
  }
  return out
}

async function handleGetAliases(user) {
  const nowMs = Date.now()
  const consumed = consumeCatalogAliasesCall(user.accessGuard, nowMs)
  if (!consumed.ok) return { ok: false, error: consumed.error }
  await persistGuard(user, consumed.next)
  return { ok: true, aliases: stripAliasesMeta(aliasesRaw) }
}

async function handleGetCityShelf(user) {
  const nowMs = Date.now()
  const consumed = consumeCatalogShelfCall(user.accessGuard, nowMs)
  if (!consumed.ok) return { ok: false, error: consumed.error }
  await persistGuard(user, consumed.next)

  const cityKey = normalizeCityKey(user.city)
  if (!cityKey) return { ok: false, error: 'NO_CITY' }
  const order = cityShelves[cityKey]
  return {
    ok: true,
    cityKey,
    shelfOrder: Array.isArray(order) ? order : []
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  const user = await loadUserForOpenid(openid)
  if (!user || !user._id) return { ok: false, error: 'NO_USER' }

  const action = event && event.action
  if (action === 'getAliases') return handleGetAliases(user)
  if (action === 'getCityShelf') return handleGetCityShelf(user)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
