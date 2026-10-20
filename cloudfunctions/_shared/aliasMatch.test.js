'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  loadAliases,
  buildAliasIndex,
  expandNames,
  normalizeCityKey,
  flattenShelfNameOrder,
  resolveShoppingLabel,
  applyShoppingDisplay
} = require('./aliasMatch.js')

const ALIASES = {
  鸡爪: ['凤爪', '鸡爪子', '鸡脚'],
  番茄: ['西红柿']
}

describe('aliasMatch', () => {
  it('loadAliases skips underscore keys', () => {
    const a = loadAliases({ _meta: { x: 1 }, 鸡爪: ['鸡脚'], 番茄: ['西红柿'] })
    assert.equal(a._meta, undefined)
    assert.deepEqual(a.鸡爪, ['鸡脚'])
  })

  it('expandNames once covers chicken foot ↔ claw', () => {
    const index = buildAliasIndex(ALIASES)
    const set = expandNames(['鸡脚', '土豆'], index)
    assert.ok(set.has('鸡爪'))
    assert.ok(set.has('鸡脚'))
    assert.ok(set.has('凤爪'))
    assert.ok(set.has('土豆'))
  })

  it('canonicalOf and unknown passthrough', () => {
    const index = buildAliasIndex(ALIASES)
    assert.equal(index.canonicalOf('鸡脚'), '鸡爪')
    assert.equal(index.canonicalOf('孜然'), '孜然')
    assert.equal(index.has('孜然'), false)
  })

  it('normalizeCityKey strips suffix', () => {
    assert.equal(normalizeCityKey('重庆市'), '重庆')
    assert.equal(normalizeCityKey('新疆维吾尔自治区'), '新疆维吾尔')
    assert.equal(normalizeCityKey(''), '')
  })

  it('flattenShelfNameOrder is stable', () => {
    const order = flattenShelfNameOrder({
      categories: { 肉禽: ['鸡脚', '猪肉'], 蔬菜: ['土豆', '鸡脚'] }
    })
    assert.deepEqual(order, ['鸡脚', '猪肉', '土豆'])
  })

  it('resolveShoppingLabel: city shelf prefers local ≠ canon', () => {
    const index = buildAliasIndex(ALIASES)
    const shelfOrder = ['猪肉', '鸡脚', '鸡爪', '土豆']
    const r = resolveShoppingLabel('鸡爪', { city: '重庆市', shelfOrder, index })
    assert.equal(r.displayName, '鸡脚')
    assert.equal(r.secondaryName, '鸡爪')
    assert.equal(r.checkKey, '鸡爪')
  })

  it('resolveShoppingLabel: no city → canon + first alias', () => {
    const index = buildAliasIndex(ALIASES)
    const r = resolveShoppingLabel('鸡爪', { city: '', shelfOrder: [], index })
    assert.equal(r.displayName, '鸡爪')
    assert.equal(r.secondaryName, '凤爪') // aliases.json 列表第一项
    assert.equal(r.checkKey, '鸡爪')
  })

  it('resolveShoppingLabel: shelf miss → canon', () => {
    const index = buildAliasIndex(ALIASES)
    const r = resolveShoppingLabel('鸡爪', {
      city: '北京',
      shelfOrder: ['猪肉'],
      index
    })
    assert.equal(r.displayName, '鸡爪')
    assert.equal(r.secondaryName, '凤爪')
  })

  it('resolveShoppingLabel: unknown raw passthrough', () => {
    const index = buildAliasIndex(ALIASES)
    const r = resolveShoppingLabel('孜然', { city: '重庆', shelfOrder: ['孜然'], index })
    assert.deepEqual(r, {
      displayName: '孜然',
      secondaryName: null,
      checkKey: '孜然'
    })
  })

  it('applyShoppingDisplay dedupes by checkKey and rewrites name', () => {
    const index = buildAliasIndex(ALIASES)
    const groups = [
      {
        category: 'meat',
        label: '肉类',
        items: [
          { name: '鸡脚', category: 'meat' },
          { name: '鸡爪', category: 'meat' }
        ],
        rows: []
      }
    ]
    const out = applyShoppingDisplay(groups, {
      city: '重庆市',
      shelfOrder: ['鸡脚', '鸡爪'],
      index
    })
    assert.equal(out[0].items.length, 1)
    assert.equal(out[0].items[0].name, '鸡爪')
    assert.equal(out[0].items[0].checkKey, '鸡爪')
    assert.equal(out[0].items[0].displayName, '鸡脚')
    assert.equal(out[0].items[0].secondaryName, '鸡爪')
    assert.equal(out[0].rows[0].length, 1)
  })
})
