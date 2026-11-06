'use strict'

const crypto = require('crypto')

/**
 * @param {{ categories?: Record<string, string[]> }} doc
 * @returns {Map<string, string>} name → category
 */
function collectNamesByCategory(doc) {
  const map = new Map()
  const categories = (doc && doc.categories) || {}
  for (const [category, names] of Object.entries(categories)) {
    if (!Array.isArray(names)) continue
    for (const name of names) {
      const n = String(name || '').trim()
      if (!n) continue
      if (!map.has(n)) map.set(n, category)
    }
  }
  return map
}

/**
 * Editor surface = canon + ungrouped（不含仅别名）。
 * @param {{ categories?: Record<string, { groups?: Array<{canon?: string, aliases?: string[]}>, ungrouped?: string[] }> }} doc
 * @returns {Set<string>}
 */
function collectEditorSurfaceNames(doc) {
  return new Set(collectEditorSurfaceByCategory(doc).keys())
}

/**
 * @param {{ categories?: Record<string, { groups?: Array<{canon?: string, aliases?: string[]}>, ungrouped?: string[] }> }} doc
 * @returns {Map<string, string>} name → editor category
 */
function collectEditorSurfaceByCategory(doc) {
  const map = new Map()
  const categories = (doc && doc.categories) || {}
  for (const [category, bucket] of Object.entries(categories)) {
    if (!bucket || typeof bucket !== 'object') continue
    for (const g of bucket.groups || []) {
      const canon = String((g && g.canon) || '').trim()
      if (canon && !map.has(canon)) map.set(canon, category)
    }
    for (const n of bucket.ungrouped || []) {
      const name = String(n || '').trim()
      if (name && !map.has(name)) map.set(name, category)
    }
  }
  return map
}

/**
 * @param {Map<string, string>} byCat
 * @param {Array<{ name?: string }>} builtin
 * @returns {Array<{ name: string, category: string }>}
 */
function findMissingNames(byCat, builtin) {
  const present = new Set()
  for (const row of builtin || []) {
    const n = String((row && row.name) || '').trim()
    if (n) present.add(n)
  }
  const missing = []
  for (const [name, category] of byCat.entries()) {
    if (!present.has(name)) missing.push({ name, category })
  }
  missing.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return missing
}

/**
 * @param {string} name
 * @param {Set<string>} existingIds
 * @returns {string}
 */
function makeIngredientId(name, existingIds) {
  const digest = crypto.createHash('sha1').update(String(name), 'utf8').digest('hex')
  let id = `ing_${digest.slice(0, 10)}`
  if (!existingIds.has(id)) return id
  let i = 1
  while (existingIds.has(`${id}_${i}`)) i += 1
  return `${id}_${i}`
}

/**
 * @param {{ name: string, category: string, updatedAt: string, existingIds: Set<string> }} opts
 */
function buildBuiltinRow(opts) {
  const { name, category, updatedAt, existingIds } = opts
  const id = makeIngredientId(name, existingIds)
  existingIds.add(id)
  const isSeasoning = category === '调味'
  const row = {
    id,
    name,
    category,
    cities: [],
    kind: isSeasoning ? 'seasoning' : 'main',
    onConfirmPage: false,
    sort: 99,
    avoidTags: [],
    source: 'builtin',
    updatedAt
  }
  if (isSeasoning) {
    delete row.onConfirmPage
  } else {
    row.availability = 'year_round'
  }
  return row
}

function setDiff(a, b) {
  const out = []
  for (const x of a) if (!b.has(x)) out.push(x)
  return out.sort((x, y) => x.localeCompare(y, 'zh'))
}

/**
 * @param {{
 *   allDoc: object,
 *   byCatDoc: object,
 *   editorDoc: object,
 *   builtin: object[],
 *   updatedAt: string
 * }} input
 */
function syncBuiltinFromCatalog(input) {
  const { allDoc, byCatDoc, editorDoc, builtin, updatedAt } = input
  const warnings = []

  const allMap = collectNamesByCategory(allDoc)
  const byCatMap = collectNamesByCategory(byCatDoc)
  const editorSurfaceMap = collectEditorSurfaceByCategory(editorDoc)
  const allNames = new Set(allMap.keys())
  const byCatNames = new Set(byCatMap.keys())
  const editorSurface = new Set(editorSurfaceMap.keys())

  const onlyInAll = setDiff(allNames, byCatNames)
  const onlyInByCat = setDiff(byCatNames, allNames)
  if (onlyInAll.length || onlyInByCat.length) {
    warnings.push(
      `ingredients-all 与 ingredients-all-by-category 名称不一致` +
        `（仅 all ${onlyInAll.length}，仅 by-category ${onlyInByCat.length}）`
    )
  }

  const editorMissingFromByCat = setDiff(editorSurface, byCatNames)
  if (editorMissingFromByCat.length) {
    warnings.push(
      `aliases-editor 表面名（canon/ungrouped）有 ${editorMissingFromByCat.length} 个不在 by-category（仍按编辑器品类补进 builtin）`
    )
  }

  // 补齐目标 = by-category ∪ 编辑器表面名
  const desired = new Map(byCatMap)
  for (const [name, category] of editorSurfaceMap.entries()) {
    if (!desired.has(name)) desired.set(name, category)
  }

  const missing = findMissingNames(desired, builtin)
  const existingIds = new Set()
  for (const row of builtin) {
    if (row && row.id) existingIds.add(row.id)
  }

  const added = []
  const next = builtin.slice()
  for (const { name, category } of missing) {
    const row = buildBuiltinRow({ name, category, updatedAt, existingIds })
    added.push(row)
    next.push(row)
  }

  return {
    builtin: next,
    added,
    missingCount: missing.length,
    warnings,
    stats: {
      all: allNames.size,
      byCategory: byCatNames.size,
      editorSurface: editorSurface.size,
      builtinBefore: new Set(builtin.map((r) => r && r.name).filter(Boolean)).size,
      builtinAfter: new Set(next.map((r) => r && r.name).filter(Boolean)).size
    }
  }
}

module.exports = {
  collectNamesByCategory,
  collectEditorSurfaceNames,
  collectEditorSurfaceByCategory,
  findMissingNames,
  buildBuiltinRow,
  makeIngredientId,
  syncBuiltinFromCatalog
}
