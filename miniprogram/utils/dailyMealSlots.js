'use strict'

const FREE_DAILY_MEAL_MAX = 6
const CUSTOM_DAILY_MEAL_MIN = 7
const MEMBER_DAILY_MEAL_MAX = 10
const MORE_MEAL_COUNTS = [7, 8, 9, 10]

function clampDailyMealCount(n, max) {
  const cap = Math.floor(Number(max))
  const hi = Number.isFinite(cap) && cap >= 1 ? cap : 1
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x) || x < 1) return 1
  if (x > hi) return hi
  return x
}

/** 自定义/更多：整数夹到 7..10；非法 → 7 */
function clampMoreMealCount(n) {
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x) || x < CUSTOM_DAILY_MEAL_MIN) return CUSTOM_DAILY_MEAL_MIN
  if (x > MEMBER_DAILY_MEAL_MAX) return MEMBER_DAILY_MEAL_MAX
  return x
}

function buildDailySlotsByCount(n, max = MEMBER_DAILY_MEAL_MAX) {
  const count = clampDailyMealCount(n, max)
  const slots = []
  for (let i = 1; i <= count; i++) {
    slots.push({ meal: 'other', label: '第' + i + '餐' })
  }
  return slots
}

/** 更多芯片：有效数字显示纯数字；否则「更多」 */
function formatMealCountChipLabel(n) {
  const x = Number(n)
  if (!Number.isInteger(x) || x < CUSTOM_DAILY_MEAL_MIN || x > MEMBER_DAILY_MEAL_MAX) {
    return '更多'
  }
  return String(x)
}

function formatMealSlotsSummary(slotsOrCount) {
  if (Array.isArray(slotsOrCount)) return slotsOrCount.length + '餐'
  const x = Math.floor(Number(slotsOrCount))
  if (!Number.isFinite(x) || x < 0) return '0餐'
  return x + '餐'
}

function normalizeMealSlotLabel(slot, index0) {
  const label = slot && typeof slot.label === 'string' ? slot.label.trim() : ''
  const mealMatch = label.match(/^第(\d+)餐$/)
  if (mealMatch) return '第' + mealMatch[1] + '餐'
  const dunMatch = label.match(/^第(\d+)顿$/)
  if (dunMatch) return '第' + dunMatch[1] + '餐'
  const meal = slot && typeof slot.meal === 'string' ? slot.meal : ''
  const idx = Math.floor(Number(index0))
  const n = (Number.isFinite(idx) && idx >= 0 ? idx : 0) + 1
  const legacy =
    meal === 'lunch' ||
    meal === 'dinner' ||
    label.includes('午饭') ||
    label.includes('晚饭') ||
    label.includes('顿')
  if (legacy || !label) return '第' + n + '餐'
  return label
}

function canUseDailyMealCount(count, opts) {
  const isMember = !!(opts && opts.isMember)
  const unlockedToday = !!(opts && opts.unlockedToday)
  const monetizationOff = !!(opts && opts.monetizationOff)
  const n = Number(count)
  if (Number.isFinite(n) && n <= FREE_DAILY_MEAL_MAX) return { ok: true }
  if (
    Number.isFinite(n) &&
    n <= MEMBER_DAILY_MEAL_MAX &&
    (monetizationOff || isMember || unlockedToday)
  ) {
    return { ok: true }
  }
  return { ok: false, error: 'MEAL_COUNT_GATE' }
}

/**
 * 是否可直接打开 7～10 餐选择。
 * monetizationOff：会员与广告都未上线时全员可进，不弹门槛。
 */
function canAccessMoreDailyMeals(opts) {
  if (opts && opts.monetizationOff) return true
  return !!(opts && (opts.isMember || opts.unlockedToday))
}

/** 门槛弹层刚打开时忽略按钮点击，避免「更多」触摸穿透到「看广告解锁」 */
const MEAL_GATE_ACTION_GRACE_MS = 400

function isMealGateActionTooSoon(openedAtMs, nowMs, graceMs) {
  const opened = Number(openedAtMs)
  const now = Number(nowMs)
  const graceRaw = Number(graceMs)
  const grace =
    Number.isFinite(graceRaw) && graceRaw >= 0 ? graceRaw : MEAL_GATE_ACTION_GRACE_MS
  if (!Number.isFinite(opened) || !Number.isFinite(now)) return false
  return now - opened < grace
}

module.exports = {
  FREE_DAILY_MEAL_MAX,
  CUSTOM_DAILY_MEAL_MIN,
  MEMBER_DAILY_MEAL_MAX,
  MORE_MEAL_COUNTS,
  MEAL_GATE_ACTION_GRACE_MS,
  clampDailyMealCount,
  clampMoreMealCount,
  buildDailySlotsByCount,
  formatMealCountChipLabel,
  formatMealSlotsSummary,
  normalizeMealSlotLabel,
  canUseDailyMealCount,
  canAccessMoreDailyMeals,
  isMealGateActionTooSoon
}
