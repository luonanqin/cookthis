'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  validateCreate,
  computeSortKey,
  isUnread,
  shapeFeedback,
  CONTENT_MAX,
  UNREAD_SORT_BASE
} = require('./feedbackLogic.js')

describe('feedbackLogic', () => {
  it('validateCreate rejects empty and overlong', () => {
    assert.equal(validateCreate({ category: 'recipe', content: '  ' }).ok, false)
    assert.equal(
      validateCreate({ category: 'recipe', content: '字'.repeat(CONTENT_MAX + 1) }).ok,
      false
    )
    assert.equal(
      validateCreate({ category: 'recipe', content: '要番茄炒蛋' }).ok,
      true
    )
  })

  it('validateCreate rejects bad category', () => {
    assert.equal(validateCreate({ category: 'spam', content: 'hi' }).ok, false)
  })

  it('unread sortKey outranks read', () => {
    const u = computeSortKey({
      unreadForUser: true,
      createdAtMs: 1000,
      repliedAtMs: 2000
    })
    const r = computeSortKey({
      unreadForUser: false,
      createdAtMs: 9000,
      repliedAtMs: 8000
    })
    assert.ok(u > r)
    assert.ok(u >= UNREAD_SORT_BASE)
  })

  it('isUnread matches reply + read clock', () => {
    assert.equal(
      isUnread({
        replyText: '好的',
        repliedAt: 200,
        userReadAt: null
      }),
      true
    )
    assert.equal(
      isUnread({
        replyText: '好的',
        repliedAt: 200,
        userReadAt: 300
      }),
      false
    )
    assert.equal(isUnread({ replyText: '', repliedAt: null }), false)
  })

  it('shapeFeedback maps labels and unread', () => {
    const card = shapeFeedback({
      _id: 'f1',
      category: 'feature',
      content: '加大字',
      createdAt: 100,
      replyText: '已记录',
      repliedAt: 200,
      userReadAt: null,
      unreadForUser: true
    })
    assert.equal(card.categoryLabel, '功能建议')
    assert.equal(card.unread, true)
    assert.equal(card.id, 'f1')
  })
})
