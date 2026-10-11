'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildShoppingList, pairRows } = require('./shoppingList.js')

const plan = {
  planIndex: 0,
  planKind: 'home',
  meals: [
    {
      slot: { meal: 'dinner', label: '晚饭' },
      dishes: [
        {
          recipeId: 'rcp_a',
          name: '土豆烧肉',
          meatVeg: 'meat',
          mainIngredients: ['猪肉', '土豆'],
          seasonings: ['生抽', '盐']
        },
        {
          recipeId: 'rcp_b',
          name: '蒜蓉小白菜',
          meatVeg: 'veg',
          mainIngredients: ['小白菜'],
          seasonings: ['蒜', '盐']
        }
      ]
    }
  ]
}

describe('buildShoppingList', () => {
  it('groups by category and pairs two per row; no alreadyHave tags', () => {
    const { groups } = buildShoppingList({
      plan,
      categoryByName: {
        猪肉: 'meat',
        土豆: 'root',
        小白菜: 'leaf'
      }
    })

    const meat = groups.find((g) => g.category === 'meat')
    const root = groups.find((g) => g.category === 'root')
    const leaf = groups.find((g) => g.category === 'leaf')
    const seasoning = groups.find((g) => g.category === 'seasoning')

    assert.ok(meat)
    assert.equal(meat.label, '肉类')
    assert.deepEqual(
      meat.items.map((x) => x.name),
      ['猪肉']
    )
    assert.ok(root)
    assert.ok(leaf)
    assert.ok(seasoning)
    assert.equal(seasoning.items.filter((x) => x.name === '盐').length, 1)

    // no alreadyHave / kind tags on items
    assert.equal(meat.items[0].alreadyHave, undefined)
    assert.equal(meat.items[0].kind, undefined)

    // category order: meat before leaf before seasoning
    const idxs = {
      meat: groups.findIndex((g) => g.category === 'meat'),
      leaf: groups.findIndex((g) => g.category === 'leaf'),
      seasoning: groups.findIndex((g) => g.category === 'seasoning')
    }
    assert.ok(idxs.meat < idxs.leaf)
    assert.ok(idxs.leaf < idxs.seasoning)
  })

  it('pairRows packs two items per row', () => {
    assert.deepEqual(pairRows([{ name: 'a' }, { name: 'b' }, { name: 'c' }]), [
      [{ name: 'a' }, { name: 'b' }],
      [{ name: 'c' }]
    ])
  })
})
