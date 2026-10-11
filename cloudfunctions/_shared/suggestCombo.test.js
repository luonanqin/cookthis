const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  suggestComboByPeople,
  suggestPartyCombo,
  partyExtraFromSeed
} = require('./suggestCombo.js')

describe('suggestComboByPeople', () => {
  it('maps table: meat=max(1,floor(n/2)), veg/soup by tier', () => {
    assert.deepEqual(suggestComboByPeople(1), { meat: 1, veg: 1, soup: 0 })
    assert.deepEqual(suggestComboByPeople(2), { meat: 1, veg: 1, soup: 1 })
    assert.deepEqual(suggestComboByPeople(3), { meat: 1, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(4), { meat: 2, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(5), { meat: 2, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(6), { meat: 3, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(7), { meat: 3, veg: 3, soup: 1 })
    assert.deepEqual(suggestComboByPeople(8), { meat: 4, veg: 3, soup: 1 })
  })
  it('invalid n returns null', () => {
    assert.equal(suggestComboByPeople(0), null)
    assert.equal(suggestComboByPeople(-1), null)
  })
})

describe('suggestPartyCombo', () => {
  it('with child: total=n, meat=floor(n/2) without +1', () => {
    assert.deepEqual(
      suggestPartyCombo({ adult: 2, child: 2, elder: 0 }, 'seed_a'),
      { meat: 2, veg: 1, soup: 1 }
    )
    assert.deepEqual(
      suggestPartyCombo({ adult: 3, child: 2, elder: 1 }, 'seed_b'),
      { meat: 3, veg: 2, soup: 1 }
    )
  })

  it('no child: meat+=1; total=n+extra; soup by n; veg>=1', () => {
    const seed = 'seed_party_extra'
    const extra = partyExtraFromSeed(seed)
    assert.ok(extra === 1 || extra === 2)
    const c = suggestPartyCombo({ adult: 4, child: 0, elder: 0 }, seed)
    assert.equal(c.meat, 3)
    assert.equal(c.soup, 1)
    assert.ok(c.veg >= 1)
    assert.equal(c.meat + c.veg + c.soup, 4 + extra)
  })

  it('n=2 no child: bumps until veg>=1 when needed', () => {
    const c = suggestPartyCombo({ adult: 2, child: 0, elder: 0 }, 'bump_seed')
    assert.equal(c.meat, 2)
    assert.equal(c.soup, 1)
    assert.ok(c.veg >= 1)
  })

  it('n=1 with child: soup=0 and at least 1 veg', () => {
    assert.deepEqual(
      suggestPartyCombo({ adult: 0, child: 1, elder: 0 }, 's'),
      { meat: 1, veg: 1, soup: 0 }
    )
  })

  it('same seed stable', () => {
    const a = suggestPartyCombo({ adult: 5, child: 0, elder: 0 }, 'req_same')
    const b = suggestPartyCombo({ adult: 5, child: 0, elder: 0 }, 'req_same')
    assert.deepEqual(a, b)
  })

  it('invalid empty counts returns null', () => {
    assert.equal(suggestPartyCombo({ adult: 0, child: 0, elder: 0 }, 's'), null)
    assert.equal(suggestPartyCombo(null, 's'), null)
  })
})
