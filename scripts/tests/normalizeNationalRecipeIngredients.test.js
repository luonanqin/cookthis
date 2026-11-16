'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  isNationalRecipe,
  normalizeNationalRecipes
} = require('../lib/normalizeNationalRecipeIngredients.js')

describe('normalizeNationalRecipeIngredients', () => {
  const aliases = {
    五花肉: ['三线肉', '三层肉'],
    北豆腐: ['内脂豆腐']
  }

  it('national = empty or missing cities', () => {
    assert.equal(isNationalRecipe({ cities: [] }), true)
    assert.equal(isNationalRecipe({}), true)
    assert.equal(isNationalRecipe({ cities: ['上海市'] }), false)
  })

  it('rewrites national recipe ingredients to canon; leaves city recipes', () => {
    const { recipes, stats } = normalizeNationalRecipes(
      [
        {
          id: 'n1',
          name: '红烧肉',
          cities: [],
          mainIngredients: ['三线肉', '三线肉'],
          seasonings: ['盐']
        },
        {
          id: 'c1',
          name: '本帮红烧肉',
          cities: ['上海市'],
          mainIngredients: ['三线肉'],
          seasonings: []
        }
      ],
      aliases
    )
    assert.deepEqual(recipes[0].mainIngredients, ['五花肉'])
    assert.deepEqual(recipes[1].mainIngredients, ['三线肉'])
    assert.equal(stats.national, 1)
    assert.equal(stats.city, 1)
    assert.equal(stats.recipesChanged, 1)
  })
})
