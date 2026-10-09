'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { planRemoveMealLog } = require('./removeMealLog.js')

describe('planRemoveMealLog (饮食记录 §4.2)', () => {
  it('requires logId', () => {
    assert.deepEqual(planRemoveMealLog({ uid: 'u1', logId: '', row: null }), {
      ok: false,
      error: 'LOG_ID_REQUIRED'
    })
    assert.deepEqual(planRemoveMealLog({ uid: 'u1', logId: '  ', row: null }), {
      ok: false,
      error: 'LOG_ID_REQUIRED'
    })
  })

  it('returns NOT_FOUND when no row', () => {
    assert.deepEqual(
      planRemoveMealLog({ uid: 'u1', logId: 'log_a', row: null }),
      { ok: false, error: 'NOT_FOUND' }
    )
  })

  it('returns FORBIDDEN when uid mismatches', () => {
    assert.deepEqual(
      planRemoveMealLog({
        uid: 'u1',
        logId: 'log_a',
        row: { _id: 'doc1', uid: 'u2', logId: 'log_a', source: 'manual' }
      }),
      { ok: false, error: 'FORBIDDEN' }
    )
  })

  it('returns docId for physical delete when owner matches', () => {
    assert.deepEqual(
      planRemoveMealLog({
        uid: 'u1',
        logId: 'log_a',
        row: { _id: 'doc1', uid: 'u1', logId: 'log_a', source: 'confirm' }
      }),
      {
        ok: true,
        docId: 'doc1',
        logId: 'log_a',
        source: 'confirm'
      }
    )
  })
})
