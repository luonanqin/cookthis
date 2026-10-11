'use strict'

const CUISINE_OPTIONS = [
  { id: 'sichuan', label: '川菜' },
  { id: 'cantonese', label: '粤菜' },
  { id: 'shandong', label: '鲁菜' },
  { id: 'jiangsu', label: '苏菜' },
  { id: 'zhejiang', label: '浙菜' },
  { id: 'fujian', label: '闽菜' },
  { id: 'hunan', label: '湘菜' },
  { id: 'anhui', label: '徽菜' },
  { id: 'northeast', label: '东北菜' },
  { id: 'northwest', label: '西北菜' },
  { id: 'shanghai', label: '本帮/上海' },
  { id: 'beijing', label: '京菜' },
  { id: 'henan', label: '豫菜' },
  { id: 'yunnan', label: '云南菜' },
  { id: 'guizhou', label: '贵州菜' },
  { id: 'inner_mongolia', label: '内蒙菜' },
  { id: 'xinjiang', label: '新疆菜' },
  { id: 'hubei', label: '湖北菜' },
  { id: 'jiangxi', label: '江西菜' }
]

/** Toggle prefer; clears avoid. Second tap clears to unset. */
function toggleCuisinePrefer(prefs, id) {
  const next = Object.assign({}, prefs || {})
  if (next[id] === 'prefer') delete next[id]
  else next[id] = 'prefer'
  return next
}

/** Toggle avoid; clears prefer. Second tap clears to unset. */
function toggleCuisineAvoid(prefs, id) {
  const next = Object.assign({}, prefs || {})
  if (next[id] === 'avoid') delete next[id]
  else next[id] = 'avoid'
  return next
}

module.exports = {
  CUISINE_OPTIONS,
  toggleCuisinePrefer,
  toggleCuisineAvoid
}
