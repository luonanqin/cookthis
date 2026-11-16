#!/usr/bin/env node
'use strict'

/**
 * 用 DeepSeek 重标 recipes-builtin 中未标注 / 通用菜的 cuisineTags。
 *
 *   export DEEPSEEK_API_KEY=sk-...
 *   node scripts/llm-tag-recipe-cuisines.js                 # dry-run
 *   node scripts/llm-tag-recipe-cuisines.js --apply         # 写回
 *   node scripts/llm-tag-recipe-cuisines.js --limit 40
 *   node scripts/llm-tag-recipe-cuisines.js --batch 25
 *   node scripts/llm-tag-recipe-cuisines.js --reset-checkpoint
 *
 * API: https://api.deepseek.com  model: deepseek-chat
 */

const fs = require('fs')
const path = require('path')
const {
  selectCandidates,
  buildSystemPrompt,
  buildUserPrompt,
  parseModelBatchJson,
  applyLlmChanges,
  summarizeBatchForLog,
  normalizeLlmTags
} = require('./lib/llmCuisineTag.js')

const ROOT = path.join(__dirname, '..')
const BUILTIN = path.join(ROOT, 'data/catalog/recipes-builtin.json')
const CHECKPOINT = path.join(ROOT, 'data/catalog/.llm-cuisine-checkpoint.json')
const DEFAULT_BASE = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_BATCH = 30

function parseArgs(argv) {
  const out = {
    apply: false,
    limit: 0,
    batch: DEFAULT_BATCH,
    resetCheckpoint: false,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--reset-checkpoint') out.resetCheckpoint = true
    else if (a === '--limit') out.limit = Number(argv[++i] || 0)
    else if (a === '--batch') out.batch = Number(argv[++i] || DEFAULT_BATCH)
    else if (a === '--base-url') out.baseUrl = String(argv[++i] || DEFAULT_BASE)
    else if (a === '--model') out.model = String(argv[++i] || DEFAULT_MODEL)
    else throw new Error('unknown arg: ' + a)
  }
  if (!Number.isFinite(out.batch) || out.batch < 1) out.batch = DEFAULT_BATCH
  if (!Number.isFinite(out.limit) || out.limit < 0) out.limit = 0
  return out
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return { doneIds: [], changes: {} }
  try {
    const raw = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'))
    return {
      doneIds: Array.isArray(raw.doneIds) ? raw.doneIds.map(String) : [],
      changes:
        raw.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes)
          ? raw.changes
          : {}
    }
  } catch (_) {
    return { doneIds: [], changes: {} }
  }
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

async function chatCompletions({ baseUrl, model, apiKey, system, user }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch (_) {
    throw new Error(`HTTP ${res.status}: non-JSON ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${body.error && body.error.message ? body.error.message : text.slice(0, 300)}`
    )
  }
  const content =
    body.choices &&
    body.choices[0] &&
    body.choices[0].message &&
    body.choices[0].message.content
  if (!content) throw new Error('empty choices in API response')
  return String(content)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const opts = parseArgs(process.argv)
  const apiKey = process.env.DEEPSEEK_API_KEY || ''
  if (!apiKey) {
    console.error('缺少 DEEPSEEK_API_KEY')
    process.exit(1)
  }

  if (opts.resetCheckpoint && fs.existsSync(CHECKPOINT)) {
    fs.unlinkSync(CHECKPOINT)
    console.log('已清除 checkpoint', CHECKPOINT)
  }

  const recipes = JSON.parse(fs.readFileSync(BUILTIN, 'utf8'))
  if (!Array.isArray(recipes)) throw new Error('recipes-builtin must be array')

  let candidates = selectCandidates(recipes, opts.limit)
  const ckpt = loadCheckpoint()
  const done = new Set(ckpt.doneIds)
  const pending = candidates.filter((r) => !done.has(String(r.id)))
  console.log(
    `候选 ${candidates.length}（未标注+通用）；checkpoint 已完成 ${done.size}；本轮待跑 ${pending.length}`
  )
  console.log(`model=${opts.model} batch=${opts.batch} apply=${opts.apply}`)

  const system = buildSystemPrompt()
  const allChanges = Object.assign({}, ckpt.changes)

  for (let i = 0; i < pending.length; i += opts.batch) {
    const batch = pending.slice(i, i + opts.batch)
    const label = `${i + 1}-${i + batch.length}/${pending.length}`
    console.log(`\n=== batch ${label} ===`)
    let parsed
    let attempt = 0
    for (;;) {
      attempt += 1
      try {
        const content = await chatCompletions({
          baseUrl: opts.baseUrl,
          model: opts.model,
          apiKey,
          system,
          user: buildUserPrompt(batch)
        })
        parsed = parseModelBatchJson(content)
        break
      } catch (e) {
        console.error(`  失败 attempt ${attempt}:`, e.message || e)
        if (attempt >= 3) throw e
        await sleep(1500 * attempt)
      }
    }

    const got = new Map()
    for (const row of parsed) {
      if (!row.id) continue
      got.set(row.id, normalizeLlmTags(row.cuisineTags))
    }
    for (const r of batch) {
      const id = String(r.id)
      if (!got.has(id)) {
        console.warn(`  缺 id ${id}（${r.name}），本轮标为空待人工`)
        allChanges[id] = []
      } else {
        allChanges[id] = got.get(id)
      }
      done.add(id)
    }

    const summary = summarizeBatchForLog(batch, parsed)
    for (const s of summary.slice(0, 8)) {
      console.log(
        `  ${s.name}: ${JSON.stringify(s.from)} → ${JSON.stringify(s.to)}`
      )
    }
    if (summary.length > 8) console.log(`  …共 ${summary.length} 道`)

    saveCheckpoint({
      doneIds: [...done],
      changes: allChanges,
      updatedAt: new Date().toISOString()
    })
    await sleep(200)
  }

  // 合并到内存副本做报告
  const draft = recipes.map((r) => Object.assign({}, r, {
    cuisineTags: Array.isArray(r.cuisineTags) ? r.cuisineTags.slice() : []
  }))
  const { updated, skipped, missing } = applyLlmChanges(draft, allChanges)
  console.log('\n汇总:')
  console.log('  将更新', updated.length)
  console.log('  跳过(非候选)', skipped.length)
  console.log('  缺菜谱', missing.length)
  console.log(
    '  更新后空标签',
    draft.filter((r) => !(r.cuisineTags || []).length).length
  )
  console.log(
    '  更新后通用',
    draft.filter(
      (r) =>
        Array.isArray(r.cuisineTags) &&
        r.cuisineTags.length === 1 &&
        r.cuisineTags[0] === 'home_style'
    ).length
  )

  if (!opts.apply) {
    console.log('\ndry-run（未写 builtin）。加 --apply 写回；断点在', CHECKPOINT)
    return
  }

  applyLlmChanges(recipes, allChanges)
  fs.writeFileSync(BUILTIN, JSON.stringify(recipes, null, 2) + '\n', 'utf8')
  console.log('\n已写回', BUILTIN)
  if (fs.existsSync(CHECKPOINT)) {
    fs.unlinkSync(CHECKPOINT)
    console.log('已清除 checkpoint')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
