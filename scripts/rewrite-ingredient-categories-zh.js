'use strict'
/**
 * 把本地 ingredients-builtin 的英文 category 改成中文，并重生成导入 JSONL。
 * 用法：node scripts/rewrite-ingredient-categories-zh.js
 * 然后：云开发 → ingredients 集合 → 导入 data/catalog/ingredients-for-import.json（冲突覆盖）
 */
const fs = require('fs')
const path = require('path')
const {
  normalizeCategory,
  LEGACY_CATEGORY_MAP
} = require('../cloudfunctions/_shared/categoryTaxonomy.js')

const root = path.join(__dirname, '..')
const builtinPath = path.join(root, 'data/catalog/ingredients-builtin.json')
const importPath = path.join(root, 'data/catalog/ingredients-for-import.json')

function main() {
  const items = JSON.parse(fs.readFileSync(builtinPath, 'utf8'))
  if (!Array.isArray(items)) throw new Error('ingredients-builtin.json must be array')

  let changed = 0
  const counts = {}
  for (const row of items) {
    const before = row.category
    const after = normalizeCategory(before, before || '其他')
    if (before !== after) {
      row.category = after
      changed++
    }
    counts[row.category] = (counts[row.category] || 0) + 1
  }

  fs.writeFileSync(builtinPath, JSON.stringify(items, null, 2) + '\n')
  const lines = items.map((row) => JSON.stringify({ _id: row.id, ...row }))
  fs.writeFileSync(importPath, lines.join('\n') + '\n')

  console.log('rewrote', builtinPath)
  console.log('changed rows:', changed, '/', items.length)
  console.log('category counts:', counts)
  console.log('wrote import JSONL:', importPath)
  console.log('')
  console.log('Next: 云开发控制台 → 数据库 → ingredients → 导入上述 JSONL（冲突选覆盖）')
  console.log('Legacy map keys:', Object.keys(LEGACY_CATEGORY_MAP).join(', '))
}

main()
