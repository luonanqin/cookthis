'use strict'

const crypto = require('crypto')

/** @param {string} text */
function loadTitleCleanMap(text) {
  const map = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 5) continue
    const orig = String(parts[3] || '').trim()
    const clean = String(parts[4] || '').trim()
    if (!orig || !clean) continue
    map.set(orig, clean)
  }
  return map
}

/** @param {string} text */
function loadDishIngredients(text) {
  const map = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    const name = String(parts[0] || '').trim()
    if (!name) continue
    let ingsPart = parts[1] || ''
    let taste = '正常口味'
    if (parts.length >= 3 && ['重口味', '清淡', '正常口味'].includes(parts[parts.length - 1])) {
      taste = parts[parts.length - 1]
      ingsPart = parts.slice(1, -1).join('\t')
    }
    const ingredients = String(ingsPart)
      .split('、')
      .map((s) => s.trim())
      .filter(Boolean)
    map.set(name, { ingredients, taste })
  }
  return map
}

function titleCharLen(s) {
  return Array.from(String(s || '')).length
}

/**
 * over-6 允许保留的菜名：原菜名 ∪ 清洗菜名。
 * @param {string} over6Text
 * @returns {Set<string>}
 */
function loadOver6AllowTitles(over6Text) {
  const allow = new Set()
  for (const line of String(over6Text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 5) continue
    const orig = String(parts[3] || '').trim()
    const clean = String(parts[4] || '').trim()
    if (orig) allow.add(orig)
    if (clean) allow.add(clean)
  }
  return allow
}

/**
 * 菜名 >6 字且不在 over-6 名单中的 recipe 删除；空条目食材键一并去掉。
 * @param {object} doc
 * @param {Set<string>} allowTitles
 */
function dropLongTitlesNotInOver6(doc, allowTitles) {
  const out = doc || { items: {} }
  const items = out.items || {}
  let removed = 0
  let kept = 0
  const emptyKeys = []
  for (const [ing, entry] of Object.entries(items)) {
    const recipes = (entry && entry.recipes) || []
    const next = []
    for (const recipe of recipes) {
      const title = String((recipe && recipe.title) || '').trim()
      if (titleCharLen(title) > 6 && !allowTitles.has(title)) {
        removed++
        continue
      }
      next.push(recipe)
      kept++
    }
    entry.recipes = next
    if (next.length === 0) emptyKeys.push(ing)
  }
  for (const k of emptyKeys) delete items[k]
  return { doc: out, stats: { removed, kept, emptyKeysRemoved: emptyKeys.length } }
}

/**
 * @param {object} doc
 * @param {Map<string,string>} titleMap
 * @param {Map<string,{ingredients:string[],taste:string}>} dishes
 * @param {{ over6AllowTitles?: Set<string> }} [opts]
 */
function patchCategoryCleanedDoc(doc, titleMap, dishes, opts) {
  const out = JSON.parse(JSON.stringify(doc || { items: {} }))
  const items = out.items || {}
  let renamed = 0
  let ingredientsFilled = 0
  for (const entry of Object.values(items)) {
    const recipes = (entry && entry.recipes) || []
    for (const recipe of recipes) {
      if (!recipe || typeof recipe !== 'object') continue
      const rawTitle = String(recipe.title || '').trim()
      let title = rawTitle
      if (titleMap.has(rawTitle)) {
        title = titleMap.get(rawTitle)
        if (title !== rawTitle) renamed++
        recipe.title = title
      }
      const dish = dishes.get(title)
      if (dish && Array.isArray(dish.ingredients) && dish.ingredients.length) {
        recipe.ingredients = dish.ingredients.slice()
        ingredientsFilled++
      }
    }
  }
  let dropStats = { removed: 0, kept: 0, emptyKeysRemoved: 0 }
  if (opts && opts.over6AllowTitles) {
    const dropped = dropLongTitlesNotInOver6(out, opts.over6AllowTitles)
    dropStats = dropped.stats
  }
  return {
    doc: out,
    stats: { renamed, ingredientsFilled, ...dropStats }
  }
}

/**
 * @param {string[]} names
 * @param {Set<string>} seasoningSet
 */
function splitMainsAndSeasonings(names, seasoningSet) {
  const mainIngredients = []
  const seasonings = []
  for (const n of names || []) {
    if (seasoningSet.has(n)) seasonings.push(n)
    else mainIngredients.push(n)
  }
  if (mainIngredients.length === 0 && seasonings.length) {
    return { mainIngredients: seasonings.slice(), seasonings: [] }
  }
  return { mainIngredients, seasonings }
}

function tasteTagsFromDish(name, taste) {
  if (taste === '清淡') return ['light']
  if (taste === '重口味') {
    const tags = ['heavy']
    if (String(name).includes('辣')) tags.push('spicy')
    return tags
  }
  return ['normal']
}

const MEAT_CATS = new Set(['肉类', '内脏', '火锅', '鱼', '河鲜', '海鲜', '蛋奶'])

/**
 * @param {string} name
 * @param {string[]} mainIngredients
 * @param {{ meatNames?: Set<string> }} [opts]
 */
function inferMeatVegAndForms(name, mainIngredients, opts) {
  const meatNames = (opts && opts.meatNames) || new Set()
  const n = String(name || '')
  let meatVeg = 'veg'
  let dishForms = ['stir_fry']
  let stapleForms = ['rice']
  let minutes = 20

  if (/汤|煲|羹/.test(n) || n.endsWith('盅')) {
    meatVeg = 'soup'
    dishForms = ['soup']
    stapleForms = []
    minutes = 35
  } else if (/面|粉|米线|面条|挂面|焖面/.test(n) && !/面粉/.test(n)) {
    meatVeg = 'staple'
    dishForms = ['noodle']
    stapleForms = ['noodle']
    minutes = 25
  } else if (/饺|馄饨|抄手/.test(n)) {
    meatVeg = 'staple'
    dishForms = ['dumpling']
    stapleForms = ['dumpling']
    minutes = 30
  } else if (/火锅|涮/.test(n)) {
    meatVeg = 'soup'
    dishForms = ['hotpot']
    stapleForms = []
    minutes = 45
  } else if (/蒸/.test(n)) {
    dishForms = ['steam']
    minutes = 25
  } else if (/烧|焖|烩|红烧|黄焖|炖/.test(n)) {
    dishForms = ['braise']
    minutes = 40
  }

  const hasMeat = (mainIngredients || []).some((x) => meatNames.has(x))
  if (meatVeg !== 'soup' && meatVeg !== 'staple') {
    meatVeg = hasMeat ? 'meat' : 'veg'
  }

  return { meatVeg, dishForms, stapleForms, minutes }
}

/**
 * @param {Array<{name:string,ingredients:string[],taste:string}>} rows
 */
function dedupeDishesByIngredientCount(rows) {
  const best = new Map()
  for (const row of rows || []) {
    const name = row && row.name
    if (!name) continue
    const prev = best.get(name)
    const count = (row.ingredients || []).length
    if (!prev || count > (prev.ingredients || []).length) {
      best.set(name, row)
    }
  }
  return [...best.values()]
}

function makeRecipeId(name, existingIds) {
  const digest = crypto.createHash('sha1').update(String(name), 'utf8').digest('hex')
  let id = `rcp_xf_${digest.slice(0, 10)}`
  if (!existingIds.has(id)) return id
  let i = 1
  while (existingIds.has(`${id}_${i}`)) i += 1
  return `${id}_${i}`
}

/**
 * @param {{
 *   name: string,
 *   ingredients: string[],
 *   taste: string,
 *   id: string,
 *   seasoningSet: Set<string>,
 *   meatNames: Set<string>,
 *   knownNames: Set<string>,
 *   aliasIndex: { canonicalOf(s: string): string }
 * }} opts
 */
function buildRecipeFromDish(opts) {
  const {
    name,
    ingredients,
    taste,
    id,
    seasoningSet,
    meatNames,
    knownNames,
    aliasIndex
  } = opts
  const normalized = []
  const unknown = []
  for (const raw of ingredients || []) {
    const canon = aliasIndex.canonicalOf(String(raw || '').trim())
    if (!canon) continue
    if (!knownNames.has(canon)) {
      unknown.push(raw)
      continue
    }
    if (!normalized.includes(canon)) normalized.push(canon)
  }
  if (unknown.length || normalized.length === 0) {
    return { ok: false, unknown, recipe: null }
  }
  const { mainIngredients, seasonings } = splitMainsAndSeasonings(
    normalized,
    seasoningSet
  )
  const inferred = inferMeatVegAndForms(name, mainIngredients, { meatNames })
  return {
    ok: true,
    unknown: [],
    recipe: {
      id,
      name,
      mainIngredients,
      seasonings,
      meatVeg: inferred.meatVeg,
      tasteTags: tasteTagsFromDish(name, taste),
      dishForms: inferred.dishForms,
      stapleForms: inferred.stapleForms,
      cities: [],
      minutes: inferred.minutes,
      servings: 2,
      enabled: true,
      cuisineTags: ['home_style']
    }
  }
}

/**
 * @param {{
 *   builtin: object[],
 *   dishes: Array<{name:string,ingredients:string[],taste:string}>,
 *   seasoningSet: Set<string>,
 *   meatNames: Set<string>,
 *   knownNames: Set<string>,
 *   aliasIndex: { canonicalOf(s: string): string }
 * }} input
 */
function mergeIntoBuiltin(input) {
  const {
    builtin,
    dishes,
    seasoningSet,
    meatNames,
    knownNames,
    aliasIndex
  } = input
  const deduped = dedupeDishesByIngredientCount(dishes)
  const byName = new Map((builtin || []).map((r) => [r.name, { ...r }]))
  const existingIds = new Set((builtin || []).map((r) => r.id).filter(Boolean))
  const skipped = []

  for (const dish of deduped) {
    const prev = byName.get(dish.name)
    const id = prev && prev.id ? prev.id : makeRecipeId(dish.name, existingIds)
    existingIds.add(id)
    const built = buildRecipeFromDish({
      name: dish.name,
      ingredients: dish.ingredients,
      taste: dish.taste,
      id,
      seasoningSet,
      meatNames,
      knownNames,
      aliasIndex
    })
    if (!built.ok) {
      skipped.push({ name: dish.name, unknown: built.unknown })
      continue
    }
    if (prev) {
      byName.set(dish.name, {
        ...prev,
        ...built.recipe,
        id: prev.id
      })
    } else {
      byName.set(dish.name, built.recipe)
    }
  }

  // stable-ish: old order first for kept names, then new names in dish order
  const recipes = []
  const seenNames = new Set()
  for (const row of builtin || []) {
    if (!row || !row.name) continue
    if (seenNames.has(row.name)) continue
    if (byName.has(row.name)) {
      recipes.push(byName.get(row.name))
      seenNames.add(row.name)
    }
  }
  for (const dish of deduped) {
    if (seenNames.has(dish.name)) continue
    if (byName.has(dish.name)) {
      recipes.push(byName.get(dish.name))
      seenNames.add(dish.name)
    }
  }

  // guarantee unique ids (city packs may have reused ids)
  const usedIds = new Set()
  for (const row of recipes) {
    if (!row.id || usedIds.has(row.id)) {
      row.id = makeRecipeId(row.name, usedIds)
    }
    usedIds.add(row.id)
  }

  const sanitized = []
  for (const row of recipes) {
    const cleaned = sanitizeRecipeIngredients(row, knownNames, aliasIndex)
    if (!cleaned) {
      skipped.push({
        name: row.name,
        unknown: ['(sanitize dropped: empty mainIngredients)']
      })
      continue
    }
    sanitized.push(cleaned)
  }
  return { recipes: sanitized, skipped }
}

/**
 * Canonicalize ingredient names; drop unknown; return null if no mains left.
 * @param {object} row
 * @param {Set<string>} knownNames
 * @param {{ canonicalOf(s: string): string }} aliasIndex
 */
function sanitizeRecipeIngredients(row, knownNames, aliasIndex) {
  if (!row) return null
  const next = { ...row }
  const mapList = (arr) => {
    const out = []
    for (const raw of arr || []) {
      const canon = aliasIndex.canonicalOf(String(raw || '').trim())
      if (!canon || !knownNames.has(canon)) continue
      if (!out.includes(canon)) out.push(canon)
    }
    return out
  }
  next.mainIngredients = mapList(row.mainIngredients)
  next.seasonings = mapList(row.seasonings)
  if (!next.mainIngredients.length) {
    if (next.seasonings.length) {
      next.mainIngredients = next.seasonings.slice()
      next.seasonings = []
    } else {
      return null
    }
  }
  return next
}

/** Compact write: one recipe object per line. */
function formatCategoryCleanedCompact(doc) {
  const items = (doc && doc.items) || {}
  const keys = Object.keys(items)
  let out = '{\n'
  out += `  "updatedAt": ${JSON.stringify((doc && doc.updatedAt) || '')},\n`
  out += '  "items": {\n'
  keys.forEach((key, i) => {
    const entry = items[key] || {}
    const recipes = entry.recipes || []
    out += `    ${JSON.stringify(key)}: {\n`
    out += `      "categories": ${JSON.stringify(entry.categories || [])},\n`
    out += `      "count": ${entry.count != null ? entry.count : 0},\n`
    out += '      "recipes": [\n'
    recipes.forEach((r, j) => {
      const line = JSON.stringify({
        title: (r && r.title) || '',
        count: r && r.count != null ? r.count : 0,
        ingredients: Array.isArray(r && r.ingredients) ? r.ingredients : []
      })
      out += `        ${line}${j < recipes.length - 1 ? ',' : ''}\n`
    })
    out += '      ]\n'
    out += `    }${i < keys.length - 1 ? ',' : ''}\n`
  })
  out += '  }\n'
  out += '}\n'
  return out
}

function collectMeatNames(byCategoryDoc) {
  const set = new Set()
  const cats = (byCategoryDoc && byCategoryDoc.categories) || {}
  for (const [cat, names] of Object.entries(cats)) {
    if (!MEAT_CATS.has(cat)) continue
    for (const n of names || []) set.add(n)
  }
  return set
}

function collectSeasoningSet(byCategoryDoc, builtinIngredients) {
  const set = new Set()
  const taste = ((byCategoryDoc && byCategoryDoc.categories) || {}).调味 || []
  for (const n of taste) set.add(n)
  for (const row of builtinIngredients || []) {
    if (row && row.kind === 'seasoning' && row.name) set.add(row.name)
  }
  return set
}

module.exports = {
  loadTitleCleanMap,
  loadDishIngredients,
  loadOver6AllowTitles,
  dropLongTitlesNotInOver6,
  titleCharLen,
  patchCategoryCleanedDoc,
  splitMainsAndSeasonings,
  tasteTagsFromDish,
  inferMeatVegAndForms,
  dedupeDishesByIngredientCount,
  buildRecipeFromDish,
  mergeIntoBuiltin,
  sanitizeRecipeIngredients,
  collectMeatNames,
  collectSeasoningSet,
  makeRecipeId,
  formatCategoryCleanedCompact,
  MEAT_CATS
}
