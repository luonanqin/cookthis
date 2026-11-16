'use strict'

const CUISINE_COMMON = 'home_style'
const CUISINE_OPTIONS = [
  { id: CUISINE_COMMON, label: '通用' },
  { id: 'sichuan', label: '川菜' },
  { id: 'cantonese', label: '粤菜' },
  { id: 'shandong', label: '鲁菜' },
  { id: 'jiangsu', label: '苏菜' },
  { id: 'zhejiang', label: '浙菜' },
  { id: 'fujian', label: '闽菜' },
  { id: 'hunan', label: '湘菜' },
  { id: 'anhui', label: '徽菜' },
  { id: 'northeast', label: '东北菜' },
  { id: 'northwest', label: '西北菜' },
  { id: 'shanghai', label: '本帮/上海' },
  { id: 'beijing', label: '京菜' },
  { id: 'henan', label: '豫菜' },
  { id: 'yunnan', label: '云南菜' },
  { id: 'guizhou', label: '贵州菜' },
  { id: 'inner_mongolia', label: '内蒙菜' },
  { id: 'xinjiang', label: '新疆菜' },
  { id: 'hubei', label: '湖北菜' },
  { id: 'jiangxi', label: '江西菜' }
]
const CUISINE_CODES = CUISINE_OPTIONS.map((x) => x.id)
const REGIONAL_MAX = 5

function rawTags(row) {
  return Array.isArray(row && row.cuisineTags) ? row.cuisineTags : []
}

function normalizeLlmTags(tags) {
  if (!Array.isArray(tags)) return []
  const allowed = new Set(CUISINE_CODES)
  const out = []
  const seen = new Set()
  for (const t of tags) {
    const s = String(t || '').trim()
    if (!allowed.has(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  if (!out.length) return []
  if (out.includes(CUISINE_COMMON)) return [CUISINE_COMMON]
  if (out.length > REGIONAL_MAX) return [CUISINE_COMMON]
  return out
}

/** 未标注，或规范化后含/仅为通用 → 交给 LLM */
function isLlmCandidate(row) {
  const tags = normalizeLlmTags(rawTags(row))
  if (!tags.length) return true
  return tags.includes(CUISINE_COMMON)
}

function selectCandidates(recipes, limit) {
  const list = (recipes || []).filter(isLlmCandidate)
  const n = Number(limit)
  if (n > 0) return list.slice(0, n)
  return list
}

function buildSystemPrompt() {
  const vocab = CUISINE_OPTIONS.map((o) => `${o.id}（${o.label}）`).join('、')
  return [
    '你是中餐菜系标注助手。根据菜名与主料，为每道菜标注 cuisineTags。',
    `允许的 code 仅限：${vocab}。`,
    '要求：',
    '1. 尽量都标上，少用空数组；家常但无明显地方特色 → home_style（通用）。',
    '2. 可多标地方系；若明显属于很多系（超过 5 个）或空气炸锅/烧烤烤制/卤菜 → 只给 ["home_style"]。',
    '3. 火锅、烧烤作为品类不要标地方系，用 home_style。',
    '4. 只返回 JSON 数组，不要其它说明。每项：{"id":"...","cuisineTags":["..."]}',
    '5. 必须覆盖用户给出的全部 id，不要编造 id。'
  ].join('\n')
}

function buildUserPrompt(batch) {
  const lines = batch.map((r) => {
    const mains = (r.mainIngredients || []).join('、') || '（无）'
    const cur = normalizeLlmTags(rawTags(r))
    return {
      id: r.id,
      name: r.name,
      mainIngredients: mains,
      currentTags: cur
    }
  })
  return `请标注下列菜谱（共 ${lines.length} 道）：\n${JSON.stringify(lines, null, 2)}`
}

function parseModelBatchJson(text) {
  let s = String(text || '').trim()
  if (!s) throw new Error('empty model response')
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('no JSON array in model response')
  const data = JSON.parse(s.slice(start, end + 1))
  if (!Array.isArray(data)) throw new Error('model response is not array')
  return data.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('bad row')
    return {
      id: String(row.id || '').trim(),
      cuisineTags: Array.isArray(row.cuisineTags) ? row.cuisineTags : []
    }
  })
}

/**
 * @returns {{ updated: string[], skipped: string[], missing: string[] }}
 */
function applyLlmChanges(recipes, changesById) {
  const byId = new Map((recipes || []).map((r) => [String(r.id || ''), r]))
  const updated = []
  const skipped = []
  const missing = []
  for (const [rid, tags] of Object.entries(changesById || {})) {
    const id = String(rid || '').trim()
    if (!id) continue
    const row = byId.get(id)
    if (!row) {
      missing.push(id)
      continue
    }
    if (!isLlmCandidate(row)) {
      skipped.push(id)
      continue
    }
    row.cuisineTags = normalizeLlmTags(tags)
    updated.push(id)
  }
  return { updated, skipped, missing }
}

function summarizeBatchForLog(batch, parsed) {
  const byId = new Map(parsed.map((p) => [p.id, normalizeLlmTags(p.cuisineTags)]))
  return batch.map((r) => ({
    id: r.id,
    name: r.name,
    from: normalizeLlmTags(rawTags(r)),
    to: byId.has(r.id) ? byId.get(r.id) : null
  }))
}

module.exports = {
  CUISINE_COMMON,
  CUISINE_OPTIONS,
  CUISINE_CODES,
  REGIONAL_MAX,
  isLlmCandidate,
  normalizeLlmTags,
  selectCandidates,
  buildSystemPrompt,
  buildUserPrompt,
  parseModelBatchJson,
  applyLlmChanges,
  summarizeBatchForLog
}
