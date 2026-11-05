// scripts/sync-alias-runtime-data.js
'use strict'
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const aliasesSrc = path.join(root, 'data/catalog/aliases.json')
const citiesDir = path.join(root, 'data/catalog/cities')
const { flattenShelfNameOrder } = require('../cloudfunctions/_shared/aliasMatch.js')

const aliasJsonTargets = [
  'cloudfunctions/_shared/data/aliases.json',
  'cloudfunctions/recommend/data/aliases.json'
]

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function writeJsModule(dest, value) {
  const body = 'module.exports = ' + JSON.stringify(value, null, 2) + '\n'
  fs.writeFileSync(dest, body)
}

const raw = fs.readFileSync(aliasesSrc, 'utf8')
const aliasesObj = JSON.parse(raw)

aliasJsonTargets.forEach((rel) => {
  const dest = path.join(root, rel)
  ensureDir(path.dirname(dest))
  fs.writeFileSync(dest, raw)
  console.log('wrote', rel)
})

// 小程序侧改为登录后拉 catalog；别名/货架进云函数 catalog 包
const catalogAliasesJs = 'cloudfunctions/catalog/data/aliases.js'
ensureDir(path.join(root, 'cloudfunctions/catalog/data'))
writeJsModule(path.join(root, catalogAliasesJs), aliasesObj)
console.log('wrote', catalogAliasesJs)

const shelvesMap = {}
for (const ent of fs.readdirSync(citiesDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const doc = JSON.parse(
    fs.readFileSync(path.join(citiesDir, ent.name, 'ingredients.json'), 'utf8')
  )
  const order = flattenShelfNameOrder(doc)
  shelvesMap[ent.name] = order
  console.log('shelf', ent.name, order.length)
}

const catalogShelvesJs = 'cloudfunctions/catalog/data/city-shelves.js'
writeJsModule(path.join(root, catalogShelvesJs), shelvesMap)
console.log('wrote', catalogShelvesJs)
