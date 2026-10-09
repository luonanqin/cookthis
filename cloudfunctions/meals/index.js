'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/confirmCandidates.js
const { buildConfirmCandidates } = require('./confirmCandidates.js')
// Vendored: keep in sync with cloudfunctions/_shared/removeMealLog.js
const { planRemoveMealLog } = require('./removeMealLog.js')
// Vendored: keep in sync with cloudfunctions/_shared/planAte.js
const { planAteOnDecision, planAteOffDecision } = require('./planAte.js')

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

function normalizeDishName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
}

function matchPlanAteRow(rows, dishName) {
  const target = normalizeDishName(dishName)
  if (!target) return null
  for (const row of rows || []) {
    const names = (row && row.dishNames) || []
    for (const raw of names) {
      if (normalizeDishName(raw) === target) return row
    }
  }
  return null
}

async function resolveUid(openid) {
  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

async function markEntryConfirmHandled(uid, event) {
  const recommendationId = event && event.recommendationId
  const requestId = event && event.requestId
  if (!recommendationId && !requestId) {
    return { ok: true, marked: false }
  }
  const patch = {
    entryConfirmHandled: true,
    entryConfirmHandledAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
  if (recommendationId) {
    try {
      await db.collection('recommendations').doc(recommendationId).update({ data: patch })
      return { ok: true, marked: true, recommendationId }
    } catch (e) {
      // fall through to requestId lookup
    }
  }
  if (requestId) {
    const res = await db.collection('recommendations')
      .where({ uid, requestId })
      .limit(1)
      .get()
    const doc = (res.data || [])[0]
    if (doc && doc._id) {
      await db.collection('recommendations').doc(doc._id).update({ data: patch })
      return { ok: true, marked: true, recommendationId: doc._id }
    }
  }
  const err = new Error('MARK_ENTRY_CONFIRM_FAILED')
  err.code = 'MARK_ENTRY_CONFIRM_FAILED'
  throw err
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

  // 候选已空（去重光了）仍建议标已处理，避免每次进场空转同一锚点
  if (!built.show && built.recommendationId) {
    try {
      await markEntryConfirmHandled(uid, {
        recommendationId: built.recommendationId,
        requestId: built.requestId
      })
    } catch (e) {
      console.error('mark empty-candidate anchor failed', e)
    }
  }

  return {
    ok: true,
    show: !!built.show,
    dishNames: built.dishNames || [],
    requestId: built.requestId || null,
    recommendationId: built.recommendationId || null
  }
}

async function resolveIngredientNames(dishNames, provided) {
  if (Array.isArray(provided) && provided.length) return cleanDishNames(provided)
  try {
    const res = await db.collection('recipes').limit(500).get()
    const byName = new Map()
    for (const r of res.data || []) {
      if (r && r.name) byName.set(r.name, r)
    }
    const set = new Set()
    for (const name of dishNames) {
      const r = byName.get(name)
      for (const n of (r && r.mainIngredients) || []) {
        if (n) set.add(n)
      }
    }
    return Array.from(set)
  } catch (e) {
    return []
  }
}

async function handleConfirmWrite(event, uid) {
  const dishNames = cleanDishNames(event && event.dishNames)
  let logId = null
  if (dishNames.length > 0) {
    const ingredientNames = await resolveIngredientNames(
      dishNames,
      event && event.ingredientNames
    )
    const now = db.serverDate()
    logId = makeLogId()
    await db.collection('meal_logs').add({
      data: {
        uid,
        logId,
        date: localDateYmd(),
        meal: (event && event.meal) || 'unknown',
        dishNames,
        ingredientNames,
        source: 'confirm',
        recommendationId: (event && event.recommendationId) || null,
        requestId: (event && event.requestId) || null,
        createdAt: now
      }
    })
  }
  // 确认（含勾 0 道）也标记已处理，下次进菜场不再弹同一批
  await markEntryConfirmHandled(uid, event)
  return { ok: true, logId, dishNames, skipped: dishNames.length === 0 }
}

async function handleConfirmSkip(event, uid) {
  await markEntryConfirmHandled(uid, event)
  return { ok: true, skipped: true }
}

async function handleAddManual(event, uid) {
  const dishNames = cleanDishNames(event && event.dishNames)
  if (dishNames.length === 0) {
    return { ok: false, error: 'DISH_NAMES_REQUIRED' }
  }
  const ingredientNames = await resolveIngredientNames(
    dishNames,
    event && event.ingredientNames
  )
  const now = db.serverDate()
  const logId = makeLogId()
  await db.collection('meal_logs').add({
    data: {
      uid,
      logId,
      date: (event && event.date) || localDateYmd(),
      meal: (event && event.meal) || 'unknown',
      dishNames,
      ingredientNames,
      source: 'manual',
      recommendationId: null,
      requestId: null,
      createdAt: now
    }
  })
  return { ok: true, logId, dishNames }
}

async function handleAddVoice(event, uid) {
  const dishNames = cleanDishNames(event && event.dishNames)
  if (dishNames.length === 0) {
    return { ok: false, error: 'DISH_NAMES_REQUIRED' }
  }
  const ingredientNames = await resolveIngredientNames(
    dishNames,
    event && event.ingredientNames
  )
  const now = db.serverDate()
  const logId = makeLogId()
  await db.collection('meal_logs').add({
    data: {
      uid,
      logId,
      date: (event && event.date) || localDateYmd(),
      meal: (event && event.meal) || 'unknown',
      dishNames,
      ingredientNames,
      source: 'voice',
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

/** §4.2 按 logId 物理删除当前用户的一条 meal_logs */
async function handleRemove(event, uid) {
  const logId = String((event && event.logId) || '').trim()
  let row = null
  if (logId) {
    const res = await db.collection('meal_logs')
      .where({ uid, logId })
      .limit(1)
      .get()
    row = (res.data || [])[0] || null
  }
  const planned = planRemoveMealLog({ uid, logId, row })
  if (!planned.ok) {
    return { ok: false, error: planned.error }
  }
  await db.collection('meal_logs').doc(planned.docId).remove()
  return {
    ok: true,
    logId: planned.logId,
    source: planned.source
  }
}

async function loadPlanAteRows(uid, requestId) {
  const rid = String(requestId || '').trim()
  if (!rid) return []
  const res = await db.collection('meal_logs')
    .where({ uid, requestId: rid, source: 'plan_ate' })
    .limit(20)
    .get()
  return res.data || []
}

async function findMealLogByLogId(uid, logId) {
  const id = String(logId || '').trim()
  if (!id) return null
  const res = await db.collection('meal_logs')
    .where({ uid, logId: id })
    .limit(1)
    .get()
  return (res.data || [])[0] || null
}

/** §4.3 已选方案点选已吃：一道菜一条 plan_ate，幂等 On */
async function handlePlanAteOn(event, uid) {
  const requestId = String((event && event.requestId) || '').trim()
  const dishName = (event && event.dishName) || ''
  const recommendationId = (event && event.recommendationId) || null
  const rows = await loadPlanAteRows(uid, requestId)
  const existingRow = matchPlanAteRow(rows, dishName)
  const decided = planAteOnDecision({
    uid,
    requestId,
    recommendationId,
    dishName,
    existingRow
  })
  if (!decided.ok) {
    return { ok: false, error: decided.error }
  }
  if (decided.noop) {
    return { ok: true, noop: true, logId: decided.logId }
  }
  const dishNames = decided.record.dishNames
  const ingredientNames = await resolveIngredientNames(dishNames)
  const now = db.serverDate()
  const logId = makeLogId()
  await db.collection('meal_logs').add({
    data: {
      uid,
      logId,
      date: localDateYmd(),
      meal: 'unknown',
      dishNames,
      ingredientNames,
      source: 'plan_ate',
      recommendationId: decided.record.recommendationId || null,
      requestId: decided.record.requestId || null,
      createdAt: now
    }
  })
  return { ok: true, logId }
}

/** §4.3 取消已吃：按 logId 或 requestId+菜名找到行后物理删除 */
async function handlePlanAteOff(event, uid) {
  const logIdArg = String((event && event.logId) || '').trim()
  let existingRow = null
  if (logIdArg) {
    existingRow = await findMealLogByLogId(uid, logIdArg)
  } else {
    const requestId = String((event && event.requestId) || '').trim()
    const dishName = (event && event.dishName) || ''
    const rows = await loadPlanAteRows(uid, requestId)
    existingRow = matchPlanAteRow(rows, dishName)
  }
  const decided = planAteOffDecision({
    uid,
    requestId: event && event.requestId,
    dishName: event && event.dishName,
    existingRow
  })
  if (decided.noop) {
    return { ok: true, noop: true }
  }
  const planned = planRemoveMealLog({
    uid,
    logId: decided.logId,
    row: existingRow
  })
  if (!planned.ok) {
    return { ok: false, error: planned.error }
  }
  await db.collection('meal_logs').doc(planned.docId).remove()
  return { ok: true, logId: planned.logId }
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
  if (action === 'confirmSkip') return handleConfirmSkip(event, uid)
  if (action === 'addManual') return handleAddManual(event, uid)
  if (action === 'addVoice') return handleAddVoice(event, uid)
  if (action === 'list') return handleList(event, uid)
  if (action === 'remove') return handleRemove(event, uid)
  if (action === 'planAteOn') return handlePlanAteOn(event, uid)
  if (action === 'planAteOff') return handlePlanAteOff(event, uid)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
