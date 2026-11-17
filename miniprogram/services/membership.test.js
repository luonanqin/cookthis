'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  memberStatusLabel,
  getMembershipLite,
  setMembershipLite
} = require('./membership.js')

describe('memberStatusLabel', () => {
  it('shows 未开通会员 when missing or inactive', () => {
    assert.equal(memberStatusLabel(null), '未开通会员')
    assert.equal(memberStatusLabel({ isMember: false }), '未开通会员')
    assert.equal(memberStatusLabel({ isMember: false, expiresLabel: '2027-01-18' }), '未开通会员')
  })

  it('shows 会员至 expiresLabel when active', () => {
    assert.equal(
      memberStatusLabel({ isMember: true, expiresLabel: '2027-01-18' }),
      '会员至 2027-01-18'
    )
  })
})

describe('membershipLite session cache', () => {
  beforeEach(() => {
    setMembershipLite(null)
  })

  it('stores a slim isMember/expiresLabel snapshot', () => {
    assert.equal(getMembershipLite(), null)
    const lite = setMembershipLite({
      isMember: true,
      expiresLabel: '2027-01-18',
      offers: [{ sku: 'month' }]
    })
    assert.deepEqual(lite, { isMember: true, expiresLabel: '2027-01-18' })
    assert.deepEqual(getMembershipLite(), lite)
  })
})
