'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  loadTitleCleanMap,
  loadDishIngredients,
  patchCategoryCleanedDoc,
  loadOver6AllowTitles,
  dropLongTitlesNotInOver6,
  splitMainsAndSeasonings,
  tasteTagsFromDish,
  inferMeatVegAndForms,
  buildRecipeFromDish,
  dedupeDishesByIngredientCount,
  mergeIntoBuiltin
} = require('../lib/mergeXiachufangDishes')

describe('loadTitleCleanMap', () => {
  it('maps original title to cleaned title', () => {
    const text = [
      '# comment',
      '17\t3972\t鸡翅\t妈妈家的味道吃了停不下来的红烧鸡翅\t红烧鸡翅'
    ].join('\n')
    const map = loadTitleCleanMap(text)
    assert.equal(map.get('妈妈家的味道吃了停不下来的红烧鸡翅'), '红烧鸡翅')
  })
})

describe('loadDishIngredients', () => {
  it('parses name, ingredients, taste', () => {
    const text = [
      '# hdr',
      '蒜蓉西兰花\t大蒜、西兰花\t正常口味',
      '爆炒花甲\t花甲、青椒\t重口味'
    ].join('\n')
    const map = loadDishIngredients(text)
    assert.deepEqual(map.get('蒜蓉西兰花'), {
      ingredients: ['大蒜', '西兰花'],
      taste: '正常口味'
    })
  })
})

describe('patchCategoryCleanedDoc', () => {
  it('renames titles and fills full ingredients under every ingredient key', () => {
    const doc = {
      items: {
        大蒜: {
          recipes: [{ title: '蒜蓉西兰花', count: 1, ingredients: ['大蒜'] }]
        },
        西兰花: {
          recipes: [
            {
              title: '超级好吃的蒜蓉西兰花家常做法',
              count: 2,
              ingredients: ['西兰花']
            }
          ]
        },
        其它: {
          recipes: [{ title: '未知脏名很长很长很长', count: 0, ingredients: ['其它'] }]
        }
      }
    }
    const titleMap = new Map([
      ['超级好吃的蒜蓉西兰花家常做法', '蒜蓉西兰花']
    ])
    const dishes = new Map([
      ['蒜蓉西兰花', { ingredients: ['大蒜', '西兰花'], taste: '正常口味' }]
    ])
    const { doc: out, stats } = patchCategoryCleanedDoc(doc, titleMap, dishes)
    assert.deepEqual(out.items.大蒜.recipes[0].ingredients, ['大蒜', '西兰花'])
    assert.equal(out.items.西兰花.recipes[0].title, '蒜蓉西兰花')
    assert.deepEqual(out.items.西兰花.recipes[0].ingredients, ['大蒜', '西兰花'])
    assert.equal(out.items.其它.recipes[0].title, '未知脏名很长很长很长')
    assert.ok(stats.renamed >= 1)
    assert.ok(stats.ingredientsFilled >= 2)
  })
})

describe('dropLongTitlesNotInOver6', () => {
  it('keeps short titles and allowlisted long titles', () => {
    const doc = {
      items: {
        白菜: {
          recipes: [
            { title: '醋溜白菜', count: 1, ingredients: ['白菜'] },
            { title: '超级好吃的家常醋溜白菜做法大全', count: 2, ingredients: ['白菜'] },
            { title: '荔浦芋头蒸排骨', count: 3, ingredients: ['排骨'] }
          ]
        }
      }
    }
    const allow = new Set(['荔浦芋头蒸排骨'])
    const { stats } = dropLongTitlesNotInOver6(doc, allow)
    assert.equal(stats.removed, 1)
    assert.equal(doc.items.白菜.recipes.length, 2)
    assert.deepEqual(
      doc.items.白菜.recipes.map((r) => r.title),
      ['醋溜白菜', '荔浦芋头蒸排骨']
    )
  })
})

describe('splitMainsAndSeasonings', () => {
  it('puts 调味 names into seasonings', () => {
    const { mainIngredients, seasonings } = splitMainsAndSeasonings(
      ['猪肉', '老抽', '生姜'],
      new Set(['老抽', '生姜'])
    )
    assert.deepEqual(mainIngredients, ['猪肉'])
    assert.deepEqual(seasonings, ['老抽', '生姜'])
  })
})

describe('tasteTagsFromDish', () => {
  it('maps Chinese taste and adds spicy when name has 辣', () => {
    assert.deepEqual(tasteTagsFromDish('清炒菠菜', '清淡'), ['light'])
    assert.deepEqual(tasteTagsFromDish('爆炒花甲', '重口味'), ['heavy'])
    assert.deepEqual(tasteTagsFromDish('香辣鸡翅', '重口味'), ['heavy', 'spicy'])
    assert.deepEqual(tasteTagsFromDish('番茄炒蛋', '正常口味'), ['normal'])
  })
})

describe('inferMeatVegAndForms', () => {
  it('detects soup / steam / stir_fry', () => {
    const meatNames = new Set(['猪肉', '鲈鱼', '鸡蛋'])
    assert.equal(
      inferMeatVegAndForms('番茄蛋汤', ['番茄', '鸡蛋'], { meatNames }).meatVeg,
      'soup'
    )
    assert.equal(
      inferMeatVegAndForms('清蒸鲈鱼', ['鲈鱼'], { meatNames }).dishForms[0],
      'steam'
    )
    assert.equal(
      inferMeatVegAndForms('青椒炒肉', ['猪肉', '青椒'], { meatNames }).meatVeg,
      'meat'
    )
  })
})

describe('dedupeDishesByIngredientCount', () => {
  it('keeps the dish with more ingredients', () => {
    const rows = [
      { name: '蒜蓉西兰花', ingredients: ['西兰花'], taste: '正常口味' },
      { name: '蒜蓉西兰花', ingredients: ['大蒜', '西兰花'], taste: '正常口味' }
    ]
    const out = dedupeDishesByIngredientCount(rows)
    assert.equal(out.length, 1)
    assert.deepEqual(out[0].ingredients, ['大蒜', '西兰花'])
  })
})

describe('mergeIntoBuiltin', () => {
  it('updates same name keeping id, appends new, leaves unmatched old', () => {
    const builtin = [
      {
        id: 'rcp_old_broccoli',
        name: '蒜蓉西兰花',
        mainIngredients: ['西兰花'],
        seasonings: ['盐'],
        meatVeg: 'veg',
        tasteTags: ['normal'],
        dishForms: ['stir_fry'],
        stapleForms: ['rice'],
        cities: [],
        minutes: 10,
        servings: 2,
        enabled: true
      },
      {
        id: 'rcp_keep',
        name: '土豆烧肉',
        mainIngredients: ['猪肉', '土豆'],
        seasonings: ['盐'],
        meatVeg: 'meat',
        tasteTags: ['normal'],
        dishForms: ['braise'],
        stapleForms: ['rice'],
        cities: [],
        minutes: 40,
        servings: 3,
        enabled: true
      }
    ]
    const dishes = [
      {
        name: '蒜蓉西兰花',
        ingredients: ['大蒜', '西兰花'],
        taste: '正常口味'
      },
      {
        name: '清蒸鲈鱼',
        ingredients: ['鲈鱼', '香葱'],
        taste: '清淡'
      }
    ]
    const seasoningSet = new Set(['香葱'])
    const meatNames = new Set(['鲈鱼', '猪肉'])
    const knownNames = new Set(['大蒜', '西兰花', '鲈鱼', '香葱', '猪肉', '土豆', '盐'])
    const aliasIndex = {
      canonicalOf(s) {
        return s
      }
    }
    const { recipes, skipped } = mergeIntoBuiltin({
      builtin,
      dishes,
      seasoningSet,
      meatNames,
      knownNames,
      aliasIndex
    })
    assert.equal(skipped.length, 0)
    const broccoli = recipes.find((r) => r.name === '蒜蓉西兰花')
    assert.equal(broccoli.id, 'rcp_old_broccoli')
    assert.deepEqual(broccoli.mainIngredients, ['大蒜', '西兰花'])
    assert.ok(recipes.find((r) => r.name === '土豆烧肉'))
    assert.ok(recipes.find((r) => r.name === '清蒸鲈鱼'))
  })
})

describe('buildRecipeFromDish', () => {
  it('builds a valid-shaped recipe', () => {
    const built = buildRecipeFromDish({
      name: '清蒸鲈鱼',
      ingredients: ['鲈鱼', '香葱'],
      taste: '清淡',
      id: 'rcp_x',
      seasoningSet: new Set(['香葱']),
      meatNames: new Set(['鲈鱼']),
      knownNames: new Set(['鲈鱼', '香葱']),
      aliasIndex: { canonicalOf: (s) => s }
    })
    assert.equal(built.ok, true)
    const r = built.recipe
    assert.equal(r.id, 'rcp_x')
    assert.deepEqual(r.mainIngredients, ['鲈鱼'])
    assert.deepEqual(r.seasonings, ['香葱'])
    assert.deepEqual(r.tasteTags, ['light'])
    assert.equal(r.meatVeg, 'meat')
    assert.ok(r.dishForms.includes('steam'))
  })
})
