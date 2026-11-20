'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const MEM_PATH = path.join(__dirname, 'membership.js')
const CLOUD_PATH = path.join(__dirname, 'cloud.js')

function installWxStorage() {
  const store = Object.create(null)
  global.wx = {
    getStorageSync(key) {
      return store[key]
    },
    setStorageSync(key, value) {
      store[key] = value
    },
    removeStorageSync(key) {
      delete store[key]
    }
  }
  return store
}

function loadMembership(callCloudImpl) {
  delete require.cache[MEM_PATH]
  delete require.cache[CLOUD_PATH]
  require.cache[CLOUD_PATH] = {
    id: CLOUD_PATH,
    filename: CLOUD_PATH,
    loaded: true,
    exports: {
      callCloud: callCloudImpl || (() => Promise.reject(new Error('unexpected callCloud')))
    }
  }
  return require(MEM_PATH)
}

describe('MEMBERSHIP_ENABLED', () => {
  let membership
  beforeEach(() => {
    installWxStorage()
    membership = loadMembership()
  })
  afterEach(() => {
    delete require.cache[MEM_PATH]
    delete require.cache[CLOUD_PATH]
  })

  it('is true while membership联调; set false before ship if not selling yet', () => {
    assert.equal(membership.MEMBERSHIP_ENABLED, true)
  })
})

describe('memberStatusLabel', () => {
  let membership
  beforeEach(() => {
    installWxStorage()
    membership = loadMembership()
  })
  afterEach(() => {
    delete require.cache[MEM_PATH]
    delete require.cache[CLOUD_PATH]
  })

  it('shows 未开通会员 when missing or inactive', () => {
    assert.equal(membership.memberStatusLabel(null), '未开通会员')
    assert.equal(membership.memberStatusLabel({ isMember: false }), '未开通会员')
    assert.equal(
      membership.memberStatusLabel({ isMember: false, expiresLabel: '2027-01-18' }),
      '未开通会员'
    )
  })

  it('shows 会员于 expiresLabel 到期 when active', () => {
    assert.equal(
      membership.memberStatusLabel({ isMember: true, expiresLabel: '2027-01-18' }),
      '会员于2027-01-18到期'
    )
    assert.equal(membership.memberStatusLabel({ isMember: true }), '会员已开通')
  })
})

describe('membershipLite local cache', () => {
  let membership
  let store
  beforeEach(() => {
    store = installWxStorage()
    membership = loadMembership()
  })
  afterEach(() => {
    delete require.cache[MEM_PATH]
    delete require.cache[CLOUD_PATH]
  })

  it('stores expiresAt/updatedAt and persists to storage', () => {
    assert.equal(membership.getMembershipLite(), null)
    const now = Date.parse('2026-11-20T12:00:00.000Z')
    const lite = membership.setMembershipLite(
      {
        isMember: true,
        expiresAt: '2027-01-18T00:00:00.000Z',
        expiresLabel: '2027-01-18',
        offers: [{ sku: 'month' }]
      },
      now
    )
    assert.equal(lite.isMember, true)
    assert.equal(lite.expiresAt, '2027-01-18T00:00:00.000Z')
    assert.equal(lite.expiresLabel, '2027-01-18')
    assert.equal(lite.updatedAt, now)
    assert.ok(!('offers' in lite))
    assert.deepEqual(store.cookthis_membership_lite, lite)

    delete require.cache[MEM_PATH]
    const again = loadMembership()
    assert.deepEqual(again.getMembershipLite(), lite)
  })

  it('recomputes isMember from expiresAt when reading', () => {
    membership.setMembershipLite(
      {
        isMember: true,
        expiresAt: '2026-11-19T00:00:00.000Z',
        expiresLabel: '2026-11-19'
      },
      Date.parse('2026-11-18T12:00:00.000Z')
    )
    const lite = membership.getMembershipLite(Date.parse('2026-11-20T12:00:00.000Z'))
    assert.equal(lite.isMember, false)
    assert.equal(lite.expiresAt, '2026-11-19T00:00:00.000Z')
  })

  it('clears memory and storage when set to null', () => {
    membership.setMembershipLite({
      isMember: true,
      expiresAt: '2027-01-18T00:00:00.000Z',
      expiresLabel: '2027-01-18'
    })
    membership.setMembershipLite(null)
    assert.equal(membership.getMembershipLite(), null)
    assert.equal(store.cookthis_membership_lite, undefined)
  })
})

describe('ensureMembershipStatus', () => {
  let calls
  afterEach(() => {
    delete require.cache[MEM_PATH]
    delete require.cache[CLOUD_PATH]
  })

  function loadWithStatus(status) {
    calls = 0
    installWxStorage()
    return loadMembership((name, data) => {
      assert.equal(name, 'membership')
      assert.equal(data.action, 'getStatus')
      calls += 1
      return Promise.resolve(status)
    })
  }

  it('fetches once when cache empty and writes lite', async () => {
    const membership = loadWithStatus({
      ok: true,
      isMember: true,
      expiresAt: '2027-01-18T00:00:00.000Z',
      expiresLabel: '2027-01-18'
    })
    const res = await membership.ensureMembershipStatus()
    assert.equal(calls, 1)
    assert.equal(res.isMember, true)
    assert.equal(membership.getMembershipLite().expiresAt, '2027-01-18T00:00:00.000Z')
  })

  it('skips network when soft TTL still fresh', async () => {
    const membership = loadWithStatus({
      ok: true,
      isMember: false,
      expiresAt: null,
      expiresLabel: null
    })
    const t0 = Date.parse('2026-11-20T12:00:00.000Z')
    await membership.ensureMembershipStatus({ nowMs: t0 })
    assert.equal(calls, 1)
    const res = await membership.ensureMembershipStatus({
      nowMs: t0 + 60 * 1000
    })
    assert.equal(calls, 1)
    assert.equal(res.isMember, false)
    assert.equal(membership.getMembershipLite().isMember, false)
  })

  it('refetches when soft TTL expired', async () => {
    const membership = loadWithStatus({
      ok: true,
      isMember: true,
      expiresAt: '2027-01-18T00:00:00.000Z',
      expiresLabel: '2027-01-18'
    })
    const t0 = Date.parse('2026-11-20T12:00:00.000Z')
    await membership.ensureMembershipStatus({ nowMs: t0 })
    assert.equal(calls, 1)
    await membership.ensureMembershipStatus({
      nowMs: t0 + membership.MEMBERSHIP_SOFT_TTL_MS + 1
    })
    assert.equal(calls, 2)
  })

  it('force bypasses soft TTL', async () => {
    const membership = loadWithStatus({
      ok: true,
      isMember: false,
      expiresAt: null
    })
    const t0 = Date.parse('2026-11-20T12:00:00.000Z')
    await membership.ensureMembershipStatus({ nowMs: t0 })
    await membership.ensureMembershipStatus({ nowMs: t0 + 1000, force: true })
    assert.equal(calls, 2)
  })

  it('dedupes concurrent ensure calls into one getStatus', async () => {
    let resolveCloud
    installWxStorage()
    const membership = loadMembership(() => {
      calls = (calls || 0) + 1
      return new Promise((resolve) => {
        resolveCloud = resolve
      })
    })
    calls = 0
    const p1 = membership.ensureMembershipStatus({ force: true })
    const p2 = membership.ensureMembershipStatus({ force: true })
    assert.equal(calls, 1)
    resolveCloud({
      ok: true,
      isMember: true,
      expiresAt: '2027-01-18T00:00:00.000Z',
      expiresLabel: '2027-01-18'
    })
    const [a, b] = await Promise.all([p1, p2])
    assert.equal(calls, 1)
    assert.equal(a.isMember, true)
    assert.equal(b.isMember, true)
  })
})
