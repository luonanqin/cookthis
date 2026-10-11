'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildRecipeSheet } = require('./recipeSheet.js')

const plan = {
  planIndex: 0,
  planKind: 'home',
  meals: [
    {
      slot: { meal: 'dinner', label: '晚饭①' },
      dishes: [
        {
          recipeId: 'rcp_a',
          name: '土豆烧肉',
          mainIngredients: ['土豆', '猪肉'],
          seasonings: ['盐', '生抽']
        },
        {
          recipeId: 'rcp_b',
          name: '蒜蓉青菜',
          mainIngredients: ['青菜'],
          seasonings: ['蒜']
        }
      ]
    },
    {
      slot: { meal: 'dinner', label: '晚饭②' },
      dishes: [
        {
          recipeId: 'rcp_c',
          name: '番茄炒蛋',
          mainIngredients: ['番茄', '鸡蛋'],
          seasonings: ['盐']
        }
      ]
    }
  ]
}

describe('buildRecipeSheet', () => {
  it('lists meals then dishes; mains before seasonings; meat before other mains', () => {
    const sheet = buildRecipeSheet({
      plan,
      categoryByName: {
        猪肉: 'meat',
        土豆: 'root',
        青菜: 'leaf',
        番茄: 'fruit_veg',
        鸡蛋: 'egg_dairy'
      }
    })

    assert.equal(sheet.meals.length, 2)
    assert.equal(sheet.meals[0].label, '晚饭①')
    assert.equal(sheet.meals[1].label, '晚饭②')

    const porkDish = sheet.meals[0].dishes[0]
    assert.equal(porkDish.name, '土豆烧肉')
    const names = porkDish.ingredients.map((x) => x.name)
    // 主料：肉类(猪肉) → 非肉(土豆)；再调味
    assert.deepEqual(names.slice(0, 2), ['猪肉', '土豆'])
    assert.ok(names.indexOf('生抽') > names.indexOf('土豆'))
    assert.ok(names.indexOf('盐') > names.indexOf('土豆'))
    assert.equal(porkDish.ingredients.find((x) => x.name === '猪肉').kind, 'main')
    assert.equal(porkDish.ingredients.find((x) => x.name === '盐').kind, 'seasoning')
  })

  it('puts seafood after meat within mains', () => {
    const sheet = buildRecipeSheet({
      plan: {
        meals: [
          {
            slot: { label: '晚饭' },
            dishes: [
              {
                recipeId: 'rcp_x',
                name: '海鲜拼',
                mainIngredients: ['豆腐', '虾', '猪肉'],
                seasonings: ['盐']
              }
            ]
          }
        ]
      },
      categoryByName: {
        猪肉: 'meat',
        虾: 'seafood',
        豆腐: 'tofu'
      }
    })
    const names = sheet.meals[0].dishes[0].ingredients.map((x) => x.name)
    assert.deepEqual(names, ['猪肉', '虾', '豆腐', '盐'])
  })

  it('returns empty meals for empty plan', () => {
    const sheet = buildRecipeSheet({ plan: { meals: [] }, categoryByName: {} })
    assert.deepEqual(sheet.meals, [])
  })
})
