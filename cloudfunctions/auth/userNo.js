'use strict'

/**
 * Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
 * Source of truth for isValidUserNo: cloudfunctions/_shared/userNo.js — keep in sync.
 */
function isValidUserNo(n) {
  return Number.isInteger(n) && n >= 1
}

function loginUserNoFields(user) {
  const row = user || {}
  return {
    userNo: isValidUserNo(row.userNo) ? row.userNo : null,
    userNoRevealSeen: !!(row.userNoRevealSeenAt)
  }
}

module.exports = { isValidUserNo, loginUserNoFields }
