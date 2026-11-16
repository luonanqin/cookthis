'use strict'

/**
 * 方案分享总开关。因合规暂关：入口不露出、落地页提示暂未开放；云函数 / 工具代码保留。
 * 合规通过后改为 true，并恢复各页分享按钮与 sharedPlan 正常加载。
 */
const PLAN_SHARE_ENABLED = false

/** Keep in sync with cloudfunctions/_shared/planShare.js shareCardTitle */
const SHARE_CARD_TITLE_MAX = 30

/**
 * @param {Array<{ name: string }>} dishes
 * @returns {string}
 */
function shareCardTitle(dishes) {
  const list = Array.isArray(dishes) ? dishes : []
  const joined = list
    .map((d) => (d && d.name != null ? String(d.name).trim() : ''))
    .filter(Boolean)
    .join('、')
  if (!joined) return ''
  if (joined.length <= SHARE_CARD_TITLE_MAX) return joined
  return joined.slice(0, SHARE_CARD_TITLE_MAX) + '…'
}

module.exports = {
  PLAN_SHARE_ENABLED,
  shareCardTitle
}
