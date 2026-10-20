'use strict'

function loadAliases(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const k of Object.keys(src)) {
    if (!k || k.charAt(0) === '_') continue
    const v = src[k]
    if (!Array.isArray(v)) continue
    out[k] = v.map(String)
  }
  return out
}

function buildAliasIndex(aliases) {
  const equiv = new Map()
  const canonMap = new Map()
  const aliasLists = new Map()
  const table = aliases || {}
  for (const canonical of Object.keys(table)) {
    const list = table[canonical] || []
    aliasLists.set(canonical, list.slice())
    const group = new Set([canonical].concat(list))
    for (const surface of group) {
      equiv.set(surface, group)
      canonMap.set(surface, canonical)
    }
  }
  return {
    equiv,
    canonicalOf(surface) {
      const s = String(surface || '')
      return canonMap.has(s) ? canonMap.get(s) : s
    },
    aliasesOf(canon) {
      return (aliasLists.get(canon) || []).slice()
    },
    has(surface) {
      return equiv.has(String(surface || ''))
    }
  }
}

function expandNames(names, index) {
  const out = new Set()
  const list = names || []
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    if (!n) continue
    const group = index && index.equiv && index.equiv.get(n)
    if (group) {
      group.forEach((x) => out.add(x))
    } else {
      out.add(n)
    }
  }
  return out
}

function normalizeCityKey(city) {
  let s = String(city || '').trim()
  if (!s) return ''
  const suffixes = ['特别行政区', '自治区', '省', '市']
  for (let i = 0; i < suffixes.length; i++) {
    const suf = suffixes[i]
    if (s.length > suf.length && s.endsWith(suf)) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}

function flattenShelfNameOrder(cityDoc) {
  const cats = (cityDoc && cityDoc.categories) || {}
  const out = []
  const seen = new Set()
  for (const key of Object.keys(cats)) {
    const arr = cats[key] || []
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i]
      if (!n || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

function resolveShoppingLabel(raw, opts) {
  const index = opts && opts.index
  const name = String(raw || '')
  if (!name) {
    return { displayName: '', secondaryName: null, checkKey: '' }
  }
  if (!index || !index.has(name)) {
    return { displayName: name, secondaryName: null, checkKey: name }
  }
  const canon = index.canonicalOf(name)
  const group = index.equiv.get(name) || new Set([name])
  const cityKey = normalizeCityKey(opts && opts.city)
  const shelfOrder = (opts && opts.shelfOrder) || []
  let displayName = canon
  if (cityKey && shelfOrder.length) {
    const hits = []
    for (let i = 0; i < shelfOrder.length; i++) {
      const n = shelfOrder[i]
      if (group.has(n)) hits.push(n)
    }
    if (hits.length) {
      let local = null
      for (let i = 0; i < hits.length; i++) {
        if (hits[i] !== canon) {
          local = hits[i]
          break
        }
      }
      displayName = local || canon
    }
  }
  let secondaryName = null
  if (displayName !== canon) {
    secondaryName = canon
  } else {
    const aliases = index.aliasesOf(canon)
    for (let i = 0; i < aliases.length; i++) {
      if (aliases[i] && aliases[i] !== displayName) {
        secondaryName = aliases[i]
        break
      }
    }
  }
  return { displayName, secondaryName, checkKey: canon }
}

function pairRows(items) {
  const list = Array.isArray(items) ? items : []
  const rows = []
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2))
  }
  return rows
}

function applyShoppingDisplay(groups, opts) {
  const src = groups || []
  return src.map((g) => {
    const byKey = new Map()
    ;(g.items || []).forEach((it) => {
      const label = resolveShoppingLabel(it.name, opts)
      if (!label.checkKey) return
      if (byKey.has(label.checkKey)) return
      byKey.set(
        label.checkKey,
        Object.assign({}, it, {
          name: label.checkKey,
          checkKey: label.checkKey,
          displayName: label.displayName,
          secondaryName: label.secondaryName || null
        })
      )
    })
    const items = Array.from(byKey.values())
    return Object.assign({}, g, { items, rows: pairRows(items) })
  })
}

module.exports = {
  loadAliases,
  buildAliasIndex,
  expandNames,
  normalizeCityKey,
  flattenShelfNameOrder,
  resolveShoppingLabel,
  applyShoppingDisplay
}
