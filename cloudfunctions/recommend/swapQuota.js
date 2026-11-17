'use strict'
// Vendored: keep in sync with cloudfunctions/_shared/swapQuota.js

const FREE_SWAP_LIMIT = 3
const SWAP_RATE_WINDOW_MS = 60 * 1000
const SWAP_RATE_MAX = 20
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

function dayKeyChina(nowMs) {
  const t = Number(nowMs)
  const ms = Number.isFinite(t) ? t : 0
  const shifted = new Date(ms + CHINA_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function nonNegInt(value) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function normalizeSwapDaily(raw, nowMs) {
  const day = dayKeyChina(nowMs)
  if (!raw || raw.day !== day) {
    return { day, used: 0, rewardExtra: 0, rewardWatches: 0 }
  }
  return {
    day,
    used: nonNegInt(raw.used),
    rewardExtra: nonNegInt(raw.rewardExtra),
    rewardWatches: nonNegInt(raw.rewardWatches)
  }
}

function canConsumeFreeSwap({ isMember, swapDaily, nowMs }) {
  const daily = normalizeSwapDaily(swapDaily, nowMs)
  if (isMember) {
    return { ok: true, consume: false, used: daily.used, limit: null }
  }
  if (daily.used < FREE_SWAP_LIMIT + daily.rewardExtra) {
    return { ok: true, consume: true, used: daily.used, limit: FREE_SWAP_LIMIT }
  }
  return {
    ok: false,
    error: 'SWAP_CAP',
    used: daily.used,
    limit: FREE_SWAP_LIMIT
  }
}

function applySwapConsume(swapDaily, nowMs) {
  const daily = normalizeSwapDaily(swapDaily, nowMs)
  return {
    day: daily.day,
    used: daily.used + 1,
    rewardExtra: daily.rewardExtra,
    rewardWatches: daily.rewardWatches
  }
}

function checkSwapRateLimit(timestampsMs, nowMs) {
  const now = Number(nowMs)
  const list = Array.isArray(timestampsMs) ? timestampsMs : []
  const inWindow = []
  for (const ts of list) {
    const n = Number(ts)
    if (!Number.isFinite(n)) continue
    if (n > now - SWAP_RATE_WINDOW_MS && n <= now) inWindow.push(n)
  }
  if (inWindow.length >= SWAP_RATE_MAX) {
    return { ok: false, error: 'SWAP_RATE_LIMIT' }
  }
  return { ok: true, nextTimestamps: inWindow.concat(now) }
}

module.exports = {
  FREE_SWAP_LIMIT,
  SWAP_RATE_WINDOW_MS,
  SWAP_RATE_MAX,
  dayKeyChina,
  normalizeSwapDaily,
  canConsumeFreeSwap,
  applySwapConsume,
  checkSwapRateLimit
}
