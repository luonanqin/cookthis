'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildPlanIngredientSummary } = require('./planIngredientSummary.js')

describe('buildPlanIngredientSummary', () => {
  it('one line: one tip per dish, join with 、等N种', () => {
    const plan = {
      meals: [
        {
          dishes: [
            {
              name: '土豆烧肉',
              mainIngredients: ['猪肉', '土豆'],
              seasonings: ['生抽']
            },
            {
              name: '家常豆腐',
              mainIngredients: ['北豆腐'],
              seasonings: ['盐']
            }
          ]
        }
      ]
    }
    const out = buildPlanIngredientSummary({
      plan,
      selectedNames: []
    })
    assert.deepEqual(out.tipNames, ['猪肉', '北豆腐'])
    assert.equal(out.tipText, '食材：猪肉、北豆腐等2种')
    assert.equal(out.count, 2)
  })

  it('prefers not-selected tip name per dish', () => {
    const plan = {
      meals: [
        {
          dishes: [
            { name: '土豆烧肉', mainIngredients: ['猪肉', '土豆'] },
            { name: '家常豆腐', mainIngredients: ['北豆腐'] }
          ]
        }
      ]
    }
    const out = buildPlanIngredientSummary({
      plan,
      selectedNames: ['猪肉']
    })
    assert.deepEqual(out.tipNames, ['土豆', '北豆腐'])
    assert.equal(out.tipText, '食材：土豆、北豆腐等2种')
  })

  it('single tip has no 等N种', () => {
    const plan = {
      meals: [{ dishes: [{ name: '蒜蓉青菜', mainIngredients: ['青菜'] }] }]
    }
    const out = buildPlanIngredientSummary({ plan, selectedNames: [] })
    assert.equal(out.tipText, '食材：青菜')
    assert.equal(out.count, 1)
  })

  it('empty when no mains', () => {
    const out = buildPlanIngredientSummary({
      plan: { meals: [{ dishes: [{ name: 'x', mainIngredients: [] }] }] },
      selectedNames: []
    })
    assert.equal(out.tipText, '')
    assert.deepEqual(out.tipNames, [])
  })

  it('shows at most 5 names; 等N种 uses full distinct count', () => {
    const dishes = []
    for (let i = 0; i < 9; i++) {
      dishes.push({ name: '菜' + i, mainIngredients: ['料' + i] })
    }
    const out = buildPlanIngredientSummary({
      plan: { meals: [{ dishes }] },
      selectedNames: []
    })
    assert.equal(out.count, 9)
    assert.equal(out.tipNames.length, 9)
    assert.equal(out.tipText, '食材：料0、料1、料2、料3、料4等9种')
  })
})
