'use strict'

/**
 * 确认页手补联想：纯字符串检索。拼音由索引预计算，这里不生成 py。
 * 排序分（低分优先）：
 * 0 汉字 surface 前缀
 * 1 汉字 canonical 前缀（surface ≠ canonical）
 * 2 汉字包含（surface 或 canonical）
 * 3 py 前缀（query 为纯字母）
 * 4 initials 前缀（纯字母）
 * 同档 surface.length 升序，再 localeCompare，再原序。
 * 同一 canonical 只保留排序后的第一条。
 */

function normalizeQuery(q) {
  const raw = String(q == null ? '' : q)
  const stripped = raw.replace(/[\s\u3000]+/g, '')
  if (!stripped) return ''
  if (isAscii(stripped)) return stripped.toLowerCase()
  return stripped
}

function isAscii(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false
  }
  return true
}

function isPureLetters(s) {
  if (!s) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 97 || c > 122) return false
  }
  return true
}

function buildEntriesFromAliases(aliasesTable) {
  if (!aliasesTable || typeof aliasesTable !== 'object' || Array.isArray(aliasesTable)) return []
  const entries = []
  const keys = Object.keys(aliasesTable)
  for (let i = 0; i < keys.length; i++) {
    const canonical = keys[i]
    if (!canonical || canonical.charAt(0) === '_') continue
    const aliases = aliasesTable[canonical]
    if (!Array.isArray(aliases)) continue
    const seen = new Set()
    pushSurface(entries, seen, canonical, canonical)
    for (let j = 0; j < aliases.length; j++) {
      pushSurface(entries, seen, aliases[j], canonical)
    }
  }
  return entries
}

function pushSurface(entries, seen, surface, canonical) {
  const s = String(surface == null ? '' : surface).trim()
  if (!s || seen.has(s)) return
  seen.add(s)
  entries.push({ surface: s, canonical: String(canonical) })
}

function toExcludeSet(value) {
  const out = new Set()
  if (!value) return out
  if (value instanceof Set) {
    value.forEach((item) => addExclude(out, item))
    return out
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) addExclude(out, value[i])
  }
  return out
}

function addExclude(set, item) {
  if (item == null) return
  const s = String(item)
  if (s) set.add(s)
}

function resolveLimit(opts) {
  const n = opts && opts.limit
  if (typeof n === 'number' && isFinite(n) && n >= 0) return Math.floor(n)
  return 10
}

function fieldText(value) {
  if (value == null) return ''
  return String(value).toLowerCase()
}

function canonicalOf(entry, surface) {
  if (entry.canonical == null || String(entry.canonical) === '') return surface
  return String(entry.canonical)
}

/**
 * @returns {number|null}
 */
function scoreEntry(query, surface, canonical, entry) {
  if (!query || !surface) return null
  if (!isPureLetters(query)) {
    if (surface.indexOf(query) === 0) return 0
    if (surface !== canonical && canonical.indexOf(query) === 0) return 1
    if (surface.indexOf(query) !== -1) return 2
    if (surface !== canonical && canonical.indexOf(query) !== -1) return 2
    return null
  }
  const py = fieldText(entry.py)
  const initials = fieldText(entry.initials)
  if (py && py.indexOf(query) === 0) return 3
  if (initials && initials.indexOf(query) === 0) return 4
  return null
}

function isStrongScore(score) {
  return score === 0 || score === 1 || score === 3 || score === 4
}

function compareHits(a, b) {
  if (a.score !== b.score) return a.score - b.score
  if (a.surface.length !== b.surface.length) return a.surface.length - b.surface.length
  const byName = a.surface.localeCompare(b.surface)
  if (byName !== 0) return byName
  return a.index - b.index
}

function collectHits(query, entries, exclude) {
  const q = normalizeQuery(query)
  if (!q) return []
  const list = Array.isArray(entries) ? entries : []
  const hits = []
  for (let i = 0; i < list.length; i++) {
    const entry = list[i]
    if (!entry) continue
    const surface = String(entry.surface == null ? '' : entry.surface).trim()
    if (!surface) continue
    const canonical = canonicalOf(entry, surface)
    if (exclude && exclude.has(canonical)) continue
    const score = scoreEntry(q, surface, canonical, entry)
    if (score == null) continue
    hits.push({ surface: surface, canonical: canonical, score: score, index: i })
  }
  hits.sort(compareHits)
  return hits
}

function labelFor(surface, canonical) {
  if (surface === canonical) return surface
  return surface + '（' + canonical + '）'
}

function suggestManualIngredients(query, entries, opts) {
  const q = normalizeQuery(query)
  if (!q) return { candidates: [], unmatchedHint: false }
  const limit = resolveLimit(opts)
  const exclude = toExcludeSet(opts && opts.excludeCanonicals)
  const hits = collectHits(query, entries, exclude)
  const seen = new Set()
  const candidates = []
  for (let i = 0; i < hits.length && candidates.length < limit; i++) {
    const hit = hits[i]
    if (seen.has(hit.canonical)) continue
    seen.add(hit.canonical)
    candidates.push({
      surface: hit.surface,
      canonical: hit.canonical,
      label: labelFor(hit.surface, hit.canonical)
    })
  }
  return { candidates: candidates, unmatchedHint: candidates.length === 0 }
}

function fromPicked(picked) {
  if (!picked || typeof picked !== 'object' || Array.isArray(picked)) return null
  let canonical = ''
  if (picked.canonical != null && String(picked.canonical) !== '') canonical = String(picked.canonical)
  else if (picked.name != null && String(picked.name) !== '') canonical = String(picked.name)
  if (!canonical) return null
  let displayName = canonical
  if (picked.displayName != null && String(picked.displayName) !== '') displayName = String(picked.displayName)
  else if (picked.surface != null && String(picked.surface) !== '') displayName = String(picked.surface)
  return { matched: true, name: canonical, displayName: displayName, canonical: canonical }
}

function uniqueCanonicals(hits) {
  const out = []
  const seen = new Set()
  for (let i = 0; i < hits.length; i++) {
    const canonical = hits[i].canonical
    if (seen.has(canonical)) continue
    seen.add(canonical)
    out.push(canonical)
  }
  return out
}

function bestHit(hits, canonical) {
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].canonical === canonical) return hits[i]
  }
  return null
}

function matchedFromHit(hit) {
  return {
    matched: true,
    name: hit.canonical,
    displayName: hit.surface,
    canonical: hit.canonical
  }
}

function resolveManualAdd(query, entries, opts) {
  const picked = fromPicked(opts && opts.picked)
  if (picked) return picked

  const trimmed = String(query == null ? '' : query).trim()
  const free = { matched: false, name: trimmed, displayName: trimmed }
  const hits = collectHits(query, entries, null)
  const strong = []
  for (let i = 0; i < hits.length; i++) {
    if (isStrongScore(hits[i].score)) strong.push(hits[i])
  }
  const exclude = toExcludeSet(opts && opts.excludeCanonicals)
  const visible = []
  for (let i = 0; i < strong.length; i++) {
    if (!exclude.has(strong[i].canonical)) visible.push(strong[i])
  }
  const pool = visible.length ? visible : strong
  const canons = uniqueCanonicals(pool)
  if (canons.length !== 1) return free
  return matchedFromHit(bestHit(pool, canons[0]))
}

module.exports = {
  normalizeQuery,
  buildEntriesFromAliases,
  suggestManualIngredients,
  resolveManualAdd
}
