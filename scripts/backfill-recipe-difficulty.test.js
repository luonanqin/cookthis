'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { inferDifficulty } = require('../cloudfunctions/_shared/cookSkill.js')
const {
  parseArgs,
  planProbeBackfill,
  applyProbeBackfill,
  summarizeInferred,
  runBackfill
} = require('./backfill-recipe-difficulty.js')

const PROBES = [
  { name: '番茄炒蛋', difficulty: 'easy' },
  { name: '红烧肉', difficulty: 'advanced' },
  { name: '凉拌黄瓜', difficulty: 'easy' }
]

function fixtureRecipes() {
  return [
    { id: 'a', name: '番茄炒蛋', minutes: 15, dishForms: ['stir_fry'] },
    { id: 'a2', name: '番茄炒蛋', minutes: 25, dishForms: ['stir_fry'] },
    { id: 'b', name: '红烧肉', minutes: 60, dishForms: ['braise'], difficulty: 'home' },
    { id: 'c', name: '清炒青菜', minutes: 10, dishForms: ['stir_fry'] },
    { id: 'd', name: '番茄炒鸡蛋', minutes: 12, dishForms: ['stir_fry'] }
  ]
}

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    assert.deepEqual(parseArgs(['node', 'backfill-recipe-difficulty.js']), {
      applyProbeNames: false
    })
  })

  it('accepts --apply-probe-names', () => {
    assert.deepEqual(parseArgs(['node', 'backfill-recipe-difficulty.js', '--apply-probe-names']), {
      applyProbeNames: true
    })
  })

  it('rejects flags that would apply inferred difficulty', () => {
    assert.throws(
      () => parseArgs(['node', 'backfill-recipe-difficulty.js', '--apply-inferred']),
      /unknown argument: --apply-inferred/
    )
  })
})

describe('planProbeBackfill', () => {
  it('plans every exact name match that has no difficulty', () => {
    const recipes = fixtureRecipes()
    const before = JSON.stringify(recipes)
    const plan = planProbeBackfill(recipes, PROBES)

    assert.deepEqual(
      plan.toWrite.map((row) => [row.id, row.name, row.difficulty]),
      [
        ['a', '番茄炒蛋', 'easy'],
        ['a2', '番茄炒蛋', 'easy']
      ]
    )
    assert.deepEqual(plan.missingNames, ['凉拌黄瓜'])
    assert.deepEqual(
      plan.kept.map((row) => [row.id, row.difficulty, row.probeDifficulty]),
      [['b', 'home', 'advanced']]
    )
    assert.equal(JSON.stringify(recipes), before)
  })
})

describe('applyProbeBackfill', () => {
  it('writes probe difficulty only onto exact matches that lack one', () => {
    const recipes = fixtureRecipes()
    const result = applyProbeBackfill(recipes, PROBES)

    assert.equal(result.written, 2)
    assert.equal(recipes[0].difficulty, 'easy')
    assert.equal(recipes[1].difficulty, 'easy')
    assert.equal(recipes[2].difficulty, 'home')
    assert.equal(recipes[3].difficulty, undefined)
    assert.equal(recipes[4].difficulty, undefined)
  })
})

describe('summarizeInferred', () => {
  it('counts fallback difficulty without writing it', () => {
    const recipes = fixtureRecipes()
    const summary = summarizeInferred(recipes, inferDifficulty)

    assert.equal(summary.explicit, 1)
    assert.equal(summary.easy, 3)
    assert.equal(summary.home, 1)
    assert.equal(summary.advanced, 0)
    assert.equal(recipes[3].difficulty, undefined)
  })
})

describe('runBackfill', () => {
  it('dry-run reports probe writes and does not touch the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-difficulty-'))
    const file = path.join(dir, 'recipes-builtin.json')
    const recipes = fixtureRecipes()
    const original = JSON.stringify(recipes, null, 2) + '\n'
    fs.writeFileSync(file, original)

    try {
      const result = runBackfill({
        recipesPath: file,
        applyProbeNames: false,
        probeDishes: PROBES,
        inferDifficulty
      })
      assert.equal(fs.readFileSync(file, 'utf8'), original)
      assert.equal(result.written, 0)
      assert.match(result.report, /mode: dry-run/)
      assert.match(result.report, /write\ta\t番茄炒蛋\tprobe=easy/)
      assert.match(result.report, /missing\t凉拌黄瓜/)
      assert.match(result.report, /kept\tb\t红烧肉\texisting=home\tprobe=advanced/)
      assert.match(result.report, /inferred difficulties were not written/)
      assert.equal(result.plan.toWrite.some((row) => row.id === 'c'), false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('apply-probe-names writes probe rows and leaves inferred-only rows blank', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-difficulty-'))
    const file = path.join(dir, 'recipes-builtin.json')
    fs.writeFileSync(file, JSON.stringify(fixtureRecipes(), null, 2) + '\n')

    try {
      const result = runBackfill({
        recipesPath: file,
        applyProbeNames: true,
        probeDishes: PROBES,
        inferDifficulty
      })
      const after = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(result.written, 2)
      assert.match(result.report, /mode: apply-probe-names/)
      assert.equal(after[0].difficulty, 'easy')
      assert.equal(after[1].difficulty, 'easy')
      assert.equal(after[2].difficulty, 'home')
      assert.equal(Object.hasOwn(after[3], 'difficulty'), false)
      assert.equal(Object.hasOwn(after[4], 'difficulty'), false)
      assert.match(result.report, /inferred difficulties were not written/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
