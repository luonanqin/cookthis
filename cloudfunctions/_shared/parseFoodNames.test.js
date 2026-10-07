'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseFoodNames } = require('./parseFoodNames.js')

describe('parseFoodNames', () => {
  it('splits by Chinese separators', () => {
    assert.deepEqual(parseFoodNames('红烧茄子，紫菜蛋花汤'), [
      '红烧茄子',
      '紫菜蛋花汤'
    ])
  })

  it('splits by 和/跟', () => {
    assert.deepEqual(parseFoodNames('土豆烧肉和蒜蓉青菜'), [
      '土豆烧肉',
      '蒜蓉青菜'
    ])
  })

  it('returns empty for blank', () => {
    assert.deepEqual(parseFoodNames(''), [])
    assert.deepEqual(parseFoodNames(null), [])
  })

  it('prefers knownNames matches inside transcript', () => {
    const known = ['猪肉', '土豆', '青菜', '鸡蛋']
    assert.deepEqual(parseFoodNames('今天有猪肉和土豆还有青菜', { knownNames: known }), [
      '猪肉',
      '土豆',
      '青菜'
    ])
  })

  it('dedupes', () => {
    assert.deepEqual(parseFoodNames('青菜，青菜'), ['青菜'])
  })
})
