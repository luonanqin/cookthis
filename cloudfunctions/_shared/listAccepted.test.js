const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  PAGE_SIZE,
  shapeAcceptedItem,
  shapeSharedListItem,
  collectAteNamesByRequestId,
  applyAcceptedCursor,
  listItemSortAt,
  mergeOwnAndSharedPage
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
    assert.equal(item.source, 'own')
    assert.equal(item.dishes.length, 2)
    assert.equal(item.dishes[0].ate, true)
    assert.equal(item.dishes[1].ate, false)
  })

  it('shapeSharedListItem uses share dishes, ate always false, badge 分享', () => {
    const received = {
      _id: 'rp1',
      ownerUid: 'u1',
      shareId: 'sh_abc',
      source: 'shared',
      savedAt: '2026-10-28T08:00:00.000Z',
      dishNamesSummary: ['旧摘要'],
      sharerNickname: '小明'
    }
    const share = {
      shareId: 'sh_abc',
      dishes: [{ name: '红烧肉' }, { name: '青菜' }],
      sharerNickname: '小明'
    }
    const item = shapeSharedListItem(received, share)
    assert.equal(item.source, 'shared')
    assert.equal(item.shareId, 'sh_abc')
    assert.equal(item.savedAt, '2026-10-28T08:00:00.000Z')
    assert.equal(item.recommendationId, null)
    assert.equal(item.requestId, null)
    assert.equal(item.scene, null)
    assert.equal(item.badge, '分享')
    assert.equal(item.dishes.length, 2)
    assert.equal(item.dishes[0].name, '红烧肉')
    assert.equal(item.dishes[0].ate, false)
    assert.equal(item.dishes[1].ate, false)
    assert.equal(item.sharerNickname, '小明')
  })

  it('shapeSharedListItem falls back to dishNamesSummary without shareDoc', () => {
    const received = {
      _id: 'rp2',
      shareId: 'sh_x',
      savedAt: '2026-10-27T12:00:00.000Z',
      dishNamesSummary: ['番茄炒蛋', '汤'],
      sharerNickname: null
    }
    const item = shapeSharedListItem(received)
    assert.equal(item.source, 'shared')
    assert.deepEqual(
      item.dishes.map((d) => d.name),
      ['番茄炒蛋', '汤']
    )
    assert.ok(item.dishes.every((d) => d.ate === false))
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

  it('listItemSortAt uses acceptedAt for own and savedAt for shared', () => {
    assert.equal(
      listItemSortAt({
        source: 'own',
        acceptedAt: '2026-10-01T00:00:00.000Z'
      }),
      '2026-10-01T00:00:00.000Z'
    )
    assert.equal(
      listItemSortAt({
        source: 'shared',
        savedAt: '2026-10-02T00:00:00.000Z'
      }),
      '2026-10-02T00:00:00.000Z'
    )
  })

  it('mergeOwnAndSharedPage sorts by sortAt desc and pages with cursor', () => {
    const own = [
      {
        source: 'own',
        recommendationId: 'o1',
        acceptedAt: '2026-10-10T12:00:00.000Z',
        dishes: []
      },
      {
        source: 'own',
        recommendationId: 'o2',
        acceptedAt: '2026-10-08T12:00:00.000Z',
        dishes: []
      }
    ]
    const shared = [
      {
        source: 'shared',
        shareId: 's1',
        savedAt: '2026-10-09T12:00:00.000Z',
        dishes: [],
        badge: '分享'
      },
      {
        source: 'shared',
        shareId: 's2',
        savedAt: '2026-10-07T12:00:00.000Z',
        dishes: [],
        badge: '分享'
      }
    ]
    const page1 = mergeOwnAndSharedPage(own, shared, null, 2)
    assert.equal(page1.items.length, 2)
    assert.equal(page1.items[0].recommendationId, 'o1')
    assert.equal(page1.items[1].shareId, 's1')
    assert.ok(page1.nextCursor)
    assert.equal(page1.nextCursor.kind, 'shared')
    assert.equal(page1.nextCursor.id, 's1')

    const page2 = mergeOwnAndSharedPage(own, shared, page1.nextCursor, 2)
    assert.equal(page2.items.length, 2)
    assert.equal(page2.items[0].recommendationId, 'o2')
    assert.equal(page2.items[1].shareId, 's2')
    assert.equal(page2.nextCursor, null)
  })
})
