const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildHomePlans,
  dishKey,
  planDishCount,
  overlapLimit,
  countSharedDishes,
  withinHomeOverlapCaps,
  normalizeDishName,
  recipeMainSignature,
  nearDishNameKey
} = require('./homePlans.js')

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

  it('excludes noodle/dumpling from home combo filling', () => {
    const withNoodle = recipes.concat([
      {
        id: 'rcp_tomato_egg_noodle',
        name: '西红柿鸡蛋面',
        mainIngredients: ['猪肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        dishForms: ['noodle'],
        stapleForms: ['noodle'],
        cities: [],
        enabled: true
      }
    ])
    const result = buildHomePlans({
      recipes: withNoodle,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: [],
      // force noodle to be preferred meat if it were allowed
      downrankedIds: ['rcp_potato_pork']
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_potato_pork')
    const names = result.plans[0].meals[0].dishes.map((d) => d.name)
    assert.ok(!names.includes('西红柿鸡蛋面'))
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

  it('soft-downranks meat that hits memberAvoids when another meat exists', () => {
    const withAltMeat = recipes.concat([
      {
        id: 'rcp_tomato_egg_meat_alt',
        name: '番茄炒蛋荤替',
        mainIngredients: ['猪肉', '番茄'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_beef_potato',
        name: '土豆炖牛腩',
        mainIngredients: ['牛肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const ingredients = {
      ...ingredientsByName,
      番茄: { avoidTags: [] },
      牛肉: { avoidTags: [] }
    }
    // pork hits memberAvoids → prefer beef
    const result = buildHomePlans({
      recipes: withAltMeat,
      ingredientsByName: ingredients,
      selectedNames: selectedNames.concat(['番茄', '牛肉']),
      scene: baseScene,
      familyAvoids: [],
      memberAvoids: ['pork']
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_beef_potato')
  })

  it('soft-downranks meat with recent ingredient overlap (tiered freshPenalty)', () => {
    const withAltMeat = recipes.concat([
      {
        id: 'rcp_beef_potato',
        name: '土豆炖牛腩',
        mainIngredients: ['牛肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const ingredients = {
      ...ingredientsByName,
      牛肉: { avoidTags: [] }
    }
    // 昨天猪肉：土豆烧肉 fresh≈24；牛腩仅土豆≈4 → 优先牛腩
    const result = buildHomePlans({
      recipes: withAltMeat,
      ingredientsByName: ingredients,
      selectedNames: selectedNames.concat(['牛肉']),
      scene: baseScene,
      familyAvoids: [],
      recentIngredientDays: { 猪肉: 0, 土豆: 0 }
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_beef_potato')
  })

  it('freshPenalty prefers non-overlapping meat over yesterday pork dish', () => {
    const withAlt = recipes.concat([
      {
        id: 'rcp_pepper_pork',
        name: '青椒炒肉',
        mainIngredients: ['猪肉', '青椒'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_beef_only',
        name: '红烧牛肉',
        mainIngredients: ['牛肉'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const ingredients = {
      ...ingredientsByName,
      青椒: { avoidTags: [] },
      牛肉: { avoidTags: [] }
    }
    const result = buildHomePlans({
      recipes: withAlt,
      ingredientsByName: ingredients,
      selectedNames: selectedNames.concat(['青椒', '牛肉']),
      scene: baseScene,
      familyAvoids: [],
      recentIngredientDays: { 猪肉: 0, 土豆: 0 },
      // 排除原土豆烧肉，只比青椒炒肉 vs 红烧牛肉
      excludedDishIds: ['rcp_potato_pork']
    })
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.equal(meatId, 'rcp_beef_only')
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

  it('same sessionSeed yields identical plans; different seeds can vary when pool is large', () => {
    const meats = []
    for (let i = 0; i < 4; i++) {
      meats.push({
        id: 'rcp_meat_' + i,
        name: '荤菜' + i,
        mainIngredients: ['猪肉'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      })
    }
    const pool = recipes.concat(meats)
    const fp = (r) =>
      r.plans
        .map((p) =>
          p.meals
            .map((m) => m.dishes.map((d) => d.recipeId).join(','))
            .join('|')
        )
        .join(';')
    const a = buildHomePlans({
      recipes: pool,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: [],
      sessionSeed: 'req_aaa'
    })
    const a2 = buildHomePlans({
      recipes: pool,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: [],
      sessionSeed: 'req_aaa'
    })
    assert.equal(fp(a), fp(a2))
    const fps = new Set()
    for (let i = 0; i < 12; i++) {
      const r = buildHomePlans({
        recipes: pool,
        ingredientsByName,
        selectedNames,
        scene: baseScene,
        familyAvoids: [],
        sessionSeed: 'req_var_' + i
      })
      fps.add(fp(r))
    }
    assert.ok(fps.size >= 2, 'expected diversity across seeds, got ' + fps.size)
  })

  it('keeps lower softPenalty ahead of high-penalty band after diversity rotate', () => {
    const pool = recipes.concat([
      {
        id: 'rcp_meat_fresh',
        name: '清炒肉片',
        mainIngredients: ['猪肉'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_meat_down',
        name: '降权肉',
        mainIngredients: ['猪肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      }
    ])
    const result = buildHomePlans({
      recipes: pool,
      ingredientsByName,
      selectedNames,
      scene: baseScene,
      familyAvoids: [],
      downrankedIds: ['rcp_meat_down'],
      sessionSeed: 'req_rotate_hard'
    })
    assert.ok(result.plans.length >= 1)
    const meatId = result.plans[0].meals[0].dishes.find((d) => d.meatVeg === 'meat').recipeId
    assert.notEqual(meatId, 'rcp_meat_down')
  })

  it('avoids repeating same main ingredient across dishes in one plan when alternatives exist', () => {
    const pool = [
      {
        id: 'rcp_beef_potato',
        name: '牛肉炖土豆',
        mainIngredients: ['牛肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_pepper_pork',
        name: '青椒炒肉',
        mainIngredients: ['猪肉', '青椒'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_potato_silk',
        name: '醋溜土豆丝',
        mainIngredients: ['土豆'],
        seasonings: ['盐', '醋'],
        meatVeg: 'veg',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_greens',
        name: '蒜蓉小白菜',
        mainIngredients: ['小白菜'],
        seasonings: ['盐'],
        meatVeg: 'veg',
        cities: [],
        enabled: true
      },
      {
        id: 'rcp_egg_soup',
        name: '蛋花汤',
        mainIngredients: ['鸡蛋'],
        seasonings: ['盐'],
        meatVeg: 'soup',
        cities: [],
        enabled: true
      }
    ]
    const ingredients = {
      牛肉: { avoidTags: [] },
      土豆: { avoidTags: [] },
      猪肉: { avoidTags: ['pork'] },
      青椒: { avoidTags: [] },
      小白菜: { avoidTags: [] },
      鸡蛋: { avoidTags: [] },
      盐: { avoidTags: [] },
      醋: { avoidTags: [] }
    }
    const result = buildHomePlans({
      recipes: pool,
      ingredientsByName: ingredients,
      selectedNames: ['牛肉', '土豆', '猪肉', '青椒', '小白菜', '鸡蛋'],
      scene: {
        combo: { meat: 1, veg: 1, soup: 1 },
        mealSlots: [{ meal: 'dinner', label: '本场' }],
        mealType: 'family_party'
      },
      familyAvoids: [],
      sessionSeed: 'req_diverse_mains'
    })
    assert.ok(result.plans.length >= 1)
    for (const plan of result.plans) {
      const dishes = plan.meals[0].dishes
      const meat = dishes.find((d) => d.meatVeg === 'meat')
      const veg = dishes.find((d) => d.meatVeg === 'veg')
      if (meat.recipeId === 'rcp_beef_potato') {
        assert.equal(veg.recipeId, 'rcp_greens')
      }
      const potatoCount = dishes
        .flatMap((d) => d.mainIngredients || [])
        .filter((n) => n === '土豆').length
      assert.ok(
        potatoCount <= 1,
        '同方案土豆主料出现次数应 ≤1，实际 ' + potatoCount + ' @plan ' + plan.planIndex
      )
    }
  })
})

describe('home plan overlap caps (3.0.6)', () => {
  it('overlapLimit uses the larger dish count of the pair', () => {
    assert.equal(overlapLimit(4, 4), 0)
    assert.equal(overlapLimit(3, 4), 0)
    assert.equal(overlapLimit(5, 5), 1)
    assert.equal(overlapLimit(7, 3), 1)
    assert.equal(overlapLimit(8, 8), 2)
    assert.equal(overlapLimit(10, 6), 2)
  })

  it('countSharedDishes prefers recipeId and falls back to normalized name', () => {
    const a = [
      {
        dishes: [
          { recipeId: 'r1', name: '青椒炒肉' },
          { recipeId: '', name: '蒜 蓉 青菜' },
          { recipeId: 'r3', name: '蛋花汤' }
        ]
      }
    ]
    const b = [
      {
        dishes: [
          { recipeId: 'r1', name: '别名' },
          { recipeId: 'r9', name: '蒜蓉青菜' },
          { recipeId: 'r8', name: '番茄蛋汤' }
        ]
      }
    ]
    assert.equal(dishKey({ recipeId: 'r1', name: 'x' }), 'id:r1')
    assert.equal(dishKey({ name: '蒜 蓉 青菜' }), 'name:蒜蓉青菜')
    assert.equal(countSharedDishes(a, b), 2)
    assert.equal(planDishCount(a), 3)
  })

  it('withinHomeOverlapCaps rejects pairs over the table limit', () => {
    function mealsFromIds(ids) {
      return [{ dishes: ids.map((id) => ({ recipeId: id, name: id })) }]
    }
    // 6 vs 6 → max 1
    assert.equal(
      withinHomeOverlapCaps(mealsFromIds(['a', 'b', 'c', 'd', 'e', 'f']), [
        { meals: mealsFromIds(['a', 'x', 'y', 'z', 'w', 'v']) }
      ]),
      true
    )
    assert.equal(
      withinHomeOverlapCaps(mealsFromIds(['a', 'b', 'c', 'd', 'e', 'f']), [
        { meals: mealsFromIds(['a', 'b', 'y', 'z', 'w', 'v']) }
      ]),
      false
    )
    // 10 vs 6 → max 2 (use larger count)
    assert.equal(
      withinHomeOverlapCaps(
        mealsFromIds(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
        [{ meals: mealsFromIds(['a', 'b', 'x', 'y', 'z', 'w']) }]
      ),
      true
    )
    assert.equal(
      withinHomeOverlapCaps(
        mealsFromIds(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
        [{ meals: mealsFromIds(['a', 'b', 'c', 'y', 'z', 'w']) }]
      ),
      false
    )
  })

  function poolForCombo(meatN, vegN, soupN) {
    const list = []
    const names = new Set(['盐'])
    const ingredients = { 盐: { avoidTags: [] } }
    for (let i = 0; i < meatN; i++) {
      const side = '肉配' + i
      names.add('猪肉')
      names.add(side)
      ingredients['猪肉'] = { avoidTags: ['pork'] }
      ingredients[side] = { avoidTags: [] }
      list.push({
        id: 'm' + i,
        name: '荤菜' + i,
        mainIngredients: ['猪肉', side],
        seasonings: ['盐'],
        meatVeg: 'meat',
        cities: [],
        enabled: true
      })
    }
    for (let i = 0; i < vegN; i++) {
      const veg = '素菜料' + i
      names.add(veg)
      ingredients[veg] = { avoidTags: [] }
      list.push({
        id: 'v' + i,
        name: '素菜' + i,
        mainIngredients: [veg],
        seasonings: ['盐'],
        meatVeg: 'veg',
        cities: [],
        enabled: true
      })
    }
    for (let i = 0; i < soupN; i++) {
      const soup = '汤料' + i
      names.add(soup)
      ingredients[soup] = { avoidTags: [] }
      list.push({
        id: 's' + i,
        name: '汤' + i,
        mainIngredients: [soup],
        seasonings: ['盐'],
        meatVeg: 'soup',
        cities: [],
        enabled: true
      })
    }
    return { list, selectedNames: [...names], ingredients }
  }

  function sharedBetween(a, b) {
    return countSharedDishes(a.meals, b.meals)
  }

  it('large combo (≥8 dishes): pairwise home overlap ≤ 2 when pool is large', () => {
    const { list, selectedNames: names, ingredients } = poolForCombo(12, 10, 4)
    const result = buildHomePlans({
      recipes: list,
      ingredientsByName: ingredients,
      selectedNames: names,
      scene: {
        combo: { meat: 5, veg: 4, soup: 1 },
        mealSlots: [{ meal: 'dinner', label: '本场' }],
        mealType: 'family_party'
      },
      familyAvoids: [],
      maxPlans: 3,
      sessionSeed: 'req_overlap_large'
    })
    assert.ok(result.plans.length >= 2, 'expected ≥2 home plans, got ' + result.plans.length)
    for (let i = 0; i < result.plans.length; i++) {
      assert.equal(planDishCount(result.plans[i].meals), 10)
      for (let j = i + 1; j < result.plans.length; j++) {
        const shared = sharedBetween(result.plans[i], result.plans[j])
        assert.ok(
          shared <= 2,
          `plans ${i},${j} shared ${shared} > 2`
        )
      }
    }
  })

  it('medium combo (5–7 dishes): pairwise home overlap ≤ 1 when pool is large', () => {
    const { list, selectedNames: names, ingredients } = poolForCombo(8, 6, 3)
    const result = buildHomePlans({
      recipes: list,
      ingredientsByName: ingredients,
      selectedNames: names,
      scene: {
        combo: { meat: 2, veg: 2, soup: 1 },
        mealSlots: [{ meal: 'dinner', label: '本场' }],
        mealType: 'family_party'
      },
      familyAvoids: [],
      maxPlans: 3,
      sessionSeed: 'req_overlap_mid'
    })
    assert.ok(result.plans.length >= 2, 'expected ≥2 home plans, got ' + result.plans.length)
    for (let i = 0; i < result.plans.length; i++) {
      assert.equal(planDishCount(result.plans[i].meals), 5)
      for (let j = i + 1; j < result.plans.length; j++) {
        const shared = sharedBetween(result.plans[i], result.plans[j])
        assert.ok(shared <= 1, `plans ${i},${j} shared ${shared} > 1`)
      }
    }
  })

  it('tiny pool still returns at least one plan (does not empty for overlap cap)', () => {
    const { list, selectedNames: names, ingredients } = poolForCombo(5, 4, 1)
    const result = buildHomePlans({
      recipes: list,
      ingredientsByName: ingredients,
      selectedNames: names,
      scene: {
        combo: { meat: 5, veg: 4, soup: 1 },
        mealSlots: [{ meal: 'dinner', label: '本场' }],
        mealType: 'family_party'
      },
      familyAvoids: [],
      maxPlans: 3,
      sessionSeed: 'req_overlap_tiny'
    })
    assert.equal(result.plans.length, 1)
    assert.ok(!result.emptyReason)
  })

  it('small combo (<5 dishes): pairwise home overlap must be 0 when pool allows', () => {
    const { list, selectedNames: names, ingredients } = poolForCombo(6, 4, 3)
    const result = buildHomePlans({
      recipes: list,
      ingredientsByName: ingredients,
      selectedNames: names,
      scene: {
        combo: { meat: 1, veg: 1, soup: 1 },
        mealSlots: [{ meal: 'dinner', label: '晚饭' }],
        mealType: 'daily'
      },
      familyAvoids: [],
      maxPlans: 3,
      sessionSeed: 'req_overlap_small'
    })
    assert.ok(result.plans.length >= 2, 'expected ≥2 home plans, got ' + result.plans.length)
    for (let i = 0; i < result.plans.length; i++) {
      assert.equal(planDishCount(result.plans[i].meals), 3)
      for (let j = i + 1; j < result.plans.length; j++) {
        const shared = sharedBetween(result.plans[i], result.plans[j])
        assert.equal(shared, 0, `plans ${i},${j} shared ${shared}, want 0`)
      }
    }
  })
})

describe('within-plan dedupe helpers (3.0.7)', () => {
  it('normalizeDishName strips whitespace', () => {
    assert.equal(normalizeDishName('辣 子 鸡'), '辣子鸡')
  })

  it('recipeMainSignature is order-insensitive and ignores seasonings', () => {
    const a = recipeMainSignature({
      mainIngredients: ['牛肉', '土豆'],
      seasonings: ['盐']
    })
    const b = recipeMainSignature({
      mainIngredients: ['土豆', '牛肉'],
      seasonings: ['生抽']
    })
    assert.equal(a, b)
    assert.ok(a.includes('土豆') || a.length > 0)
  })

  it('recipeMainSignature differs when one extra main', () => {
    const a = recipeMainSignature({ mainIngredients: ['牛肉', '土豆'] })
    const b = recipeMainSignature({ mainIngredients: ['牛肉', '土豆', '青椒'] })
    assert.notEqual(a, b)
  })

  it('nearDishNameKey strips cook verbs; 烧 vs 炖 collide', () => {
    assert.equal(nearDishNameKey('土豆烧牛肉'), nearDishNameKey('土豆炖牛肉'))
  })

  it('nearDishNameKey strips 红烧 before 烧', () => {
    assert.equal(nearDishNameKey('红烧牛肉'), '牛肉')
  })
})
