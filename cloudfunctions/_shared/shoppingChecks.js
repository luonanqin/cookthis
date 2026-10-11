'use strict'

/**
 * 清单已买勾选 storage key：同一推荐会话 + 方案序号 + 换一批代数。
 * 换一批后 swapCount 变化，旧勾选自动失效。
 */
function shoppingCheckKey(requestId, planIndex, swapCount) {
  const rid = requestId || 'none'
  const idx = Number.isFinite(Number(planIndex)) ? Number(planIndex) : 0
  const swap = Number.isFinite(Number(swapCount)) ? Number(swapCount) : 0
  return rid + ':' + idx + ':' + swap
}

/**
 * @param {Record<string, string[]>} map
 * @param {string} requestId
 * @returns {Record<string, string[]>}
 */
function clearChecksForRequest(map, requestId) {
  const src = map && typeof map === 'object' ? map : {}
  const prefix = (requestId || 'none') + ':'
  const next = {}
  Object.keys(src).forEach((k) => {
    if (!k.startsWith(prefix)) next[k] = src[k]
  })
  return next
}

/**
 * @param {Record<string, string[]>} map
 * @param {string} key
 * @param {string[]} validNames
 * @returns {string[]}
 */
function checkedNamesFromMap(map, key, validNames) {
  const stored = (map && map[key]) || []
  const valid = new Set(validNames || [])
  return stored.filter((n) => n && valid.has(n))
}

module.exports = {
  shoppingCheckKey,
  clearChecksForRequest,
  checkedNamesFromMap
}
