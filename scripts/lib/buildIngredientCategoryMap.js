'use strict'

const { collectNamesByCategory } = require('./syncBuiltinFromAllCatalog.js')

/**
 * Flatten ingredients-all-by-category → plain { name: category } for runtime.
 * @param {{ categories?: Record<string, string[]> }} byCategoryDoc
 * @returns {Record<string, string>}
 */
function buildIngredientCategoryMap(byCategoryDoc) {
  const map = collectNamesByCategory(byCategoryDoc)
  const out = Object.create(null)
  for (const [name, category] of map.entries()) {
    out[name] = category
  }
  return out
}

module.exports = {
  buildIngredientCategoryMap
}
