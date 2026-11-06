'use strict'
/**
 * 1) 用 review-titles-over-6 + dish-ingredients 改写 category-results.cleaned
 * 2) 合并进 recipes-builtin（同名覆盖；去重保留食材多的；旧菜保留）
 *
 * 用法：node scripts/merge-xiachufang-dishes-into-recipes.js
 * 之后：node scripts/import-recipes.js
 */
const fs = require('fs')
const path = require('path')
const {
  loadTitleCleanMap,
  loadDishIngredients,
  loadOver6AllowTitles,
  patchCategoryCleanedDoc,
  mergeIntoBuiltin,
  collectMeatNames,
  collectSeasoningSet,
  formatCategoryCleanedCompact
} = require('./lib/mergeXiachufangDishes')
const {
  loadAliases,
  buildAliasIndex
} = require('../cloudfunctions/_shared/aliasMatch')

const ROOT = path.join(__dirname, '..')
const XF = path.join(ROOT, 'data', 'recipes', 'xiachufang')
const CATALOG = path.join(ROOT, 'data', 'catalog')

function main() {
  const over6Text = fs.readFileSync(
    path.join(XF, 'review-titles-over-6.txt'),
    'utf8'
  )
  const titleMap = loadTitleCleanMap(over6Text)
  const over6AllowTitles = loadOver6AllowTitles(over6Text)
  const dishMap = loadDishIngredients(
    fs.readFileSync(path.join(XF, 'dish-ingredients.txt'), 'utf8')
  )
  const cleanedPath = path.join(XF, 'xiachufang-category-results.cleaned.json')
  const cleanedDoc = JSON.parse(fs.readFileSync(cleanedPath, 'utf8'))
  const { doc: patched, stats: patchStats } = patchCategoryCleanedDoc(
    cleanedDoc,
    titleMap,
    dishMap,
    { over6AllowTitles }
  )
  patched.updatedAt = new Date().toISOString()
  fs.writeFileSync(cleanedPath, formatCategoryCleanedCompact(patched))
  console.log('Patched', cleanedPath, patchStats)

  const builtinPath = path.join(CATALOG, 'recipes-builtin.json')
  const builtin = JSON.parse(fs.readFileSync(builtinPath, 'utf8'))
  const ingredients = JSON.parse(
    fs.readFileSync(path.join(CATALOG, 'ingredients-builtin.json'), 'utf8')
  )
  const byCat = JSON.parse(
    fs.readFileSync(path.join(CATALOG, 'ingredients-all-by-category.json'), 'utf8')
  )
  const aliasesRaw = JSON.parse(
    fs.readFileSync(path.join(CATALOG, 'aliases.json'), 'utf8')
  )
  const aliasIndex = buildAliasIndex(loadAliases(aliasesRaw))
  const knownNames = new Set(ingredients.map((r) => r.name).filter(Boolean))
  const seasoningSet = collectSeasoningSet(byCat, ingredients)
  const meatNames = collectMeatNames(byCat)

  const dishes = [...dishMap.entries()].map(([name, v]) => ({
    name,
    ingredients: v.ingredients,
    taste: v.taste
  }))

  const { recipes, skipped } = mergeIntoBuiltin({
    builtin,
    dishes,
    seasoningSet,
    meatNames,
    knownNames,
    aliasIndex
  })

  fs.writeFileSync(builtinPath, JSON.stringify(recipes, null, 2) + '\n')
  console.log(
    'Wrote',
    builtinPath,
    `recipes=${recipes.length} (was ${builtin.length}), skipped=${skipped.length}`
  )
  if (skipped.length) {
    const report = path.join(XF, 'recipes-builtin-skipped.txt')
    const lines = skipped.map(
      (s) => `${s.name}\t${(s.unknown || []).join('、')}`
    )
    fs.writeFileSync(
      report,
      '# 因未知食材未写入 recipes-builtin\n' + lines.join('\n') + '\n'
    )
    console.log('Skipped report:', report)
    console.log('Sample skipped:', skipped.slice(0, 10))
  }
  console.log('Next: node scripts/import-recipes.js')
}

main()
