'use strict'

function hasCuisineStance(prefs) {
  const p = prefs || {}
  return Object.keys(p).some((k) => p[k] === 'prefer' || p[k] === 'avoid')
}

function computeProfileGaps(input) {
  const familyAvoids = (input && input.familyAvoids) || []
  const familyAvoidsNone = !!(input && input.familyAvoidsNone)
  const membersCount = Number(input && input.membersCount) || 0
  const city = (input && input.city) || ''
  const cuisinePrefs = (input && input.cuisinePrefs) || {}
  const cuisinePrefsConfirmedAt = input && input.cuisinePrefsConfirmedAt
  const cookSkillProbeDishIds = (input && input.cookSkillProbeDishIds) || []

  const familyAvoidsOpen = !(
    (Array.isArray(familyAvoids) && familyAvoids.length > 0) ||
    familyAvoidsNone
  )
  const membersOpen = membersCount < 1
  const cityOpen = !String(city).trim()
  const cuisineOpen =
    !hasCuisineStance(cuisinePrefs) && !cuisinePrefsConfirmedAt
  // 与「我的」一致：至少勾过 1 道探针菜才算已填；引导跳过清 dishIds → 缺口仍开
  const cookSkillOpen = !(
    Array.isArray(cookSkillProbeDishIds) && cookSkillProbeDishIds.length > 0
  )

  const gaps = []
  if (familyAvoidsOpen) gaps.push('family_avoids')
  if (membersOpen) gaps.push('members')
  if (cityOpen) gaps.push('city')
  if (cookSkillOpen) gaps.push('cook_skill')
  if (cuisineOpen) gaps.push('cuisine')

  return {
    gaps,
    familyAvoidsOpen,
    membersOpen,
    cityOpen,
    cookSkillOpen,
    cuisineOpen,
    anyOpen: gaps.length > 0,
    recommendBanner: familyAvoidsOpen
  }
}

module.exports = { computeProfileGaps }
