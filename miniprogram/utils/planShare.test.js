'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { shareCardTitle } = require('./planShare.js')

describe('miniprogram planShare', () => {
  it('shareCardTitle joins and truncates', () => {
    assert.equal(shareCardTitle([{ name: '土豆烧肉' }, { name: '青菜' }]), '土豆烧肉、青菜')
    const t = shareCardTitle([{ name: '一' }, { name: '二' }, { name: '三' }])
    assert.ok(t.includes('一'))
    const long = shareCardTitle(
      Array.from({ length: 20 }, (_, i) => ({ name: '菜' + i }))
    )
    assert.ok(long.endsWith('…'))
    assert.ok(long.length <= 31)
  })

  it('shareCardTitle empty', () => {
    assert.equal(shareCardTitle([]), '')
    assert.equal(shareCardTitle(null), '')
  })
})
