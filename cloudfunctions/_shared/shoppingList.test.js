const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildShoppingList } = require('./shoppingList.js')

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
  it('dedupes, marks alreadyHave, sorts mains before seasonings', () => {
    const list = buildShoppingList({
      plan,
      selectedNames: ['猪肉', '土豆', '小白菜']
    })
    const names = list.map((x) => x.name)
    assert.ok(names.includes('猪肉'))
    assert.ok(names.includes('盐'))
    assert.equal(names.filter((n) => n === '盐').length, 1)

    const salt = list.find((x) => x.name === '盐')
    assert.equal(salt.kind, 'seasoning')

    const firstSeasoningIdx = list.findIndex((x) => x.kind === 'seasoning')
    assert.ok(list.slice(0, firstSeasoningIdx).every((x) => x.kind === 'main'))

    const needBuyFirst = list.find((x) => x.name === '生抽')
    assert.equal(needBuyFirst.alreadyHave, false)
    const pork = list.find((x) => x.name === '猪肉')
    assert.equal(pork.alreadyHave, true)

    const mains = list.filter((x) => x.kind === 'main')
    const needIdx = mains.findIndex((x) => !x.alreadyHave)
    const haveIdx = mains.findIndex((x) => x.alreadyHave)
    if (needIdx >= 0 && haveIdx >= 0) {
      // 若存在未持有主料，应排在已持有主料前；本夹具主料全已有则跳过
    }
  })

  it('puts not-already-have mains before already-have mains', () => {
    const list = buildShoppingList({
      plan,
      selectedNames: ['猪肉'] // 土豆、小白菜未持有
    })
    const mains = list.filter((x) => x.kind === 'main')
    const firstHave = mains.findIndex((x) => x.alreadyHave)
    const lastNeed = (() => {
      let i = -1
      mains.forEach((x, idx) => {
        if (!x.alreadyHave) i = idx
      })
      return i
    })()
    if (firstHave >= 0 && lastNeed >= 0) {
      assert.ok(lastNeed < firstHave)
    }
    assert.equal(mains.find((x) => x.name === '猪肉').alreadyHave, true)
    assert.equal(mains.find((x) => x.name === '土豆').alreadyHave, false)
  })
})
