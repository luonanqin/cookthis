'use strict'

const { formatMealSlotsSummary } = require('./dailyMealSlots.js')

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
 * 场景摘要两行。
 * 行1：类型 · 人数 · 大/小/老（及聚会顿次若有）
 * 行2：日常荤素汤 · 顿次（N顿）；已选方案 omitSlots 时行2可无荤素汤外的顿次
 * 例行1：日常 · 2人 · 1大 0小 1老
 * 例行2：5荤4素2汤 · 3顿
 */
function formatSceneSummaryLines(scene, opts) {
  if (!scene || typeof scene !== 'object') {
    return { line1: '', line2: '' }
  }
  const line1 = []
  const line2 = []
  const isDaily = scene.mealType === 'daily'
  const typeLabel = MEAL_TYPE_LABELS[scene.mealType] || (isDaily ? '日常' : '聚会')
  if (typeLabel) line1.push(typeLabel)

  const tiers = tierCountsFromScene(scene)
  const people =
    typeof scene.peopleCount === 'number' && scene.peopleCount > 0
      ? scene.peopleCount
      : tiers
        ? tiers.adult + tiers.child + tiers.elder
        : 0
  if (people > 0) {
    line1.push(people + '人')
  }
  if (tiers) {
    line1.push(tiers.adult + '大 ' + tiers.child + '小 ' + tiers.elder + '老')
  }

  // 聚会不露荤素汤（与确认页一致）；日常放到第二行
  if (isDaily) {
    const combo = scene.combo || {}
    const comboBits = []
    if (combo.meat) comboBits.push(combo.meat + '荤')
    if (combo.veg) comboBits.push(combo.veg + '素')
    if (combo.soup) comboBits.push(combo.soup + '汤')
    if (comboBits.length) line2.push(comboBits.join(''))
  }
  if (!(opts && opts.omitSlots)) {
    let summary =
      typeof scene.mealSlotsSummary === 'string'
        ? scene.mealSlotsSummary.trim()
        : ''
    // 日常：有 mealSlotsSummary 且含「午/晚」→ 忽略，改用 slots.length
    // 聚会：沿用 summary 或 slot.label join（本场 / 第N顿）
    if (isDaily && summary && /午|晚/.test(summary)) summary = ''
    if (summary) {
      line2.push(summary)
    } else if (isDaily) {
      const n = (scene.mealSlots || []).length
      if (n > 0) line2.push(formatMealSlotsSummary(n))
    } else {
      const slots = (scene.mealSlots || [])
        .map((s) => (s && (s.label || s.meal)) || '')
        .filter(Boolean)
      if (slots.length) line2.push(slots.join('、'))
    }
  }
  return {
    line1: line1.join(' · '),
    line2: line2.join(' · ')
  }
}

/** 单行摘要（已选方案等）；内容同两行用「 · 」拼接 */
function formatSceneSummary(scene, opts) {
  const { line1, line2 } = formatSceneSummaryLines(scene, opts)
  return [line1, line2].filter(Boolean).join(' · ')
}

module.exports = {
  MEAL_TYPE_LABELS,
  formatSceneSummary,
  formatSceneSummaryLines,
  tierCountsFromScene
}
