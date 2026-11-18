'use strict'

/**
 * 每个档位两个米大师道具：首购价 / 页价各一个 productId，
 * 避免同一道具固定标价与首购优惠冲突。
 */
const SKUS = {
  month: {
    tier: 'month',
    days: 31,
    listFen: 660,
    firstFen: 99,
    productIdFirst: 'vip_month_first',
    productIdList: 'vip_month'
  },
  quarter: {
    tier: 'quarter',
    days: 93,
    listFen: 1660,
    firstFen: 990,
    productIdFirst: 'vip_quarter_first',
    productIdList: 'vip_quarter'
  },
  year: {
    tier: 'year',
    days: 365,
    listFen: 5660,
    firstFen: 3990,
    productIdFirst: 'vip_year_first',
    productIdList: 'vip_year'
  }
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
