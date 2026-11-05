'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { PROBE_DISHES, COOK_SKILL_VALUES } = require('./cookSkill.js')
const {
  RETAKE_LINK_TESTED,
  RETAKE_LINK_UNTESTED,
  RETAKE_TOAST,
  TRACK_SUBMIT,
  TRACK_CANCEL,
  retakeLinkLabel,
  buildProbeGroups,
  probeCountsFromChecked,
  retakeCloudCall
} = require('./cookSkillRetake.js')

describe('mine cook skill retake', () => {
  it('link copy depends on whether a skill is stored, and never states the tier', () => {
    for (const skill of COOK_SKILL_VALUES) {
      assert.equal(retakeLinkLabel(skill), RETAKE_LINK_TESTED)
    }
    assert.equal(RETAKE_LINK_TESTED, '已测 · 可重测')
    for (const missing of [null, undefined, '', 'expert']) {
      assert.equal(retakeLinkLabel(missing), RETAKE_LINK_UNTESTED)
    }
    assert.equal(RETAKE_LINK_UNTESTED, '测一下做饭水平')
    for (const skill of COOK_SKILL_VALUES) {
      assert.equal(RETAKE_LINK_TESTED.includes(skill), false)
      assert.equal(RETAKE_LINK_UNTESTED.includes(skill), false)
    }
  })

  it('reuses the same 15 probe dishes in onboarding group order', () => {
    const groups = buildProbeGroups()
    assert.deepEqual(
      groups.map((g) => g.id),
      ['easy', 'home', 'advanced']
    )
    assert.deepEqual(
      groups.map((g) => g.title),
      ['轻松上手', '家常水平', '进阶一点']
    )
    const dishes = groups.flatMap((g) => g.dishes)
    assert.equal(dishes.length, 15)
    assert.deepEqual(
      dishes.map((d) => d.id),
      PROBE_DISHES.map((d) => d.id)
    )
    assert.deepEqual(
      dishes.map((d) => d.name),
      PROBE_DISHES.map((d) => d.name)
    )
    const visible = groups
      .flatMap((g) => [g.title, ...g.dishes.map((d) => d.name)])
      .join(' ')
    for (const skill of COOK_SKILL_VALUES) {
      assert.equal(visible.includes(skill), false)
    }
  })

  it('counts checks by probe group', () => {
    const checked = { 'easy-1': true, 'easy-2': true, 'home-3': true, 'advanced-5': true }
    assert.deepEqual(probeCountsFromChecked(checked), {
      easy: 2,
      home: 1,
      advanced: 1
    })
    assert.deepEqual(probeCountsFromChecked({}), { easy: 0, home: 0, advanced: 0 })
    assert.deepEqual(probeCountsFromChecked(null), { easy: 0, home: 0, advanced: 0 })
  })

  it('submit calls saveCookSkillProbe with counts and a neutral toast, without a client tier', () => {
    const checked = { 'advanced-1': true, 'advanced-2': true, 'advanced-3': true }
    const call = retakeCloudCall('submit', checked)
    assert.equal(call.track, TRACK_SUBMIT)
    assert.equal(TRACK_SUBMIT, 'cook_skill_retake_submit')
    assert.equal(call.toast, RETAKE_TOAST)
    assert.equal(RETAKE_TOAST, '已根据选择优化推荐')
    assert.deepEqual(call.payload, {
      action: 'saveCookSkillProbe',
      counts: { easy: 0, home: 0, advanced: 3 }
    })
    assert.equal('cookSkill' in call.payload, false)
    assert.equal(call.payload.skipped, undefined)
    assert.deepEqual(call.trackProps, {
      cookSkill: 'skilled',
      counts: { easy: 0, home: 0, advanced: 3 }
    })
  })

  it('cancel and back do not call the cloud, so the stored skill stays', () => {
    const checked = { 'home-1': true, 'home-2': true, 'home-3': true }
    for (const kind of ['cancel', 'back']) {
      const call = retakeCloudCall(kind, checked)
      assert.equal(call.track, TRACK_CANCEL)
      assert.equal(TRACK_CANCEL, 'cook_skill_retake_cancel')
      assert.equal(call.payload, null)
      assert.equal(call.toast, null)
      assert.deepEqual(call.trackProps, {})
    }
  })
})
