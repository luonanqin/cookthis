'use strict'

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
  shareCardTitle
}
