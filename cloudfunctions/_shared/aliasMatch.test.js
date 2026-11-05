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
  fitSecondaryNames,
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
    assert.deepEqual(r.secondaryNames, ['鸡爪', '凤爪', '鸡爪子'])
    assert.equal(r.secondaryName, '鸡爪 凤爪 鸡爪子')
    assert.equal(r.checkKey, '鸡爪')
  })

  it('resolveShoppingLabel: no city → canon + all aliases that fit', () => {
    const index = buildAliasIndex(ALIASES)
    const r = resolveShoppingLabel('鸡爪', { city: '', shelfOrder: [], index })
    assert.equal(r.displayName, '鸡爪')
    assert.deepEqual(r.secondaryNames, ['凤爪', '鸡爪子', '鸡脚'])
    assert.equal(r.secondaryName, '凤爪 鸡爪子 鸡脚')
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
    assert.equal(r.secondaryName, '凤爪 鸡爪子 鸡脚')
  })

  it('resolveShoppingLabel: unknown raw passthrough', () => {
    const index = buildAliasIndex(ALIASES)
    const r = resolveShoppingLabel('孜然', { city: '重庆', shelfOrder: ['孜然'], index })
    assert.deepEqual(r, {
      displayName: '孜然',
      secondaryNames: [],
      secondaryName: null,
      checkKey: '孜然'
    })
  })

  it('fitSecondaryNames packs whole names only, no truncate', () => {
    assert.equal(fitSecondaryNames(['凤爪', '鸡爪子', '鸡脚'], '鸡爪'), '凤爪 鸡爪子 鸡脚')
    // 第二段完整放不下 → 只保留已放下的，不截断
    assert.equal(fitSecondaryNames(['凤爪', '附名特别特别特别长放不下'], '鸡爪'), '凤爪')
    // 首段就超宽 → 不展示
    assert.equal(fitSecondaryNames(['附名特别特别特别长放不下'], '鸡爪'), null)
  })

  it('expandCategoryByName copies category across alias group', () => {
    const { expandCategoryByName } = require('./aliasMatch.js')
    const index = buildAliasIndex({
      猪肋排: ['排骨', '肋排'],
      三线肉: ['五花肉', '三层肉']
    })
    const out = expandCategoryByName(
      { 猪肋排: '肉类', 三线肉: '肉类' },
      index
    )
    assert.equal(out['排骨'], '肉类')
    assert.equal(out['五花肉'], '肉类')
    assert.equal(out['猪肋排'], '肉类')
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
    assert.equal(out[0].items[0].secondaryName, '鸡爪 凤爪 鸡爪子')
    assert.equal(out[0].rows[0].cells.length, 1)
  })
})
