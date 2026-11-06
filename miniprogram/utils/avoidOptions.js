/**
 * 忌口词表（与 data/catalog/ingredients-major-minor.json 的 avoidVocab 对齐）。
 * 改词表后可跑：node scripts/sync-avoid-options.js
 */
const AVOID_OPTIONS = [
  { id: 'pork', label: '猪肉' },
  { id: 'g1', label: '牛肉' },
  { id: 'g2', label: '羊肉' },
  { id: 'g8', label: '鸡肉' },
  { id: 'g9', label: '鸭肉' },
  { id: 'g11', label: '鱼' },
  { id: 'offal', label: '内脏' },
  { id: 'g7', label: '腌腊肉' },
  { id: 'seafood', label: '海鲜' },
  { id: 'g3', label: '豆类' },
  { id: 'g4', label: '豆制品' },
  { id: 'g5', label: '菌菇' },
  { id: 'g6', label: '绿叶菜' },
  { id: 'g10', label: '辣' },
  { id: 'dairy', label: '乳制品' }
]

module.exports = {
  AVOID_OPTIONS
}
