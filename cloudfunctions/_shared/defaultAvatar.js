'use strict'

const { hash32 } = require('./nickname.js')

const AVATAR_COUNT = 10
const AVATAR_PREFIX = '/assets/avatars/avatar-cook-'

/**
 * 新用户默认头像：按 uid 稳定映射到 10 张内置卡通图之一（跨用户看起来随机）。
 * @param {string} uid
 * @returns {string} 小程序本地资源路径
 */
function pickDefaultAvatar(uid) {
  const n = (hash32(String(uid || 'anon')) % AVATAR_COUNT) + 1
  const id = n < 10 ? `0${n}` : String(n)
  return `${AVATAR_PREFIX}${id}.png`
}

module.exports = { pickDefaultAvatar, AVATAR_COUNT, AVATAR_PREFIX }
