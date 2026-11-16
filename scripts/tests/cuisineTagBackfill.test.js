'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeDishName,
  suggestCuisineTags,
  backfillRecipes,
  matchRules
} = require('../lib/cuisineTagBackfill.js')

describe('cuisineTagBackfill', () => {
  it('normalize strips weight and brackets', () => {
    assert.equal(normalizeDishName('宫保鸡丁约250g'), '宫保鸡丁')
    assert.equal(normalizeDishName('麻婆豆腐（微辣）'), '麻婆豆腐')
  })

  it('exact and similar from index', () => {
    const index = new Map([
      ['宫保鸡丁', new Set(['sichuan'])],
      ['水煮牛肉', new Set(['sichuan'])]
    ])
    assert.deepEqual(suggestCuisineTags('宫保鸡丁', index), {
      tags: ['sichuan'],
      source: 'exact'
    })
    assert.equal(suggestCuisineTags('水煮牛肉片', index).source, 'similar')
    assert.ok(suggestCuisineTags('水煮牛肉片', index).tags.includes('sichuan'))
  })

  it('rules for classic names when index misses', () => {
    assert.deepEqual(matchRules('鱼香肉丝'), ['sichuan'])
    assert.deepEqual(suggestCuisineTags('鱼香肉丝', new Map()).source, 'rule')
    assert.deepEqual(matchRules('白菜炖粉条'), ['northeast'])
    assert.deepEqual(matchRules('铁锅土鸡炖榛蘑'), ['northeast'])
    assert.deepEqual(matchRules('广式焖牛肋排'), ['cantonese'])
    assert.deepEqual(matchRules('气锅鸡'), ['yunnan'])
    assert.deepEqual(matchRules('老北京扁豆焖面'), ['beijing'])
    assert.deepEqual(matchRules('烩面'), ['henan'])
  })

  it('air fryer / grill / braised cold cuts become home_style', () => {
    assert.deepEqual(suggestCuisineTags('空气炸锅烤豆腐', new Map()), {
      tags: ['home_style'],
      source: 'common'
    })
    assert.deepEqual(suggestCuisineTags('卤鸭脖', new Map()).tags, ['home_style'])
    assert.deepEqual(suggestCuisineTags('辣卤牛蹄筋', new Map()).tags, ['home_style'])
    assert.deepEqual(suggestCuisineTags('烤羊肉串', new Map()).tags, ['home_style'])
    assert.deepEqual(suggestCuisineTags('蒜香烤肋排', new Map()).tags, ['home_style'])
    // 经典名菜不被烧烤规则吞掉
    assert.deepEqual(suggestCuisineTags('北京烤鸭', new Map()).tags, ['beijing'])
    assert.notDeepEqual(suggestCuisineTags('卤煮火烧', new Map()).tags, ['home_style'])
  })

  it('backfill clears home_style and leaves none empty', () => {
    const index = new Map([['宫保鸡丁', new Set(['sichuan'])]])
    const { recipes, stats } = backfillRecipes(
      [
        { id: '1', name: '宫保鸡丁', cuisineTags: ['home_style'] },
        { id: '2', name: '青椒土豆丝', cuisineTags: ['home_style'] }
      ],
      index
    )
    assert.equal(stats.clearedHome, 2)
    assert.deepEqual(recipes[0].cuisineTags, ['sichuan'])
    assert.deepEqual(recipes[1].cuisineTags, [])
    assert.equal(stats.none, 1)
  })
})
