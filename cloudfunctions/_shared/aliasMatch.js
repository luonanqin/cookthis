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
    if (!canonical || canonical.charAt(0) === '_') continue
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

/**
 * 附名称按完整词贪心拼接（空格分隔）；放不下的整段丢弃，不截断、不加省略号。
 * 宽度按清单半列名区估算（rpx ≈ 字号 × 字数）。
 */
function fitSecondaryNames(candidates, displayName, opts) {
  const list = Array.isArray(candidates) ? candidates : []
  if (!list.length) return null
  const large = !!(opts && opts.largeText)
  const secFs = large ? 28 : 22
  const spaceFs = Math.max(8, Math.round(secFs * 0.35))
  // 半列名区约 260rpx；为主名与间距预留，附名侧上限约一半多一点
  const maxRpx = (opts && opts.maxRpx) || (large ? 200 : 184)
  const picked = []
  let used = 0
  for (let i = 0; i < list.length; i++) {
    const n = String(list[i] || '')
    if (!n) continue
    const need = n.length * secFs + (picked.length ? spaceFs : 0)
    if (used + need > maxRpx) break
    picked.push(n)
    used += need
  }
  return picked.length ? picked.join(' ') : null
}

function collectSecondaryNames(displayName, canon, index) {
  const seen = new Set()
  const out = []
  const push = (n) => {
    const s = String(n || '')
    if (!s || s === displayName || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  if (displayName !== canon) push(canon)
  const aliases = (index && index.aliasesOf(canon)) || []
  for (let i = 0; i < aliases.length; i++) push(aliases[i])
  return out
}

function resolveShoppingLabel(raw, opts) {
  const index = opts && opts.index
  const name = String(raw || '')
  if (!name) {
    return { displayName: '', secondaryNames: [], secondaryName: null, checkKey: '' }
  }
  if (!index || !index.has(name)) {
    return { displayName: name, secondaryNames: [], secondaryName: null, checkKey: name }
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
  const secondaryNames = collectSecondaryNames(displayName, canon, index)
  const secondaryName = fitSecondaryNames(secondaryNames, displayName, opts)
  return { displayName, secondaryNames, secondaryName, checkKey: canon }
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
          secondaryNames: label.secondaryNames || [],
          secondaryName: label.secondaryName || null
        })
      )
    })
    const items = Array.from(byKey.values())
    return Object.assign({}, g, { items, rows: pairRows(items) })
  })
}

/**
 * 把已选食材的 category 扩到别名组（如 猪肋排→排骨、三线肉→五花肉），
 * 避免菜谱用口语名时清单掉进「其他」。
 * @param {Record<string, string>} categoryByName
 * @param {{ equiv?: Map<string, Set<string>> }|null} index
 * @returns {Record<string, string>}
 */
function expandCategoryByName(categoryByName, index) {
  const src = categoryByName || {}
  const out = Object.assign({}, src)
  if (!index || !index.equiv) return out
  for (const name of Object.keys(src)) {
    const cat = src[name]
    if (!cat) continue
    const group = index.equiv.get(name)
    if (!group) continue
    group.forEach((surface) => {
      if (out[surface] == null) out[surface] = cat
    })
  }
  return out
}

module.exports = {
  loadAliases,
  buildAliasIndex,
  expandNames,
  expandCategoryByName,
  normalizeCityKey,
  flattenShelfNameOrder,
  fitSecondaryNames,
  collectSecondaryNames,
  resolveShoppingLabel,
  applyShoppingDisplay
}
