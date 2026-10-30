'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeCategory,
  categoryLabel,
  CATEGORY_ORDER
} = require('./categoryTaxonomy.js')

describe('categoryTaxonomy', () => {
  it('keeps Chinese taxonomy codes', () => {
    assert.equal(normalizeCategory('肉类'), '肉类')
    assert.equal(normalizeCategory('菜叶'), '菜叶')
    assert.equal(categoryLabel('根茎'), '根茎')
  })

  it('maps legacy English to Chinese', () => {
    assert.equal(normalizeCategory('meat'), '肉类')
    assert.equal(normalizeCategory('leaf'), '菜叶')
    assert.equal(normalizeCategory('seafood'), '海鲜')
    assert.equal(normalizeCategory('seasoning'), '调味')
    assert.equal(normalizeCategory('staple'), '主食')
    assert.equal(normalizeCategory('other'), '其他')
  })

  it('falls back for unknown', () => {
    assert.equal(normalizeCategory(''), '其他')
    assert.equal(normalizeCategory(null), '其他')
    assert.equal(normalizeCategory('未知品类'), '其他')
    assert.equal(normalizeCategory(undefined, '调味'), '调味')
  })

  it('CATEGORY_ORDER is Chinese-only', () => {
    assert.ok(CATEGORY_ORDER.includes('肉类'))
    assert.ok(!CATEGORY_ORDER.includes('meat'))
  })
})
