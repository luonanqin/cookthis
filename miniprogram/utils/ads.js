/**
 * 广告总开关（发版形态见 doc/分支与发布约定.md）。
 * - false：不渲染清单广告位；确认页「更多」不展示「看广告解锁」。
 * - true：开放广告相关入口；激励有 unitId 走真广告，开发/体验无 unitId 可模拟完播。
 * 当前联调为 true；上线前若流量主未就绪改回 false。
 */
const ADS_ENABLED = true

/**
 * 流量主广告 unitId。总开关开启且 unitId 非空时才展示真广告。
 * 在微信公众平台开通流量主后填入真实 unitId。
 */
const AD_UNITS = {
  // 购买清单原生模板（主位 A）
  shoppingNative: '',
  // 确认页「更多」餐数激励视频（填 unitId 后真机完播解锁当日）
  rewardedDailyMealCustom: ''
}

/** 确认页门槛是否展示「看广告解锁」（跟 ADS_ENABLED） */
function canOfferDailyMealRewardAd() {
  return !!ADS_ENABLED
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
