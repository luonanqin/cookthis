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
  'cloudfunctions/recommend/data/aliases.json',
  'miniprogram/data/aliases.json'
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

// 小程序 require('.json') 常打包失败（同 holidays）；额外写 .js
const aliasesJsRel = 'miniprogram/data/aliases.js'
writeJsModule(path.join(root, aliasesJsRel), aliasesObj)
console.log('wrote', aliasesJsRel)

const shelfOut = path.join(root, 'miniprogram/data/city-shelves')
ensureDir(shelfOut)
const shelvesMap = {}
for (const ent of fs.readdirSync(citiesDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const doc = JSON.parse(
    fs.readFileSync(path.join(citiesDir, ent.name, 'ingredients.json'), 'utf8')
  )
  const order = flattenShelfNameOrder(doc)
  const dest = path.join(shelfOut, ent.name + '.json')
  fs.writeFileSync(dest, JSON.stringify(order) + '\n')
  shelvesMap[ent.name] = order
  console.log('shelf', ent.name, order.length)
}

const shelvesJsRel = 'miniprogram/data/city-shelves.js'
writeJsModule(path.join(root, shelvesJsRel), shelvesMap)
console.log('wrote', shelvesJsRel)
