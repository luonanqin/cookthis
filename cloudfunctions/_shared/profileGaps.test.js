'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { computeProfileGaps } = require('./profileGaps.js')

describe('computeProfileGaps', () => {
  const base = {
    familyAvoids: [],
    familyAvoidsNone: false,
    membersCount: 0,
    city: '',
    cuisinePrefs: {},
    cuisinePrefsConfirmedAt: null
  }

  it('all open for empty skip-onboarding style user', () => {
    const g = computeProfileGaps(base)
    assert.deepEqual(g.gaps, ['family_avoids', 'members', 'city', 'cuisine'])
    assert.equal(g.recommendBanner, true)
    assert.equal(g.anyOpen, true)
  })

  it('skip lite does not close family_avoids (still open with empty avoids)', () => {
    const g = computeProfileGaps(base)
    assert.equal(g.familyAvoidsOpen, true)
  })

  it('familyAvoidsNone closes family_avoids and recommendBanner', () => {
    const g = computeProfileGaps(Object.assign({}, base, { familyAvoidsNone: true }))
    assert.equal(g.familyAvoidsOpen, false)
    assert.equal(g.recommendBanner, false)
    assert.ok(!g.gaps.includes('family_avoids'))
  })

  it('non-empty familyAvoids closes family_avoids', () => {
    const g = computeProfileGaps(Object.assign({}, base, { familyAvoids: ['pork'] }))
    assert.equal(g.familyAvoidsOpen, false)
  })

  it('cuisinePrefsConfirmedAt closes cuisine without prefer/avoid', () => {
    const g = computeProfileGaps(
      Object.assign({}, base, { cuisinePrefsConfirmedAt: '2026-10-19T00:00:00.000Z' })
    )
    assert.equal(g.cuisineOpen, false)
  })

  it('prefer cuisine closes cuisine gap', () => {
    const g = computeProfileGaps(
      Object.assign({}, base, { cuisinePrefs: { sichuan: 'prefer' } })
    )
    assert.equal(g.cuisineOpen, false)
  })

  it('members and city', () => {
    const g = computeProfileGaps(
      Object.assign({}, base, { membersCount: 1, city: '杭州市', familyAvoidsNone: true })
    )
    assert.equal(g.membersOpen, false)
    assert.equal(g.cityOpen, false)
    assert.deepEqual(g.gaps, ['cuisine'])
  })
})
