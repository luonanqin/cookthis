'use strict'

const AGE_BANDS = ['5_15', '16_25', '26_40', '41_59', '60_plus']
const TASTE_VALUES = ['light', 'normal', 'heavy', 'spicy']

const GUEST_DEFAULTS = {
  adult: { ageBand: '26_40', taste: 'normal', avoids: [] },
  child: { ageBand: '5_15', taste: 'light', avoids: [] },
  elder: { ageBand: '60_plus', taste: 'light', avoids: [] }
}

const LEGACY_AGE = {
  '6_15': '5_15',
  '41_60': '41_59'
}

const PRESCHOOL = new Set(['0_2', '3_5'])

function normalizeAgeBand(band) {
  if (band == null || band === '') return null
  const raw = String(band)
  if (PRESCHOOL.has(raw)) return null
  const mapped = LEGACY_AGE[raw] || raw
  return AGE_BANDS.includes(mapped) ? mapped : null
}

function ageBandToTier(band) {
  const b = normalizeAgeBand(band)
  if (!b) return null
  if (b === '5_15') return 'child'
  if (b === '60_plus') return 'elder'
  return 'adult'
}

function sortMembers(members) {
  return (members || [])
    .slice()
    .sort((a, b) => {
      const sa = Number(a && a.sort) || 0
      const sb = Number(b && b.sort) || 0
      if (sa !== sb) return sa - sb
      return String((a && a.memberId) || '').localeCompare(String((b && b.memberId) || ''))
    })
}

function computeHouseholdCounts(members) {
  const out = { adult: 0, child: 0, elder: 0 }
  for (const m of members || []) {
    const tier = ageBandToTier(m && m.ageBand)
    if (tier) out[tier]++
  }
  return out
}

function summarizeHousehold(members) {
  const counts = computeHouseholdCounts(members)
  const total = counts.adult + counts.child + counts.elder
  return {
    total,
    adult: counts.adult,
    child: counts.child,
    elder: counts.elder,
    label: `共${total}人 · ${counts.adult}大 ${counts.child}小 ${counts.elder}老`
  }
}

function emptyTierCounts() {
  return { adult: 0, child: 0, elder: 0 }
}

function normalizeTierCounts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = emptyTierCounts()
  for (const k of ['adult', 'child', 'elder']) {
    const n = Math.floor(Number(src[k]) || 0)
    out[k] = n > 0 ? n : 0
  }
  return out
}

function pushTierDefaults(diners, counts, flagKey) {
  for (const tier of ['adult', 'child', 'elder']) {
    const def = GUEST_DEFAULTS[tier]
    const n = counts[tier] || 0
    for (let i = 0; i < n; i++) {
      const row = {
        ageBand: def.ageBand,
        taste: def.taste,
        avoids: [],
        guest: true,
        tier
      }
      if (flagKey === 'party') row.party = true
      diners.push(row)
    }
  }
  return diners
}

/**
 * 非日常：仅 partyCounts × 档位默认（不并 members 个人忌口）。
 * 全 0 时返回 []（确认页须 peopleCount≥1）。
 */
function expandPartyDiners(scene) {
  const counts = normalizeTierCounts(scene && scene.partyCounts)
  return pushTierDefaults([], counts, 'party')
}

/**
 * 当次用餐人：
 * - 日常：档案成员（omit 末尾省略）+ guestCounts 访客
 * - 非日常：仅 partyCounts 档位默认（§3.1.2 / §3.0.8）
 */
function expandMealDiners(members, scene) {
  const mealType = scene && scene.mealType
  if (mealType && mealType !== 'daily') {
    return expandPartyDiners(scene)
  }

  const guestCounts = normalizeTierCounts(scene && scene.guestCounts)
  const omitCounts = normalizeTierCounts(scene && scene.omitCounts)
  const sorted = sortMembers(members).filter((m) => normalizeAgeBand(m && m.ageBand))

  const byTier = { adult: [], child: [], elder: [] }
  for (const m of sorted) {
    const tier = ageBandToTier(m.ageBand)
    if (tier) byTier[tier].push(m)
  }

  const diners = []
  for (const tier of ['adult', 'child', 'elder']) {
    const list = byTier[tier]
    const omit = Math.min(omitCounts[tier], list.length)
    const kept = list.slice(0, list.length - omit)
    for (const m of kept) {
      diners.push({
        memberId: m.memberId || null,
        ageBand: normalizeAgeBand(m.ageBand),
        taste: TASTE_VALUES.includes(m.taste) ? m.taste : 'normal',
        avoids: Array.isArray(m.avoids) ? m.avoids.slice() : [],
        guest: false,
        tier
      })
    }
    const def = GUEST_DEFAULTS[tier]
    for (let i = 0; i < guestCounts[tier]; i++) {
      diners.push({
        ageBand: def.ageBand,
        taste: def.taste,
        avoids: [],
        guest: true,
        tier
      })
    }
  }
  // 日常 0 成员且无访客：按 1 大兜底
  if (diners.length === 0) {
    return [
      {
        ageBand: '26_40',
        taste: 'normal',
        avoids: [],
        guest: false,
        tier: 'adult'
      }
    ]
  }
  return diners
}

function recipeTasteKey(recipe) {
  if (!recipe) return null
  if (typeof recipe.taste === 'string' && recipe.taste) return recipe.taste
  const tags = recipe.tasteTags || recipe.tags || []
  if (!Array.isArray(tags)) return null
  if (tags.includes('spicy') || tags.includes('辣')) return 'spicy'
  if (tags.includes('heavy') || tags.includes('重口')) return 'heavy'
  if (tags.includes('light') || tags.includes('清淡')) return 'light'
  return null
}

function recipeAvoidTagSet(recipe, ingredientsByName) {
  const tags = new Set()
  const names = []
    .concat((recipe && recipe.mainIngredients) || [])
    .concat((recipe && recipe.seasonings) || [])
  const map = ingredientsByName || {}
  for (const n of names) {
    const meta = map[n] || map[String(n || '').trim()]
    for (const t of (meta && meta.avoidTags) || []) tags.add(t)
  }
  return tags
}

function intersectsAvoids(tagSet, avoids) {
  if (!avoids || !avoids.length) return false
  for (const a of avoids) {
    if (tagSet.has(a)) return true
  }
  return false
}

/**
 * §3.0.8 extras only（不含 reject / fresh）。
 * 忌口命中 +40（多人不叠）；小/老+辣重口 +15；多数口味冲突 +10。
 */
function dinerSoftPenalty(recipe, diners, ingredientsByName) {
  const list = diners || []
  if (!list.length) return 0
  let score = 0
  const tags = recipeAvoidTagSet(recipe, ingredientsByName)
  let avoidHit = false
  for (const d of list) {
    if (intersectsAvoids(tags, d.avoids)) {
      avoidHit = true
      break
    }
  }
  if (avoidHit) score += 40

  const taste = recipeTasteKey(recipe)
  const hasChildOrElder = list.some(
    (d) => d.ageBand === '5_15' || d.ageBand === '60_plus'
  )
  if (hasChildOrElder && (taste === 'spicy' || taste === 'heavy')) {
    score += 15
  }

  if (taste) {
    const counts = {}
    for (const d of list) {
      const t = d.taste || 'normal'
      counts[t] = (counts[t] || 0) + 1
    }
    let majority = 'normal'
    let best = -1
    for (const [k, v] of Object.entries(counts)) {
      if (v > best) {
        best = v
        majority = k
      }
    }
    const conflict =
      (majority === 'light' && (taste === 'spicy' || taste === 'heavy')) ||
      (majority === 'spicy' && taste === 'light') ||
      (majority === 'heavy' && taste === 'light')
    if (conflict) score += 10
  }

  return score
}

function effectivePeopleCount(diners) {
  return (diners || []).length
}

module.exports = {
  AGE_BANDS,
  TASTE_VALUES,
  GUEST_DEFAULTS,
  normalizeAgeBand,
  ageBandToTier,
  computeHouseholdCounts,
  summarizeHousehold,
  normalizeTierCounts,
  expandMealDiners,
  expandPartyDiners,
  dinerSoftPenalty,
  effectivePeopleCount,
  recipeTasteKey
}
