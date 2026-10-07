'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildUnconventionalPlan,
  mergePlansWithUnconventional
} = require('./unconventionalPlans.js')

const recipes = [
  {
    id: 'rcp_hotpot_base',
    name: '清汤锅底',
    mainIngredients: ['白菜'],
    seasonings: [],
    meatVeg: 'soup',
    dishForms: ['hotpot'],
    enabled: true
  },
  {
    id: 'rcp_hotpot_meat',
    name: '涮羊肉',
    mainIngredients: ['羊肉'],
    seasonings: [],
    meatVeg: 'meat',
    dishForms: ['hotpot'],
    enabled: true
  },
  {
    id: 'rcp_noodle',
    name: '西红柿鸡蛋面',
    mainIngredients: ['鸡蛋', '番茄'],
    seasonings: [],
    meatVeg: 'meat',
    dishForms: ['noodle'],
    enabled: true
  },
  {
    id: 'rcp_home_meat',
    name: '土豆烧肉',
    mainIngredients: ['猪肉', '土豆'],
    seasonings: [],
    meatVeg: 'meat',
    dishForms: ['braise'],
    enabled: true
  }
]

const slots = [{ meal: 'dinner', label: '晚饭' }]

describe('buildUnconventionalPlan', () => {
  it('returns null when no prefer prefs', () => {
    const out = buildUnconventionalPlan({
      recipes,
      selectedNames: ['白菜', '羊肉'],
      dishFormPrefs: {},
      mealSlots: slots
    })
    assert.equal(out, null)
  })

  it('builds hotpot when preferred and candidates exist', () => {
    const out = buildUnconventionalPlan({
      recipes,
      selectedNames: ['白菜', '羊肉'],
      dishFormPrefs: { hotpot: 'prefer' },
      mealSlots: slots,
      familyAvoids: []
    })
    assert.ok(out)
    assert.equal(out.planKind, 'hotpot')
    assert.equal(out.meals.length, 1)
    const ids = out.meals[0].dishes.map((d) => d.recipeId)
    assert.ok(ids.includes('rcp_hotpot_base'))
    assert.ok(ids.includes('rcp_hotpot_meat'))
  })

  it('skips avoid tags and returns null if cannot fill', () => {
    const out = buildUnconventionalPlan({
      recipes,
      selectedNames: ['白菜', '羊肉'],
      dishFormPrefs: { hotpot: 'avoid', noodle: 'prefer' },
      mealSlots: slots
    })
    // noodle needs 鸡蛋 番茄 — not selected
    assert.equal(out, null)
  })

  it('builds noodle when preferred and toppings selected', () => {
    const out = buildUnconventionalPlan({
      recipes,
      selectedNames: ['鸡蛋', '番茄'],
      dishFormPrefs: { noodle: 'prefer' },
      mealSlots: slots
    })
    assert.ok(out)
    assert.equal(out.planKind, 'noodle')
    assert.equal(out.meals[0].dishes[0].recipeId, 'rcp_noodle')
  })
})

describe('mergePlansWithUnconventional', () => {
  it('appends unconventional when under maxPlans', () => {
    const home = [{ planIndex: 0, planKind: 'home', meals: [] }]
    const unc = { planKind: 'hotpot', meals: [{ slot: slots[0], dishes: [] }] }
    const merged = mergePlansWithUnconventional(home, unc, 3)
    assert.equal(merged.length, 2)
    assert.equal(merged[1].planKind, 'hotpot')
    assert.equal(merged[1].planIndex, 1)
  })

  it('replaces last home plan when already at max', () => {
    const home = [
      { planIndex: 0, planKind: 'home', meals: [] },
      { planIndex: 1, planKind: 'home', meals: [] },
      { planIndex: 2, planKind: 'home', meals: [] }
    ]
    const unc = { planKind: 'noodle', meals: [] }
    const merged = mergePlansWithUnconventional(home, unc, 3)
    assert.equal(merged.length, 3)
    assert.equal(merged[2].planKind, 'noodle')
  })
})
