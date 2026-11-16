'use strict'

const {
  isValidUserNo,
  formatUserNoLabel,
  revealStartValue,
  easeOutCubic
} = require('./userNo.js')

const REVEAL_DURATION_MS = 1500

function readWxInfo() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAppBaseInfo === 'function') {
      const info = wx.getAppBaseInfo()
      if (info && typeof info === 'object') return info
    }
  } catch (e) {}
  try {
    if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
      const info = wx.getSystemInfoSync()
      if (info && typeof info === 'object') return info
    }
  } catch (e) {}
  return {}
}

function shouldAnimateUserNoReveal(info) {
  const src = info === undefined ? readWxInfo() : info && typeof info === 'object' ? info : {}
  if (src.reducedMotion === true || src.prefersReducedMotion === true) return false
  return true
}

function revealTick(n, elapsedMs, durationMs) {
  if (!isValidUserNo(n)) return { display: 0, done: true }
  const duration = durationMs == null ? REVEAL_DURATION_MS : durationMs
  const start = revealStartValue(n)
  const t = Math.min(1, Math.max(0, Number(elapsedMs) / duration))
  const display = Math.round(start + (n - start) * easeOutCubic(t))
  return { display, done: t >= 1 }
}

module.exports = {
  REVEAL_DURATION_MS,
  shouldAnimateUserNoReveal,
  revealTick,
  isValidUserNo,
  formatUserNoLabel,
  revealStartValue,
  easeOutCubic
}
