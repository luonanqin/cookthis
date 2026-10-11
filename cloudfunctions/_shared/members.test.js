'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeAgeBand,
  ageBandToTier,
  computeHouseholdCounts,
  summarizeHousehold,
  expandMealDiners,
  dinerSoftPenalty
} = require('./members.js')

describe('normalizeAgeBand', () => {
  it('keeps five canonical bands', () => {
    assert.equal(normalizeAgeBand('5_15'), '5_15')
    assert.equal(normalizeAgeBand('16_25'), '16_25')
    assert.equal(normalizeAgeBand('26_40'), '26_40')
    assert.equal(normalizeAgeBand('41_59'), '41_59')
    assert.equal(normalizeAgeBand('60_plus'), '60_plus')
  })

  it('maps legacy bands', () => {
    assert.equal(normalizeAgeBand('6_15'), '5_15')
    assert.equal(normalizeAgeBand('41_60'), '41_59')
  })

  it('drops preschool', () => {
    assert.equal(normalizeAgeBand('0_2'), null)
    assert.equal(normalizeAgeBand('3_5'), null)
  })
})

describe('ageBandToTier / household', () => {
  it('maps small/adult/elder', () => {
    assert.equal(ageBandToTier('5_15'), 'child')
    assert.equal(ageBandToTier('26_40'), 'adult')
    assert.equal(ageBandToTier('60_plus'), 'elder')
  })

  it('counts household and builds summary label', () => {
    const members = [
      { ageBand: '26_40', sort: 0 },
      { ageBand: '5_15', sort: 1 },
      { ageBand: '60_plus', sort: 2 },
      { ageBand: '41_59', sort: 3 }
    ]
    assert.deepEqual(computeHouseholdCounts(members), {
      adult: 2,
      child: 1,
      elder: 1
    })
    const s = summarizeHousehold(members)
    assert.equal(s.total, 4)
    assert.equal(s.label, '共4人 · 2大 1小 1老')
  })
})

describe('expandMealDiners', () => {
  const members = [
    { memberId: 'a', ageBand: '26_40', taste: 'normal', avoids: [], sort: 0 },
    { memberId: 'b', ageBand: '5_15', taste: 'light', avoids: ['peanut'], sort: 1 },
    { memberId: 'c', ageBand: '60_plus', taste: 'light', avoids: [], sort: 2 }
  ]

  it('starts from members when no guests / omit', () => {
    const diners = expandMealDiners(members, { mealType: 'daily' })
    assert.equal(diners.length, 3)
    assert.equal(diners[1].avoids[0], 'peanut')
  })

  it('expands guestCounts with tier defaults', () => {
    const diners = expandMealDiners(members, {
      mealType: 'daily',
      guestCounts: { adult: 1, child: 1, elder: 0 }
    })
    assert.equal(diners.length, 5)
    const guests = diners.filter((d) => d.guest)
    assert.equal(guests.length, 2)
    assert.deepEqual(
      guests.find((g) => g.tier === 'adult'),
      {
        ageBand: '26_40',
        taste: 'normal',
        avoids: [],
        guest: true,
        tier: 'adult'
      }
    )
    assert.deepEqual(
      guests.find((g) => g.tier === 'child'),
      {
        ageBand: '5_15',
        taste: 'light',
        avoids: [],
        guest: true,
        tier: 'child'
      }
    )
  })

  it('omits archive members from tier tail when effective below household', () => {
    // household child=1; omit that child (effective child 0) without guests
    const diners = expandMealDiners(members, {
      mealType: 'daily',
      guestCounts: { adult: 0, child: 0, elder: 0 },
      omitCounts: { adult: 0, child: 1, elder: 0 }
    })
    assert.equal(diners.length, 2)
    assert.ok(!diners.some((d) => d.memberId === 'b'))
  })

  it('non-daily expands only partyCounts with tier defaults (ignores members)', () => {
    const diners = expandMealDiners(members, {
      mealType: 'family_party',
      partyCounts: { adult: 2, child: 1, elder: 0 }
    })
    assert.equal(diners.length, 3)
    assert.ok(diners.every((d) => d.guest === true || d.party === true))
    assert.ok(!diners.some((d) => d.avoids && d.avoids.length))
    assert.ok(!diners.some((d) => d.memberId === 'b'))
    const child = diners.find((d) => d.tier === 'child')
    assert.deepEqual(
      { ageBand: child.ageBand, taste: child.taste, avoids: child.avoids },
      { ageBand: '5_15', taste: 'light', avoids: [] }
    )
  })

  it('non-daily empty partyCounts yields empty diners (no household fallback)', () => {
    const diners = expandMealDiners(members, {
      mealType: 'friends_party',
      partyCounts: { adult: 0, child: 0, elder: 0 }
    })
    assert.equal(diners.length, 0)
  })
})

describe('dinerSoftPenalty', () => {
  const ingredientsByName = {
    猪肉: { avoidTags: ['pork'] },
    青菜: { avoidTags: [] },
    辣椒: { avoidTags: [] }
  }

  it('adds +40 once when any diner avoid hits', () => {
    const recipe = {
      id: 'r1',
      mainIngredients: ['猪肉'],
      seasonings: [],
      taste: 'normal'
    }
    const diners = [
      { ageBand: '26_40', taste: 'normal', avoids: ['pork'] },
      { ageBand: '26_40', taste: 'normal', avoids: ['pork'] }
    ]
    assert.equal(dinerSoftPenalty(recipe, diners, ingredientsByName), 40)
  })

  it('adds +15 when child/elder and spicy/heavy', () => {
    const recipe = {
      id: 'r2',
      mainIngredients: ['青菜'],
      seasonings: [],
      taste: 'spicy'
    }
    // taste normal → 不叠多数口味冲突 +10
    const diners = [{ ageBand: '5_15', taste: 'normal', avoids: [] }]
    assert.equal(dinerSoftPenalty(recipe, diners, ingredientsByName), 15)
  })

  it('adds +10 when majority taste conflicts with spicy/heavy', () => {
    const recipe = {
      id: 'r3',
      mainIngredients: ['青菜'],
      seasonings: [],
      taste: 'heavy'
    }
    const diners = [
      { ageBand: '26_40', taste: 'light', avoids: [] },
      { ageBand: '26_40', taste: 'light', avoids: [] },
      { ageBand: '26_40', taste: 'normal', avoids: [] }
    ]
    // majority light vs heavy → +10; no child/elder → no +15
    assert.equal(dinerSoftPenalty(recipe, diners, ingredientsByName), 10)
  })

  it('stacks avoid + child/elder + taste when all apply', () => {
    const recipe = {
      id: 'r4',
      mainIngredients: ['猪肉'],
      seasonings: [],
      taste: 'spicy'
    }
    const diners = [
      { ageBand: '60_plus', taste: 'light', avoids: ['pork'] },
      { ageBand: '5_15', taste: 'light', avoids: [] }
    ]
    // +40 avoid, +15 child/elder spicy, +10 majority light vs spicy
    assert.equal(dinerSoftPenalty(recipe, diners, ingredientsByName), 65)
  })
})
