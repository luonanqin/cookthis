'use strict'

// Vendored: keep in sync with cloudfunctions/_shared/membershipCatalog.js
const { SKUS, getSku } = require('./membershipCatalog.js')
// Vendored: keep in sync with cloudfunctions/_shared/membershipLogic.js
const {
  isMemberActive,
  resolvePriceFen,
  buildSkuOffer,
  firstPurchaseUsedFromOrders
} = require('./membershipLogic.js')
// Vendored: keep in sync with cloudfunctions/_shared/swapQuota.js
const {
  FREE_SWAP_LIMIT,
  dayKeyChina,
  normalizeSwapDaily
} = require('./swapQuota.js')
const defaultXpay = require('./xpay.js')
const { fulfillPaidOrder, loadMembership } = require('./fulfill.js')

const SKU_ORDER = Object.keys(SKUS)

function toIso(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  const n = Number(value)
  if (Number.isFinite(n)) return new Date(n).toISOString()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function expiresLabel(expiresAt) {
  const iso = toIso(expiresAt)
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return dayKeyChina(ms)
}

function makeOrderId(uid, nowMs) {
  const clean = String(uid || '').replace(/[^A-Za-z0-9]/g, '')
  const short = clean.slice(-8) || 'u'
  const ts = Math.trunc(Number(nowMs) || Date.now()).toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  let id = ('m' + short + ts + rand).replace(/[^A-Za-z0-9_\-|*@]/g, '')
  if (id.length < 8) id = (id + '00000000').slice(0, 8)
  if (id.length > 32) id = id.slice(0, 32)
  if (id.charAt(0) === '_') id = 'm' + id.slice(1, 32)
  return id
}

function isWxOrderPaid(wx) {
  if (!wx || typeof wx !== 'object') return false
  if (wx.status === 'paid' || wx.Status === 'paid') return true
  if (wx.order_state === 2 || wx.OrderState === 2) return true
  return false
}

async function resolveUid(db, openid) {
  const idRes = await db
    .collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  return (idRes.data[0] && idRes.data[0].uid) || null
}

async function loadUser(db, uid) {
  const res = await db.collection('users').where({ uid }).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function loadFirstPurchaseUsed(db, uid) {
  const res = await db
    .collection('membership_orders')
    .where({ uid, status: 'paid' })
    .limit(100)
    .get()
  const skus = new Set()
  for (const row of res.data || []) {
    if (row && row.sku) skus.add(row.sku)
  }
  return firstPurchaseUsedFromOrders(skus)
}

async function writeFirstPurchaseUsed(db, uid, used) {
  const user = await loadUser(db, uid)
  if (!user || !user._id) return
  const prev = user.firstPurchaseUsed || {}
  const keys = Object.keys(used)
  const prevKeys = Object.keys(prev)
  let same = keys.length === prevKeys.length
  if (same) {
    for (const k of keys) {
      if (!prev[k]) {
        same = false
        break
      }
    }
  }
  if (same) return
  try {
    await db.collection('users').doc(user._id).update({
      data: { firstPurchaseUsed: used }
    })
  } catch (err) {
    console.error('membership firstPurchaseUsed writeback failed', err)
  }
}

function createMembershipApi(deps) {
  const db = deps.db
  const xpay = deps.xpay || defaultXpay
  const env = deps.env || {}
  const nowMs = Number.isFinite(Number(deps.nowMs)) ? Number(deps.nowMs) : Date.now()
  const openid = deps.openid
  const sessionKey = deps.sessionKey

  async function getStatus(uid) {
    const membership = await loadMembership(db, uid)
    const user = await loadUser(db, uid)
    const firstPurchaseUsed = await loadFirstPurchaseUsed(db, uid)
    await writeFirstPurchaseUsed(db, uid, firstPurchaseUsed)

    const isMember = isMemberActive(membership, nowMs)
    const swapDaily = normalizeSwapDaily(user && user.swapDaily, nowMs)
    const expiresAt = membership ? toIso(membership.expiresAt) : null
    const offers = SKU_ORDER.map((sku) => buildSkuOffer(sku, firstPurchaseUsed))
    return {
      ok: true,
      isMember,
      tier: membership ? membership.tier : null,
      expiresAt: membership ? expiresAt : null,
      expiresLabel: membership ? expiresLabel(membership.expiresAt) : null,
      swap: {
        used: swapDaily.used,
        limit: isMember ? null : FREE_SWAP_LIMIT,
        rewardExtra: swapDaily.rewardExtra
      },
      offers,
      noticeAckRequired: true
    }
  }

  async function createOrder(uid, sku) {
    const item = getSku(sku)
    if (!item) return { ok: false, error: 'BAD_SKU' }
    if (!xpay.isPayConfigured(env)) return { ok: false, error: 'PAY_NOT_CONFIGURED' }
    if (!String(sessionKey || '').trim()) return { ok: false, error: 'NO_SESSION_KEY' }

    const firstPurchaseUsed = await loadFirstPurchaseUsed(db, uid)
    const payFen = resolvePriceFen(sku, firstPurchaseUsed)
    const orderId = makeOrderId(uid, nowMs)
    await db.collection('membership_orders').add({
      data: {
        orderId,
        uid,
        sku,
        amountFen: payFen,
        isFirstPurchase: !firstPurchaseUsed[sku],
        productId: item.productId,
        status: 'created',
        createdAt: new Date(nowMs).toISOString()
      }
    })
    const pay = xpay.buildVirtualPayParams({
      orderId,
      productId: item.productId,
      goodsPrice: payFen,
      openid,
      attach: orderId,
      sessionKey,
      env
    })
    if (!pay.ok) return pay
    return {
      ok: true,
      orderId,
      payFen,
      payment: pay.payment
    }
  }

  async function refresh(uid) {
    const res = await db
      .collection('membership_orders')
      .where({ uid, status: 'created' })
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get()
    for (const order of res.data || []) {
      let wx = null
      try {
        wx = await xpay.queryOrder(order.orderId)
      } catch (err) {
        console.error('membership queryOrder failed', err)
      }
      if (isWxOrderPaid(wx)) {
        await fulfillPaidOrder({
          db,
          orderId: order.orderId,
          wxPayment: wx,
          nowMs
        })
      }
    }
    return getStatus(uid)
  }

  async function devGrant(uid, sku) {
    if (String(env.MEMBERSHIP_ALLOW_DEV_GRANT) !== '1') {
      return { ok: false, error: 'FORBIDDEN' }
    }
    const code = sku || 'month'
    const item = getSku(code)
    if (!item) return { ok: false, error: 'BAD_SKU' }
    const firstPurchaseUsed = await loadFirstPurchaseUsed(db, uid)
    const orderId = makeOrderId(uid, nowMs)
    await db.collection('membership_orders').add({
      data: {
        orderId,
        uid,
        sku: code,
        amountFen: 0,
        isFirstPurchase: !firstPurchaseUsed[code],
        productId: item.productId,
        status: 'created',
        createdAt: new Date(nowMs).toISOString(),
        dev: true
      }
    })
    return fulfillPaidOrder({
      db,
      orderId,
      wxPayment: { dev: true },
      nowMs
    })
  }

  return { getStatus, createOrder, refresh, devGrant }
}

function isClientSpoofedXpayNotify(wxContext) {
  return Boolean(wxContext && wxContext.OPENID)
}

function isLegitimateXpayDeliverPush(eventObj) {
  if (!eventObj || eventObj.Event !== 'xpay_goods_deliver_notify') return false
  if (eventObj.MsgType !== 'event') return false
  return String(eventObj.OutTradeNo || '').trim() !== ''
}

async function handleMain(event, ctx) {
  const eventObj = event || {}
  const wxContext = ctx.wxContext || {}
  if (eventObj.Event === 'xpay_goods_deliver_notify') {
    if (isClientSpoofedXpayNotify(wxContext) || !isLegitimateXpayDeliverPush(eventObj)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    try {
      await fulfillPaidOrder({
        db: ctx.db,
        orderId: String(eventObj.OutTradeNo).trim(),
        wxPayment: eventObj.WeChatPayInfo || {},
        nowMs: ctx.nowMs
      })
      return { ErrCode: 0, ErrMsg: 'success' }
    } catch (err) {
      console.error('membership fulfill push failed', err)
      return { ErrCode: -1, ErrMsg: 'fail' }
    }
  }

  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }
  const uid = await resolveUid(ctx.db, openid)
  if (!uid) return { ok: false, error: 'NO_USER' }

  const api = createMembershipApi({
    db: ctx.db,
    xpay: ctx.xpay || defaultXpay,
    env: ctx.env || {},
    nowMs: ctx.nowMs,
    openid,
    sessionKey: wxContext.SESSION_KEY
  })
  const action = eventObj.action || ''
  if (action === 'getStatus') return api.getStatus(uid)
  if (action === 'createOrder') return api.createOrder(uid, eventObj.sku)
  if (action === 'refresh') return api.refresh(uid)
  if (action === 'devGrant') return api.devGrant(uid, eventObj.sku)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}

exports.createMembershipApi = createMembershipApi
exports.handleMain = handleMain
exports.main = async (event) => {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return handleMain(event, {
    db: cloud.database(),
    xpay: defaultXpay,
    env: process.env,
    nowMs: Date.now(),
    wxContext: cloud.getWXContext()
  })
}
