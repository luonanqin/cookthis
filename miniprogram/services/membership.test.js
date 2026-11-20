'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  MEMBERSHIP_ENABLED,
  memberStatusLabel,
  getMembershipLite,
  setMembershipLite
} = require('./membership.js')

describe('MEMBERSHIP_ENABLED', () => {
  it('is true while membership联调; set false before ship if not selling yet', () => {
    assert.equal(MEMBERSHIP_ENABLED, true)
  })
})

describe('memberStatusLabel', () => {
  it('shows 未开通会员 when missing or inactive', () => {
    assert.equal(memberStatusLabel(null), '未开通会员')
    assert.equal(memberStatusLabel({ isMember: false }), '未开通会员')
    assert.equal(memberStatusLabel({ isMember: false, expiresLabel: '2027-01-18' }), '未开通会员')
  })

  it('shows 会员于 expiresLabel 到期 when active', () => {
    assert.equal(
      memberStatusLabel({ isMember: true, expiresLabel: '2027-01-18' }),
      '会员于2027-01-18到期'
    )
    assert.equal(memberStatusLabel({ isMember: true }), '会员已开通')
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
