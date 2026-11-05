'use strict'

const PROBE_THRESHOLD = 3
const COOK_SKILL_VALUES = ['beginner', 'home', 'skilled']
const DIFFICULTY_VALUES = ['easy', 'home', 'advanced']
const COMPLEX_DISH_FORMS = ['steam', 'hotpot', 'dumpling', 'bake']
const DIFFICULTY_SOFT_PENALTY = 20

/** 测验用固定 15 道，id 不依赖菜谱库。组内顺序与组顺序固定。 */
const PROBE_DISHES = [
  { id: 'easy-1', name: '凉拌黄瓜', difficulty: 'easy', group: 'easy' },
  { id: 'easy-2', name: '蒜蓉西兰花', difficulty: 'easy', group: 'easy' },
  { id: 'easy-3', name: '番茄炒蛋', difficulty: 'easy', group: 'easy' },
  { id: 'easy-4', name: '蒸蛋羹', difficulty: 'easy', group: 'easy' },
  { id: 'easy-5', name: '青菜豆腐汤', difficulty: 'easy', group: 'easy' },
  { id: 'home-1', name: '鱼香肉丝', difficulty: 'home', group: 'home' },
  { id: 'home-2', name: '麻婆豆腐', difficulty: 'home', group: 'home' },
  { id: 'home-3', name: '红烧茄子', difficulty: 'home', group: 'home' },
  { id: 'home-4', name: '土豆烧肉', difficulty: 'home', group: 'home' },
  { id: 'home-5', name: '西红柿鸡蛋面', difficulty: 'home', group: 'home' },
  { id: 'advanced-1', name: '红烧肉', difficulty: 'advanced', group: 'advanced' },
  { id: 'advanced-2', name: '糖醋排骨', difficulty: 'advanced', group: 'advanced' },
  { id: 'advanced-3', name: '清蒸鱼', difficulty: 'advanced', group: 'advanced' },
  { id: 'advanced-4', name: '宫保鸡丁', difficulty: 'advanced', group: 'advanced' },
  { id: 'advanced-5', name: '水煮鱼', difficulty: 'advanced', group: 'advanced' }
]

/**
 * 从高到低看勾选数。advanced ≥ 阈值 → skilled；否则 home ≥ 阈值 → home；否则 beginner。
 * 全 0 也是 beginner（点了下一步但没勾）。跳过不走这里，字段留空。
 * @param {{ easy?: number, home?: number, advanced?: number }|null|undefined} counts
 * @returns {'beginner'|'home'|'skilled'}
 */
function deriveCookSkill(counts) {
  const nA = Number(counts && counts.advanced) || 0
  const nH = Number(counts && counts.home) || 0
  if (nA >= PROBE_THRESHOLD) return 'skilled'
  if (nH >= PROBE_THRESHOLD) return 'home'
  return 'beginner'
}

/**
 * 推荐用的有效能力。未填 / 跳过 / 非法值当 home，不硬排 advanced。
 * 已有合法档原样返回（重测跳过不应靠这个函数清档）。
 * @param {string|null|undefined} userCookSkill
 * @returns {'beginner'|'home'|'skilled'}
 */
function effectiveCookSkill(userCookSkill) {
  if (COOK_SKILL_VALUES.includes(userCookSkill)) return userCookSkill
  return 'home'
}

/**
 * 显式 difficulty 优先；否则 minutes + 复杂形态启发式。
 * @param {{ difficulty?: string, minutes?: number|string, dishForms?: string[] }|null|undefined} recipe
 * @returns {'easy'|'home'|'advanced'}
 */
function inferDifficulty(recipe) {
  const r = recipe && typeof recipe === 'object' ? recipe : {}
  if (r.difficulty && DIFFICULTY_VALUES.includes(r.difficulty)) {
    return r.difficulty
  }
  const minutes = Number(r.minutes)
  const forms = Array.isArray(r.dishForms) ? r.dishForms : []
  const complex = forms.some((f) => COMPLEX_DISH_FORMS.includes(f))
  if (Number.isFinite(minutes) && minutes <= 20 && !complex) return 'easy'
  if ((Number.isFinite(minutes) && minutes >= 50) || complex) return 'advanced'
  return 'home'
}

/**
 * beginner × advanced 硬排除。其余通过。
 * @param {string} skill 应为 effectiveCookSkill 的结果
 * @param {string} difficulty
 * @returns {boolean}
 */
function difficultyHardBlocked(skill, difficulty) {
  return skill === 'beginner' && difficulty === 'advanced'
}

/**
 * 差一档软降权：beginner×home、home×advanced。硬排除档不加软分。
 * @param {string} skill
 * @param {string} difficulty
 * @returns {number}
 */
function difficultySoftPenalty(skill, difficulty) {
  if (skill === 'beginner' && difficulty === 'home') return DIFFICULTY_SOFT_PENALTY
  if (skill === 'home' && difficulty === 'advanced') return DIFFICULTY_SOFT_PENALTY
  return 0
}

module.exports = {
  PROBE_THRESHOLD,
  COOK_SKILL_VALUES,
  DIFFICULTY_VALUES,
  COMPLEX_DISH_FORMS,
  DIFFICULTY_SOFT_PENALTY,
  PROBE_DISHES,
  deriveCookSkill,
  effectiveCookSkill,
  inferDifficulty,
  difficultyHardBlocked,
  difficultySoftPenalty
}
