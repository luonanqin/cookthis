#!/usr/bin/env node
'use strict'

/**
 * 全国菜（cities 空）主料/调味按 aliases.json 收成通用名；城菜不动。
 *
 *   node scripts/normalize-national-recipe-ingredients.js           # dry-run
 *   node scripts/normalize-national-recipe-ingredients.js --apply
 */

const fs = require('fs')
const path = require('path')
const {
  normalizeNationalRecipes
} = require('./lib/normalizeNationalRecipeIngredients.js')

const ROOT = path.join(__dirname, '..')
const BUILTIN = path.join(ROOT, 'data/catalog/recipes-builtin.json')
const ALIASES = path.join(ROOT, 'data/catalog/aliases.json')

function parseArgs(argv) {
  let apply = false
  for (const a of argv.slice(2)) {
    if (a === '--apply') apply = true
    else throw new Error('unknown arg: ' + a)
  }
  return { apply }
}

function main() {
  const { apply } = parseArgs(process.argv)
  const recipes = JSON.parse(fs.readFileSync(BUILTIN, 'utf8'))
  const aliases = JSON.parse(fs.readFileSync(ALIASES, 'utf8'))
  if (!Array.isArray(recipes)) throw new Error('recipes-builtin must be array')

  const { recipes: next, stats, samples } = normalizeNationalRecipes(
    recipes,
    aliases
  )
  console.log('统计:', stats)
  console.log('样例（最多 20）:')
  for (const s of samples) {
    const bits = []
      .concat(
        (s.main || []).map((c) => `主料 ${c.from}→${c.to}`),
        (s.seasonings || []).map((c) => `调味 ${c.from}→${c.to}`)
      )
      .join('; ')
    console.log(`  ${s.name} (${s.id}): ${bits}`)
  }

  if (!apply) {
    console.log('dry-run（未写文件）。加 --apply 写回', BUILTIN)
    return
  }
  fs.writeFileSync(BUILTIN, JSON.stringify(next, null, 2) + '\n', 'utf8')
  console.log('已写回', BUILTIN)
  console.log('如需上云库：node scripts/import-recipes.js 后再导入 recipes')
}

main()
