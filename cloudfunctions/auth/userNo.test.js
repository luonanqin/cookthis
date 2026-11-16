'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { isValidUserNo, loginUserNoFields } = require('./userNo.js')

describe('isValidUserNo', () => {
  it('accepts positive integers and rejects illegal values', () => {
    assert.equal(isValidUserNo(1), true)
    assert.equal(isValidUserNo(128), true)
    assert.equal(isValidUserNo(0), false)
    assert.equal(isValidUserNo(1.5), false)
    assert.equal(isValidUserNo('8'), false)
    assert.equal(isValidUserNo(null), false)
    assert.equal(isValidUserNo(undefined), false)
  })
})

describe('loginUserNoFields', () => {
  it('returns a valid userNo and unseen reveal for a new signup', () => {
    assert.deepEqual(loginUserNoFields({ userNo: 3, userNoRevealSeenAt: null }), {
      userNo: 3,
      userNoRevealSeen: false
    })
  })

  it('returns seen=true when userNoRevealSeenAt is set', () => {
    assert.deepEqual(
      loginUserNoFields({ userNo: 12, userNoRevealSeenAt: '2026-11-16T02:00:00.000Z' }),
      { userNo: 12, userNoRevealSeen: true }
    )
  })

  it('returns userNo null for existing users missing or illegal userNo', () => {
    assert.deepEqual(loginUserNoFields({}), { userNo: null, userNoRevealSeen: false })
    assert.deepEqual(loginUserNoFields({ userNo: 0 }), { userNo: null, userNoRevealSeen: false })
    assert.deepEqual(loginUserNoFields({ userNo: '1' }), { userNo: null, userNoRevealSeen: false })
    assert.deepEqual(loginUserNoFields({ userNo: 1.2, userNoRevealSeenAt: 'x' }), {
      userNo: null,
      userNoRevealSeen: true
    })
  })
})
