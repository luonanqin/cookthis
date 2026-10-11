'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  CUISINE_CODES,
  sanitizeCuisinePrefs,
  familyAvoidCuisines,
  recipeBlockedByCuisine,
  cuisineSoftDelta
} = require('./cuisinePrefs.js')

describe('cuisinePrefs', () => {
  it('has 19 user-facing codes and no home_style', () => {
    assert.equal(CUISINE_CODES.length, 19)
    assert.ok(!CUISINE_CODES.includes('home_style'))
    assert.ok(CUISINE_CODES.includes('sichuan'))
    assert.ok(CUISINE_CODES.includes('shanghai'))
  })

  it('sanitize drops unknown codes and bad values', () => {
    const out = sanitizeCuisinePrefs({
      sichuan: 'prefer',
      hunan: 'avoid',
      home_style: 'prefer',
      foo: 'prefer',
      cantonese: 'maybe'
    })
    assert.deepEqual(out, { sichuan: 'prefer', hunan: 'avoid' })
  })

  it('hard-blocks recipe when cuisineTags hit avoid', () => {
    assert.equal(
      recipeBlockedByCuisine(
        { cuisineTags: ['sichuan', 'home_style'] },
        { sichuan: 'avoid' }
      ),
      true
    )
    assert.equal(
      recipeBlockedByCuisine({ cuisineTags: ['cantonese'] }, { sichuan: 'avoid' }),
      false
    )
    assert.equal(
      recipeBlockedByCuisine({ cuisineTags: [] }, { sichuan: 'avoid' }),
      false
    )
    assert.equal(
      recipeBlockedByCuisine({ name: 'x' }, { sichuan: 'avoid' }),
      false
    )
  })

  it('soft delta -20 on prefer hit', () => {
    assert.equal(
      cuisineSoftDelta({ cuisineTags: ['hunan'] }, { hunan: 'prefer' }),
      -20
    )
    assert.equal(
      cuisineSoftDelta({ cuisineTags: ['hunan'] }, { sichuan: 'prefer' }),
      0
    )
  })

  it('familyAvoidCuisines lists avoid codes', () => {
    assert.deepEqual(
      familyAvoidCuisines({ sichuan: 'prefer', hunan: 'avoid', yunnan: 'neutral' }),
      ['hunan']
    )
  })
})
