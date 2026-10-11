'use strict'

function clampMealCount(n) {
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x) || x < 0) return 0
  if (x > 7) return 7
  return x
}

function canIncrement(lunch, dinner, which) {
  const l = clampMealCount(lunch)
  const d = clampMealCount(dinner)
  if (l + d >= 14) return false
  if (which === 'lunch') return l < 7
  if (which === 'dinner') return d < 7
  return false
}

function buildDailySlotsFromCounts(lunchCount, dinnerCount) {
  const l = clampMealCount(lunchCount)
  const d = clampMealCount(dinnerCount)
  const slots = []
  for (let i = 0; i < l; i++) {
    slots.push({ meal: 'lunch', label: '午饭' + '①②③④⑤⑥⑦'[i] })
  }
  for (let i = 0; i < d; i++) {
    slots.push({ meal: 'dinner', label: '晚饭' + '①②③④⑤⑥⑦'[i] })
  }
  return slots
}

function formatCustomChipLabel(lunchCount, dinnerCount) {
  const l = clampMealCount(lunchCount)
  const d = clampMealCount(dinnerCount)
  if (l === 0 && d === 0) return '自定义'
  if (l === 0) return d + '晚'
  if (d === 0) return l + '午'
  return l + '午+' + d + '晚'
}

module.exports = {
  clampMealCount,
  canIncrement,
  buildDailySlotsFromCounts,
  formatCustomChipLabel
}
