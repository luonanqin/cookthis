'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { flattenScaleBucket } = require('./confirmListFromScale.js')

const sampleDoc = {
  city: '测试',
  scales: {
    small: {
      seasonal: {
        菜叶: [{ name: '菠菜', displayName: '青菜菠菜' }],
        根茎: [],
        肉类: [{ name: '猪肉', displayName: '猪肉' }]
      },
      yearRound: {
        蛋奶: [{ name: '鸡蛋' }],
        豆类: [],
        菌菇: [{ name: '香菇', displayName: '鲜香菇' }]
      }
    },
    medium: {
      seasonal: {
        菜叶: [
          { name: '菠菜', displayName: '青菜菠菜' },
          { name: '油麦菜', displayName: '油麦菜' }
        ]
      },
      yearRound: {
        肉类: [{ name: '五花肉', displayName: '五花' }]
      }
    },
    large: {
      seasonal: {},
      yearRound: {}
    }
  }
}

describe('flattenScaleBucket', () => {
  it('flattens by category key order and keeps in-array order', () => {
    const r = flattenScaleBucket(sampleDoc, 'medium')
    assert.deepEqual(
      r.seasonal.map((x) => x.name),
      ['菠菜', '油麦菜']
    )
    assert.equal(r.seasonal[0].displayName, '青菜菠菜')
    assert.equal(r.seasonal[0].category, '菜叶')
    assert.deepEqual(
      r.yearRound.map((x) => x.name),
      ['五花肉']
    )
    assert.equal(r.yearRound[0].displayName, '五花')
  })

  it('omits empty categories', () => {
    const r = flattenScaleBucket(sampleDoc, 'small')
    assert.deepEqual(
      r.seasonal.map((x) => ({ name: x.name, category: x.category })),
      [
        { name: '菠菜', category: '菜叶' },
        { name: '猪肉', category: '肉类' }
      ]
    )
    assert.ok(!r.seasonal.some((x) => x.category === '根茎'))
    assert.deepEqual(
      r.yearRound.map((x) => ({ name: x.name, category: x.category })),
      [
        { name: '鸡蛋', category: '蛋奶' },
        { name: '香菇', category: '菌菇' }
      ]
    )
    assert.ok(!r.yearRound.some((x) => x.category === '豆类'))
  })

  it('sets id/name/displayName/sort; displayName falls back to name', () => {
    const r = flattenScaleBucket(sampleDoc, 'small')
    const egg = r.yearRound.find((x) => x.name === '鸡蛋')
    assert.ok(egg)
    assert.equal(egg.id, '鸡蛋')
    assert.equal(egg.displayName, '鸡蛋')
    assert.equal(typeof egg.sort, 'number')
    assert.equal(r.seasonal[0].sort, 0)
    assert.equal(r.seasonal[1].sort, 1)
    assert.equal(r.yearRound[0].sort, 0)
  })

  it('defaults unknown effective to medium', () => {
    const r = flattenScaleBucket(sampleDoc, 'nope')
    assert.equal(r.seasonal.length, 2)
    assert.equal(r.yearRound[0].name, '五花肉')
  })

  it('returns empty lists when bucket missing or empty', () => {
    const empty = flattenScaleBucket(sampleDoc, 'large')
    assert.deepEqual(empty.seasonal, [])
    assert.deepEqual(empty.yearRound, [])
    const missing = flattenScaleBucket({ scales: {} }, 'small')
    assert.deepEqual(missing.seasonal, [])
    assert.deepEqual(missing.yearRound, [])
  })
})
