'use strict'
const cloud = require('wx-server-sdk')
// Vendored: keep in sync with cloudfunctions/_shared/feedbackLogic.js
const {
  validateCreate,
  computeSortKey,
  shapeFeedback,
  toMs,
  CONTENT_MAX,
  CATEGORY_LABELS
} = require('./feedbackLogic.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function resolveUid(openid) {
  const idRes = await db
    .collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  return (idRes.data[0] && idRes.data[0].uid) || null
}

async function getUserDoc(uid) {
  const res = await db.collection('users').where({ uid }).limit(1).get()
  return res.data[0] || null
}

async function handleCreate(event, uid) {
  const v = validateCreate(event)
  if (!v.ok) return { ok: false, error: v.error }

  const recent = await db
    .collection('feedbacks')
    .where({ uid })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  const last = recent.data[0]
  const lastMs = toMs(last && last.createdAt)
  if (lastMs != null && Date.now() - lastMs < 60 * 1000) {
    return { ok: false, error: 'RATE_LIMITED' }
  }

  const now = db.serverDate()
  const createdAtMs = Date.now()
  const subscribeReady = !!(event && event.subscribeReady)
  const addRes = await db.collection('feedbacks').add({
    data: {
      uid,
      category: v.category,
      content: v.content,
      createdAt: now,
      replyText: null,
      repliedAt: null,
      repliedBy: null,
      userReadAt: null,
      unreadForUser: false,
      subscribeReady,
      sortKey: computeSortKey({
        unreadForUser: false,
        createdAtMs,
        repliedAtMs: 0
      })
    }
  })
  const item = shapeFeedback({
    _id: addRes._id,
    category: v.category,
    content: v.content,
    createdAt: createdAtMs,
    replyText: null,
    repliedAt: null,
    unreadForUser: false
  })
  return { ok: true, item }
}

async function handleHasUnread(uid) {
  const user = await getUserDoc(uid)
  const epoch = (user && user.feedbackListEpoch) || 0
  const res = await db
    .collection('feedbacks')
    .where({ uid, unreadForUser: true })
    .limit(1)
    .get()
  return {
    ok: true,
    hasUnread: !!(res.data && res.data.length),
    feedbackListEpoch: epoch
  }
}

async function handleListMine(event, uid) {
  const limit = Math.min(20, Math.max(1, Number(event.limit) || 5))
  const cursor = event.cursor || null
  const user = await getUserDoc(uid)
  const epoch = (user && user.feedbackListEpoch) || 0

  // 多取若干便于内存 cursor（若云库 where+orderBy 直接支持则优先服务端分页）
  const res = await db
    .collection('feedbacks')
    .where({ uid })
    .orderBy('sortKey', 'desc')
    .limit(100)
    .get()

  let rows = res.data || []
  if (cursor && cursor.sortKey != null) {
    const cKey = Number(cursor.sortKey)
    const cId = String(cursor.id || '')
    rows = rows.filter((row) => {
      const k = Number(row.sortKey) || 0
      if (k < cKey) return true
      if (k > cKey) return false
      return String(row._id) < cId
    })
  }
  const page = rows.slice(0, limit)
  const items = page.map(shapeFeedback)
  let nextCursor = null
  if (page.length === limit && rows.length > limit) {
    const last = page[page.length - 1]
    nextCursor = {
      sortKey: Number(last.sortKey) || 0,
      id: last._id
    }
  }
  const unreadRes = await db
    .collection('feedbacks')
    .where({ uid, unreadForUser: true })
    .limit(1)
    .get()
  return {
    ok: true,
    items,
    nextCursor,
    feedbackListEpoch: epoch,
    hasUnread: !!(unreadRes.data && unreadRes.data.length)
  }
}

async function handleMarkRead(event, uid) {
  const id = event && event.id
  if (!id) return { ok: false, error: 'ID_REQUIRED' }
  const docRes = await db.collection('feedbacks').doc(id).get()
  const doc = docRes.data
  if (!doc || doc.uid !== uid) return { ok: false, error: 'NOT_FOUND' }
  if (!doc.replyText) return { ok: true, item: shapeFeedback(doc) }

  const createdAtMs = toMs(doc.createdAt) || Date.now()
  const repliedAtMs = toMs(doc.repliedAt) || createdAtMs
  const sortKey = computeSortKey({
    unreadForUser: false,
    createdAtMs,
    repliedAtMs
  })
  await db.collection('feedbacks').doc(id).update({
    data: {
      userReadAt: db.serverDate(),
      unreadForUser: false,
      sortKey
    }
  })
  return {
    ok: true,
    item: shapeFeedback(
      Object.assign({}, doc, {
        userReadAt: Date.now(),
        unreadForUser: false,
        sortKey
      })
    )
  }
}

async function handleReply(event) {
  const key = process.env.FEEDBACK_ADMIN_KEY || ''
  if (!key || event.adminKey !== key) {
    return { ok: false, error: 'FORBIDDEN' }
  }
  const id = event.id
  const replyText = String((event && event.replyText) || '').trim()
  if (!id || !replyText) return { ok: false, error: 'BAD_ARGS' }
  // replyText 不按 CONTENT_MAX 截断
  void CONTENT_MAX

  const docRes = await db.collection('feedbacks').doc(id).get()
  const doc = docRes.data
  if (!doc) return { ok: false, error: 'NOT_FOUND' }

  const repliedAtMs = Date.now()
  const createdAtMs = toMs(doc.createdAt) || repliedAtMs
  const sortKey = computeSortKey({
    unreadForUser: true,
    createdAtMs,
    repliedAtMs
  })
  await db.collection('feedbacks').doc(id).update({
    data: {
      replyText,
      repliedAt: db.serverDate(),
      repliedBy: String(event.repliedBy || 'admin'),
      userReadAt: null,
      unreadForUser: true,
      sortKey
    }
  })
  const user = await getUserDoc(doc.uid)
  if (user && user._id) {
    await db
      .collection('users')
      .doc(user._id)
      .update({
        data: {
          feedbackListEpoch: _.inc(1),
          updatedAt: db.serverDate()
        }
      })
  }

  // 订阅消息：失败只打日志，不回滚已写入的回复
  if (doc.subscribeReady) {
    try {
      const idRes = await db
        .collection('user_identities')
        .where({ uid: doc.uid, provider: 'wechat_mp' })
        .limit(1)
        .get()
      const openid = idRes.data[0] && idRes.data[0].providerUserId
      const tmplId = process.env.FEEDBACK_SUBSCRIBE_TMPL_ID || ''
      if (openid && tmplId) {
        // 字段名需与微信后台订阅模板对齐；当前用通用 thing1/thing2 占位
        const categoryLabel = CATEGORY_LABELS[doc.category] || '建议'
        await cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId: tmplId,
          page: 'pages/index/index?openFeedback=1',
          data: {
            thing1: { value: String(categoryLabel).slice(0, 20) },
            thing2: { value: replyText.slice(0, 20) }
          }
        })
      }
    } catch (err) {
      console.error('subscribeMessage.send failed', err)
    }
  }
  return { ok: true }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const action = (event && event.action) || ''
  if (action === 'reply') return handleReply(event)

  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }
  const uid = await resolveUid(openid)
  if (!uid) return { ok: false, error: 'NO_USER' }

  if (action === 'create') return handleCreate(event, uid)
  if (action === 'listMine') return handleListMine(event, uid)
  if (action === 'markRead') return handleMarkRead(event, uid)
  if (action === 'hasUnread') return handleHasUnread(uid)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
