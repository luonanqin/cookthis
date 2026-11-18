'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { SKUS, getSku, formatYuanFromFen } = require('./membershipCatalog.js')

describe('membershipCatalog', () => {
  it('defines month, quarter, and year at integer fen prices', () => {
    assert.deepEqual(SKUS.month, {
      tier: 'month',
      days: 31,
      listFen: 660,
      firstFen: 99,
      productIdFirst: 'vip_month_first',
      productIdList: 'vip_month'
    })
    assert.deepEqual(SKUS.quarter, {
      tier: 'quarter',
      days: 93,
      listFen: 1660,
      firstFen: 990,
      productIdFirst: 'vip_quarter_first',
      productIdList: 'vip_quarter'
    })
    assert.deepEqual(SKUS.year, {
      tier: 'year',
      days: 365,
      listFen: 5660,
      firstFen: 3990,
      productIdFirst: 'vip_year_first',
      productIdList: 'vip_year'
    })
  })

  it('getSku returns the catalog row or null', () => {
    assert.equal(getSku('month'), SKUS.month)
    assert.equal(getSku('quarter'), SKUS.quarter)
    assert.equal(getSku('year'), SKUS.year)
    assert.equal(getSku('week'), null)
    assert.equal(getSku(''), null)
    assert.equal(getSku(null), null)
    assert.equal(getSku(undefined), null)
    assert.equal(getSku('toString'), null)
  })

  it('formats fen as yuan without trailing zeros', () => {
    assert.equal(formatYuanFromFen(660), '6.6')
    assert.equal(formatYuanFromFen(99), '0.99')
    assert.equal(formatYuanFromFen(1660), '16.6')
    assert.equal(formatYuanFromFen(990), '9.9')
    assert.equal(formatYuanFromFen(5660), '56.6')
    assert.equal(formatYuanFromFen(3990), '39.9')
    assert.equal(formatYuanFromFen(100), '1')
    assert.equal(formatYuanFromFen(10), '0.1')
    assert.equal(formatYuanFromFen(1), '0.01')
    assert.equal(formatYuanFromFen(0), '0')
    assert.equal(formatYuanFromFen(101), '1.01')
  })
})
