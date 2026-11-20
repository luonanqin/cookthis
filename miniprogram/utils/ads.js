/**
 * 广告总开关：未开通流量主前保持 false，不渲染任何广告位。
 * 开通并填好 unitId 后再改为 true。
 */
const ADS_ENABLED = false

/**
 * 流量主广告 unitId。总开关开启且 unitId 非空时才展示。
 * 在微信公众平台开通流量主后填入真实 unitId。
 */
const AD_UNITS = {
  // 购买清单原生模板（主位 A）
  shoppingNative: '',
  // 确认页「更多」餐数激励视频（填 unitId 后真机完播解锁当日）
  rewardedDailyMealCustom: ''
}

/** 确认页门槛展示「看广告解锁」；有 unitId 走真广告，开发/体验无 unitId 可模拟完播 */
function canOfferDailyMealRewardAd() {
  return true
}

function shoppingAdSlots(mealType) {
  if (!ADS_ENABLED) return []
  const unitId = AD_UNITS.shoppingNative
  if (!unitId) return []
  const count = mealType && mealType !== 'daily' ? 2 : 1
  const slots = []
  for (let i = 0; i < count; i++) {
    slots.push({ id: `ad_${i}`, unitId })
  }
  return slots
}

module.exports = {
  ADS_ENABLED,
  AD_UNITS,
  shoppingAdSlots,
  canOfferDailyMealRewardAd
}
