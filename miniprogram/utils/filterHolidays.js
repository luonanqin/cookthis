'use strict'

function toDateStr(fromDate) {
  if (typeof fromDate === 'string') {
    return fromDate.slice(0, 10)
  }
  if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) {
    throw new TypeError('fromDate must be a Date or YYYY-MM-DD string')
  }
  const y = fromDate.getFullYear()
  const m = fromDate.getMonth() + 1
  const d = fromDate.getDate()
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d)
}

function addDays(dateStr, delta) {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = dt.getMonth() + 1
  const dd = dt.getDate()
  return yy + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd)
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
