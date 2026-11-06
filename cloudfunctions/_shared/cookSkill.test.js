'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  PROBE_THRESHOLD,
  PROBE_GROUP_SIZE,
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
} = require('./cookSkill.js')

const PROBE_NAMES = [
  '凉拌黄瓜',
  '番茄炒蛋',
  '青菜豆腐汤',
  '清炒小白菜',
  '蚝油生菜',
  '青椒炒肉',
  '酸辣土豆丝',
  '肉末蒸蛋',
  '鱼香肉丝',
  '麻婆豆腐',
  '红烧茄子',
  '土豆烧肉',
  '回锅肉',
  '可乐鸡翅',
  '香菇滑鸡',
  '小炒黄牛肉',
  '红烧肉',
  '糖醋排骨',
  '清蒸鱼',
  '宫保鸡丁',
  '剁椒鱼头',
  '啤酒鸭',
  '水煮牛肉',
  '蒜蓉粉丝蒸鲍鱼'
]

describe('probe constants', () => {
  it('locks threshold, group size, skill, difficulty, complex forms, and soft penalty', () => {
    assert.equal(PROBE_THRESHOLD, 5)
    assert.equal(PROBE_GROUP_SIZE, 8)
    assert.deepEqual(COOK_SKILL_VALUES, ['beginner', 'home', 'skilled'])
    assert.deepEqual(DIFFICULTY_VALUES, ['easy', 'home', 'advanced'])
    assert.deepEqual(COMPLEX_DISH_FORMS, ['steam', 'hotpot', 'dumpling', 'bake'])
    assert.equal(DIFFICULTY_SOFT_PENALTY, 20)
  })

  it('lists 24 probe dishes in fixed group order with matching difficulty', () => {
    assert.equal(PROBE_DISHES.length, 24)
    assert.deepEqual(
      PROBE_DISHES.map((d) => d.name),
      PROBE_NAMES
    )
    assert.deepEqual(
      PROBE_DISHES.map((d) => d.group),
      [
        'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy',
        'home', 'home', 'home', 'home', 'home', 'home', 'home', 'home',
        'advanced', 'advanced', 'advanced', 'advanced', 'advanced', 'advanced', 'advanced', 'advanced'
      ]
    )
    for (const dish of PROBE_DISHES) {
      assert.equal(dish.difficulty, dish.group)
      assert.equal(typeof dish.id, 'string')
      assert.ok(dish.id.length > 0)
    }
    const ids = PROBE_DISHES.map((d) => d.id)
    assert.equal(new Set(ids).size, ids.length)
  })
})

describe('deriveCookSkill', () => {
  it('returns skilled when advanced exceeds 4 (≥5), ahead of home', () => {
    assert.equal(deriveCookSkill({ easy: 0, home: 0, advanced: 5 }), 'skilled')
    assert.equal(deriveCookSkill({ easy: 8, home: 8, advanced: 5 }), 'skilled')
    assert.equal(deriveCookSkill({ advanced: 8 }), 'skilled')
    assert.equal(deriveCookSkill({ easy: 8, home: 8, advanced: 4 }), 'home')
  })

  it('returns home when home exceeds 4 and advanced does not', () => {
    assert.equal(deriveCookSkill({ easy: 8, home: 5, advanced: 4 }), 'home')
    assert.equal(deriveCookSkill({ home: 5 }), 'home')
    assert.equal(deriveCookSkill({ advanced: '4', home: '5' }), 'home')
  })

  it('returns beginner at or below 4 in both home and advanced, including zero checks', () => {
    assert.equal(deriveCookSkill({ easy: 8, home: 4, advanced: 4 }), 'beginner')
    assert.equal(deriveCookSkill({ easy: 0, home: 0, advanced: 0 }), 'beginner')
    assert.equal(deriveCookSkill({}), 'beginner')
    assert.equal(deriveCookSkill(null), 'beginner')
    assert.equal(deriveCookSkill(undefined), 'beginner')
  })
})

describe('effectiveCookSkill', () => {
  it('keeps an explicit stored skill', () => {
    assert.equal(effectiveCookSkill('beginner'), 'beginner')
    assert.equal(effectiveCookSkill('home'), 'home')
    assert.equal(effectiveCookSkill('skilled'), 'skilled')
  })

  it('treats skip / unset / unknown as home and does not invent beginner', () => {
    assert.equal(effectiveCookSkill(undefined), 'home')
    assert.equal(effectiveCookSkill(null), 'home')
    assert.equal(effectiveCookSkill(''), 'home')
    assert.equal(effectiveCookSkill('expert'), 'home')
    assert.notEqual(effectiveCookSkill(null), deriveCookSkill({ easy: 0, home: 0, advanced: 0 }))
  })
})

describe('inferDifficulty', () => {
  it('keeps an explicit difficulty and does not let minutes or forms override it', () => {
    assert.equal(
      inferDifficulty({ difficulty: 'easy', minutes: 90, dishForms: ['steam'] }),
      'easy'
    )
    assert.equal(inferDifficulty({ difficulty: 'home', minutes: 10 }), 'home')
    assert.equal(
      inferDifficulty({ difficulty: 'advanced', minutes: 10, dishForms: ['stir_fry'] }),
      'advanced'
    )
  })

  it('infers easy at or under 20 minutes without a complex form', () => {
    assert.equal(inferDifficulty({ minutes: 20, dishForms: ['stir_fry'] }), 'easy')
    assert.equal(inferDifficulty({ minutes: '15', dishForms: ['soup'] }), 'easy')
    assert.equal(inferDifficulty({ minutes: 10 }), 'easy')
  })

  it('infers advanced at or over 50 minutes, or when a complex form is present', () => {
    assert.equal(inferDifficulty({ minutes: 50, dishForms: ['braise'] }), 'advanced')
    assert.equal(inferDifficulty({ minutes: 80 }), 'advanced')
    assert.equal(inferDifficulty({ minutes: 15, dishForms: ['steam'] }), 'advanced')
    assert.equal(inferDifficulty({ minutes: 15, dishForms: ['hotpot'] }), 'advanced')
    assert.equal(inferDifficulty({ minutes: 15, dishForms: ['dumpling'] }), 'advanced')
    assert.equal(inferDifficulty({ minutes: 15, dishForms: ['bake'] }), 'advanced')
    assert.equal(inferDifficulty({ dishForms: ['steam'] }), 'advanced')
    assert.equal(
      inferDifficulty({ minutes: 12, dishForms: ['stir_fry', 'bake'] }),
      'advanced'
    )
  })

  it('infers home in the middle band and when minutes are missing or invalid', () => {
    assert.equal(inferDifficulty({ minutes: 21, dishForms: ['stir_fry'] }), 'home')
    assert.equal(inferDifficulty({ minutes: 49, dishForms: ['noodle'] }), 'home')
    assert.equal(inferDifficulty({ minutes: 30 }), 'home')
    assert.equal(inferDifficulty({}), 'home')
    assert.equal(inferDifficulty({ minutes: 'soon', dishForms: ['stir_fry'] }), 'home')
    assert.equal(inferDifficulty({ difficulty: 'hard', minutes: 30 }), 'home')
    assert.equal(inferDifficulty(null), 'home')
  })
})

describe('difficulty match', () => {
  it('hard-blocks only beginner × advanced', () => {
    assert.equal(difficultyHardBlocked('beginner', 'advanced'), true)
    assert.equal(difficultyHardBlocked('beginner', 'home'), false)
    assert.equal(difficultyHardBlocked('beginner', 'easy'), false)
    assert.equal(difficultyHardBlocked('home', 'advanced'), false)
    assert.equal(difficultyHardBlocked('skilled', 'advanced'), false)
    assert.equal(
      difficultyHardBlocked(effectiveCookSkill(null), 'advanced'),
      false
    )
    assert.equal(
      difficultyHardBlocked(deriveCookSkill({ easy: 0, home: 0, advanced: 0 }), 'advanced'),
      true
    )
  })

  it('soft-penalizes one tier apart by 20 and leaves other pairs at 0', () => {
    assert.equal(difficultySoftPenalty('beginner', 'home'), 20)
    assert.equal(difficultySoftPenalty('home', 'advanced'), 20)
    assert.equal(difficultySoftPenalty('beginner', 'advanced'), 0)
    assert.equal(difficultySoftPenalty('beginner', 'easy'), 0)
    assert.equal(difficultySoftPenalty('home', 'easy'), 0)
    assert.equal(difficultySoftPenalty('home', 'home'), 0)
    assert.equal(difficultySoftPenalty('skilled', 'advanced'), 0)
    assert.equal(difficultySoftPenalty('skilled', 'easy'), 0)
    assert.equal(
      difficultySoftPenalty(effectiveCookSkill(undefined), 'advanced'),
      DIFFICULTY_SOFT_PENALTY
    )
  })
})
