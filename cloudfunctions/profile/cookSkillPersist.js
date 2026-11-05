'use strict'

// Vendored: keep in sync with cloudfunctions/_shared/cookSkill.js
const { COOK_SKILL_VALUES, deriveCookSkill } = require('./cookSkill.js')

function clampProbeCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(5, Math.floor(n))
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

function storedCookSkill(value) {
  return COOK_SKILL_VALUES.includes(value) ? value : null
}

function storedProbeCounts(value) {
  return sanitizeProbeCounts(value)
}

/**
 * completeOnboarding 写入片段。
 * cookSkillSkipped===true 不写 cookSkill（即使同时带了合法档）。
 * 合法 cookSkill 才写入。带了 cookSkillProbeCounts 则写入（跳过也不清已有档）。
 * 不写 cookSkillProbeAt：重测 action 才记时间。
 */
function onboardingCookSkillPatch(event) {
  const e = event || {}
  const patch = {}
  if (e.cookSkillSkipped !== true && COOK_SKILL_VALUES.includes(e.cookSkill)) {
    patch.cookSkill = e.cookSkill
  }
  const counts = sanitizeProbeCounts(e.cookSkillProbeCounts)
  if (counts) patch.cookSkillProbeCounts = counts
  return patch
}

/**
 * saveCookSkillProbe。skipped 不产生任何写入字段。
 * 否则以 deriveCookSkill(counts) 为准，忽略客户端传来的 cookSkill。
 */
function planSaveCookSkillProbe(event) {
  if (event && event.skipped === true) {
    return { ok: true, unchanged: true }
  }
  const counts = sanitizeProbeCounts(event && event.counts)
  if (!counts) return { ok: false, error: 'INVALID_COUNTS' }
  return {
    ok: true,
    cookSkill: deriveCookSkill(counts),
    cookSkillProbeCounts: counts
  }
}

module.exports = {
  sanitizeProbeCounts,
  storedCookSkill,
  storedProbeCounts,
  onboardingCookSkillPatch,
  planSaveCookSkillProbe
}
