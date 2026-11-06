'use strict'

// Vendored: keep in sync with cloudfunctions/_shared/cookSkill.js
const {
  COOK_SKILL_VALUES,
  deriveCookSkill,
  PROBE_DISHES,
  PROBE_GROUP_SIZE
} = require('./cookSkill.js')

const PROBE_ID_SET = new Set(PROBE_DISHES.map((d) => d.id))

function clampProbeCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(PROBE_GROUP_SIZE, Math.floor(n))
}

/** @returns {{ easy: number, home: number, advanced: number }|null} */
function sanitizeProbeCounts(counts) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null
  return {
    easy: clampProbeCount(counts.easy),
    home: clampProbeCount(counts.home),
    advanced: clampProbeCount(counts.advanced)
  }
}

/**
 * 合法探针 id 去重保序；非数组 → null。
 * @returns {string[]|null}
 */
function sanitizeProbeDishIds(ids) {
  if (!Array.isArray(ids)) return null
  const out = []
  const seen = new Set()
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (typeof id !== 'string' || !PROBE_ID_SET.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** @returns {{ easy: number, home: number, advanced: number }|null} */
function countsFromDishIds(ids) {
  const list = sanitizeProbeDishIds(ids)
  if (!list) return null
  const on = new Set(list)
  const counts = { easy: 0, home: 0, advanced: 0 }
  PROBE_DISHES.forEach((dish) => {
    if (on.has(dish.id)) counts[dish.group] += 1
  })
  return counts
}

function probeCountTotal(counts) {
  if (!counts) return 0
  return (counts.easy || 0) + (counts.home || 0) + (counts.advanced || 0)
}

function storedCookSkill(value) {
  return COOK_SKILL_VALUES.includes(value) ? value : null
}

function storedProbeCounts(value) {
  return sanitizeProbeCounts(value)
}

function storedProbeDishIds(value) {
  return sanitizeProbeDishIds(value)
}

/**
 * completeOnboarding 写入片段。
 * cookSkillSkipped===true → 返回 {}；真正清档由 profile/index 用 _.remove()（含旧 dishIds）。
 * 合法 cookSkill 才写入。带了 cookSkillProbeCounts / dishIds 则写入。
 * 不写 cookSkillProbeAt：重测 action 才记时间。
 */
function onboardingCookSkillPatch(event) {
  const e = event || {}
  if (e.cookSkillSkipped === true) return {}
  const patch = {}
  if (COOK_SKILL_VALUES.includes(e.cookSkill)) {
    patch.cookSkill = e.cookSkill
  }
  const dishIds = sanitizeProbeDishIds(e.cookSkillProbeDishIds)
  let counts = sanitizeProbeCounts(e.cookSkillProbeCounts)
  if (!counts && dishIds && dishIds.length) counts = countsFromDishIds(dishIds)
  if (counts) patch.cookSkillProbeCounts = counts
  if (dishIds) patch.cookSkillProbeDishIds = dishIds
  return patch
}

/**
 * saveCookSkillProbe。skipped 不产生任何写入字段。
 * 有 dishIds 时以 id 派生 counts；否则用 counts。须至少 1 道。
 * 否则以 deriveCookSkill(counts) 为准，忽略客户端传来的 cookSkill。
 */
function planSaveCookSkillProbe(event) {
  if (event && event.skipped === true) {
    return { ok: true, unchanged: true }
  }
  const dishIds = sanitizeProbeDishIds(event && event.dishIds)
  let counts =
    dishIds && dishIds.length
      ? countsFromDishIds(dishIds)
      : sanitizeProbeCounts(event && event.counts)
  if (!counts) return { ok: false, error: 'INVALID_COUNTS' }
  if (probeCountTotal(counts) < 1) return { ok: false, error: 'EMPTY_PROBE' }
  const plan = {
    ok: true,
    cookSkill: deriveCookSkill(counts),
    cookSkillProbeCounts: counts
  }
  if (dishIds) plan.cookSkillProbeDishIds = dishIds
  return plan
}

module.exports = {
  sanitizeProbeCounts,
  sanitizeProbeDishIds,
  countsFromDishIds,
  storedCookSkill,
  storedProbeCounts,
  storedProbeDishIds,
  onboardingCookSkillPatch,
  planSaveCookSkillProbe
}
