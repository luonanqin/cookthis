'use strict'

// Vendored: keep in sync with cloudfunctions/_shared/membershipCatalog.js
const { SKUS, getSku, formatYuanFromFen } = require('./membershipCatalog.js')
// Vendored: keep in sync with cloudfunctions/_shared/membershipLogic.js
const {
  isMemberActive,
  hasUsedFirstPurchase,
  resolvePriceFen,
  resolveProductId,
  isFirstPurchaseProduct,
  buildSkuOffer,
  firstPurchaseUsedFromOrders
} = require('./membershipLogic.js')

const DAY_MS = 86400000

// Vendored: keep in sync with cloudfunctions/_shared/swapQuota.js
const {
  FREE_SWAP_LIMIT,
  dayKeyChina,
  normalizeSwapDaily
} = require('./swapQuota.js')
const defaultXpay = require('./xpay.js')
const { fulfillPaidOrder, loadMembership } = require('./fulfill.js')
const {
  PAY_TTL_MS,
  ORDER_LOCK_MS,
  ORDERS_LIST_LIMIT,
  payExpiresAtIso,
  isCreatedPayExpired,
  isActiveCreated,
  selectOrdersForDisplay,
  remainMs,
  toMs: orderToMs
} = require('./orderLifecycle.js')
const SKU_ORDER = Object.keys(SKUS)
const TIER_LABEL = { month: '月卡', quarter: '季卡', year: '年卡' }

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
  // query_order 常见：LeftAmount / paid 标记
  if (wx.paid === true || wx.Paid === true) return true
  const state = Number(wx.status != null ? wx.status : wx.Status)
  if (state === 2) return true
  return false
}

function nowIsoMs(nowMs) {
  return new Date(Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()).toISOString()
}

/** 未支付单：等值查询即可（人均极少），正倒序在内存排，避免建 ASC/DESC 双索引 */
async function listCreatedOrders(db, uid) {
  const res = await db
    .collection('membership_orders')
    .where({ uid, status: 'created' })
    .limit(20)
    .get()
  const rows = (res.data || []).slice()
  rows.sort((a, b) => (orderToMs(a && a.createdAt) || 0) - (orderToMs(b && b.createdAt) || 0))
  return rows
}

async function listRecentOrders(db, uid) {
  const res = await db
    .collection('membership_orders')
    .where({ uid })
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get()
  return (res.data || []).slice()
}

async function closeCreatedOrder(db, orderId, reason, nowMs) {
  if (!orderId) return
  await db
    .collection('membership_orders')
    .where({ orderId, status: 'created' })
    .update({
      data: {
        status: 'closed',
        closedReason: reason || 'SUPERSEDED',
        closedAt: nowIsoMs(nowMs)
      }
    })
}

/** 懒关闭：过期 created → EXPIRED */
async function lazyExpireCreatedOrders(db, uid, nowMs) {
  const pending = await listCreatedOrders(db, uid)
  let closed = 0
  for (const row of pending) {
    if (!isCreatedPayExpired(row, nowMs)) continue
    await closeCreatedOrder(db, row.orderId, 'EXPIRED', nowMs)
    closed += 1
  }
  return closed
}

function summarizePending(order, nowMs) {
  if (!order) return null
  return {
    orderId: order.orderId,
    sku: order.sku,
    amountFen: order.amountFen,
    productId: order.productId,
    payExpiresAt: order.payExpiresAt || null,
    remainMs: remainMs(order, nowMs),
    title: TIER_LABEL[order.sku] || order.sku,
    labelYuan: formatYuanFromFen(order.amountFen)
  }
}

function decorateOrderRow(order, nowMs) {
  const active = isActiveCreated(order, nowMs)
  return {
    orderId: order.orderId,
    sku: order.sku,
    amountFen: order.amountFen,
    status: order.status,
    isFirstPurchase: !!order.isFirstPurchase,
    productId: order.productId,
    createdAt: order.createdAt || null,
    paidAt: order.paidAt || null,
    payExpiresAt: order.payExpiresAt || null,
    title: TIER_LABEL[order.sku] || order.sku,
    labelYuan: formatYuanFromFen(order.amountFen),
    canPay: active,
    canCancel: active,
    remainMs: active ? remainMs(order, nowMs) : 0
  }
}

async function findActivePending(db, uid, nowMs) {
  const pending = await listCreatedOrders(db, uid)
  for (const row of pending) {
    if (isActiveCreated(row, nowMs)) return row
  }
  return null
}

async function acquireOrderLock(db, uid, nowMs) {
  const user = await loadUser(db, uid)
  if (!user || !user._id) return { ok: false, error: 'NO_USER' }
  const until = orderToMs(user.orderLockUntil)
  if (Number.isFinite(until) && until > nowMs) {
    return { ok: false, error: 'ORDER_BUSY' }
  }
  await db.collection('users').doc(user._id).update({
    data: { orderLockUntil: new Date(nowMs + ORDER_LOCK_MS).toISOString() }
  })
  return { ok: true, userId: user._id }
}

async function releaseOrderLock(db, userId) {
  if (!userId) return
  try {
    await db.collection('users').doc(userId).update({
      data: { orderLockUntil: null }
    })
  } catch (err) {
    console.error('membership releaseOrderLock failed', err)
  }
}

async function buildPaymentForOrder(xpay, { order, openid, sessionKey, env }) {
  return xpay.buildVirtualPayParams({
    orderId: order.orderId,
    productId: order.productId,
    goodsPrice: order.amountFen,
    openid,
    attach: order.orderId,
    sessionKey,
    env
  })
}

async function insertCreatedOrder(db, row) {
  await db.collection('membership_orders').add({ data: row })
  return row
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
    if (!row || !row.sku) continue
    if (row.ignoreForFirstPurchase === true) continue
    skus.add(row.sku)
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
    const payload =
      db.command && typeof db.command.set === 'function'
        ? db.command.set(used)
        : used
    await db.collection('users').doc(user._id).update({
      data: { firstPurchaseUsed: payload }
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
    await lazyExpireCreatedOrders(db, uid, nowMs)
    const membership = await loadMembership(db, uid)
    const user = await loadUser(db, uid)
    const firstPurchaseUsed = await loadFirstPurchaseUsed(db, uid)
    await writeFirstPurchaseUsed(db, uid, firstPurchaseUsed)

    const isMember = isMemberActive(membership, nowMs)
    const swapDaily = normalizeSwapDaily(user && user.swapDaily, nowMs)
    const expiresAt = membership ? toIso(membership.expiresAt) : null
    const offers = SKU_ORDER.map((sku) => buildSkuOffer(sku, firstPurchaseUsed))
    const recent = await listRecentOrders(db, uid)
    const orders = selectOrdersForDisplay(recent, nowMs, ORDERS_LIST_LIMIT).map((row) =>
      decorateOrderRow(row, nowMs)
    )
    const pending = await findActivePending(db, uid, nowMs)
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
      orders,
      pendingOrder: summarizePending(pending, nowMs),
      serverNow: nowMs,
      payTtlMs: PAY_TTL_MS,
      noticeAckRequired: true
    }
  }

  async function createOrder(uid, sku, opts) {
    const item = getSku(sku)
    if (!item) return { ok: false, error: 'BAD_SKU' }
    if (!xpay.isPayConfigured(env)) return { ok: false, error: 'PAY_NOT_CONFIGURED' }
    if (!String(sessionKey || '').trim()) return { ok: false, error: 'NO_SESSION_KEY' }

    const replacePending = !!(opts && opts.replacePending)
    const lock = await acquireOrderLock(db, uid, nowMs)
    if (!lock.ok) return lock
    try {
      await lazyExpireCreatedOrders(db, uid, nowMs)
      const firstPurchaseUsed = await loadFirstPurchaseUsed(db, uid)
      const payFen = resolvePriceFen(sku, firstPurchaseUsed)
      const productId = resolveProductId(sku, firstPurchaseUsed)
      const isFirstPurchase = !hasUsedFirstPurchase(firstPurchaseUsed)
      if (hasUsedFirstPurchase(firstPurchaseUsed) && isFirstPurchaseProduct(sku, productId)) {
        return { ok: false, error: 'FIRST_PURCHASE_USED' }
      }

      const pending = await findActivePending(db, uid, nowMs)
      if (pending) {
        if (pending.sku === sku) {
          // 同档：复用并重签
          if (
            pending.productId !== productId ||
            Number(pending.amountFen) !== Number(payFen)
          ) {
            await closeCreatedOrder(db, pending.orderId, 'SUPERSEDED', nowMs)
          } else {
            const pay = await buildPaymentForOrder(xpay, {
              order: pending,
              openid,
              sessionKey,
              env
            })
            if (!pay.ok) return pay
            return {
              ok: true,
              orderId: pending.orderId,
              payFen: pending.amountFen,
              productId: pending.productId,
              reused: true,
              payExpiresAt: pending.payExpiresAt,
              payment: pay.payment
            }
          }
        } else if (!replacePending) {
          return {
            ok: false,
            error: 'PENDING_OTHER_SKU',
            pending: summarizePending(pending, nowMs)
          }
        } else {
          await closeCreatedOrder(db, pending.orderId, 'SUPERSEDED', nowMs)
        }
      }

      // 关掉本档残留 created（价档变化等）
      const leftover = await listCreatedOrders(db, uid)
      for (const row of leftover) {
        if (row && row.sku === sku) {
          await closeCreatedOrder(db, row.orderId, 'SUPERSEDED', nowMs)
        }
      }

      const createdAt = nowIsoMs(nowMs)
      const row = {
        orderId: makeOrderId(uid, nowMs),
        uid,
        sku,
        amountFen: payFen,
        isFirstPurchase,
        productId,
        status: 'created',
        createdAt,
        payExpiresAt: payExpiresAtIso(nowMs, nowMs)
      }
      await insertCreatedOrder(db, row)

      // 并发收敛：全局只留一笔 active created（最早）
      const allCreated = await listCreatedOrders(db, uid)
      const actives = allCreated.filter((o) => isActiveCreated(o, nowMs))
      const winner =
        actives.find((o) => o.orderId === row.orderId) || actives[0] || row
      for (const o of actives) {
        if (o.orderId === winner.orderId) continue
        await closeCreatedOrder(db, o.orderId, 'SUPERSEDED', nowMs)
      }

      const pay = await buildPaymentForOrder(xpay, {
        order: winner,
        openid,
        sessionKey,
        env
      })
      if (!pay.ok) return pay
      return {
        ok: true,
        orderId: winner.orderId,
        payFen: winner.amountFen,
        productId: winner.productId,
        reused: winner.orderId !== row.orderId,
        payExpiresAt: winner.payExpiresAt,
        payment: pay.payment
      }
    } finally {
      await releaseOrderLock(db, lock.userId)
    }
  }

  async function payOrder(uid, orderId) {
    if (!String(sessionKey || '').trim()) return { ok: false, error: 'NO_SESSION_KEY' }
    if (!xpay.isPayConfigured(env)) return { ok: false, error: 'PAY_NOT_CONFIGURED' }
    await lazyExpireCreatedOrders(db, uid, nowMs)
    const res = await db
      .collection('membership_orders')
      .where({ orderId, uid })
      .limit(1)
      .get()
    const order = (res.data && res.data[0]) || null
    if (!order || order.status !== 'created' || isCreatedPayExpired(order, nowMs)) {
      return { ok: false, error: 'ORDER_EXPIRED' }
    }
    const pay = await buildPaymentForOrder(xpay, {
      order,
      openid,
      sessionKey,
      env
    })
    if (!pay.ok) return pay
    return {
      ok: true,
      orderId: order.orderId,
      payFen: order.amountFen,
      productId: order.productId,
      payExpiresAt: order.payExpiresAt,
      payment: pay.payment
    }
  }

  async function cancelOrder(uid, orderId) {
    await lazyExpireCreatedOrders(db, uid, nowMs)
    const res = await db
      .collection('membership_orders')
      .where({ orderId, uid })
      .limit(1)
      .get()
    const order = (res.data && res.data[0]) || null
    if (!order || order.status !== 'created' || isCreatedPayExpired(order, nowMs)) {
      return { ok: false, error: 'ORDER_EXPIRED' }
    }
    await closeCreatedOrder(db, orderId, 'USER_CANCEL', nowMs)
    return { ok: true }
  }

  async function refresh(uid) {
    await lazyExpireCreatedOrders(db, uid, nowMs)
    // 复用 listCreatedOrders（无 orderBy）；查单优先较新的单
    const created = (await listCreatedOrders(db, uid)).slice().reverse().slice(0, 5)
    for (const order of created) {
      let wx = null
      try {
        wx = await xpay.queryOrder({
          orderId: order.orderId,
          openid,
          env
        })
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

  return {
    getStatus,
    createOrder,
    payOrder,
    cancelOrder,
    refresh
  }
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
  if (action === 'createOrder') {
    return api.createOrder(uid, eventObj.sku, {
      replacePending: !!eventObj.replacePending
    })
  }
  if (action === 'payOrder') return api.payOrder(uid, eventObj.orderId)
  if (action === 'cancelOrder') return api.cancelOrder(uid, eventObj.orderId)
  if (action === 'refresh') return api.refresh(uid)
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
