'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  isMemberActive,
  computeNewExpiry,
  resolvePriceFen,
  resolveProductId,
  buildSkuOffer,
  firstPurchaseUsedFromOrders
} = require('./membershipLogic.js')

const DAY_MS = 86400000

describe('membershipLogic', () => {
  it('resolvePriceFen uses firstFen until that sku is used', () => {
    assert.equal(resolvePriceFen('month', {}), 99)
    assert.equal(resolvePriceFen('month', { month: true }), 660)
    assert.equal(resolvePriceFen('quarter', {}), 990)
    assert.equal(resolvePriceFen('quarter', { quarter: true }), 1660)
    assert.equal(resolvePriceFen('year', {}), 3990)
    assert.equal(resolvePriceFen('year', { year: true }), 5660)
    assert.equal(resolvePriceFen('quarter', { month: true }), 990)
    assert.equal(resolvePriceFen('month', null), 99)
    assert.equal(resolvePriceFen('week', {}), null)
  })

  it('isMemberActive when expiresAt is strictly after now', () => {
    const now = 1_700_000_000_000
    assert.ok(isMemberActive({ expiresAt: now + 1000 }, now))
    assert.equal(isMemberActive({ expiresAt: now - 1 }, now), false)
    assert.equal(isMemberActive({ expiresAt: now }, now), false)
    assert.equal(isMemberActive(null, now), false)
    assert.equal(isMemberActive(undefined, now), false)
    assert.equal(isMemberActive({}, now), false)
    assert.equal(isMemberActive({ expiresAt: 'not-a-date' }, now), false)
    assert.ok(isMemberActive({ expiresAt: new Date(now + 1000).toISOString() }, now))
    assert.ok(isMemberActive({ expiresAt: new Date(now + 5000) }, now))
  })

  it('computeNewExpiry stacks days on max(now, previous expiry)', () => {
    const now = 1_700_000_000_000
    const future = now + DAY_MS
    assert.equal(
      new Date(computeNewExpiry(future, 31, now)).getTime() > future,
      true
    )
    assert.equal(
      computeNewExpiry(future, 31, now),
      new Date(future + 31 * DAY_MS).toISOString()
    )
    assert.equal(
      computeNewExpiry(now - DAY_MS, 31, now),
      new Date(now + 31 * DAY_MS).toISOString()
    )
    assert.equal(
      computeNewExpiry(null, 93, now),
      new Date(now + 93 * DAY_MS).toISOString()
    )
    assert.equal(
      computeNewExpiry(new Date(future).toISOString(), 365, now),
      new Date(future + 365 * DAY_MS).toISOString()
    )
  })

  it('resolveProductId picks first vs list prop', () => {
    assert.equal(resolveProductId('month', {}), 'vip_month_first')
    assert.equal(resolveProductId('month', { month: true }), 'vip_month')
    assert.equal(resolveProductId('quarter', {}), 'vip_quarter_first')
    assert.equal(resolveProductId('year', { year: true }), 'vip_year')
    assert.equal(resolveProductId('nope', {}), null)
  })

  it('buildSkuOffer exposes pay and list yuan', () => {
    assert.deepEqual(buildSkuOffer('month', {}), {
      sku: 'month',
      listFen: 660,
      payFen: 99,
      isFirstPurchase: true,
      productId: 'vip_month_first',
      labelYuan: '0.99',
      listYuan: '6.6'
    })
    assert.deepEqual(buildSkuOffer('month', { month: true }), {
      sku: 'month',
      listFen: 660,
      payFen: 660,
      isFirstPurchase: false,
      productId: 'vip_month',
      labelYuan: '6.6',
      listYuan: '6.6'
    })
    assert.deepEqual(buildSkuOffer('year', { month: true }), {
      sku: 'year',
      listFen: 5660,
      payFen: 3990,
      isFirstPurchase: true,
      productId: 'vip_year_first',
      labelYuan: '39.9',
      listYuan: '56.6'
    })
    assert.equal(buildSkuOffer('nope', {}), null)
  })

  it('firstPurchaseUsedFromOrders maps paid skus to true', () => {
    assert.deepEqual(firstPurchaseUsedFromOrders(new Set(['month', 'year'])), {
      month: true,
      year: true
    })
    assert.deepEqual(firstPurchaseUsedFromOrders(new Set()), {})
    assert.deepEqual(firstPurchaseUsedFromOrders(new Set(['month', 'week'])), {
      month: true
    })
    assert.deepEqual(firstPurchaseUsedFromOrders(null), {})
  })
})
