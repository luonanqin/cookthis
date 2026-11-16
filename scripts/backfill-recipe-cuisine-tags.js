#!/usr/bin/env node
'use strict'

/**
 * 清空 home_style 并用点评 + 弱规则回填 recipes-builtin.cuisineTags。
 *
 * 默认 dry-run；写回：
 *   node scripts/backfill-recipe-cuisine-tags.js --apply
 */

const fs = require('fs')
const path = require('path')
const {
  buildDianpingIndex,
  backfillRecipes
} = require('./lib/cuisineTagBackfill.js')

const ROOT = path.join(__dirname, '..')
const BUILTIN = path.join(ROOT, 'data/catalog/recipes-builtin.json')
const DIANPING_OUT = path.join(ROOT, 'tools/dianping-automator/output')

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
  if (!Array.isArray(recipes)) throw new Error('recipes-builtin must be array')

  console.log('索引点评目录…', DIANPING_OUT)
  const index = buildDianpingIndex(DIANPING_OUT)
  console.log('点评归一化菜名键数:', index.size)

  const { recipes: next, stats } = backfillRecipes(recipes, index)
  console.log('统计:', stats)
  console.log(
    '有标签:',
    next.filter((r) => (r.cuisineTags || []).length).length,
    '/',
    next.length
  )

  if (!apply) {
    console.log('dry-run（未写文件）。加 --apply 写回', BUILTIN)
    return
  }
  fs.writeFileSync(BUILTIN, JSON.stringify(next, null, 2) + '\n', 'utf8')
  console.log('已写回', BUILTIN)
}

main()
