'use strict'

const { callCloud } = require('./cloud.js')
const { getUser } = require('./session.js')

/** @type {{ scale: string, seasonal: any[], yearRound: any[] } | null} */
let cache = null

function resolveScale(scale) {
  if (scale) return scale
  const user = getUser() || {}
  return user.marketScaleEffective || 'medium'
}

function peek(scale) {
  const s = resolveScale(scale)
  if (cache && cache.scale === s) return cache
  return null
}

/** 取出一次缓存（确认页首屏消费）；不匹配则保留 */
function take(scale) {
  const hit = peek(scale)
  if (!hit) return null
  cache = null
  return hit
}

function clear() {
  cache = null
}

/**
 * 按当前有效规模拉食材并写入内存缓存；已命中则复用。
 * @param {string} [scale]
 * @returns {Promise<{ scale: string, seasonal: any[], yearRound: any[] }>}
 */
function ensure(scale) {
  const s = resolveScale(scale)
  if (cache && cache.scale === s) {
    return Promise.resolve(cache)
  }
  return callCloud('ingredients', { scale: s }).then((res) => {
    cache = {
      scale: (res && res.scale) || s,
      seasonal: (res && res.seasonal) || [],
      yearRound: (res && res.yearRound) || []
    }
    return cache
  })
}

module.exports = {
  ensure,
  peek,
  take,
  clear,
  resolveScale
}
