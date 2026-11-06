'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  onboardingCookSkillPatch,
  planSaveCookSkillProbe,
  storedCookSkill,
  storedProbeCounts
} = require('./cookSkillPersist.js')

describe('onboardingCookSkillPatch', () => {
  it('returns empty patch when the step is skipped, even if a skill is sent', () => {
    const patch = onboardingCookSkillPatch({
      cookSkillSkipped: true,
      cookSkill: 'skilled',
      cookSkillProbeCounts: { easy: 0, home: 0, advanced: 5 },
      cookSkillProbeDishIds: ['advanced-1']
    })
    assert.deepEqual(patch, {})
  })

  it('writes a valid cookSkill and counts, and ignores an invalid skill', () => {
    assert.deepEqual(
      onboardingCookSkillPatch({
        cookSkill: 'beginner',
        cookSkillProbeCounts: { easy: 1, home: 0, advanced: 0 },
        cookSkillProbeDishIds: ['easy-1']
      }),
      {
        cookSkill: 'beginner',
        cookSkillProbeCounts: { easy: 1, home: 0, advanced: 0 },
        cookSkillProbeDishIds: ['easy-1']
      }
    )
    const invalid = onboardingCookSkillPatch({ cookSkill: 'expert' })
    assert.equal(Object.prototype.hasOwnProperty.call(invalid, 'cookSkill'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(invalid, 'cookSkillProbeCounts'), false)
  })

  it('does not clear an existing skill when the client omits the fields', () => {
    assert.deepEqual(onboardingCookSkillPatch({}), {})
    assert.deepEqual(onboardingCookSkillPatch({ cookSkillSkipped: false }), {})
  })
})

describe('planSaveCookSkillProbe', () => {
  it('leaves the stored skill alone when skipped', () => {
    const plan = planSaveCookSkillProbe({
      skipped: true,
      cookSkill: 'beginner',
      counts: { easy: 0, home: 0, advanced: 0 }
    })
    assert.deepEqual(plan, { ok: true, unchanged: true })
    assert.equal(Object.prototype.hasOwnProperty.call(plan, 'cookSkill'), false)
  })

  it('stores the server-derived skill, not the client value', () => {
    const dishIds = [
      'advanced-1',
      'advanced-2',
      'advanced-3',
      'advanced-4',
      'advanced-5'
    ]
    const plan = planSaveCookSkillProbe({
      cookSkill: 'beginner',
      counts: { easy: 5, home: 5, advanced: 5 },
      dishIds
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.cookSkill, 'skilled')
    assert.deepEqual(plan.cookSkillProbeCounts, { easy: 0, home: 0, advanced: 5 })
    assert.deepEqual(plan.cookSkillProbeDishIds, dishIds)
  })

  it('derives home and beginner from counts when dishIds omitted', () => {
    assert.equal(
      planSaveCookSkillProbe({ counts: { easy: 5, home: 5, advanced: 4 } }).cookSkill,
      'home'
    )
    assert.equal(
      planSaveCookSkillProbe({ counts: { easy: 2, home: 0, advanced: 0 } }).cookSkill,
      'beginner'
    )
  })

  it('refuses empty probe and missing counts', () => {
    assert.deepEqual(planSaveCookSkillProbe({ cookSkill: 'home' }), {
      ok: false,
      error: 'INVALID_COUNTS'
    })
    assert.deepEqual(planSaveCookSkillProbe({ counts: null }), {
      ok: false,
      error: 'INVALID_COUNTS'
    })
    assert.deepEqual(planSaveCookSkillProbe({ counts: { easy: 0, home: 0, advanced: 0 } }), {
      ok: false,
      error: 'EMPTY_PROBE'
    })
    assert.deepEqual(planSaveCookSkillProbe({ dishIds: [] }), {
      ok: false,
      error: 'INVALID_COUNTS'
    })
  })
})

describe('stored cookSkill reads', () => {
  it('defaults missing or unknown skill to null and passes counts through', () => {
    assert.equal(storedCookSkill(undefined), null)
    assert.equal(storedCookSkill(null), null)
    assert.equal(storedCookSkill('expert'), null)
    assert.equal(storedCookSkill('home'), 'home')
    assert.equal(storedProbeCounts(undefined), null)
    assert.deepEqual(storedProbeCounts({ easy: 1, home: 2, advanced: 3 }), {
      easy: 1,
      home: 2,
      advanced: 3
    })
  })
})
