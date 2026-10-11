'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  shoppingCheckKey,
  clearChecksForRequest,
  checkedNamesFromMap
} = require('./shoppingChecks.js')

describe('shoppingChecks', () => {
  it('keys by requestId, planIndex, swapCount', () => {
    assert.equal(shoppingCheckKey('req1', 0, 0), 'req1:0:0')
    assert.equal(shoppingCheckKey('req1', 1, 2), 'req1:1:2')
    assert.equal(shoppingCheckKey('', 0, undefined), 'none:0:0')
  })

  it('clearChecksForRequest removes only that requestId prefix', () => {
    const map = {
      'req1:0:0': ['猪肉'],
      'req1:1:0': ['青菜'],
      'req2:0:0': ['鸡蛋']
    }
    const next = clearChecksForRequest(map, 'req1')
    assert.deepEqual(next, { 'req2:0:0': ['鸡蛋'] })
    assert.ok(map['req1:0:0']) // does not mutate input
  })

  it('checkedNamesFromMap restores only names still on the list', () => {
    const map = { 'req1:0:0': ['猪肉', '已删', '青菜'] }
    const names = checkedNamesFromMap(map, shoppingCheckKey('req1', 0, 0), [
      '猪肉',
      '青菜',
      '豆腐'
    ])
    assert.deepEqual(names.sort(), ['猪肉', '青菜'].sort())
  })
})
