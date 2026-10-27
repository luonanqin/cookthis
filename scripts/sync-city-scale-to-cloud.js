'use strict'
// Copy data/catalog/cities/<city>/ingredients-by-scale.json
// -> cloudfunctions/ingredients/data/cities/<city>/ingredients-by-scale.json
// and vendor confirmListFromScale.js into the ingredients function dir.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const citiesSrc = path.join(root, 'data/catalog/cities')
const citiesDest = path.join(
  root,
  'cloudfunctions/ingredients/data/cities'
)
const sharedSrc = path.join(
  root,
  'cloudfunctions/_shared/confirmListFromScale.js'
)
const vendorDest = path.join(
  root,
  'cloudfunctions/ingredients/confirmListFromScale.js'
)

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function main() {
  ensureDir(citiesDest)
  let copied = 0
  for (const ent of fs.readdirSync(citiesSrc, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const src = path.join(citiesSrc, ent.name, 'ingredients-by-scale.json')
    if (!fs.existsSync(src)) continue
    const destDir = path.join(citiesDest, ent.name)
    ensureDir(destDir)
    const dest = path.join(destDir, 'ingredients-by-scale.json')
    fs.copyFileSync(src, dest)
    copied += 1
    console.log('scale', ent.name)
  }
  fs.copyFileSync(sharedSrc, vendorDest)
  console.log('vendored confirmListFromScale.js')
  console.log('done', { cities: copied })
}

main()
