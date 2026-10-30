'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  shoppingCheckKey,
  clearChecksForRequest,
  checkedNamesFromMap
} = require('./shoppingChecks.js')

describe('shoppingChecks', () => {
  it('keys by requestId, planIndex, swapCount, city', () => {
    assert.equal(shoppingCheckKey('req1', 0, 0, '重庆'), 'req1:0:0:重庆')
    assert.equal(shoppingCheckKey('req1', 1, 2, '北京'), 'req1:1:2:北京')
    assert.equal(shoppingCheckKey('', 0, undefined, ''), 'none:0:0:none')
    assert.equal(shoppingCheckKey('req1', 0, 0, null), 'req1:0:0:none')
  })

  it('different city → different key (换城不复用勾选)', () => {
    assert.notEqual(
      shoppingCheckKey('req1', 0, 0, '重庆'),
      shoppingCheckKey('req1', 0, 0, '北京')
    )
  })

  it('clearChecksForRequest removes only that requestId prefix', () => {
    const map = {
      'req1:0:0:重庆': ['猪肉'],
      'req1:1:0:重庆': ['青菜'],
      'req2:0:0:重庆': ['鸡蛋']
    }
    const next = clearChecksForRequest(map, 'req1')
    assert.deepEqual(next, { 'req2:0:0:重庆': ['鸡蛋'] })
    assert.ok(map['req1:0:0:重庆']) // does not mutate input
  })

  it('checkedNamesFromMap restores only names still on the list', () => {
    const map = { 'req1:0:0:重庆': ['猪肉', '已删', '青菜'] }
    const names = checkedNamesFromMap(map, shoppingCheckKey('req1', 0, 0, '重庆'), [
      '猪肉',
      '青菜',
      '豆腐'
    ])
    assert.deepEqual(names.sort(), ['猪肉', '青菜'].sort())
  })
})
