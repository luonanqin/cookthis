const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  PAGE_SIZE,
  shapeAcceptedItem,
  collectAteNamesByRequestId,
  applyAcceptedCursor
} = require('./listAccepted.js')

describe('listAccepted helpers', () => {
  it('PAGE_SIZE is 7', () => {
    assert.equal(PAGE_SIZE, 7)
  })

  it('shapeAcceptedItem flattens dishes and marks ate', () => {
    const doc = {
      _id: 'rec1',
      requestId: 'req_1',
      accepted: true,
      acceptedAt: '2026-10-09T12:00:00.000Z',
      acceptedPlanIndex: 0,
      scene: { mealType: 'daily', peopleCount: 2 },
      plans: [
        {
          planIndex: 0,
          planKind: 'home',
          meals: [
            {
              slot: { meal: 'dinner' },
              dishes: [
                { recipeId: 'r1', name: '土豆烧肉', meatVeg: 'meat' },
                { recipeId: 'r2', name: '蒜蓉青菜', meatVeg: 'veg' }
              ]
            }
          ]
        }
      ]
    }
    const ate = new Set(['土豆烧肉'])
    const item = shapeAcceptedItem(doc, ate)
    assert.equal(item.requestId, 'req_1')
    assert.equal(item.dishes.length, 2)
    assert.equal(item.dishes[0].ate, true)
    assert.equal(item.dishes[1].ate, false)
  })

  it('collectAteNamesByRequestId groups logs', () => {
    const map = collectAteNamesByRequestId([
      { requestId: 'req_1', dishNames: ['A'] },
      { requestId: 'req_1', dishNames: ['B'], source: 'plan_ate' },
      { requestId: 'req_2', dishNames: ['C'] }
    ])
    assert.ok(map.get('req_1').has('A'))
    assert.ok(map.get('req_1').has('B'))
    assert.equal(map.get('req_2').has('C'), true)
  })

  it('applyAcceptedCursor returns next page of 7', () => {
    const rows = []
    for (let i = 0; i < 15; i++) {
      rows.push({
        _id: 'id' + i,
        acceptedAt: new Date(Date.UTC(2026, 9, 15 - i)).toISOString(),
        accepted: true,
        acceptedPlanIndex: 0,
        requestId: 'r' + i,
        plans: [{ meals: [{ dishes: [{ name: '菜' + i }] }] }],
        scene: {}
      })
    }
    const page1 = applyAcceptedCursor(rows, null)
    assert.equal(page1.length, 7)
    const last = page1[6]
    const page2 = applyAcceptedCursor(rows, {
      acceptedAt: last.acceptedAt,
      recommendationId: last._id
    })
    assert.equal(page2.length, 7)
    assert.notEqual(page2[0]._id, last._id)
  })
})
