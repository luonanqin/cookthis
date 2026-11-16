'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  CUISINE_COMMON,
  isLlmCandidate,
  normalizeLlmTags,
  parseModelBatchJson,
  applyLlmChanges,
  selectCandidates
} = require('../lib/llmCuisineTag.js')

describe('llmCuisineTag', () => {
  it('candidate: empty or home_style only', () => {
    assert.equal(isLlmCandidate({ cuisineTags: [] }), true)
    assert.equal(isLlmCandidate({ cuisineTags: [CUISINE_COMMON] }), true)
    assert.equal(isLlmCandidate({ cuisineTags: ['sichuan', CUISINE_COMMON] }), true)
    assert.equal(isLlmCandidate({ cuisineTags: ['sichuan'] }), false)
    assert.equal(isLlmCandidate({ cuisineTags: ['sichuan', 'hunan'] }), false)
  })

  it('normalize: drop unknown; home_style alone; >5 → home_style', () => {
    assert.deepEqual(normalizeLlmTags(['sichuan', 'foo', 'hunan']), [
      'sichuan',
      'hunan'
    ])
    assert.deepEqual(normalizeLlmTags(['sichuan', 'home_style']), [CUISINE_COMMON])
    assert.deepEqual(
      normalizeLlmTags([
        'sichuan',
        'cantonese',
        'hunan',
        'anhui',
        'beijing',
        'shanghai'
      ]),
      [CUISINE_COMMON]
    )
  })

  it('parse model json array or fenced block', () => {
    const raw = '```json\n[{"id":"a","cuisineTags":["northeast"]}]\n```'
    assert.deepEqual(parseModelBatchJson(raw), [
      { id: 'a', cuisineTags: ['northeast'] }
    ])
  })

  it('apply only changes candidates; leaves regional alone', () => {
    const recipes = [
      { id: '1', name: '白菜炖粉条', cuisineTags: [] },
      { id: '2', name: '宫保鸡丁', cuisineTags: ['sichuan'] },
      { id: '3', name: '空气炸锅鸡翅', cuisineTags: [CUISINE_COMMON] }
    ]
    const { updated, skipped } = applyLlmChanges(recipes, {
      1: ['northeast'],
      2: ['cantonese'],
      3: ['home_style']
    })
    assert.deepEqual(updated, ['1', '3'])
    assert.deepEqual(skipped, ['2'])
    assert.deepEqual(recipes[0].cuisineTags, ['northeast'])
    assert.deepEqual(recipes[1].cuisineTags, ['sichuan'])
    assert.deepEqual(recipes[2].cuisineTags, [CUISINE_COMMON])
  })

  it('selectCandidates respects limit', () => {
    const rows = [
      { id: 'a', cuisineTags: [] },
      { id: 'b', cuisineTags: ['sichuan'] },
      { id: 'c', cuisineTags: [CUISINE_COMMON] }
    ]
    assert.deepEqual(
      selectCandidates(rows, 1).map((r) => r.id),
      ['a']
    )
    assert.deepEqual(
      selectCandidates(rows, 0).map((r) => r.id),
      ['a', 'c']
    )
  })
})
