'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  collectNamesByCategory,
  collectEditorSurfaceNames,
  findMissingNames,
  buildBuiltinRow,
  makeIngredientId,
  syncBuiltinFromCatalog
} = require('../lib/syncBuiltinFromAllCatalog')

describe('collectNamesByCategory', () => {
  it('flattens category → name map', () => {
    const map = collectNamesByCategory({
      categories: { 蛋奶: ['黄油', '鸡蛋'], 调味: ['盐'] }
    })
    assert.deepEqual([...map.entries()].sort(), [
      ['盐', '调味'],
      ['鸡蛋', '蛋奶'],
      ['黄油', '蛋奶']
    ])
  })
})

describe('collectEditorSurfaceNames', () => {
  it('collects canon + ungrouped, not aliases-only', () => {
    const names = collectEditorSurfaceNames({
      categories: {
        蛋奶: {
          groups: [{ canon: '鸡蛋', aliases: ['土鸡蛋'] }],
          ungrouped: ['黄油']
        }
      }
    })
    assert.deepEqual([...names].sort((a, b) => a.localeCompare(b, 'zh')), [
      '黄油',
      '鸡蛋'
    ])
    assert.equal(names.has('土鸡蛋'), false)
  })
})

describe('findMissingNames', () => {
  it('returns by-category names absent from builtin', () => {
    const byCat = new Map([
      ['黄油', '蛋奶'],
      ['鸡蛋', '蛋奶'],
      ['盐', '调味']
    ])
    const builtin = [{ name: '鸡蛋' }, { name: '盐', cities: ['成都市'] }]
    assert.deepEqual(findMissingNames(byCat, builtin), [
      { name: '黄油', category: '蛋奶' }
    ])
  })
})

describe('buildBuiltinRow', () => {
  it('builds main row for non-调味', () => {
    const row = buildBuiltinRow({
      name: '黄油',
      category: '蛋奶',
      updatedAt: '2026-11-04T00:00:00.000Z',
      existingIds: new Set()
    })
    assert.equal(row.name, '黄油')
    assert.equal(row.category, '蛋奶')
    assert.equal(row.kind, 'main')
    assert.equal(row.availability, 'year_round')
    assert.deepEqual(row.cities, [])
    assert.equal(row.source, 'builtin')
    assert.ok(row.id.startsWith('ing_'))
  })

  it('builds seasoning row for 调味', () => {
    const row = buildBuiltinRow({
      name: '五香粉',
      category: '调味',
      updatedAt: '2026-11-04T00:00:00.000Z',
      existingIds: new Set()
    })
    assert.equal(row.kind, 'seasoning')
    assert.equal(row.availability, undefined)
  })
})

describe('makeIngredientId', () => {
  it('avoids colliding with existing ids', () => {
    const first = makeIngredientId('黄油', new Set())
    const second = makeIngredientId('黄油', new Set([first]))
    assert.notEqual(first, second)
  })
})

describe('syncBuiltinFromCatalog', () => {
  it('appends only missing names and reports diffs', () => {
    const result = syncBuiltinFromCatalog({
      allDoc: { categories: { 未映射: ['黄油', '鸡蛋'] } },
      byCatDoc: { categories: { 蛋奶: ['黄油', '鸡蛋'] } },
      editorDoc: {
        categories: {
          蛋奶: { groups: [{ canon: '鸡蛋', aliases: [] }], ungrouped: ['黄油'] }
        }
      },
      builtin: [
        {
          id: 'ing_egg',
          name: '鸡蛋',
          category: 'egg_dairy',
          cities: [],
          kind: 'main',
          availability: 'year_round',
          sort: 1,
          source: 'builtin',
          updatedAt: '2026-10-06T00:00:00.000Z'
        }
      ],
      updatedAt: '2026-11-04T00:00:00.000Z'
    })
    assert.equal(result.added.length, 1)
    assert.equal(result.added[0].name, '黄油')
    assert.equal(result.builtin.length, 2)
    assert.equal(result.warnings.length, 0)
  })

  it('warns when all and by-category name sets diverge', () => {
    const result = syncBuiltinFromCatalog({
      allDoc: { categories: { 未映射: ['黄油'] } },
      byCatDoc: { categories: { 蛋奶: ['黄油', '鸡蛋'] } },
      editorDoc: { categories: {} },
      builtin: [],
      updatedAt: '2026-11-04T00:00:00.000Z'
    })
    assert.ok(result.warnings.some((w) => w.includes('ingredients-all')))
  })

  it('also appends editor surface names missing from by-category', () => {
    const result = syncBuiltinFromCatalog({
      allDoc: { categories: { 荤菜: ['猪肉'] } },
      byCatDoc: { categories: { 肉类: ['猪肉'] } },
      editorDoc: {
        categories: {
          肉类: { groups: [{ canon: '掌中宝', aliases: ['鸡掌中宝'] }], ungrouped: [] }
        }
      },
      builtin: [{ id: 'ing_pork', name: '猪肉', category: '肉类' }],
      updatedAt: '2026-11-04T00:00:00.000Z'
    })
    assert.equal(result.added.length, 1)
    assert.equal(result.added[0].name, '掌中宝')
    assert.equal(result.added[0].category, '肉类')
    assert.ok(result.warnings.some((w) => w.includes('by-category')))
  })
})
