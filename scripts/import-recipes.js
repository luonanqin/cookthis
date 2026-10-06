'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const JSON_PATH = path.join(ROOT, 'data', 'recipes-builtin.json')
const INGREDIENTS_PATH = path.join(ROOT, 'data', 'ingredients-builtin.json')
const OUT_PATH = path.join(ROOT, 'data', 'recipes-for-import.json')

const REQUIRED = [
  'id',
  'name',
  'mainIngredients',
  'seasonings',
  'meatVeg',
  'tasteTags',
  'dishForms',
  'stapleForms',
  'cities',
  'minutes',
  'servings',
  'enabled',
]

const MEAT_VEG = new Set(['meat', 'veg', 'soup', 'staple', 'other'])

function loadIngredientNames() {
  const items = JSON.parse(fs.readFileSync(INGREDIENTS_PATH, 'utf8'))
  if (!Array.isArray(items)) {
    throw new Error('ingredients-builtin.json must be a JSON array')
  }
  return new Set(items.map((x) => x.name))
}

function loadAndValidate(knownNames) {
  const raw = fs.readFileSync(JSON_PATH, 'utf8')
  const items = JSON.parse(raw)
  if (!Array.isArray(items)) {
    throw new Error('recipes-builtin.json must be a JSON array')
  }

  const ids = new Set()
  for (const row of items) {
    for (const key of REQUIRED) {
      if (row[key] === undefined || row[key] === null) {
        throw new Error(`invalid row (missing ${key}): ${JSON.stringify(row)}`)
      }
    }
    if (!row.id || !row.name) {
      throw new Error('invalid row ' + JSON.stringify(row))
    }
    if (ids.has(row.id)) {
      throw new Error('duplicate recipe id: ' + row.id)
    }
    ids.add(row.id)

    for (const arrKey of ['mainIngredients', 'seasonings', 'tasteTags', 'dishForms', 'stapleForms', 'cities']) {
      if (!Array.isArray(row[arrKey])) {
        throw new Error(row.id + ' ' + arrKey + ' must be array')
      }
    }
    if (row.mainIngredients.length === 0) {
      throw new Error(row.id + ' mainIngredients must be non-empty')
    }
    for (const name of row.mainIngredients) {
      if (!knownNames.has(name)) {
        throw new Error(row.id + ' unknown mainIngredient name: ' + name)
      }
    }
    if (!MEAT_VEG.has(row.meatVeg)) {
      throw new Error(row.id + ' invalid meatVeg: ' + row.meatVeg)
    }
    if (typeof row.minutes !== 'number' || typeof row.servings !== 'number') {
      throw new Error(row.id + ' minutes/servings must be numbers')
    }
    if (typeof row.enabled !== 'boolean') {
      throw new Error(row.id + ' enabled must be boolean')
    }
  }

  return items
}

function main() {
  const knownNames = loadIngredientNames()
  const items = loadAndValidate(knownNames)

  const byType = { meat: 0, veg: 0, soup: 0, staple: 0, other: 0 }
  for (const r of items) {
    byType[r.meatVeg] = (byType[r.meatVeg] || 0) + 1
  }

  const jsonl = items.map((row) => JSON.stringify(row)).join('\n') + '\n'
  fs.writeFileSync(OUT_PATH, jsonl, 'utf8')

  console.log(
    'Validated',
    items.length,
    'recipes (meat:',
    byType.meat,
    'veg:',
    byType.veg,
    'soup:',
    byType.soup + ').'
  )
  console.log('Wrote JSONL:', OUT_PATH)
  console.log('')
  console.log('Manual import (this slice):')
  console.log('  微信开发者工具 → 云开发 → 数据库 → 集合 `recipes` → 导入 JSON')
  console.log('  Or set each document _id to the `id` field before batch insert.')
  console.log('')
  console.log('Import', items.length, 'recipes into collection `recipes`')
  console.log('  Seed:', JSON_PATH)
  console.log('  JSONL:', OUT_PATH)
}

main()
