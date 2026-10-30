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
  it('groups by Chinese taxonomy; maps legacy English codes', () => {
    const { groups } = buildShoppingList({
      plan,
      categoryByName: {
        猪肉: 'meat',
        土豆: 'root',
        小白菜: 'leaf'
      }
    })

    const meat = groups.find((g) => g.category === '肉类')
    const root = groups.find((g) => g.category === '根茎')
    const leaf = groups.find((g) => g.category === '菜叶')
    const seasoning = groups.find((g) => g.category === '调味')

    assert.ok(meat)
    assert.equal(meat.label, '肉类')
    assert.deepEqual(
      meat.items.map((x) => x.name),
      ['猪肉']
    )
    assert.ok(root)
    assert.equal(root.label, '根茎')
    assert.ok(leaf)
    assert.equal(leaf.label, '菜叶')
    assert.ok(seasoning)
    assert.equal(seasoning.label, '调味')
    assert.equal(seasoning.items.filter((x) => x.name === '盐').length, 1)

    assert.equal(meat.items[0].alreadyHave, undefined)
    assert.equal(meat.items[0].kind, undefined)

    const idxs = {
      meat: groups.findIndex((g) => g.category === '肉类'),
      leaf: groups.findIndex((g) => g.category === '菜叶'),
      seasoning: groups.findIndex((g) => g.category === '调味')
    }
    assert.ok(idxs.meat < idxs.leaf)
    assert.ok(idxs.leaf < idxs.seasoning)
  })

  it('labels Chinese taxonomy categories from by-scale (not 其他)', () => {
    const { groups } = buildShoppingList({
      plan: {
        meals: [
          {
            dishes: [
              {
                name: '示例',
                mainIngredients: ['牛肉', '土豆', '生菜'],
                seasonings: ['盐']
              }
            ]
          }
        ]
      },
      categoryByName: {
        牛肉: '肉类',
        土豆: '根茎',
        生菜: '菜叶'
      }
    })
    const meat = groups.find((g) => g.category === '肉类')
    const root = groups.find((g) => g.category === '根茎')
    const leaf = groups.find((g) => g.category === '菜叶')
    const seasoning = groups.find((g) => g.category === '调味')
    assert.ok(meat)
    assert.equal(meat.label, '肉类')
    assert.ok(root)
    assert.equal(root.label, '根茎')
    assert.ok(leaf)
    assert.equal(leaf.label, '菜叶')
    assert.ok(seasoning)
    assert.equal(seasoning.label, '调味')
    assert.equal(groups.filter((g) => g.label === '其他').length, 0)
  })

  it('pairRows packs two items per row', () => {
    assert.deepEqual(pairRows([{ name: 'a' }, { name: 'b' }, { name: 'c' }]), [
      [{ name: 'a' }, { name: 'b' }],
      [{ name: 'c' }]
    ])
  })
})
