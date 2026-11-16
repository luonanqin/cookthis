'use strict'

/**
 * 家庭菜系偏好：UI / 引导 / 推荐生效总开关。
 * false = 暂不暴露选择、推荐不硬排除/不加软分；词表、sanitize、字段与 recipe cuisineTags 仍保留，翻 true 即可恢复。
 */
const CUISINE_PREFS_ENABLED = false

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
/** 通用：编辑器展示「通用」；含此 tag 时推荐忽略同行地方系 */
const CUISINE_COMMON = 'home_style'

function sanitizeCuisinePrefs(prefs) {
  const out = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const code of CUISINE_CODES) {
    const v = prefs[code]
    if (FORM_VALUES.includes(v) && v !== 'neutral') out[code] = v
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

/**
 * 推荐用的生效菜系：含 home_style（通用）→ 空集；否则仅地方系 code。
 */
function effectiveCuisineTags(recipe) {
  const tags = (recipe && recipe.cuisineTags) || []
  if (!Array.isArray(tags) || !tags.length) return []
  if (tags.includes(CUISINE_COMMON)) return []
  const allowed = new Set(CUISINE_CODES)
  const out = []
  const seen = new Set()
  for (const t of tags) {
    if (!allowed.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function recipeBlockedByCuisine(recipe, prefs) {
  if (!CUISINE_PREFS_ENABLED) return false
  const avoids = familyAvoidCuisines(prefs)
  if (!avoids.length) return false
  const tags = effectiveCuisineTags(recipe)
  if (!tags.length) return false
  const set = new Set(avoids)
  return tags.some((t) => set.has(t))
}

function cuisineSoftDelta(recipe, prefs) {
  if (!CUISINE_PREFS_ENABLED) return 0
  const prefers = familyPreferCuisines(prefs)
  if (!prefers.length) return 0
  const tags = effectiveCuisineTags(recipe)
  if (!tags.length) return 0
  const set = new Set(prefers)
  return tags.some((t) => set.has(t)) ? PREFER_DELTA : 0
}

module.exports = {
  CUISINE_PREFS_ENABLED,
  CUISINE_CODES,
  CUISINE_OPTIONS,
  CUISINE_COMMON,
  PREFER_DELTA,
  sanitizeCuisinePrefs,
  familyAvoidCuisines,
  familyPreferCuisines,
  effectiveCuisineTags,
  recipeBlockedByCuisine,
  cuisineSoftDelta
}
