'use strict'

const SKUS = {
  month: { tier: 'month', days: 31, listFen: 660, firstFen: 99, productId: 'vip_month' },
  quarter: { tier: 'quarter', days: 93, listFen: 1660, firstFen: 990, productId: 'vip_quarter' },
  year: { tier: 'year', days: 365, listFen: 5660, firstFen: 3990, productId: 'vip_year' }
}

function getSku(sku) {
  if (!Object.prototype.hasOwnProperty.call(SKUS, sku)) return null
  return SKUS[sku]
}

/** Integer fen → yuan text. 660 → '6.6', 99 → '0.99'. */
function formatYuanFromFen(fen) {
  const n = Math.trunc(Number(fen))
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  if (frac === 0) return sign + String(whole)
  if (frac % 10 === 0) return sign + whole + '.' + String(frac / 10)
  return sign + whole + '.' + String(frac).padStart(2, '0')
}

module.exports = {
  SKUS,
  getSku,
  formatYuanFromFen
}
