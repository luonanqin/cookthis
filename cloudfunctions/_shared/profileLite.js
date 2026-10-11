'use strict'

/**
 * 日常路径确认食材后、recommend.create 前是否弹出轻量补全。
 * @param {{
 *   mealType?: string,
 *   familyAvoids?: string[],
 *   profileLiteSkipped?: boolean,
 *   profileLitePromptedAt?: string|Date|number|null
 * }} input
 */
function shouldShowProfileLite(input) {
  const mealType = input && input.mealType
  if (mealType !== 'daily') return false
  const avoids = (input && input.familyAvoids) || []
  if (Array.isArray(avoids) && avoids.length > 0) return false
  if (input && input.profileLiteSkipped === true) return false
  if (input && input.profileLitePromptedAt) return false
  return true
}

module.exports = { shouldShowProfileLite }
