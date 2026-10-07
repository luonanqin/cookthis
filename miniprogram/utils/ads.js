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
  shoppingNative: ''
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

module.exports = { ADS_ENABLED, AD_UNITS, shoppingAdSlots }
