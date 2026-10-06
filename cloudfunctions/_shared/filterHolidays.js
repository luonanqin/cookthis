'use strict'

function toDateStr(fromDate) {
  if (typeof fromDate === 'string') {
    return fromDate.slice(0, 10)
  }
  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) {
    throw new TypeError('fromDate must be a Date or YYYY-MM-DD string')
  }
  const y = fromDate.getFullYear()
  const m = String(fromDate.getMonth() + 1).padStart(2, '0')
  const d = String(fromDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Holidays on or after fromDate within the next `days` calendar days (inclusive).
 * @param {object[]} items - holidays items with `date` YYYY-MM-DD
 * @param {Date | string} fromDate
 * @param {number} [days=30]
 * @returns {object[]}
 */
function filterHolidays(items, fromDate, days = 30) {
  if (days < 1) return []
  const start = toDateStr(fromDate)
  const end = addDays(start, days - 1)
  return (items || [])
    .filter((item) => item.date >= start && item.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
}

module.exports = { filterHolidays, toDateStr, addDays }
