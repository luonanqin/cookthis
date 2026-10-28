'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/planShare.js (+ shoppingList.js)
const { buildSnapshotPayload, shapeShareView } = require('./planShare.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function resolveUid(openid) {
  const idRes = await db
    .collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

async function loadUserDoc(uid) {
  const res = await db.collection('users').where({ uid }).limit(1).get()
  return res.data[0] || null
}

function categoryByNameFromSelected(selectedIngredients) {
  const map = {}
  for (const item of selectedIngredients || []) {
    if (!item || !item.name) continue
    if (item.category) map[item.name] = item.category
  }
  return map
}

async function loadRecommendationForCreate(uid, event) {
  const recommendationId = String((event && event.recommendationId) || '').trim()
  const requestId = String((event && event.requestId) || '').trim()

  if (recommendationId) {
    let doc = null
    try {
      const res = await db.collection('recommendations').doc(recommendationId).get()
      doc = res.data || null
      if (doc && !doc._id) doc._id = recommendationId
    } catch (e) {
      return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }
    }
    if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }
    if (doc.uid !== uid) return { ok: false, error: 'FORBIDDEN' }
    return { ok: true, doc }
  }

  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }
  const res = await db
    .collection('recommendations')
    .where({ uid, requestId })
    .limit(1)
    .get()
  const doc = (res.data || [])[0] || null
  if (!doc) return { ok: false, error: 'RECOMMENDATION_NOT_FOUND' }
  return { ok: true, doc }
}

function resolvePlanIndex(event, doc) {
  if (typeof (event && event.planIndex) === 'number' && Number.isFinite(event.planIndex)) {
    return event.planIndex
  }
  if (typeof doc.acceptedPlanIndex === 'number' && Number.isFinite(doc.acceptedPlanIndex)) {
    return doc.acceptedPlanIndex
  }
  return null
}

async function findShareBySource(uid, requestId, planIndex) {
  const res = await db
    .collection('plan_shares')
    .where({
      createdBy: uid,
      sourceRequestId: requestId,
      sourcePlanIndex: planIndex
    })
    .limit(1)
    .get()
  return (res.data || [])[0] || null
}

async function findShareByShareId(shareId) {
  const res = await db
    .collection('plan_shares')
    .where({ shareId })
    .limit(1)
    .get()
  return (res.data || [])[0] || null
}

async function findReceived(ownerUid, shareId) {
  const res = await db
    .collection('received_plans')
    .where({ ownerUid, shareId })
    .limit(1)
    .get()
  return (res.data || [])[0] || null
}

async function handleCreate(event, uid) {
  const loaded = await loadRecommendationForCreate(uid, event)
  if (!loaded.ok) return loaded

  const doc = loaded.doc
  const planIndex = resolvePlanIndex(event, doc)
  if (planIndex == null) return { ok: false, error: 'PLAN_INDEX_REQUIRED' }

  const plan = (doc.plans || [])[planIndex]
  if (!plan) return { ok: false, error: 'PLAN_NOT_FOUND' }

  const requestId = doc.requestId
  if (!requestId) return { ok: false, error: 'REQUEST_ID_REQUIRED' }

  const existing = await findShareBySource(uid, requestId, planIndex)
  if (existing && existing.shareId) {
    return { ok: true, shareId: existing.shareId }
  }

  let sharerNickname
  try {
    const user = await loadUserDoc(uid)
    if (user && user.nickname) sharerNickname = user.nickname
  } catch (e) {
    // optional
  }

  const payload = buildSnapshotPayload({
    plan,
    uid,
    requestId,
    planIndex,
    categoryByName: categoryByNameFromSelected(doc.selectedIngredients),
    sharerNickname
  })

  await db.collection('plan_shares').add({ data: payload })
  return { ok: true, shareId: payload.shareId }
}

async function handleGet(event, uid) {
  const shareId = String((event && event.shareId) || '').trim()
  if (!shareId) return { ok: false, error: 'SHARE_ID_REQUIRED' }

  const snap = await findShareByShareId(shareId)
  if (!snap) return { ok: false, error: 'NOT_FOUND' }

  let saved = false
  if (uid) {
    const received = await findReceived(uid, shareId)
    saved = !!received
  }

  return {
    ok: true,
    share: shapeShareView(snap),
    saved
  }
}

async function handleSave(event, uid) {
  const shareId = String((event && event.shareId) || '').trim()
  if (!shareId) return { ok: false, error: 'SHARE_ID_REQUIRED' }

  const snap = await findShareByShareId(shareId)
  if (!snap) return { ok: false, error: 'NOT_FOUND' }

  const existing = await findReceived(uid, shareId)
  if (existing) {
    return { ok: true, saved: true, id: existing._id }
  }

  const dishes = Array.isArray(snap.dishes) ? snap.dishes : []
  const addRes = await db.collection('received_plans').add({
    data: {
      ownerUid: uid,
      shareId,
      source: 'shared',
      savedAt: db.serverDate(),
      dishNamesSummary: dishes.slice(0, 6).map((d) => (d && d.name) || '').filter(Boolean),
      sharerNickname: snap.sharerNickname || null,
      createdBy: snap.createdBy
    }
  })

  return { ok: true, saved: true, id: addRes._id }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  const action = (event && event.action) || ''
  const uid = await resolveUid(openid)

  if (action === 'get') {
    return handleGet(event, uid)
  }

  if (!uid) return { ok: false, error: 'NO_USER' }

  if (action === 'create') return handleCreate(event, uid)
  if (action === 'save') return handleSave(event, uid)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
