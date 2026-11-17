'use strict'

const { isMemberActive } = require('./membershipLogic.js')
const {
  normalizeSwapDaily,
  canConsumeFreeSwap,
  applySwapConsume,
  checkSwapRateLimit
} = require('./swapQuota.js')

function evaluateSwapAccess({ membership, swapDaily, swapRateTimestamps, nowMs }) {
  const now = Number(nowMs)
  const isMember = isMemberActive(membership, now)
  const rate = checkSwapRateLimit(swapRateTimestamps || [], now)
  if (!rate.ok) return { ok: false, error: rate.error }

  const daily = normalizeSwapDaily(swapDaily, now)
  const gate = canConsumeFreeSwap({ isMember, swapDaily: daily, nowMs: now })
  if (!gate.ok) {
    return {
      ok: false,
      error: 'SWAP_CAP',
      used: gate.used,
      limit: gate.limit,
      isMember: false
    }
  }
  return {
    ok: true,
    consume: gate.consume,
    isMember,
    swapDaily: daily,
    nextTimestamps: rate.nextTimestamps
  }
}

function buildSwapQuotaUserPatch({ consume, swapDaily, nextTimestamps, nowMs, serverDate }) {
  const data = {
    swapRateTimestamps: nextTimestamps,
    updatedAt: serverDate
  }
  if (consume) {
    data.swapDaily = applySwapConsume(swapDaily, nowMs)
  }
  return data
}

module.exports = {
  evaluateSwapAccess,
  buildSwapQuotaUserPatch
}
