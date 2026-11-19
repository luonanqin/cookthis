'use strict'

const FREE_DAILY_MEAL_MAX = 6
const MEMBER_DAILY_MEAL_MAX = 10

function clampDailyMealCount(n, max) {
  const cap = Math.floor(Number(max))
  const hi = Number.isFinite(cap) && cap >= 1 ? cap : 1
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x) || x < 1) return 1
  if (x > hi) return hi
  return x
}

function buildDailySlotsByCount(n, max = MEMBER_DAILY_MEAL_MAX) {
  const count = clampDailyMealCount(n, max)
  const slots = []
  for (let i = 1; i <= count; i++) {
    slots.push({ meal: 'other', label: '第' + i + '顿' })
  }
  return slots
}

function formatMealCountChipLabel(n) {
  const x = Number(n)
  if (!Number.isInteger(x) || x < 1) return '自定义'
  return x + '顿'
}

function formatMealSlotsSummary(slotsOrCount) {
  if (Array.isArray(slotsOrCount)) return slotsOrCount.length + '顿'
  const x = Math.floor(Number(slotsOrCount))
  if (!Number.isFinite(x) || x < 0) return '0顿'
  return x + '顿'
}

function normalizeMealSlotLabel(slot, index0) {
  const label = slot && typeof slot.label === 'string' ? slot.label.trim() : ''
  if (/^第\d+顿$/.test(label)) return label
  const meal = slot && typeof slot.meal === 'string' ? slot.meal : ''
  const idx = Math.floor(Number(index0))
  const n = (Number.isFinite(idx) && idx >= 0 ? idx : 0) + 1
  const legacy =
    meal === 'lunch' ||
    meal === 'dinner' ||
    label.includes('午饭') ||
    label.includes('晚饭')
  if (legacy || !label) return '第' + n + '顿'
  return label
}

function canUseDailyMealCount(count, opts) {
  const isMember = !!(opts && opts.isMember)
  const unlockedToday = !!(opts && opts.unlockedToday)
  const n = Number(count)
  if (Number.isFinite(n) && n <= FREE_DAILY_MEAL_MAX) return { ok: true }
  if (Number.isFinite(n) && n <= MEMBER_DAILY_MEAL_MAX && (isMember || unlockedToday)) {
    return { ok: true }
  }
  return { ok: false, error: 'MEAL_COUNT_GATE' }
}

module.exports = {
  FREE_DAILY_MEAL_MAX,
  MEMBER_DAILY_MEAL_MAX,
  clampDailyMealCount,
  buildDailySlotsByCount,
  formatMealCountChipLabel,
  formatMealSlotsSummary,
  normalizeMealSlotLabel,
  canUseDailyMealCount
}
