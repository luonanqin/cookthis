/**
 * 流量主广告 unitId。未配置（空字符串）时购物页不渲染广告位。
 * 在微信公众平台开通流量主后填入真实 unitId。
 */
const AD_UNITS = {
  // 购买清单原生模板（主位 A）
  shoppingNative: ''
}

function shoppingAdSlots(mealType) {
  const unitId = AD_UNITS.shoppingNative
  if (!unitId) return []
  const count = mealType && mealType !== 'daily' ? 2 : 1
  const slots = []
  for (let i = 0; i < count; i++) {
    slots.push({ id: `ad_${i}`, unitId })
  }
  return slots
}

module.exports = { AD_UNITS, shoppingAdSlots }
