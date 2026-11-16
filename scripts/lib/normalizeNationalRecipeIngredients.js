'use strict'

const { loadAliases, buildAliasIndex } = require('../../cloudfunctions/_shared/aliasMatch.js')

function isNationalRecipe(row) {
  const cities = row && row.cities
  return !Array.isArray(cities) || cities.length === 0
}

function mapNameList(names, index) {
  if (!Array.isArray(names)) return { list: [], changes: [] }
  const list = []
  const changes = []
  const seen = new Set()
  for (const raw of names) {
    const s = String(raw || '').trim()
    if (!s) continue
    const canon = index.canonicalOf(s)
    if (canon !== s) changes.push({ from: s, to: canon })
    if (seen.has(canon)) continue
    seen.add(canon)
    list.push(canon)
  }
  return { list, changes }
}

/**
 * 全国菜（cities 空）主料/调味 → 别名通用名；城菜不动。
 * @returns {{ recipes: object[], stats: object, samples: object[] }}
 */
function normalizeNationalRecipes(recipes, aliasesRaw) {
  const index = buildAliasIndex(loadAliases(aliasesRaw))
  const stats = {
    total: (recipes || []).length,
    national: 0,
    city: 0,
    recipesChanged: 0,
    nameChanges: 0
  }
  const samples = []
  const next = (recipes || []).map((row) => {
    if (!isNationalRecipe(row)) {
      stats.city += 1
      return row
    }
    stats.national += 1
    const main = mapNameList(row.mainIngredients, index)
    const seas = mapNameList(row.seasonings, index)
    const changed =
      JSON.stringify(main.list) !== JSON.stringify(row.mainIngredients || []) ||
      JSON.stringify(seas.list) !== JSON.stringify(row.seasonings || [])
    if (!changed) return row
    stats.recipesChanged += 1
    stats.nameChanges += main.changes.length + seas.changes.length
    if (samples.length < 20) {
      samples.push({
        id: row.id,
        name: row.name,
        main: main.changes,
        seasonings: seas.changes
      })
    }
    return Object.assign({}, row, {
      mainIngredients: main.list,
      seasonings: seas.list
    })
  })
  return { recipes: next, stats, samples }
}

module.exports = {
  isNationalRecipe,
  mapNameList,
  normalizeNationalRecipes
}
