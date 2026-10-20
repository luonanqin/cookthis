// scripts/sync-alias-runtime-data.js
'use strict'
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const aliasesSrc = path.join(root, 'data/catalog/aliases.json')
const citiesDir = path.join(root, 'data/catalog/cities')
const { flattenShelfNameOrder } = require('../cloudfunctions/_shared/aliasMatch.js')

const aliasTargets = [
  'cloudfunctions/_shared/data/aliases.json',
  'cloudfunctions/recommend/data/aliases.json',
  'miniprogram/data/aliases.json'
]

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

const raw = fs.readFileSync(aliasesSrc, 'utf8')
aliasTargets.forEach((rel) => {
  const dest = path.join(root, rel)
  ensureDir(path.dirname(dest))
  fs.writeFileSync(dest, raw)
  console.log('wrote', rel)
})

const shelfOut = path.join(root, 'miniprogram/data/city-shelves')
ensureDir(shelfOut)
for (const ent of fs.readdirSync(citiesDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue
  const doc = JSON.parse(
    fs.readFileSync(path.join(citiesDir, ent.name, 'ingredients.json'), 'utf8')
  )
  const order = flattenShelfNameOrder(doc)
  const dest = path.join(shelfOut, ent.name + '.json')
  fs.writeFileSync(dest, JSON.stringify(order) + '\n')
  console.log('shelf', ent.name, order.length)
}
