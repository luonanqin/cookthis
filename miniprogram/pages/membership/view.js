'use strict'

const PAY_UNAVAILABLE = '当前环境暂无法支付'
const ORDER_CANCELLED_TOAST = '订单已取消，请重新下单'
const POLL_MAX = 3
const NOTICE_KEY = 'cookthis_membership_notice_acked'

const TIER_LABEL = {
  month: '月卡',
  quarter: '季卡',
  year: '年卡'
}

const SKU_HINT = {
  month: '31 天',
  quarter: '93 天 · 约 ¥5.5/月',
  year: '365 天 · 约 ¥4.7/月'
}

/** 权益对照表：左会员右免费。多餐在换菜激励之后、展示类广告预告之前。 */
const BENEFITS = [
  { id: 'swap', dim: '换菜次数', member: '不限', free: '每日 3 次' },
  { id: 'dishes', dim: '推荐菜数量', member: '不限', free: '每次 12 道' },
  { id: 'reward', dim: '视频广告', member: '免看', free: '解锁限制' },
  { id: 'meals', dim: '日常多餐', member: '日常最多 10 餐', free: '快捷 ≤6' }
]

/** 从「更多」餐门槛进来时高亮「日常多餐」。 */
function highlightBenefitId(from) {
  return from === 'daily_meal_custom' ? 'meals' : ''
}

const NOTICE_ITEMS = [
  '不自动续费，如有需要可自行复购。',
  '有效期内再买任意档，剩余天数保留，新套餐时长从原到期日叠加。',
  '首购优惠每个账号仅一次：任选月/季/年首次购买后，再次购买均恢复原价。',
  '支付成功后权益自动到账；若未到账可点「刷新会员状态」，或联系客服。',
  '虚拟商品原则上不退；Android 可走商户退款，iOS 需向 App Store 申请。'
]

const IOS_MIN_WECHAT = [8, 0, 68]
const IOS_UPDATE_WECHAT = '请将微信更新至最新版后再进行支付'

function isIosPlatform(platform) {
  return String(platform || '').toLowerCase() === 'ios'
}

function parseVersionParts(version) {
  return String(version || '')
    .split('.')
    .map((p) => Number(p))
    .map((n) => (Number.isFinite(n) ? n : 0))
}

function isVersionAtLeast(version, minParts) {
  const cur = parseVersionParts(version)
  const base = minParts || IOS_MIN_WECHAT
  for (let i = 0; i < base.length; i += 1) {
    const a = cur[i] || 0
    const b = base[i] || 0
    if (a > b) return true
    if (a < b) return false
  }
  return true
}

/** iOS 需微信 ≥ 8.0.68；其它端放行。 */
function canUseVirtualPayOnClient({ platform, version }) {
  if (!isIosPlatform(platform)) return { ok: true, message: '' }
  if (isVersionAtLeast(version, IOS_MIN_WECHAT)) return { ok: true, message: '' }
  return { ok: false, message: IOS_UPDATE_WECHAT }
}

function orderErrorToast(err, platform) {
  void platform
  const code = err && err.error
  if (code === 'PAY_NOT_CONFIGURED' || code === 'NO_SESSION_KEY') {
    return PAY_UNAVAILABLE
  }
  if (code === 'FIRST_PURCHASE_USED') {
    return '首购优惠已用过，请按页价购买'
  }
  if (code === 'PENDING_ORDER_EXISTS') return '请先处理待支付订单'
  if (code === 'ORDER_EXPIRED') return ORDER_CANCELLED_TOAST
  if (code === 'ORDER_BUSY') return '请稍后再试'
  if (code === 'BAD_SKU') return '套餐无效'
  return (code && String(code)) || '下单失败'
}

function formatRemain(ms) {
  const n = Math.max(0, Math.floor(Number(ms) / 1000))
  const m = Math.floor(n / 60)
  const s = n % 60
  return m + ':' + String(s).padStart(2, '0')
}

function formatOrderTime(iso) {
  if (!iso) return ''
  const raw = String(iso)
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) {
    if (raw.length >= 16 && raw[10] === 'T') return raw.slice(0, 16).replace('T', ' ')
    return raw.slice(0, 10)
  }
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

function decorateOrders(orders) {
  return (orders || []).map((o) => {
    const remain = o && o.canPay && Number.isFinite(Number(o.remainMs)) ? Math.max(0, Number(o.remainMs)) : 0
    const timeSrc = (o && (o.paidAt || o.createdAt)) || ''
    let statusLabel = '已结束'
    if (o && o.canPay) statusLabel = '待支付'
    else if (o && o.status === 'paid') statusLabel = '' // 已支付不展示文案
    return Object.assign({}, o, {
      remainLabel: o && o.canPay ? formatRemain(remain) : '',
      remainMsLocal: remain,
      timeLabel: formatOrderTime(timeSrc),
      statusLabel
    })
  })
}

function payFailToast(err, payUnavailable) {
  if (err && err.errCode === -2) return '支付未完成'
  if (payUnavailable) return PAY_UNAVAILABLE
  return '支付未完成'
}

function shouldContinuePoll(attempt, isMember) {
  if (isMember) return false
  return Number(attempt) < POLL_MAX
}

function statusHeadline(status) {
  if (!status) return '加载中…'
  if (status.isMember) {
    return status.expiresLabel
      ? '会员生效中 · ' + status.expiresLabel + ' 到期'
      : '会员生效中'
  }
  return '未开通'
}

function usageText(status) {
  const used =
    status && status.swap && Number.isFinite(Number(status.swap.used))
      ? Number(status.swap.used)
      : 0
  if (status && status.isMember) {
    return '换菜不限次（今日已换 ' + used + '）'
  }
  return '每日 3 次 · 今日已用 ' + used
}

function decorateOffers(offers) {
  return (offers || []).map((o) => {
    const sku = o && o.sku
    const listFen = Number(o && o.listFen)
    const payFen = Number(o && o.payFen)
    const isFirstPurchase = !!(o && o.isFirstPurchase)
    return {
      sku,
      listFen,
      payFen,
      isFirstPurchase,
      labelYuan: (o && o.labelYuan) || '',
      listYuan: (o && o.listYuan) || '',
      title: TIER_LABEL[sku] || sku || '',
      hint: SKU_HINT[sku] || '',
      showList: isFirstPurchase && listFen !== payFen
    }
  })
}

function applyStatus(payload, prevSelectedSku, prevBuyExpanded, clientNow) {
  const status = payload || null
  const offers = decorateOffers((status && status.offers) || [])
  let selectedSku = prevSelectedSku
  if (!offers.some((o) => o.sku === selectedSku)) {
    selectedSku = (offers[0] && offers[0].sku) || 'month'
  }
  const isMember = !!(status && status.isMember)
  const tier = status && status.tier
  const appliedAt = Number.isFinite(Number(clientNow)) ? Number(clientNow) : Date.now()
  const orders = decorateOrders((status && status.orders) || [])
  return {
    status,
    offers,
    orders,
    selectedSku,
    selectedSkuLabel: TIER_LABEL[selectedSku] || selectedSku || '',
    isMember,
    statusText: statusHeadline(status),
    usageText: usageText(status),
    tierLabel: (tier && TIER_LABEL[tier]) || '',
    expiresLabel: (status && status.expiresLabel) || '',
    buyExpanded: isMember ? !!prevBuyExpanded : true,
    ctaLabel: isMember ? '续费/再买' : '立即开通',
    _ordersAppliedAt: appliedAt,
    serverNow: (status && status.serverNow) || appliedAt
  }
}

function tickOrderRemains(orders, appliedAt, nowMs) {
  const elapsed = Math.max(0, Number(nowMs) - Number(appliedAt))
  return (orders || []).map((o) => {
    if (!o || !o.canPay) {
      return Object.assign({}, o, { remainMsLocal: 0, remainLabel: '' })
    }
    const left = Math.max(0, Number(o.remainMs || 0) - elapsed)
    return Object.assign({}, o, {
      remainMsLocal: left,
      remainLabel: formatRemain(left),
      canPay: left > 0,
      canCancel: left > 0
    })
  })
}

function pendingOtherSkuCopy(pending, nextSku) {
  const cur = (pending && (pending.title || TIER_LABEL[pending.sku])) || '未支付订单'
  const next = TIER_LABEL[nextSku] || nextSku || '新套餐'
  const yuan = (pending && pending.labelYuan) || ''
  const price = yuan ? '（¥' + yuan + '）' : ''
  return '你有一笔待支付的' + cur + price + '。确认后将取消该单并下单' + next + '。'
}

module.exports = {
  BENEFITS,
  NOTICE_ITEMS,
  highlightBenefitId,
  NOTICE_KEY,
  IOS_MIN_WECHAT,
  IOS_UPDATE_WECHAT,
  ORDER_CANCELLED_TOAST,
  PAY_UNAVAILABLE,
  POLL_MAX,
  TIER_LABEL,
  applyStatus,
  canUseVirtualPayOnClient,
  decorateOffers,
  decorateOrders,
  formatOrderTime,
  formatRemain,
  isIosPlatform,
  isVersionAtLeast,
  orderErrorToast,
  payFailToast,
  pendingOtherSkuCopy,
  shouldContinuePoll,
  statusHeadline,
  tickOrderRemains,
  usageText
}
