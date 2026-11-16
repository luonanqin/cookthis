'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  CUISINE_PREFS_ENABLED,
  CUISINE_CODES,
  sanitizeCuisinePrefs,
  familyAvoidCuisines,
  effectiveCuisineTags,
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

  it('effectiveCuisineTags ignores regional when home_style present', () => {
    assert.deepEqual(effectiveCuisineTags({ cuisineTags: ['sichuan', 'home_style'] }), [])
    assert.deepEqual(effectiveCuisineTags({ cuisineTags: ['home_style'] }), [])
    assert.deepEqual(effectiveCuisineTags({ cuisineTags: ['sichuan', 'hunan'] }), [
      'sichuan',
      'hunan'
    ])
    assert.deepEqual(effectiveCuisineTags({ cuisineTags: [] }), [])
    assert.deepEqual(effectiveCuisineTags({}), [])
  })

  it('recommend effect gated off while CUISINE_PREFS_ENABLED is false', () => {
    assert.equal(CUISINE_PREFS_ENABLED, false)
    assert.equal(
      recipeBlockedByCuisine({ cuisineTags: ['sichuan'] }, { sichuan: 'avoid' }),
      false
    )
    assert.equal(
      cuisineSoftDelta({ cuisineTags: ['hunan'] }, { hunan: 'prefer' }),
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
