'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { shouldShowProfileLite } = require('./profileLite.js')

describe('shouldShowProfileLite', () => {
  it('shows for daily with empty avoids and never prompted', () => {
    assert.equal(
      shouldShowProfileLite({
        mealType: 'daily',
        familyAvoids: [],
        profileLiteSkipped: false,
        profileLitePromptedAt: null
      }),
      true
    )
  })

  it('hides for non-daily', () => {
    assert.equal(
      shouldShowProfileLite({
        mealType: 'friends_party',
        familyAvoids: [],
        profileLiteSkipped: false,
        profileLitePromptedAt: null
      }),
      false
    )
  })

  it('hides when familyAvoids already set', () => {
    assert.equal(
      shouldShowProfileLite({
        mealType: 'daily',
        familyAvoids: ['pork'],
        profileLiteSkipped: false,
        profileLitePromptedAt: null
      }),
      false
    )
  })

  it('hides after skip or prompted', () => {
    assert.equal(
      shouldShowProfileLite({
        mealType: 'daily',
        familyAvoids: [],
        profileLiteSkipped: true,
        profileLitePromptedAt: null
      }),
      false
    )
    assert.equal(
      shouldShowProfileLite({
        mealType: 'daily',
        familyAvoids: [],
        profileLiteSkipped: false,
        profileLitePromptedAt: '2026-10-08T00:00:00.000Z'
      }),
      false
    )
  })
})
