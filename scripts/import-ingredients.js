'use strict'

const fs = require('fs')
const path = require('path')

const JSON_PATH = path.join(__dirname, '..', 'data', 'catalog', 'ingredients-builtin.json')

const REQUIRED = ['id', 'name', 'category', 'cities', 'kind', 'sort', 'source', 'updatedAt']

function loadAndValidate() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8')
  const items = JSON.parse(raw)
  if (!Array.isArray(items)) {
    throw new Error('ingredients-builtin.json must be a JSON array')
  }

  const seen = new Set()
  for (const row of items) {
    for (const key of REQUIRED) {
      if (row[key] === undefined || row[key] === null || row[key] === '') {
        throw new Error(`invalid row (missing ${key}): ${JSON.stringify(row)}`)
      }
    }
    if (!row.id || !row.name || !row.kind) {
      throw new Error('invalid row ' + JSON.stringify(row))
    }
    if (seen.has(row.id)) {
      throw new Error('duplicate ingredient id: ' + row.id)
    }
    seen.add(row.id)
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
  const importJsonPath = path.join(__dirname, '..', 'data', 'catalog', 'ingredients-for-import.json')
  const lines = items.map((row) => JSON.stringify({ _id: row.id, ...row }))
  fs.writeFileSync(importJsonPath, lines.join('\n') + '\n')
  // 同内容另存 .jsonl，便于本地核对
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'catalog', 'ingredients-builtin.jsonl'),
    lines.join('\n') + '\n'
  )

  console.log('Manual import (this slice):')
  console.log('  微信开发者工具 → 云开发 → 数据库 → 集合 `ingredients` → 导入')
  console.log('  选文件（扩展名 .json，内容是 JSON Lines 每行一条）：')
  console.log('  ', importJsonPath)
  console.log('  不要选 ingredients-builtin.json（那是数组，会报格式错误）')
  console.log('')
  console.log('Wrote', items.length, 'lines for collection `ingredients`')
}

main()
