const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildHomePlans } = require('./homePlans.js')

const recipes = [
  {
    id: 'rcp_potato_pork',
    name: '土豆烧肉',
    mainIngredients: ['猪肉', '土豆'],
    seasonings: ['盐', '酱油'],
    meatVeg: 'meat',
    cities: [],
    enabled: true
  },
  {
    id: 'rcp_garlic_greens',
    name: '蒜蓉青菜',
    mainIngredients: ['青菜'],
    seasonings: ['盐'],
    meatVeg: 'veg',
    cities: [],
    enabled: true
  },
  {
    id: 'rcp_egg_drop',
    name: '蛋花汤',
    mainIngredients: ['鸡蛋'],
    seasonings: ['盐'],
    meatVeg: 'soup',
    cities: [],
    enabled: true
  }
]

const ingredientsByName = {
  猪肉: { avoidTags: ['pork'] },
  土豆: { avoidTags: [] },
  青菜: { avoidTags: [] },
  鸡蛋: { avoidTags: [] },
  盐: { avoidTags: [] },
  酱油: { avoidTags: [] }
}

const selectedNames = ['猪肉', '土豆', '青菜', '鸡蛋']

const baseScene = {
  combo: { meat: 1, veg: 1, soup: 1 },
  mealSlots: [{ meal: 'dinner', label: '晚饭' }],
  mealType: 'daily'
}

describe('buildHomePlans', () => {
  it('builds one home plan when selected covers meat veg soup', () => {
    const result = buildHomePlans({
      recipes,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: []
    })
    assert.equal(result.plans.length, 1)
    assert.equal(result.plans[0].planKind, 'home')
    assert.equal(result.plans[0].meals.length, 1)
    const dishes = result.plans[0].meals[0].dishes
    assert.equal(dishes.length, 3)
    const byType = Object.fromEntries(dishes.map((d) => [d.meatVeg, d.recipeId]))
    assert.equal(byType.meat, 'rcp_potato_pork')
    assert.equal(byType.veg, 'rcp_garlic_greens')
    assert.equal(byType.soup, 'rcp_egg_drop')
  })

  it('empties plans when familyAvoids includes pork', () => {
    const result = buildHomePlans({
      recipes,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: ['pork']
    })
    assert.deepEqual(result.plans, [])
    assert.equal(result.emptyReason, 'cannot_fill_combo')
  })

  it('accepts Map for ingredientsByName', () => {
    const map = new Map(Object.entries(ingredientsByName))
    const result = buildHomePlans({
      recipes,
      ingredientsByName: map,
      selectedNames,
      scene: baseScene,
      familyAvoids: []
    })
    assert.equal(result.plans.length, 1)
  })

  it('hard-excludes recipes whose name matches recentDishNames', () => {
    const withAltMeat = recipes.concat([
      {
        id: 'rcp_tomato_egg_meat_alt',
        name: '番茄炒蛋荤替',
        mainIngredients: ['猪肉', '番茄'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const ingredients = {
      ...ingredientsByName,
      番茄: { avoidTags: [] }
    }
    const result = buildHomePlans({
      recipes: withAltMeat,
      ingredientsByName: ingredients,
      selectedNames: selectedNames.concat(['番茄']),
      scene: baseScene,
      familyAvoids: [],
      recentDishNames: ['土豆烧肉']
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_tomato_egg_meat_alt')
  })

  it('prefers non-downranked meat when another meat exists', () => {
    const withAltMeat = recipes.concat([
      {
        id: 'rcp_tomato_egg_meat_alt',
        name: '番茄炒蛋荤替',
        mainIngredients: ['猪肉', '番茄'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const ingredients = {
      ...ingredientsByName,
      番茄: { avoidTags: [] }
    }
    const result = buildHomePlans({
      recipes: withAltMeat,
      ingredientsByName: ingredients,
      selectedNames: selectedNames.concat(['番茄']),
      scene: baseScene,
      familyAvoids: [],
      downrankedIds: ['rcp_potato_pork']
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_tomato_egg_meat_alt')
  })
})
