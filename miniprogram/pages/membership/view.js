'use strict'

const PAY_UNAVAILABLE = '当前环境暂无法支付'
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

const BENEFITS = [
  {
    id: 'swap',
    title: '换菜不限次',
    desc: '日常与聚会共用一池，会员不再扣每日 3 次'
  },
  {
    id: 'dishes',
    title: '日常菜数放宽',
    desc: '免费用户日常总菜数软限 12；会员不限'
  },
  {
    id: 'reward',
    title: '免换菜激励预告',
    desc: '激励上线后，会员免看视频再换'
  }
]

const NOTICE_ITEMS = [
  '不自动续费，买一次算一次。',
  '支付成功后权益自动到账；若未到账可点「刷新会员状态」。',
  '各档首购优惠仅一次，月 / 季 / 年互不影响。',
  '会员免的是换菜功能激励；展示类广告策略以届时说明为准。',
  '虚拟商品，原则上不退。'
]

function isIosPlatform(platform) {
  return String(platform || '').toLowerCase() === 'ios'
}

function orderErrorToast(err, platform) {
  const code = err && err.error
  if (
    isIosPlatform(platform) ||
    code === 'PAY_NOT_CONFIGURED' ||
    code === 'NO_SESSION_KEY'
  ) {
    return PAY_UNAVAILABLE
  }
  return (code && String(code)) || '下单失败'
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

function applyStatus(payload, prevSelectedSku, prevBuyExpanded) {
  const status = payload || null
  const offers = decorateOffers((status && status.offers) || [])
  let selectedSku = prevSelectedSku
  if (!offers.some((o) => o.sku === selectedSku)) {
    selectedSku = (offers[0] && offers[0].sku) || 'month'
  }
  const isMember = !!(status && status.isMember)
  const tier = status && status.tier
  return {
    status,
    offers,
    selectedSku,
    isMember,
    statusText: statusHeadline(status),
    usageText: usageText(status),
    tierLabel: (tier && TIER_LABEL[tier]) || '',
    expiresLabel: (status && status.expiresLabel) || '',
    buyExpanded: isMember ? !!prevBuyExpanded : true,
    ctaLabel: isMember ? '续费/再买' : '立即开通'
  }
}

module.exports = {
  BENEFITS,
  NOTICE_ITEMS,
  NOTICE_KEY,
  PAY_UNAVAILABLE,
  POLL_MAX,
  TIER_LABEL,
  applyStatus,
  decorateOffers,
  isIosPlatform,
  orderErrorToast,
  payFailToast,
  shouldContinuePoll,
  statusHeadline,
  usageText
}
