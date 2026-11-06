'use strict'
/**
 * 用全量食材表补齐 ingredients-builtin.json 中缺失的名称。
 *
 * 对照源：
 * - ingredients-all-by-category.json（名 + 品类；补行以此为准）
 * - ingredients-all.json（名称集合应一致，否则告警）
 * - aliases-editor.json（canon/ungrouped 应 ⊆ by-category，否则告警）
 *
 * 已有 builtin 行（含分城条目）不改动；仅追加缺失名，cities=[]。
 *
 * 用法：
 *   node scripts/sync-builtin-from-all-catalog.js           # 写回 builtin
 *   node scripts/sync-builtin-from-all-catalog.js --dry-run # 只报告
 *
 * 之后通常再跑：node scripts/import-ingredients.js
 */
const fs = require('fs')
const path = require('path')
const { syncBuiltinFromCatalog } = require('./lib/syncBuiltinFromAllCatalog')

const ROOT = path.join(__dirname, '..')
const CATALOG = path.join(ROOT, 'data', 'catalog')
const ALL_PATH = path.join(CATALOG, 'ingredients-all.json')
const BY_CAT_PATH = path.join(CATALOG, 'ingredients-all-by-category.json')
const EDITOR_PATH = path.join(CATALOG, 'aliases-editor.json')
const BUILTIN_PATH = path.join(CATALOG, 'ingredients-builtin.json')

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const allDoc = loadJson(ALL_PATH)
  const byCatDoc = loadJson(BY_CAT_PATH)
  const editorDoc = loadJson(EDITOR_PATH)
  const builtin = loadJson(BUILTIN_PATH)
  if (!Array.isArray(builtin)) {
    throw new Error('ingredients-builtin.json must be a JSON array')
  }

  const updatedAt = new Date().toISOString()
  const result = syncBuiltinFromCatalog({
    allDoc,
    byCatDoc,
    editorDoc,
    builtin,
    updatedAt
  })

  console.log('Catalog sizes:', result.stats)
  console.log('Missing names to append:', result.missingCount)
  if (result.added.length) {
    const sample = result.added.slice(0, 20).map((r) => `${r.name}(${r.category})`)
    console.log('Sample added:', sample.join(', '), result.added.length > 20 ? '…' : '')
  }
  for (const w of result.warnings) console.warn('WARN:', w)

  if (dryRun) {
    console.log('Dry run — did not write', BUILTIN_PATH)
    return
  }

  if (result.added.length === 0) {
    console.log('Nothing to write; builtin already covers by-category names.')
    return
  }

  fs.writeFileSync(BUILTIN_PATH, JSON.stringify(result.builtin, null, 2) + '\n')
  console.log('Wrote', BUILTIN_PATH, `(+${result.added.length} rows, total ${result.builtin.length})`)
  console.log('Next: node scripts/import-ingredients.js')
}

main()
