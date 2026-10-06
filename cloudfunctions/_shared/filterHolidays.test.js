const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { filterHolidays } = require('./filterHolidays.js')

const items = [
  { id: 'national_day', date: '2026-10-01', nameZh: '国庆节', nameEn: 'National Day' },
  { id: 'double_ninth', date: '2026-10-18', nameZh: '重阳节', nameEn: 'Double Ninth Festival' },
  { id: 'mid_autumn', date: '2026-09-25', nameZh: '中秋节', nameEn: 'Mid-Autumn Festival' },
  { id: 'spring_festival', date: '2026-02-17', nameZh: '春节', nameEn: 'Spring Festival' }
]

describe('filterHolidays', () => {
  it('returns holidays from fromDate through the next days-1 days, sorted', () => {
    const r = filterHolidays(items, '2026-10-07', 30)
    assert.deepEqual(r.map((x) => x.id), ['double_ninth'])
  })

  it('includes a holiday on the window start day', () => {
    const r = filterHolidays(items, '2026-10-01', 7)
    assert.deepEqual(r.map((x) => x.id), ['national_day'])
  })

  it('includes a holiday on the last day of the window', () => {
    const r = filterHolidays(items, '2026-09-18', 8)
    assert.deepEqual(r.map((x) => x.id), ['mid_autumn'])
  })

  it('accepts Date as fromDate', () => {
    const r = filterHolidays(items, new Date(2026, 9, 7), 30)
    assert.equal(r.length, 1)
    assert.equal(r[0].id, 'double_ninth')
  })

  it('returns empty for empty items', () => {
    assert.deepEqual(filterHolidays([], '2026-10-07'), [])
  })
})
