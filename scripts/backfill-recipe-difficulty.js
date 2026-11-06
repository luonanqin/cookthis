'use strict'

/**
 * Backfill explicit recipe difficulty onto recipes-builtin.json.
 *
 * Default: dry-run report (probe matches + inferred preview; no file write).
 * --apply-probe-names: exact PROBE_DISHES name match, only if difficulty missing.
 * --apply-inferred: fill remaining blanks with inferDifficulty (never overwrite).
 * Flags can combine; probe writes run before inferred fills.
 */
const fs = require('fs')
const path = require('path')
const {
  DIFFICULTY_VALUES,
  PROBE_DISHES,
  inferDifficulty
} = require('../cloudfunctions/_shared/cookSkill.js')

const DEFAULT_RCP = path.join(__dirname, '..', 'data', 'catalog', 'recipes-builtin.json')

function parseArgs(argv) {
  const args = argv.slice(2)
  let applyProbeNames = false
  let applyInferred = false
  for (const arg of args) {
    if (arg === '--apply-probe-names') {
      applyProbeNames = true
      continue
    }
    if (arg === '--apply-inferred') {
      applyInferred = true
      continue
    }
    throw new Error('unknown argument: ' + arg)
  }
  return { applyProbeNames, applyInferred }
}

function lacksDifficulty(recipe) {
  return !(typeof recipe.difficulty === 'string' && recipe.difficulty.length > 0)
}

function indexProbes(probeDishes) {
  const byName = new Map()
  for (const dish of probeDishes) {
    if (!dish || typeof dish.name !== 'string' || dish.name.length === 0) {
      throw new Error('probe dish missing name')
    }
    if (!DIFFICULTY_VALUES.includes(dish.difficulty)) {
      throw new Error('probe dish invalid difficulty: ' + dish.name)
    }
    const prev = byName.get(dish.name)
    if (prev && prev !== dish.difficulty) {
      throw new Error('conflicting probe difficulty for ' + dish.name)
    }
    byName.set(dish.name, dish.difficulty)
  }
  return byName
}

function planProbeBackfill(recipes, probeDishes) {
  const byName = indexProbes(probeDishes)
  const toWrite = []
  const kept = []
  const seenNames = new Set()

  recipes.forEach((recipe, index) => {
    const probeDifficulty = byName.get(recipe && recipe.name)
    if (!probeDifficulty) return
    seenNames.add(recipe.name)
    if (lacksDifficulty(recipe)) {
      toWrite.push({
        index,
        id: recipe.id,
        name: recipe.name,
        difficulty: probeDifficulty
      })
      return
    }
    kept.push({
      index,
      id: recipe.id,
      name: recipe.name,
      difficulty: recipe.difficulty,
      probeDifficulty
    })
  })

  const missingNames = []
  for (const name of byName.keys()) {
    if (!seenNames.has(name)) missingNames.push(name)
  }
  return { toWrite, kept, missingNames }
}

function applyProbeBackfill(recipes, probeDishes) {
  const plan = planProbeBackfill(recipes, probeDishes)
  for (const row of plan.toWrite) {
    recipes[row.index].difficulty = row.difficulty
  }
  return { ...plan, written: plan.toWrite.length }
}

function planInferredBackfill(recipes, infer) {
  const toWrite = []
  recipes.forEach((recipe, index) => {
    if (!lacksDifficulty(recipe)) return
    toWrite.push({
      index,
      id: recipe.id,
      name: recipe.name,
      difficulty: infer(recipe)
    })
  })
  return { toWrite }
}

function applyInferredBackfill(recipes, infer) {
  const plan = planInferredBackfill(recipes, infer)
  for (const row of plan.toWrite) {
    recipes[row.index].difficulty = row.difficulty
  }
  return { ...plan, written: plan.toWrite.length }
}

function summarizeInferred(recipes, infer) {
  const summary = { explicit: 0, easy: 0, home: 0, advanced: 0 }
  for (const recipe of recipes) {
    if (!lacksDifficulty(recipe)) {
      summary.explicit += 1
      continue
    }
    const difficulty = infer(recipe)
    if (Object.prototype.hasOwnProperty.call(summary, difficulty)) {
      summary[difficulty] += 1
    }
  }
  return summary
}

function countDifficulty(recipes) {
  const counts = { easy: 0, home: 0, advanced: 0, missing: 0, other: 0 }
  for (const recipe of recipes) {
    const d = recipe && recipe.difficulty
    if (!(typeof d === 'string' && d.length > 0)) {
      counts.missing += 1
      continue
    }
    if (Object.prototype.hasOwnProperty.call(counts, d)) counts[d] += 1
    else counts.other += 1
  }
  return counts
}

function formatReport({
  mode,
  recipesPath,
  probePlan,
  inferredPlan,
  recipes,
  infer,
  summary,
  afterCounts
}) {
  const lines = [
    `mode: ${mode}`,
    `catalog: ${recipesPath}`,
    `probe writes: ${probePlan.toWrite.length}`
  ]
  for (const row of probePlan.toWrite) {
    const inferred = infer(recipes[row.index])
    lines.push(`write\t${row.id}\t${row.name}\tprobe=${row.difficulty}\tinferred=${inferred}`)
  }
  lines.push(`missing probe names: ${probePlan.missingNames.length}`)
  for (const name of probePlan.missingNames) lines.push(`missing\t${name}`)
  lines.push(`kept existing difficulty: ${probePlan.kept.length}`)
  for (const row of probePlan.kept) {
    lines.push(`kept\t${row.id}\t${row.name}\texisting=${row.difficulty}\tprobe=${row.probeDifficulty}`)
  }
  lines.push(
    `inferred preview (blanks before apply): explicit=${summary.explicit} easy=${summary.easy} home=${summary.home} advanced=${summary.advanced}`
  )
  if (inferredPlan) {
    lines.push(`inferred writes: ${inferredPlan.toWrite.length}`)
  } else {
    lines.push('inferred difficulties were not written')
  }
  if (afterCounts) {
    lines.push(
      `after counts: easy=${afterCounts.easy} home=${afterCounts.home} advanced=${afterCounts.advanced} missing=${afterCounts.missing} other=${afterCounts.other}`
    )
  }
  return lines.join('\n') + '\n'
}

function runBackfill(options = {}) {
  const recipesPath = options.recipesPath || DEFAULT_RCP
  const probeDishes = options.probeDishes || PROBE_DISHES
  const infer = options.inferDifficulty || inferDifficulty
  const applyProbe = !!options.applyProbeNames
  const applyInferred = !!options.applyInferred
  const raw = fs.readFileSync(recipesPath, 'utf8')
  const recipes = JSON.parse(raw)
  if (!Array.isArray(recipes)) {
    throw new Error('recipes file must be a JSON array')
  }

  const probePlan = planProbeBackfill(recipes, probeDishes)
  const summary = summarizeInferred(recipes, infer)
  const reportRecipes = recipes.map((recipe) => ({ ...recipe }))

  let written = 0
  let inferredPlan = null
  if (applyProbe) {
    written += applyProbeBackfill(recipes, probeDishes).written
  }
  if (applyInferred) {
    inferredPlan = applyInferredBackfill(recipes, infer)
    written += inferredPlan.written
  }

  const modeParts = []
  if (applyProbe) modeParts.push('apply-probe-names')
  if (applyInferred) modeParts.push('apply-inferred')
  const mode = modeParts.length ? modeParts.join('+') : 'dry-run'

  let afterCounts = null
  if (applyProbe || applyInferred) {
    const out = JSON.stringify(recipes, null, 2) + '\n'
    if (out !== raw) fs.writeFileSync(recipesPath, out)
    afterCounts = countDifficulty(recipes)
  }

  const report = formatReport({
    mode,
    recipesPath,
    probePlan,
    inferredPlan,
    recipes: reportRecipes,
    infer,
    summary,
    afterCounts
  })
  return { report, plan: probePlan, inferredPlan, written }
}

function main(argv = process.argv) {
  const args = parseArgs(argv)
  const result = runBackfill({
    applyProbeNames: args.applyProbeNames,
    applyInferred: args.applyInferred
  })
  process.stdout.write(result.report)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  }
}

module.exports = {
  parseArgs,
  planProbeBackfill,
  applyProbeBackfill,
  planInferredBackfill,
  applyInferredBackfill,
  summarizeInferred,
  countDifficulty,
  runBackfill
}
