'use strict'

/**
 * Vendored copy: WeChat upload only packs this function dir.
 * Source of truth: cloudfunctions/_shared/defaultAvatar.js — keep in sync.
 */
const { hash32 } = require('./nickname.js')

const AVATAR_COUNT = 10
const AVATAR_PREFIX = '/assets/avatars/avatar-cook-'

function pickDefaultAvatar(uid) {
  const n = (hash32(String(uid || 'anon')) % AVATAR_COUNT) + 1
  const id = n < 10 ? `0${n}` : String(n)
  return `${AVATAR_PREFIX}${id}.png`
}

module.exports = { pickDefaultAvatar, AVATAR_COUNT, AVATAR_PREFIX }
