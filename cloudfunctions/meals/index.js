'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/confirmCandidates.js
const { buildConfirmCandidates } = require('./confirmCandidates.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX = 100

function localDateYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function makeLogId() {
  return `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function cleanDishNames(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const name = String(raw || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

async function resolveUid(openid) {
  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

async function handleConfirmCandidates(uid) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const recRes = await db.collection('recommendations')
    .where({
      uid,
      createdAt: _.gte(since)
    })
    .limit(MAX)
    .get()

  const recommendations = recRes.data || []
  // Load meal logs that might sit after any possible anchor (last 14d is enough)
  const logRes = await db.collection('meal_logs')
    .where({
      uid,
      createdAt: _.gte(since)
    })
    .limit(MAX)
    .get()

  const built = buildConfirmCandidates({
    recommendations,
    mealLogs: logRes.data || []
  })

  return {
    ok: true,
    show: !!built.show,
    dishNames: built.dishNames || [],
    requestId: built.requestId || null,
    recommendationId: built.recommendationId || null
  }
}

async function handleConfirmWrite(event, uid) {
  const dishNames = cleanDishNames(event && event.dishNames)
  if (dishNames.length === 0) {
    return { ok: true, skipped: true }
  }
  const now = db.serverDate()
  const logId = makeLogId()
  await db.collection('meal_logs').add({
    data: {
      uid,
      logId,
      date: localDateYmd(),
      meal: (event && event.meal) || 'unknown',
      dishNames,
      ingredientNames: [],
      source: 'confirm',
      recommendationId: (event && event.recommendationId) || null,
      requestId: (event && event.requestId) || null,
      createdAt: now
    }
  })
  return { ok: true, logId, dishNames }
}

async function handleAddManual(event, uid) {
  const dishNames = cleanDishNames(event && event.dishNames)
  if (dishNames.length === 0) {
    return { ok: false, error: 'DISH_NAMES_REQUIRED' }
  }
  const now = db.serverDate()
  const logId = makeLogId()
  await db.collection('meal_logs').add({
    data: {
      uid,
      logId,
      date: (event && event.date) || localDateYmd(),
      meal: (event && event.meal) || 'unknown',
      dishNames,
      ingredientNames: [],
      source: 'manual',
      recommendationId: null,
      requestId: null,
      createdAt: now
    }
  })
  return { ok: true, logId, dishNames }
}

async function handleList(event, uid) {
  const limit = Math.min(50, Math.max(1, Number(event && event.limit) || 20))
  const res = await db.collection('meal_logs')
    .where({ uid })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  const items = (res.data || []).map((row) => ({
    logId: row.logId,
    date: row.date,
    meal: row.meal,
    dishNames: row.dishNames || [],
    source: row.source,
    createdAt: row.createdAt
  }))
  return { ok: true, items }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  const uid = await resolveUid(openid)
  if (!uid) return { ok: false, error: 'USER_NOT_FOUND' }

  const action = (event && event.action) || 'confirmCandidates'
  if (action === 'confirmCandidates') return handleConfirmCandidates(uid)
  if (action === 'confirmWrite') return handleConfirmWrite(event, uid)
  if (action === 'addManual') return handleAddManual(event, uid)
  if (action === 'list') return handleList(event, uid)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
