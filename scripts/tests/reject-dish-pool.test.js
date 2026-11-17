'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildRejectDishPool
} = require('../../miniprogram/utils/rejectDishPool.js')

describe('buildRejectDishPool', () => {
  it('caps at 10 and keeps meat/veg/soup proportion', () => {
    const meat = Array.from({ length: 6 }, (_, i) => ({
      recipeId: 'm' + i,
      name: '荤' + i,
      meatVeg: 'meat'
    }))
    const veg = Array.from({ length: 3 }, (_, i) => ({
      recipeId: 'v' + i,
      name: '素' + i,
      meatVeg: 'veg'
    }))
    const soup = Array.from({ length: 2 }, (_, i) => ({
      recipeId: 's' + i,
      name: '汤' + i,
      meatVeg: 'soup'
    }))
    const plans = [
      { meals: [{ dishes: meat.concat(veg) }] },
      { meals: [{ dishes: soup }] }
    ]
    const pool = buildRejectDishPool(plans, { limit: 10 })
    assert.equal(pool.length, 10)
    const c = { meat: 0, veg: 0, soup: 0 }
    pool.forEach((d) => {
      c[d.meatVeg]++
    })
    assert.equal(c.meat, 5)
    assert.equal(c.veg, 3)
    assert.equal(c.soup, 2)
    assert.ok(pool.every((d) => d.typeLabel))
  })

  it('dedupes by recipeId and ignores non meat/veg/soup', () => {
    const plans = [
      {
        meals: [
          {
            dishes: [
              { recipeId: 'a', name: '肉', meatVeg: 'meat' },
              { recipeId: 'a', name: '肉', meatVeg: 'meat' },
              { recipeId: 'n', name: '面', meatVeg: 'staple' }
            ]
          }
        ]
      }
    ]
    const pool = buildRejectDishPool(plans)
    assert.equal(pool.length, 1)
    assert.equal(pool[0].recipeId, 'a')
  })
})
