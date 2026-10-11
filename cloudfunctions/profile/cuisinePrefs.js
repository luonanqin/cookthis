'use strict'

const CUISINE_OPTIONS = [
  { id: 'sichuan', label: '川菜' },
  { id: 'cantonese', label: '粤菜' },
  { id: 'shandong', label: '鲁菜' },
  { id: 'jiangsu', label: '苏菜' },
  { id: 'zhejiang', label: '浙菜' },
  { id: 'fujian', label: '闽菜' },
  { id: 'hunan', label: '湘菜' },
  { id: 'anhui', label: '徽菜' },
  { id: 'northeast', label: '东北菜' },
  { id: 'northwest', label: '西北菜' },
  { id: 'shanghai', label: '本帮/上海' },
  { id: 'beijing', label: '京菜' },
  { id: 'henan', label: '豫菜' },
  { id: 'yunnan', label: '云南菜' },
  { id: 'guizhou', label: '贵州菜' },
  { id: 'inner_mongolia', label: '内蒙菜' },
  { id: 'xinjiang', label: '新疆菜' },
  { id: 'hubei', label: '湖北菜' },
  { id: 'jiangxi', label: '江西菜' }
]

const CUISINE_CODES = CUISINE_OPTIONS.map((x) => x.id)
const FORM_VALUES = ['prefer', 'neutral', 'avoid']
const PREFER_DELTA = -20

function sanitizeCuisinePrefs(prefs) {
  const out = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const code of CUISINE_CODES) {
    const v = prefs[code]
    if (FORM_VALUES.includes(v) && v !== 'neutral') out[code] = v
    // neutral 可省略；若客户端显式传 neutral 也可写入，二选一：本实现省略 neutral 以省字段
  }
  return out
}

function familyAvoidCuisines(prefs) {
  const p = prefs || {}
  return CUISINE_CODES.filter((c) => p[c] === 'avoid')
}

function familyPreferCuisines(prefs) {
  const p = prefs || {}
  return CUISINE_CODES.filter((c) => p[c] === 'prefer')
}

function recipeBlockedByCuisine(recipe, prefs) {
  const avoids = familyAvoidCuisines(prefs)
  if (!avoids.length) return false
  const tags = (recipe && recipe.cuisineTags) || []
  if (!Array.isArray(tags) || !tags.length) return false
  const set = new Set(avoids)
  return tags.some((t) => set.has(t))
}

function cuisineSoftDelta(recipe, prefs) {
  const prefers = familyPreferCuisines(prefs)
  if (!prefers.length) return 0
  const tags = (recipe && recipe.cuisineTags) || []
  if (!Array.isArray(tags) || !tags.length) return 0
  const set = new Set(prefers)
  return tags.some((t) => set.has(t)) ? PREFER_DELTA : 0
}

module.exports = {
  CUISINE_CODES,
  CUISINE_OPTIONS,
  PREFER_DELTA,
  sanitizeCuisinePrefs,
  familyAvoidCuisines,
  familyPreferCuisines,
  recipeBlockedByCuisine,
  cuisineSoftDelta
}
