'use strict'

function toMs(v) {
  if (!v) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  // cloud DB may return {$date: ...} or similar — try valueOf
  if (typeof v.valueOf === 'function') {
    const n = Number(v.valueOf())
    if (Number.isFinite(n)) return n
  }
  return null
}

function normalizeName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
}

function collectDishNames(plan) {
  const names = []
  const seen = new Set()
  for (const meal of (plan && plan.meals) || []) {
    for (const dish of meal.dishes || []) {
      const raw = dish && dish.name
      const key = normalizeName(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      names.push(String(raw).trim())
    }
  }
  return names
}

function resolvePlanIndex(doc, anchorKind) {
  if (anchorKind === 'accepted') {
    return typeof doc.acceptedPlanIndex === 'number' ? doc.acceptedPlanIndex : 0
  }
  if (anchorKind === 'engaged') {
    return typeof doc.engagedPlanIndex === 'number' ? doc.engagedPlanIndex : 0
  }
  // both present and times equal: prefer accepted
  return typeof doc.acceptedPlanIndex === 'number' ? doc.acceptedPlanIndex : 0
}

function pickAnchor(recommendations) {
  let best = null
  for (const doc of recommendations || []) {
    if (!doc) continue
    // 只认「最新」一条采纳/停留锚点；已处理也要选中，避免往前翻旧会话
    const acceptedMs = toMs(doc.acceptedAt)
    const engagedMs = toMs(doc.engagedAt)
    if (acceptedMs == null && engagedMs == null) continue

    let anchorMs
    let anchorKind
    if (acceptedMs != null && engagedMs != null) {
      if (acceptedMs >= engagedMs) {
        anchorMs = acceptedMs
        anchorKind = acceptedMs === engagedMs ? 'both' : 'accepted'
      } else {
        anchorMs = engagedMs
        anchorKind = 'engaged'
      }
    } else if (acceptedMs != null) {
      anchorMs = acceptedMs
      anchorKind = 'accepted'
    } else {
      anchorMs = engagedMs
      anchorKind = 'engaged'
    }

    if (!best || anchorMs > best.anchorMs) {
      best = { doc, anchorMs, anchorKind }
    }
  }
  return best
}

/**
 * @param {{ recommendations?: object[], mealLogs?: object[] }} input
 * @returns {{
 *   show: boolean,
 *   dishNames: string[],
 *   requestId?: string,
 *   recommendationId?: string,
 *   anchorAt?: number
 * }}
 */
function buildConfirmCandidates(input) {
  const recommendations = (input && input.recommendations) || []
  const mealLogs = (input && input.mealLogs) || []
  const anchor = pickAnchor(recommendations)
  if (!anchor) {
    return { show: false, dishNames: [] }
  }

  const { doc, anchorMs, anchorKind } = anchor
  // 最新锚点已确认/跳过 → 不弹，也不再往前找更旧的会话
  if (doc.entryConfirmHandled === true) {
    return {
      show: false,
      dishNames: [],
      requestId: doc.requestId,
      recommendationId: doc._id || doc.id,
      anchorAt: anchorMs
    }
  }

  const plans = Array.isArray(doc.plans) ? doc.plans : []
  const planIndex = resolvePlanIndex(doc, anchorKind)
  const plan = plans[planIndex] || plans[0] || null
  const allNames = collectDishNames(plan)

  const recorded = new Set()
  for (const log of mealLogs) {
    const created = toMs(log && log.createdAt)
    if (created == null || created < anchorMs) continue
    for (const name of (log && log.dishNames) || []) {
      const key = normalizeName(name)
      if (key) recorded.add(key)
    }
  }

  const dishNames = allNames.filter((n) => !recorded.has(normalizeName(n)))
  if (dishNames.length === 0) {
    return {
      show: false,
      dishNames: [],
      requestId: doc.requestId,
      recommendationId: doc._id || doc.id,
      anchorAt: anchorMs
    }
  }

  return {
    show: true,
    dishNames,
    requestId: doc.requestId,
    recommendationId: doc._id || doc.id,
    anchorAt: anchorMs
  }
}

module.exports = { buildConfirmCandidates, normalizeName }
