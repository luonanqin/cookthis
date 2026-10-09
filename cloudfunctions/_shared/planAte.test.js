'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { planAteOnDecision, planAteOffDecision } = require('./planAte.js')

describe('planAte decisions', () => {
  it('on is noop when plan_ate row exists', () => {
    const d = planAteOnDecision({
      uid: 'u1',
      requestId: 'req',
      recommendationId: 'rec',
      dishName: '辣子鸡',
      existingRow: { logId: 'log_1', uid: 'u1', source: 'plan_ate' }
    })
    assert.equal(d.ok, true)
    assert.equal(d.noop, true)
    assert.equal(d.logId, 'log_1')
  })

  it('on prepares single-dish plan_ate record', () => {
    const d = planAteOnDecision({
      uid: 'u1',
      requestId: 'req',
      recommendationId: 'rec',
      dishName: ' 辣子鸡 ',
      existingRow: null
    })
    assert.equal(d.ok, true)
    assert.equal(d.noop, false)
    assert.deepEqual(d.record.dishNames, ['辣子鸡'])
    assert.equal(d.record.source, 'plan_ate')
  })

  it('off is noop when missing', () => {
    const d = planAteOffDecision({
      uid: 'u1',
      requestId: 'req',
      dishName: '辣子鸡',
      existingRow: null
    })
    assert.equal(d.ok, true)
    assert.equal(d.noop, true)
  })
})
