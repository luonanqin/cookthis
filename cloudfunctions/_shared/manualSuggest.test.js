'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeQuery,
  buildEntriesFromAliases,
  suggestManualIngredients,
  resolveManualAdd
} = require('./manualSuggest.js')

const entries = [
  { surface: '西红柿', canonical: '番茄', py: 'xihongshi', initials: 'xhs' },
  { surface: '番茄', canonical: '番茄', py: 'fanqie', initials: 'fq' }
]

describe('normalizeQuery', () => {
  it('trims, strips whitespace, lowercases ascii-only text', () => {
    assert.equal(normalizeQuery('  Xi Hong  '), 'xihong')
    assert.equal(normalizeQuery('西 红'), '西红')
    assert.equal(normalizeQuery('西\u3000红'), '西红')
    assert.equal(normalizeQuery('  AbC! '), 'abc!')
    assert.equal(normalizeQuery('Ab番茄'), 'Ab番茄')
    assert.equal(normalizeQuery(null), '')
    assert.equal(normalizeQuery(undefined), '')
    assert.equal(normalizeQuery(''), '')
  })
})

describe('buildEntriesFromAliases', () => {
  it('emits canonical plus aliases without pinyin', () => {
    const list = buildEntriesFromAliases({
      _meta: { source: 'x' },
      番茄: ['西红柿', '番茄', ''],
      西瓜: []
    })
    assert.deepEqual(list, [
      { surface: '番茄', canonical: '番茄' },
      { surface: '西红柿', canonical: '番茄' },
      { surface: '西瓜', canonical: '西瓜' }
    ])
    assert.equal(list[0].py, undefined)
    assert.equal(list[0].initials, undefined)
  })

  it('skips non-arrays and null tables', () => {
    assert.deepEqual(buildEntriesFromAliases(null), [])
    assert.deepEqual(buildEntriesFromAliases({ 番茄: '西红柿' }), [])
  })

  it('built entries match a hanzi prefix', () => {
    const list = buildEntriesFromAliases({ 番茄: ['西红柿'] })
    const r = suggestManualIngredients('西红', list)
    assert.equal(r.candidates[0].canonical, '番茄')
    assert.equal(r.candidates[0].surface, '西红柿')
    assert.equal(r.candidates[0].label, '西红柿（番茄）')
  })
})

describe('suggestManualIngredients', () => {
  it('xihong maps to 番茄 via py prefix', () => {
    const entries = [
      { surface: '西红柿', canonical: '番茄', py: 'xihongshi', initials: 'xhs' },
      { surface: '番茄', canonical: '番茄', py: 'fanqie', initials: 'fq' }
    ]
    const r = suggestManualIngredients('xihong', entries, { limit: 10 })
    assert.equal(r.candidates[0].canonical, '番茄')
    assert.equal(r.candidates.length, 1) // 合并
  })

  it('汉字 西红 命中', () => {
    const r = suggestManualIngredients('西红', entries)
    assert.ok(r.candidates.some((c) => c.canonical === '番茄'))
  })

  it('labels an alias with the canonical in fullwidth parens', () => {
    const r = suggestManualIngredients('西红', entries)
    assert.deepEqual(r.candidates[0], {
      surface: '西红柿',
      canonical: '番茄',
      label: '西红柿（番茄）'
    })
    assert.equal(r.unmatchedHint, false)
  })

  it('collapses spaces and ascii case before matching', () => {
    const py = suggestManualIngredients('  XI Hong ', entries)
    assert.equal(py.candidates[0].canonical, '番茄')
    const hanzi = suggestManualIngredients('西 红', entries)
    assert.ok(hanzi.candidates.some((c) => c.canonical === '番茄'))
  })

  it('maps initials prefix case-insensitively', () => {
    const r = suggestManualIngredients('FQ', entries)
    assert.deepEqual(r.candidates, [{ surface: '番茄', canonical: '番茄', label: '番茄' }])
    const viaXhs = suggestManualIngredients('xhs', entries)
    assert.equal(viaXhs.candidates[0].surface, '西红柿')
    assert.equal(viaXhs.candidates[0].canonical, '番茄')
  })

  it('py prefix outranks a shorter initials-only surface', () => {
    const list = [
      { surface: '短', canonical: '短', py: 'yyy', initials: 'z' },
      { surface: '长长长', canonical: '长长长', py: 'zzz', initials: 'zz' }
    ]
    const r = suggestManualIngredients('z', list)
    assert.deepEqual(
      r.candidates.map((c) => c.canonical),
      ['长长长', '短']
    )
  })

  it('surface prefix outranks a shorter canonical-prefix alias', () => {
    const list = [
      { surface: '瓜', canonical: '南瓜' },
      { surface: '南瓜饼', canonical: '南瓜饼' }
    ]
    const r = suggestManualIngredients('南', list)
    assert.deepEqual(
      r.candidates.map((c) => c.canonical),
      ['南瓜饼', '南瓜']
    )
    assert.equal(r.candidates[1].label, '瓜（南瓜）')
  })

  it('canonical prefix outranks a shorter contains hit', () => {
    const list = [
      { surface: '红南瓜', canonical: '樱桃南瓜' },
      { surface: '别名很长很长', canonical: '南瓜' }
    ]
    const r = suggestManualIngredients('南', list)
    assert.deepEqual(
      r.candidates.map((c) => c.canonical),
      ['南瓜', '樱桃南瓜']
    )
    assert.equal(r.candidates[0].label, '别名很长很长（南瓜）')
  })

  it('canonical contains matches when the surface does not', () => {
    const r = suggestManualIngredients('茄', [{ surface: '西红柿', canonical: '番茄' }])
    assert.deepEqual(r.candidates, [
      { surface: '西红柿', canonical: '番茄', label: '西红柿（番茄）' }
    ])
  })

  it('same score ranks shorter surface first', () => {
    const list = [
      { surface: '番茄炒蛋', canonical: '番茄炒蛋' },
      { surface: '番茄', canonical: '番茄' }
    ]
    const r = suggestManualIngredients('番茄', list)
    assert.deepEqual(
      r.candidates.map((c) => c.surface),
      ['番茄', '番茄炒蛋']
    )
  })

  it('tie-breaks equal score and length with localeCompare', () => {
    const list = [
      { surface: '豆角', canonical: '豆角' },
      { surface: '豆芽', canonical: '豆芽' }
    ]
    const r = suggestManualIngredients('豆', list)
    const expected = ['豆角', '豆芽'].sort((a, b) => a.localeCompare(b))
    assert.deepEqual(
      r.candidates.map((c) => c.surface),
      expected
    )
  })

  it('keeps input order when surface and score tie', () => {
    const list = [
      { surface: '豆苗', canonical: '甲豆苗' },
      { surface: '豆苗', canonical: '乙豆苗' }
    ]
    const r = suggestManualIngredients('豆', list)
    assert.deepEqual(
      r.candidates.map((c) => c.canonical),
      ['甲豆苗', '乙豆苗']
    )
  })

  it('dedupes by canonical after ranking', () => {
    const list = [
      { surface: '西红柿', canonical: '番茄' },
      { surface: '番茄', canonical: '番茄' }
    ]
    const r = suggestManualIngredients('番', list)
    assert.equal(r.candidates.length, 1)
    assert.equal(r.candidates[0].surface, '番茄')
    assert.equal(r.candidates[0].label, '番茄')
  })

  it('defaults limit to 10 and applies it after dedupe', () => {
    const many = []
    for (let i = 0; i < 12; i++) {
      const surface = '菜' + String.fromCharCode(0x4e00 + i)
      many.push({ surface: surface, canonical: surface })
    }
    assert.equal(suggestManualIngredients('菜', many).candidates.length, 10)
    assert.equal(suggestManualIngredients('菜', many, {}).candidates.length, 10)
    assert.equal(suggestManualIngredients('菜', many, { limit: 3 }).candidates.length, 3)

    const dupes = []
    for (let i = 0; i < 12; i++) dupes.push({ surface: '番茄' + i, canonical: '番茄' })
    dupes.push({ surface: '番茄', canonical: '番茄' })
    const collapsed = suggestManualIngredients('番', dupes, { limit: 10 })
    assert.equal(collapsed.candidates.length, 1)
    assert.equal(collapsed.candidates[0].surface, '番茄')
  })

  it('excludeCanonicals accepts a Set or an array', () => {
    const bySet = suggestManualIngredients('番', entries, {
      excludeCanonicals: new Set(['番茄'])
    })
    const byArray = suggestManualIngredients('番', entries, { excludeCanonicals: ['番茄'] })
    assert.deepEqual(bySet, { candidates: [], unmatchedHint: true })
    assert.deepEqual(byArray, { candidates: [], unmatchedHint: true })
  })

  it('does not exclude a different surface string', () => {
    const r = suggestManualIngredients('番', entries, { excludeCanonicals: ['西红柿'] })
    assert.ok(r.candidates.some((c) => c.canonical === '番茄'))
  })

  it('blank query yields no candidates and no hint', () => {
    assert.deepEqual(suggestManualIngredients('   ', entries), {
      candidates: [],
      unmatchedHint: false
    })
  })

  it('unknown query sets unmatchedHint', () => {
    assert.deepEqual(suggestManualIngredients('独角兽', entries), {
      candidates: [],
      unmatchedHint: true
    })
  })

  it('ignores null and empty entries', () => {
    const r = suggestManualIngredients('番', [
      null,
      { surface: '' },
      { surface: '番茄', canonical: '番茄' }
    ])
    assert.equal(r.candidates.length, 1)
    assert.equal(r.candidates[0].canonical, '番茄')
  })

  it('does not treat null py as the string null', () => {
    const r = suggestManualIngredients('null', [{ surface: '番茄', canonical: '番茄', py: null, initials: null }])
    assert.deepEqual(r, { candidates: [], unmatchedHint: true })
  })
})

describe('resolveManualAdd', () => {
  it('unique py prefix stores the canonical as name', () => {
    assert.deepEqual(resolveManualAdd('xihong', entries), {
      matched: true,
      name: '番茄',
      displayName: '西红柿',
      canonical: '番茄'
    })
    assert.deepEqual(resolveManualAdd('  XI Hong ', entries), {
      matched: true,
      name: '番茄',
      displayName: '西红柿',
      canonical: '番茄'
    })
  })

  it('unique hanzi prefix prefers the canonical surface', () => {
    assert.deepEqual(resolveManualAdd('番茄', entries), {
      matched: true,
      name: '番茄',
      displayName: '番茄',
      canonical: '番茄'
    })
  })

  it('unique initials prefix is a strong match', () => {
    assert.deepEqual(resolveManualAdd('fq', entries), {
      matched: true,
      name: '番茄',
      displayName: '番茄',
      canonical: '番茄'
    })
  })

  it('picked stores canonical as name', () => {
    assert.deepEqual(
      resolveManualAdd('nope', [], { picked: { surface: '西红柿', canonical: '番茄' } }),
      { matched: true, name: '番茄', displayName: '西红柿', canonical: '番茄' }
    )
  })

  it('picked canonical wins when name differs', () => {
    assert.deepEqual(
      resolveManualAdd('西红柿', [], {
        picked: { name: '西红柿', canonical: '番茄', displayName: '西红柿' }
      }),
      { matched: true, name: '番茄', displayName: '西红柿', canonical: '番茄' }
    )
  })

  it('free text keeps trimmed user text when nothing matches', () => {
    assert.deepEqual(resolveManualAdd('  独角兽  ', entries), {
      matched: false,
      name: '独角兽',
      displayName: '独角兽'
    })
    assert.equal(resolveManualAdd('DragonFruit', entries).name, 'DragonFruit')
  })

  it('free text when several strong prefixes match', () => {
    const list = entries.concat([
      { surface: '西瓜', canonical: '西瓜', py: 'xigua', initials: 'xg' }
    ])
    assert.deepEqual(resolveManualAdd('西', list), {
      matched: false,
      name: '西',
      displayName: '西'
    })
  })

  it('contains-only hit is not a strong prefix', () => {
    assert.deepEqual(resolveManualAdd('茄', entries), {
      matched: false,
      name: '茄',
      displayName: '茄'
    })
  })

  it('unique strong prefix wins over a weaker contains candidate', () => {
    const list = [
      { surface: '番茄', canonical: '番茄' },
      { surface: '红番茄', canonical: '樱桃番茄' }
    ]
    assert.deepEqual(resolveManualAdd('番', list), {
      matched: true,
      name: '番茄',
      displayName: '番茄',
      canonical: '番茄'
    })
  })

  it('returns the excluded canonical when it is the only strong hit', () => {
    assert.deepEqual(resolveManualAdd('西红柿', entries, { excludeCanonicals: ['番茄'] }), {
      matched: true,
      name: '番茄',
      displayName: '西红柿',
      canonical: '番茄'
    })
  })

  it('skips an excluded canonical when another strong hit remains', () => {
    const list = entries.concat([{ surface: '西瓜', canonical: '西瓜' }])
    assert.deepEqual(
      resolveManualAdd('西', list, { excludeCanonicals: new Set(['番茄']) }),
      { matched: true, name: '西瓜', displayName: '西瓜', canonical: '西瓜' }
    )
  })
})
