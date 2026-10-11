const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  RECIPE_BATCH_SIZE,
  pickRecipeBatch,
  isRecipePoolExhausted,
  recipeDocId
} = require('./recipePool.js')

function r(id, cities) {
  return { id, name: id, cities: cities || [], enabled: true }
}

describe('pickRecipeBatch', () => {
  it('prefers city-specific then fills with national up to limit', () => {
    const rows = [
      r('n1', []),
      r('c1', ['杭州']),
      r('n2', []),
      r('c2', ['杭州']),
      r('other', ['宁波']),
      r('n3', [])
    ]
    const batch = pickRecipeBatch(rows, { city: '杭州', excludeIds: [], limit: 4 })
    assert.deepEqual(
      batch.map((x) => x.id),
      ['c1', 'c2', 'n1', 'n2']
    )
  })

  it('skips excludeIds and can form a next batch', () => {
    const rows = [r('c1', ['杭州']), r('n1', []), r('n2', []), r('n3', [])]
    const first = pickRecipeBatch(rows, { city: '杭州', excludeIds: [], limit: 2 })
    assert.deepEqual(
      first.map((x) => x.id),
      ['c1', 'n1']
    )
    const second = pickRecipeBatch(rows, {
      city: '杭州',
      excludeIds: first.map((x) => x.id),
      limit: 2
    })
    assert.deepEqual(
      second.map((x) => x.id),
      ['n2', 'n3']
    )
  })

  it('without city only takes national', () => {
    const rows = [r('c1', ['杭州']), r('n1', []), r('n2', [])]
    const batch = pickRecipeBatch(rows, { city: null, excludeIds: [], limit: 10 })
    assert.deepEqual(
      batch.map((x) => x.id),
      ['n1', 'n2']
    )
  })

  it('default limit is RECIPE_BATCH_SIZE', () => {
    assert.equal(RECIPE_BATCH_SIZE, 50)
    const rows = []
    for (let i = 0; i < 60; i++) rows.push(r('n' + i, []))
    const batch = pickRecipeBatch(rows, { city: '杭州', excludeIds: [] })
    assert.equal(batch.length, 50)
  })

  it('skips disabled recipes', () => {
    const rows = [
      { id: 'off', cities: [], enabled: false },
      r('on', [])
    ]
    const batch = pickRecipeBatch(rows, { city: null, excludeIds: [], limit: 10 })
    assert.deepEqual(
      batch.map((x) => x.id),
      ['on']
    )
  })
})

describe('isRecipePoolExhausted', () => {
  it('true when every pool id is excluded', () => {
    assert.equal(isRecipePoolExhausted(['a', 'b'], ['a', 'b', 'c']), true)
  })
  it('false when pool has unused ids', () => {
    assert.equal(isRecipePoolExhausted(['a', 'b'], ['a']), false)
  })
  it('true for empty pool', () => {
    assert.equal(isRecipePoolExhausted([], ['a']), true)
  })
})

describe('recipeDocId', () => {
  it('prefers id then _id', () => {
    assert.equal(recipeDocId({ id: 'a', _id: 'b' }), 'a')
    assert.equal(recipeDocId({ _id: 'b' }), 'b')
  })
})
