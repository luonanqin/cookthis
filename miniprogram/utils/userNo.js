'use strict'

/**
 * Vendored copy: miniprogram cannot require cloudfunctions/_shared.
 * Source of truth: cloudfunctions/_shared/userNo.js — keep in sync.
 */
function isValidUserNo(n) {
  return Number.isInteger(n) && n >= 1
}
function formatUserNoLabel(n) {
  return isValidUserNo(n) ? '第 ' + n + ' 位大厨' : ''
}
function revealStartValue(n, spanPreferred) {
  if (!isValidUserNo(n)) return 0
  let span = Number(spanPreferred)
  if (!Number.isFinite(span)) span = 50
  span = Math.min(80, Math.max(30, Math.floor(span)))
  if (n <= span) return 0
  return n - span
}
function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0))
  return 1 - Math.pow(1 - x, 3)
}
module.exports = { isValidUserNo, formatUserNoLabel, revealStartValue, easeOutCubic }
