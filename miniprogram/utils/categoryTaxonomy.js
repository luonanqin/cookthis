'use strict'

/**
 * 食材分类统一用 `ingredients-all-by-category` 中文 taxonomy。
 * 旧英文码仅在 normalizeCategory 里映射，对外不再当正式码。
 */
const CATEGORY_ORDER = [
  '肉类',
  '内脏',
  '火锅',
  '菜叶',
  '瓜果',
  '根茎',
  '水果',
  '豆类',
  '豆制品',
  '主食',
  '菌菇',
  '鱼',
  '河鲜',
  '海鲜',
  '蛋奶',
  '调味',
  '其他'
]

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, c]))

/** 历史英文码 → 中文 taxonomy */
const LEGACY_CATEGORY_MAP = {
  meat: '肉类',
  seafood: '海鲜',
  egg_dairy: '蛋奶',
  tofu: '豆制品',
  leaf: '菜叶',
  root: '根茎',
  fruit_veg: '瓜果',
  bean: '豆类',
  mushroom: '菌菇',
  seasoning: '调味',
  staple: '主食',
  other: '其他'
}

/**
 * @param {string|null|undefined} category
 * @param {string} [fallback='其他']
 * @returns {string}
 */
function normalizeCategory(category, fallback) {
  const fb = fallback || '其他'
  if (category == null || category === '') return fb
  const raw = String(category).trim()
  if (!raw) return fb
  if (LEGACY_CATEGORY_MAP[raw]) return LEGACY_CATEGORY_MAP[raw]
  if (CATEGORY_LABEL[raw]) return raw
  return fb
}

/**
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  const c = normalizeCategory(category)
  return CATEGORY_LABEL[c] || '其他'
}

function needsCategoryMigration(category) {
  if (category == null || category === '') return false
  return Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_MAP, String(category).trim())
}

module.exports = {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
  categoryLabel,
  needsCategoryMigration
}
