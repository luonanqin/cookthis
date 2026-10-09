'use strict'

const MEAL_TYPE_LABELS = {
  daily: '日常',
  family_party: '家庭聚餐',
  friends_party: '朋友聚会',
  holiday_party: '节日聚餐'
}

/** 推荐页 / 已选方案：家庭聚餐 · 6人 · 5荤4素1汤 · 本场 */
function formatSceneSummary(scene) {
  if (!scene || typeof scene !== 'object') return ''
  const parts = []
  const typeLabel = MEAL_TYPE_LABELS[scene.mealType] || scene.mealType
  if (typeLabel) parts.push(typeLabel)
  if (typeof scene.peopleCount === 'number' && scene.peopleCount > 0) {
    parts.push(scene.peopleCount + '人')
  }
  const combo = scene.combo || {}
  const comboBits = []
  if (combo.meat) comboBits.push(combo.meat + '荤')
  if (combo.veg) comboBits.push(combo.veg + '素')
  if (combo.soup) comboBits.push(combo.soup + '汤')
  if (comboBits.length) parts.push(comboBits.join(''))
  const slots = (scene.mealSlots || [])
    .map((s) => (s && (s.label || s.meal)) || '')
    .filter(Boolean)
  if (slots.length) parts.push(slots.join('、'))
  return parts.join(' · ')
}

module.exports = { MEAL_TYPE_LABELS, formatSceneSummary }
