'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { mealLogSourceLabel, SOURCE_LABELS } = require('./mealLogSource.js')

describe('mealLogSourceLabel', () => {
  it('maps known English sources to Chinese', () => {
    assert.equal(mealLogSourceLabel('manual'), '手动记录')
    assert.equal(mealLogSourceLabel('photo'), '拍照')
    assert.equal(mealLogSourceLabel('voice'), '语音')
    assert.equal(mealLogSourceLabel('confirm'), '买前确认')
    assert.equal(mealLogSourceLabel('plan_ate'), '已选方案')
  })

  it('falls back for unknown / empty', () => {
    assert.equal(mealLogSourceLabel('weird'), '其他')
    assert.equal(mealLogSourceLabel(''), '其他')
    assert.equal(mealLogSourceLabel(null), '其他')
    assert.equal(mealLogSourceLabel(undefined), '其他')
  })

  it('keeps English keys for DB query', () => {
    assert.deepEqual(Object.keys(SOURCE_LABELS).sort(), [
      'confirm',
      'manual',
      'photo',
      'plan_ate',
      'voice'
    ])
  })
})
