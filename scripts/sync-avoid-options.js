'use strict'

/**
 * 从 ingredients-major-minor.json 的 avoidVocab 同步到：
 * - miniprogram/utils/avoidOptions.js
 * - cloudfunctions/profile/index.js 的 AVOID_CODES（含历史码）
 *
 * Usage: node scripts/sync-avoid-options.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MM_PATH = path.join(ROOT, 'data', 'catalog', 'ingredients-major-minor.json')
const OPT_PATH = path.join(ROOT, 'miniprogram', 'utils', 'avoidOptions.js')
const PROFILE_PATH = path.join(ROOT, 'cloudfunctions', 'profile', 'index.js')

function main() {
  const mm = JSON.parse(fs.readFileSync(MM_PATH, 'utf8'))
  const vocab = mm.avoidVocab
  if (!Array.isArray(vocab) || !vocab.length) {
    throw new Error('avoidVocab missing/empty in major-minor')
  }
  for (const v of vocab) {
    if (!v || !v.id || !v.label) throw new Error('bad avoidVocab item: ' + JSON.stringify(v))
  }

  const optsBody = vocab
    .map((v) => `  { id: '${String(v.id).replace(/'/g, "\\'")}', label: '${String(v.label).replace(/'/g, "\\'")}' }`)
    .join(',\n')

  const optFile = `/**
 * 忌口词表（与 data/catalog/ingredients-major-minor.json 的 avoidVocab 对齐）。
 * 改词表后可跑：node scripts/sync-avoid-options.js
 */
const AVOID_OPTIONS = [
${optsBody}
]

module.exports = {
  AVOID_OPTIONS
}
`
  fs.writeFileSync(OPT_PATH, optFile)

  const ids = vocab.map((v) => v.id)
  const allowed = [...ids]
  const codesLit = '[' + allowed.map((x) => `'${x}'`).join(', ') + ']'

  let profile = fs.readFileSync(PROFILE_PATH, 'utf8')
  const re = /const AVOID_CODES = \[[^\]]*\]/
  if (!re.test(profile)) {
    throw new Error('AVOID_CODES declaration not found in profile/index.js')
  }
  profile = profile.replace(re, `const AVOID_CODES = ${codesLit}`)
  fs.writeFileSync(PROFILE_PATH, profile)

  console.log('Wrote', OPT_PATH)
  console.log('Updated AVOID_CODES in', PROFILE_PATH)
  console.log('UI options:', ids.join(', '))
  console.log('Sanitize allow:', allowed.join(', '))
}

main()
