'use strict'

const TIP_NAME_DISPLAY_MAX = 5

/**
 * 方案卡右下角一行食材文案。
 * 每道菜取 1 个主料名（优先未在已选中的），去重后拼成「食材：猪肉、豆腐等2种」；
 * 展示名最多 5 个，「等 N 种」的 N 仍为去重后总数。
 * @param {{ plan: object, selectedNames?: string[] }} input
 * @returns {{ tipNames: string[], tipText: string, count: number, plan: object }}
 */
function buildPlanIngredientSummary(input) {
  const plan = input && input.plan
  const selected = new Set((input && input.selectedNames) || [])
  const tipNames = []
  const seen = new Set()

  for (const meal of (plan && plan.meals) || []) {
    for (const dish of meal.dishes || []) {
      const mains = (dish.mainIngredients || []).filter(Boolean)
      if (!mains.length) continue
      const needBuy = mains.filter((n) => !selected.has(n))
      const tipName = needBuy[0] || mains[0]
      if (!seen.has(tipName)) {
        seen.add(tipName)
        tipNames.push(tipName)
      }
    }
  }

  const count = tipNames.length
  let tipText = ''
  if (count === 1) {
    tipText = '食材：' + tipNames[0]
  } else if (count > 1) {
    const shown = tipNames.slice(0, TIP_NAME_DISPLAY_MAX).join('、')
    tipText = '食材：' + shown + '等' + count + '种'
  }

  return {
    tipNames,
    tipText,
    count,
    plan: plan || {}
  }
}

module.exports = { buildPlanIngredientSummary }
