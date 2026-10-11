const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  PAGE_SIZE,
  applyMealListCursor,
  nextMealListCursor,
  shapeMealListItem
} = require('./mealList.js')

describe('mealList pagination', () => {
  it('PAGE_SIZE is 10', () => {
    assert.equal(PAGE_SIZE, 10)
  })

  it('first page takes limit items', () => {
    const rows = []
    for (let i = 0; i < 15; i++) {
      rows.push({
        logId: 'log_' + i,
        createdAt: new Date(2026, 0, 15 - i).toISOString(),
        dishNames: ['菜' + i]
      })
    }
    const page = applyMealListCursor(rows, null, 10)
    assert.equal(page.length, 10)
    assert.equal(page[0].logId, 'log_0')
    assert.equal(page[9].logId, 'log_9')
  })

  it('cursor page continues after last item', () => {
    const rows = [
      { logId: 'a', createdAt: '2026-01-03T00:00:00.000Z' },
      { logId: 'b', createdAt: '2026-01-02T00:00:00.000Z' },
      { logId: 'c', createdAt: '2026-01-01T00:00:00.000Z' }
    ]
    const first = applyMealListCursor(rows, null, 2)
    assert.deepEqual(
      first.map((r) => r.logId),
      ['a', 'b']
    )
    const cursor = nextMealListCursor(first)
    const second = applyMealListCursor(rows, cursor, 2)
    assert.deepEqual(
      second.map((r) => r.logId),
      ['c']
    )
    assert.equal(nextMealListCursor(second) != null, true)
  })

  it('shapes list item', () => {
    const item = shapeMealListItem({
      logId: 'log_1',
      date: '2026-01-01',
      meal: 'dinner',
      dishNames: ['青菜'],
      source: 'manual',
      createdAt: 't'
    })
    assert.equal(item.logId, 'log_1')
    assert.deepEqual(item.dishNames, ['青菜'])
  })
})
