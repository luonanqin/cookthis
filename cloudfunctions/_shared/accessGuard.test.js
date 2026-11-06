'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveIngredientsCity,
  consumeIngredientsCall,
  consumeCatalogAliasesCall,
  consumeCatalogShelfCall,
  checkCityChange,
  weekKeyChina,
  CITY_CHANGE_MAX_PER_WEEK,
  INGREDIENTS_MAX_PER_DAY,
  CATALOG_ALIASES_MAX_PER_DAY,
  CATALOG_SHELF_MAX_PER_DAY
} = require('./accessGuard.js')

describe('resolveIngredientsCity', () => {
  it('ignores eventCity and uses userCity', () => {
    assert.equal(
      resolveIngredientsCity({ eventCity: '上海', userCity: '北京' }),
      '北京'
    )
  })

  it('returns null when user has no city', () => {
    assert.equal(
      resolveIngredientsCity({ eventCity: '上海', userCity: null }),
      null
    )
    assert.equal(resolveIngredientsCity({ eventCity: '上海', userCity: '' }), null)
    assert.equal(resolveIngredientsCity({ eventCity: '上海', userCity: '  ' }), null)
  })

  it('trims userCity', () => {
    assert.equal(
      resolveIngredientsCity({ eventCity: null, userCity: '  重庆  ' }),
      '重庆'
    )
  })
})

describe('consumeIngredientsCall', () => {
  const t0 = Date.parse('2026-11-03T08:00:00.000Z')

  it('allows first call and increments', () => {
    const r = consumeIngredientsCall(null, t0)
    assert.equal(r.ok, true)
    assert.equal(r.next.ingredientsCount, 1)
    assert.equal(r.next.ingredientsDay, '2026-11-03')
  })

  it('rate limits when calls are too close', () => {
    const first = consumeIngredientsCall(null, t0)
    const second = consumeIngredientsCall(first.next, t0 + 100)
    assert.equal(second.ok, false)
    assert.equal(second.error, 'RATE_LIMITED')
  })

  it('enforces daily max', () => {
    let g = null
    const opts = { maxPerDay: 2, minIntervalMs: 0 }
    g = consumeIngredientsCall(g, t0, opts).next
    g = consumeIngredientsCall(g, t0 + 1, opts).next
    const blocked = consumeIngredientsCall(g, t0 + 2, opts)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'INGREDIENTS_DAILY_LIMIT')
  })

  it('resets count on new UTC day', () => {
    const opts = { maxPerDay: 1, minIntervalMs: 0 }
    const g = consumeIngredientsCall(null, t0, opts).next
    const nextDay = Date.parse('2026-11-04T00:00:00.000Z')
    const r = consumeIngredientsCall(g, nextDay, opts)
    assert.equal(r.ok, true)
    assert.equal(r.next.ingredientsCount, 1)
    assert.equal(r.next.ingredientsDay, '2026-11-04')
  })

  it('default daily max is INGREDIENTS_MAX_PER_DAY', () => {
    assert.equal(INGREDIENTS_MAX_PER_DAY, 60)
  })
})

describe('weekKeyChina', () => {
  it('uses Monday of China week as key', () => {
    // 2026-11-03 16:00 CST = Tuesday → week starts 2026-11-02
    assert.equal(weekKeyChina(Date.parse('2026-11-03T08:00:00.000Z')), '2026-11-02')
  })

  it('rolls at China Monday 00:00', () => {
    // 2026-11-01 23:59:59 CST = Sunday → week of 2026-10-26
    assert.equal(weekKeyChina(Date.parse('2026-11-01T15:59:59.000Z')), '2026-10-26')
    // 2026-11-02 00:00:00 CST = Monday → new week
    assert.equal(weekKeyChina(Date.parse('2026-11-01T16:00:00.000Z')), '2026-11-02')
  })
})

describe('checkCityChange', () => {
  const t0 = Date.parse('2026-11-03T08:00:00.000Z')

  it('allows first city set without counting', () => {
    const r = checkCityChange(null, '', '北京', t0)
    assert.equal(r.ok, true)
    assert.equal(r.countChange, false)
  })

  it('allows same city without counting', () => {
    const r = checkCityChange(null, '北京', '北京', t0)
    assert.equal(r.ok, true)
    assert.equal(r.countChange, false)
  })

  it('counts real change and stores week guard', () => {
    const r = checkCityChange(null, '北京', '上海', t0)
    assert.equal(r.ok, true)
    assert.equal(r.countChange, true)
    assert.equal(r.next.cityChangeCount, 1)
    assert.equal(r.next.cityChangeWeek, '2026-11-02')
    assert.equal(r.next.cityChangedAtMs, t0)
  })

  it('allows immediate second change (no interval)', () => {
    const g = checkCityChange(null, '北京', '上海', t0).next
    const soon = checkCityChange(g, '上海', '广州', t0 + 1)
    assert.equal(soon.ok, true)
    assert.equal(soon.next.cityChangeCount, 2)
  })

  it('enforces weekly max of 2', () => {
    let g = null
    let prev = '城0'
    for (let i = 1; i <= 2; i++) {
      const next = '城' + i
      const r = checkCityChange(g, prev, next, t0 + i)
      assert.equal(r.ok, true)
      g = r.next
      prev = next
    }
    const blocked = checkCityChange(g, prev, '城3', t0 + 3)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'CITY_CHANGE_WEEKLY_LIMIT')
  })

  it('resets count on new China week', () => {
    const opts = { maxPerWeek: 1 }
    const g = checkCityChange(null, '北京', '上海', t0, opts).next
    // next China Monday 00:00
    const nextWeek = Date.parse('2026-11-08T16:00:00.000Z')
    const r = checkCityChange(g, '上海', '广州', nextWeek, opts)
    assert.equal(r.ok, true)
    assert.equal(r.next.cityChangeCount, 1)
    assert.equal(r.next.cityChangeWeek, '2026-11-09')
  })

  it('default max per week is CITY_CHANGE_MAX_PER_WEEK', () => {
    assert.equal(CITY_CHANGE_MAX_PER_WEEK, 2)
  })
})

describe('consumeCatalogAliasesCall', () => {
  const t0 = Date.parse('2026-11-03T08:00:00.000Z')

  it('allows then rate limits', () => {
    const first = consumeCatalogAliasesCall(null, t0)
    assert.equal(first.ok, true)
    assert.equal(first.next.catalogAliasesCount, 1)
    const second = consumeCatalogAliasesCall(first.next, t0 + 100)
    assert.equal(second.ok, false)
    assert.equal(second.error, 'RATE_LIMITED')
  })

  it('enforces daily max', () => {
    const opts = { maxPerDay: 1, minIntervalMs: 0 }
    const g = consumeCatalogAliasesCall(null, t0, opts).next
    const blocked = consumeCatalogAliasesCall(g, t0 + 1, opts)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'CATALOG_ALIASES_DAILY_LIMIT')
  })

  it('default max is CATALOG_ALIASES_MAX_PER_DAY', () => {
    assert.equal(CATALOG_ALIASES_MAX_PER_DAY, 30)
  })
})

describe('consumeCatalogShelfCall', () => {
  const t0 = Date.parse('2026-11-03T08:00:00.000Z')

  it('enforces daily max', () => {
    const opts = { maxPerDay: 1, minIntervalMs: 0 }
    const g = consumeCatalogShelfCall(null, t0, opts).next
    const blocked = consumeCatalogShelfCall(g, t0 + 1, opts)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'CATALOG_SHELF_DAILY_LIMIT')
  })

  it('default max is CATALOG_SHELF_MAX_PER_DAY', () => {
    assert.equal(CATALOG_SHELF_MAX_PER_DAY, 40)
  })
})
