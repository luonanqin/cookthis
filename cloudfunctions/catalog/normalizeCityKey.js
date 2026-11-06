'use strict'
// Vendored subset of aliasMatch.normalizeCityKey — keep in sync with
// cloudfunctions/_shared/aliasMatch.js / miniprogram/utils/aliasMatch.js

function normalizeCityKey(city) {
  let s = String(city || '').trim()
  if (!s) return ''
  const suffixes = ['特别行政区', '自治区', '省', '市']
  for (let i = 0; i < suffixes.length; i++) {
    const suf = suffixes[i]
    if (s.length > suf.length && s.endsWith(suf)) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}

module.exports = { normalizeCityKey }
