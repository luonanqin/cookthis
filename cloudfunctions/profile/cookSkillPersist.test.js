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
  it('does not write cookSkill when the step is skipped, even if a skill is sent', () => {
    const patch = onboardingCookSkillPatch({
      cookSkillSkipped: true,
      cookSkill: 'skilled',
      cookSkillProbeCounts: { easy: 0, home: 0, advanced: 5 }
    })
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'cookSkill'), false)
    assert.deepEqual(patch.cookSkillProbeCounts, { easy: 0, home: 0, advanced: 5 })
  })

  it('writes a valid cookSkill and counts, and ignores an invalid skill', () => {
    assert.deepEqual(
      onboardingCookSkillPatch({
        cookSkill: 'beginner',
        cookSkillProbeCounts: { easy: 1, home: 0, advanced: 0 }
      }),
      {
        cookSkill: 'beginner',
        cookSkillProbeCounts: { easy: 1, home: 0, advanced: 0 }
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
    const plan = planSaveCookSkillProbe({
      cookSkill: 'beginner',
      counts: { easy: 5, home: 5, advanced: 3 }
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.cookSkill, 'skilled')
    assert.deepEqual(plan.cookSkillProbeCounts, { easy: 5, home: 5, advanced: 3 })
  })

  it('derives home and beginner from counts, including all zeros', () => {
    assert.equal(
      planSaveCookSkillProbe({ counts: { easy: 5, home: 3, advanced: 2 } }).cookSkill,
      'home'
    )
    assert.equal(
      planSaveCookSkillProbe({ counts: { easy: 0, home: 0, advanced: 0 } }).cookSkill,
      'beginner'
    )
  })

  it('refuses to write when counts are missing', () => {
    assert.deepEqual(planSaveCookSkillProbe({ cookSkill: 'home' }), {
      ok: false,
      error: 'INVALID_COUNTS'
    })
    assert.deepEqual(planSaveCookSkillProbe({ counts: null }), {
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
