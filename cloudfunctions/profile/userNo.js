'use strict'

/**
 * Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
 * Source of truth for isValidUserNo: cloudfunctions/_shared/userNo.js — keep in sync.
 * loginUserNoFields matches cloudfunctions/auth/userNo.js.
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

async function ackUserNoReveal(db, uid, user) {
  if (user.userNoRevealSeenAt) return { ok: true, userNoRevealSeen: true }
  await db.collection('users').doc(user._id).update({
    data: {
      userNoRevealSeenAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, userNoRevealSeen: true }
}

module.exports = { isValidUserNo, loginUserNoFields, ackUserNoReveal }
