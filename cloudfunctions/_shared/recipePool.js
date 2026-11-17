'use strict'

const RECIPE_BATCH_SIZE = 50
/** 套数未满且库未耗尽时，最多再拉几批（首批之外） */
const RECIPE_REFILL_MAX = 20
/** 单次会话候选池上限，防止无限拉 */
const RECIPE_POOL_CAP = 1000

/**
 * 是否继续按批续拉候选。
 * 例：planCount=1、pool=200、exhausted=false → true（勿因「已有若干批」就停）。
 */
function shouldContinueRecipeRefill(input) {
  const planCount = Number(input && input.planCount) || 0
  const target = Math.max(1, Number(input && input.target) || 2)
  if (planCount >= target) return false
  if (input && input.exhausted) return false
  const poolSize = Number(input && input.poolSize) || 0
  const poolCap =
    Number(input && input.poolCap) > 0
      ? Number(input.poolCap)
      : RECIPE_POOL_CAP
  if (poolSize >= poolCap) return false
  const batchIndex = Number(input && input.batchIndex) || 0
  const maxBatches =
    Number(input && input.maxBatches) > 0
      ? Number(input.maxBatches)
      : RECIPE_REFILL_MAX
  if (batchIndex >= maxBatches) return false
  return true
}

function recipeDocId(row) {
  if (!row) return ''
  return String(row.id || row._id || '')
}

function isEnabled(row) {
  return !row || row.enabled !== false
}

function isNational(row) {
  return !row.cities || row.cities.length === 0
}

function isCitySpecific(row, city) {
  return !!(row.cities && row.cities.length > 0 && city && row.cities.includes(city))
}

/**
 * 从已读出的菜谱行中挑一批：城内优先，再全国；跳过 excludeIds；截断 limit。
 * @param {object[]} rows
 * @param {{ city?: string|null, excludeIds?: string[], limit?: number }} [opts]
 */
function pickRecipeBatch(rows, opts) {
  const city =
    opts && opts.city && String(opts.city).trim() ? String(opts.city).trim() : null
  const exclude = new Set((opts && opts.excludeIds) || [])
  const limit =
    typeof (opts && opts.limit) === 'number' && opts.limit > 0
      ? opts.limit
      : RECIPE_BATCH_SIZE

  const cityHits = []
  const national = []
  for (const row of rows || []) {
    if (!isEnabled(row)) continue
    const id = recipeDocId(row)
    if (!id || exclude.has(id)) continue
    if (city && isCitySpecific(row, city)) {
      cityHits.push(row)
    } else if (isNational(row)) {
      national.push(row)
    }
    // 其它城市专属不进池（非「对应城市」且非全国）
  }

  const out = []
  for (const row of cityHits) {
    if (out.length >= limit) break
    out.push(row)
  }
  for (const row of national) {
    if (out.length >= limit) break
    out.push(row)
  }
  return out
}

/** 当前池是否已被 excluded 耗尽（无剩余可用 id） */
function isRecipePoolExhausted(poolIds, excludedIds) {
  const pool = Array.isArray(poolIds) ? poolIds : []
  if (!pool.length) return true
  const excluded = new Set(excludedIds || [])
  return pool.every((id) => excluded.has(id))
}

module.exports = {
  RECIPE_BATCH_SIZE,
  RECIPE_REFILL_MAX,
  RECIPE_POOL_CAP,
  shouldContinueRecipeRefill,
  recipeDocId,
  pickRecipeBatch,
  isRecipePoolExhausted,
  isNational,
  isCitySpecific
}
