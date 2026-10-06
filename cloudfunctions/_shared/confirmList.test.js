const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildConfirmList } = require('./confirmList.js')

const base = [
  { id: 'ing_salt', name: '盐', kind: 'seasoning', cities: [], sort: 1 },
  { id: 'ing_egg', name: '鸡蛋', kind: 'main', availability: 'year_round', cities: [], sort: 1, category: 'egg_dairy', onConfirmPage: false },
  { id: 'ing_pork', name: '猪肉', kind: 'main', availability: 'year_round', cities: [], sort: 2, category: 'meat', onConfirmPage: false, avoidTags: ['pork'] },
  { id: 'ing_tomato', name: '番茄', kind: 'main', availability: 'seasonal', cities: [], sort: 1, category: 'fruit_veg', onConfirmPage: true },
  { id: 'ing_hz_only', name: '杭州特产菜', kind: 'main', availability: 'seasonal', cities: ['杭州'], sort: 1, category: 'leaf', onConfirmPage: true }
]

describe('buildConfirmList', () => {
  it('drops seasoning and splits yearRound vs seasonal', () => {
    const r = buildConfirmList(base, null)
    assert.ok(!r.seasonal.find(x => x.id === 'ing_salt'))
    assert.ok(r.yearRound.find(x => x.id === 'ing_egg'))
    assert.ok(r.seasonal.find(x => x.id === 'ing_tomato'))
  })

  it('falls back to national when city-specific too few', () => {
    const r = buildConfirmList(base, '杭州')
    // 杭州专属只有 1 条 < 3 → fallback
    assert.equal(r.fallback, 'national')
    assert.ok(!r.seasonal.find(x => x.id === 'ing_hz_only'))
    assert.ok(r.seasonal.find(x => x.id === 'ing_tomato'))
  })
})
