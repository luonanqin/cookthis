'use strict'

const fs = require('fs')
const path = require('path')

const JSON_PATH = path.join(__dirname, '..', 'data', 'ingredients-builtin.json')

const REQUIRED = ['id', 'name', 'category', 'cities', 'kind', 'sort', 'source', 'updatedAt']

function loadAndValidate() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8')
  const items = JSON.parse(raw)
  if (!Array.isArray(items)) {
    throw new Error('ingredients-builtin.json must be a JSON array')
  }

  for (const row of items) {
    for (const key of REQUIRED) {
      if (row[key] === undefined || row[key] === null || row[key] === '') {
        throw new Error(`invalid row (missing ${key}): ${JSON.stringify(row)}`)
      }
    }
    if (!row.id || !row.name || !row.kind) {
      throw new Error('invalid row ' + JSON.stringify(row))
    }
    if (!Array.isArray(row.cities)) {
      throw new Error(row.id + ' cities must be array')
    }
    if (row.avoidTags !== undefined && !Array.isArray(row.avoidTags)) {
      throw new Error(row.id + ' avoidTags must be array when present')
    }
    if (row.kind === 'main') {
      if (!row.availability) {
        throw new Error(row.id + ' main ingredient must have availability')
      }
    }
  }

  return items
}

function main() {
  const items = loadAndValidate()
  const mains = items.filter((x) => x.kind === 'main')
  const seasoning = items.filter((x) => x.kind === 'seasoning')

  console.log('Validated', items.length, 'rows (', mains.length, 'main,', seasoning.length, 'seasoning).')
  console.log('')
  console.log('Manual import (this slice):')
  console.log('  微信开发者工具 → 云开发 → 数据库 → 集合 `ingredients` → 导入 JSON')
  console.log('  Or set each document _id to the `id` field before batch insert.')
  console.log('')
  console.log('Import', items.length, 'ingredients into collection `ingredients`')
  console.log('  File:', JSON_PATH)
}

main()
