'use strict'

function normalizeIngredientName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
}

/** A 主荤 */
const TIER_A = new Set([
  '猪肉',
  '牛肉',
  '羊肉',
  '鸡肉',
  '鸭肉',
  '鱼',
  '草鱼',
  '带鱼',
  '鲈鱼',
  '虾',
  '基围虾',
  '排骨',
  '五花肉',
  '里脊'
])

/** B 蛋豆主菜 */
const TIER_B = new Set(['鸡蛋', '豆腐', '北豆腐', '豆干', '豆腐皮', '鹌鹑蛋'])

/** C 大宗配菜 */
const TIER_C = new Set([
  '土豆',
  '番茄',
  '西红柿',
  '青椒',
  '白菜',
  '青菜',
  '小白菜',
  '茄子',
  '洋葱',
  '胡萝卜',
  '黄瓜',
  '芹菜',
  '生菜',
  '菠菜',
  '白萝卜',
  '莲藕',
  '冬瓜',
  '豆角',
  '四季豆',
  '金针菇',
  '香菇',
  '菜心',
  '红薯',
  '毛豆'
])

function ingredientBaseScore(name) {
  const n = normalizeIngredientName(name)
  if (!n) return 0
  if (TIER_A.has(n)) return 24
  if (TIER_B.has(n)) return 12
  if (TIER_C.has(n)) return 4
  return 12
}

function decayFactor(daysAgo) {
  const d = Number(daysAgo)
  if (!Number.isFinite(d) || d < 0 || d >= 7) return 0
  if (d <= 1) return 1
  if (d <= 3) return 0.6
  return 0.3
}

/**
 * @param {string[]} mainIngredients
 * @param {Record<string, number>} recentDaysByName 食材名 → 距今天数（同一食材仅最近一次）
 */
function computeFreshPenalty(mainIngredients, recentDaysByName) {
  const map = recentDaysByName || {}
  let sum = 0
  const seen = new Set()
  for (const raw of mainIngredients || []) {
    const name = normalizeIngredientName(raw)
    if (!name || seen.has(name)) continue
    seen.add(name)
    const days = map[name]
    if (days == null || !Number.isFinite(Number(days))) continue
    const factor = decayFactor(days)
    if (factor <= 0) continue
    sum += ingredientBaseScore(name) * factor
  }
  return Math.min(60, Math.round(sum))
}

/**
 * 合并为「每食材最近一次」距今天数。
 * @param {{ name: string, daysAgo: number }[]} signals
 * @returns {Record<string, number>}
 */
function mergeRecentIngredientDays(signals) {
  const map = {}
  for (const row of signals || []) {
    const name = normalizeIngredientName(row && row.name)
    if (!name) continue
    const days = Number(row.daysAgo)
    if (!Number.isFinite(days) || days < 0) continue
    if (map[name] == null || days < map[name]) map[name] = days
  }
  return map
}

module.exports = {
  normalizeIngredientName,
  ingredientBaseScore,
  decayFactor,
  computeFreshPenalty,
  mergeRecentIngredientDays,
  TIER_A,
  TIER_B,
  TIER_C
}
