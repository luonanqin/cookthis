'use strict'

/**
 * Backfill explicit recipe difficulty.
 *
 * Default: dry-run report. Probe-name matches are listed, and inferDifficulty
 * is only previewed.
 * --apply-probe-names: for each PROBE_DISHES name, if recipes-builtin.json has
 * an exact name match and no difficulty, write that probe difficulty.
 * Inferred difficulties are never written in bulk.
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
  for (const arg of args) {
    if (arg === '--apply-probe-names') {
      applyProbeNames = true
      continue
    }
    throw new Error('unknown argument: ' + arg)
  }
  return { applyProbeNames }
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

function formatReport({ mode, recipesPath, plan, recipes, infer, summary }) {
  const lines = [
    `mode: ${mode}`,
    `catalog: ${recipesPath}`,
    `probe writes: ${plan.toWrite.length}`
  ]
  for (const row of plan.toWrite) {
    const inferred = infer(recipes[row.index])
    lines.push(`write\t${row.id}\t${row.name}\tprobe=${row.difficulty}\tinferred=${inferred}`)
  }
  lines.push(`missing probe names: ${plan.missingNames.length}`)
  for (const name of plan.missingNames) lines.push(`missing\t${name}`)
  lines.push(`kept existing difficulty: ${plan.kept.length}`)
  for (const row of plan.kept) {
    lines.push(`kept\t${row.id}\t${row.name}\texisting=${row.difficulty}\tprobe=${row.probeDifficulty}`)
  }
  lines.push(
    `inferred preview (not written): explicit=${summary.explicit} easy=${summary.easy} home=${summary.home} advanced=${summary.advanced}`
  )
  lines.push('inferred difficulties were not written')
  return lines.join('\n') + '\n'
}

function runBackfill(options = {}) {
  const recipesPath = options.recipesPath || DEFAULT_RCP
  const probeDishes = options.probeDishes || PROBE_DISHES
  const infer = options.inferDifficulty || inferDifficulty
  const apply = !!options.applyProbeNames
  const raw = fs.readFileSync(recipesPath, 'utf8')
  const recipes = JSON.parse(raw)
  if (!Array.isArray(recipes)) {
    throw new Error('recipes file must be a JSON array')
  }

  const plan = planProbeBackfill(recipes, probeDishes)
  const summary = summarizeInferred(recipes, infer)
  const reportRecipes = recipes.map((recipe) => ({ ...recipe }))

  let written = 0
  if (apply) {
    written = applyProbeBackfill(recipes, probeDishes).written
    const out = JSON.stringify(recipes, null, 2) + '\n'
    if (out !== raw) fs.writeFileSync(recipesPath, out)
  }

  const report = formatReport({
    mode: apply ? 'apply-probe-names' : 'dry-run',
    recipesPath,
    plan,
    recipes: reportRecipes,
    infer,
    summary
  })
  return { report, plan, written }
}

function main(argv = process.argv) {
  const args = parseArgs(argv)
  const result = runBackfill({ applyProbeNames: args.applyProbeNames })
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
  summarizeInferred,
  runBackfill
}
