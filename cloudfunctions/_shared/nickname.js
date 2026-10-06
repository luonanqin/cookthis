'use strict'

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * @param {string} uid
 * @param {number} [len=4]
 * @returns {string}
 */
function buildDefaultNickname(uid, len = 4) {
  let h = hash32(String(uid || 'anon'))
  let code = ''
  const n = Math.max(4, len)
  for (let i = 0; i < n; i++) {
    code += ALPHA[h % ALPHA.length]
    h = Math.imul(h, 1664525) + 1013904223
    h >>>= 0
  }
  return `大厨${code}`
}

module.exports = { buildDefaultNickname, hash32 }
