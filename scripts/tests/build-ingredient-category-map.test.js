'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildIngredientCategoryMap
} = require('../lib/buildIngredientCategoryMap.js')

describe('buildIngredientCategoryMap', () => {
  it('flattens by-category names including 猪瘦肉 → 肉类', () => {
    const map = buildIngredientCategoryMap({
      categories: {
        肉类: ['猪瘦肉', '精瘦肉'],
        根茎: ['莲藕']
      }
    })
    assert.equal(map['猪瘦肉'], '肉类')
    assert.equal(map['精瘦肉'], '肉类')
    assert.equal(map['莲藕'], '根茎')
  })
})
