'use strict'

/**
 * Extract food/dish names from ASR transcript.
 * @param {string} text
 * @param {{ knownNames?: string[] }} [opts]
 * @returns {string[]}
 */
function parseFoodNames(text, opts) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const known = Array.isArray(opts && opts.knownNames)
    ? opts.knownNames.filter(Boolean).slice().sort((a, b) => b.length - a.length)
    : []

  // Prefer matching known catalog names inside the transcript
  if (known.length) {
    const found = []
    for (const name of known) {
      if (raw.includes(name)) found.push(name)
    }
    if (found.length) return dedupe(found)
  }

  return dedupe(splitTokens(raw))
}

function splitTokens(text) {
  return String(text || '')
    .replace(/[。！？!?]/g, ' ')
    .split(/[，,、；;/\s]+|和|跟|与|及|以及|还有|还有个|再加|加上/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 2 &&
        !/^(吃了?|今天|昨天|有|有个|晚饭?|午饭?|早饭?|菜场)$/.test(s)
    )
}

function dedupe(list) {
  const out = []
  const seen = new Set()
  for (const n of list) {
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

module.exports = { parseFoodNames }
