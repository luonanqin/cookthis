'use strict'

/**
 * 日常按总人数推荐荤素汤（可改）。
 * meat = max(1, floor(n/2))；veg/soup 按人数档位表。
 */
function suggestComboByPeople(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return null
  const meat = Math.max(1, Math.floor(num / 2))
  if (num === 1) return { meat, veg: 1, soup: 0 }
  if (num === 2) return { meat, veg: 1, soup: 1 }
  if (num === 3) return { meat, veg: 2, soup: 1 }
  if (num <= 6) return { meat, veg: 2, soup: 1 }
  return { meat, veg: 3, soup: 1 }
}

function normalizePartyCounts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const adult = Math.max(0, Math.floor(Number(src.adult) || 0))
  const child = Math.max(0, Math.floor(Number(src.child) || 0))
  const elder = Math.max(0, Math.floor(Number(src.elder) || 0))
  return { adult, child, elder }
}

/** FNV-1a → [0,1)；用于稳定抽 extra */
function hash01(seed) {
  const s = String(seed || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** extra ∈ {1,2}，同 seed 固定 */
function partyExtraFromSeed(sessionSeed) {
  return hash01(String(sessionSeed || '') + ':partyExtra') < 0.5 ? 1 : 2
}

/**
 * 聚会自动搭配（页上不编辑）。
 * meat = max(1,⌊n/2⌋)；无小孩 meat+=1；
 * 有小孩 total=n；无小孩 total=n+{1|2}（seed 稳定）；
 * soup = n≥2?1:0；其余给素，保证 veg≥1。
 *
 * @param {{ adult?: number, child?: number, elder?: number }} partyCounts
 * @param {string} [sessionSeed] 如 requestId
 * @returns {{ meat: number, veg: number, soup: number }|null}
 */
function suggestPartyCombo(partyCounts, sessionSeed) {
  const { adult, child, elder } = normalizePartyCounts(partyCounts)
  const n = adult + child + elder
  if (n < 1) return null

  const hasChild = child >= 1
  let meat = Math.max(1, Math.floor(n / 2))
  if (!hasChild) meat += 1

  let total = hasChild ? n : n + partyExtraFromSeed(sessionSeed)
  const soup = n >= 2 ? 1 : 0
  let veg = total - meat - soup
  while (veg < 1) {
    total += 1
    veg = total - meat - soup
  }
  return { meat, veg, soup }
}

module.exports = {
  suggestComboByPeople,
  suggestPartyCombo,
  partyExtraFromSeed,
  normalizePartyCounts
}
