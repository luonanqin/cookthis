'use strict'

const MEAL_TYPE_LABELS = {
  daily: '日常',
  // 与确认页入口一致：非 daily 一律展示「聚会」
  family_party: '聚会',
  friends_party: '聚会',
  holiday_party: '聚会'
}

function tierNum(raw, key) {
  const n = Math.floor(Number(raw && raw[key]) || 0)
  return n > 0 ? n : 0
}

function hasTierSource(raw) {
  return !!(raw && typeof raw === 'object' && ('adult' in raw || 'child' in raw || 'elder' in raw))
}

/** 当次展示用大/小/老：聚会用 partyCounts；日常 = 档案±访客−省略；无档位字段则 null */
function tierCountsFromScene(scene) {
  if (!scene || typeof scene !== 'object') return null
  if (scene.mealType !== 'daily') {
    if (!hasTierSource(scene.partyCounts)) return null
    const p = scene.partyCounts
    return {
      adult: tierNum(p, 'adult'),
      child: tierNum(p, 'child'),
      elder: tierNum(p, 'elder')
    }
  }
  if (!hasTierSource(scene.householdCounts) && !hasTierSource(scene.guestCounts)) {
    return null
  }
  const hh = scene.householdCounts || {}
  const guests = scene.guestCounts || {}
  const omit = scene.omitCounts || {}
  return {
    adult: Math.max(0, tierNum(hh, 'adult') + tierNum(guests, 'adult') - tierNum(omit, 'adult')),
    child: Math.max(0, tierNum(hh, 'child') + tierNum(guests, 'child') - tierNum(omit, 'child')),
    elder: Math.max(0, tierNum(hh, 'elder') + tierNum(guests, 'elder') - tierNum(omit, 'elder'))
  }
}

/**
 * 场景一行摘要。默认含顿次（本场 / 晚饭①…）；已选方案传 omitSlots:true。
 * 例：聚会 · 9人 · 5大 2小 2老 · 本场
 *     日常 · 3人 · 2大 1小 0老 · 1荤1素1汤 · 晚饭①
 */
function formatSceneSummary(scene, opts) {
  if (!scene || typeof scene !== 'object') return ''
  const parts = []
  const isDaily = scene.mealType === 'daily'
  const typeLabel = MEAL_TYPE_LABELS[scene.mealType] || (isDaily ? '日常' : '聚会')
  if (typeLabel) parts.push(typeLabel)

  const tiers = tierCountsFromScene(scene)
  const people =
    typeof scene.peopleCount === 'number' && scene.peopleCount > 0
      ? scene.peopleCount
      : tiers
        ? tiers.adult + tiers.child + tiers.elder
        : 0
  if (people > 0) {
    parts.push(people + '人')
  }
  if (tiers) {
    parts.push(tiers.adult + '大 ' + tiers.child + '小 ' + tiers.elder + '老')
  }

  // 聚会不露荤素汤（与确认页一致）；日常仍展示
  if (isDaily) {
    const combo = scene.combo || {}
    const comboBits = []
    if (combo.meat) comboBits.push(combo.meat + '荤')
    if (combo.veg) comboBits.push(combo.veg + '素')
    if (combo.soup) comboBits.push(combo.soup + '汤')
    if (comboBits.length) parts.push(comboBits.join(''))
  }
  if (!(opts && opts.omitSlots)) {
    // 日常优先用确认页芯片文案（一顿晚饭 / 1午+1晚 / 2午+1晚…）
    const summary =
      typeof scene.mealSlotsSummary === 'string'
        ? scene.mealSlotsSummary.trim()
        : ''
    if (summary) {
      parts.push(summary)
    } else {
      const slots = (scene.mealSlots || [])
        .map((s) => (s && (s.label || s.meal)) || '')
        .filter(Boolean)
      if (slots.length) parts.push(slots.join('、'))
    }
  }
  return parts.join(' · ')
}

module.exports = { MEAL_TYPE_LABELS, formatSceneSummary, tierCountsFromScene }
