'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildDishesFromPlan,
  buildIngredientsFromPlan,
  buildSnapshotPayload,
  shareCardTitle,
  makeShareId
} = require('./planShare.js')

const plan = {
  meals: [
    {
      slot: { meal: 'dinner', label: '晚饭' },
      dishes: [
        {
          name: '土豆烧肉',
          mainIngredients: ['猪肉', '土豆'],
          seasonings: ['盐']
        },
        { name: '蒜蓉青菜', mainIngredients: ['小白菜'], seasonings: [] }
      ]
    }
  ]
}

describe('planShare', () => {
  it('buildDishesFromPlan keeps meal labels', () => {
    const d = buildDishesFromPlan(plan)
    assert.equal(d.length, 2)
    assert.equal(d[0].name, '土豆烧肉')
    assert.equal(d[0].mealLabel, '晚饭')
  })

  it('buildIngredientsFromPlan is full list without bought', () => {
    const ings = buildIngredientsFromPlan(plan, {
      猪肉: 'meat',
      土豆: 'root',
      小白菜: 'leaf'
    })
    const names = ings.map((x) => x.name).sort()
    assert.deepEqual(names, ['土豆', '小白菜', '猪肉', '盐'].sort())
    assert.ok(ings.every((x) => x.category && x.name))
  })

  it('shareCardTitle truncates', () => {
    const t = shareCardTitle([{ name: '一' }, { name: '二' }, { name: '三' }])
    assert.ok(t.includes('一'))
    assert.ok(makeShareId().startsWith('sh_'))
  })

  it('buildSnapshotPayload stores sourceSwapCount (default 0)', () => {
    const base = {
      plan,
      uid: 'u1',
      requestId: 'req_1',
      planIndex: 0
    }
    const missing = buildSnapshotPayload(base)
    assert.equal(missing.sourceSwapCount, 0)
    assert.equal(missing.sourceRequestId, 'req_1')
    assert.equal(missing.sourcePlanIndex, 0)

    const withSwap = buildSnapshotPayload(Object.assign({}, base, { swapCount: 3 }))
    assert.equal(withSwap.sourceSwapCount, 3)
  })
})
