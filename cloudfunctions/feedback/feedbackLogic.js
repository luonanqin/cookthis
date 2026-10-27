'use strict'

const CONTENT_MAX = 100
const UNREAD_SORT_BASE = 2e15
const CATEGORY_LABELS = {
  recipe: '菜谱',
  ingredient: '食材',
  feature: '功能建议',
  other: '其他'
}

function toMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
  }
  if (typeof v.valueOf === 'function') {
    const n = Number(v.valueOf())
    return Number.isFinite(n) ? n : null
  }
  return null
}

function validateCreate(input) {
  const category = input && input.category
  if (!CATEGORY_LABELS[category]) {
    return { ok: false, error: 'BAD_CATEGORY' }
  }
  const content = String((input && input.content) || '').trim()
  if (!content) return { ok: false, error: 'EMPTY_CONTENT' }
  if (content.length > CONTENT_MAX) return { ok: false, error: 'CONTENT_TOO_LONG' }
  return { ok: true, category, content }
}

function isUnread(doc) {
  const text = doc && doc.replyText
  if (!text || !String(text).trim()) return false
  const repliedAt = toMs(doc.repliedAt)
  const readAt = toMs(doc.userReadAt)
  if (readAt == null) return true
  if (repliedAt == null) return true
  return readAt < repliedAt
}

function computeSortKey(input) {
  const createdAtMs = Number(input && input.createdAtMs) || 0
  const repliedAtMs = Number(input && input.repliedAtMs) || 0
  const base = Math.max(createdAtMs, repliedAtMs)
  if (input && input.unreadForUser) return UNREAD_SORT_BASE + base
  return base
}

function shapeFeedback(doc) {
  if (!doc) return null
  const unread =
    typeof doc.unreadForUser === 'boolean' ? doc.unreadForUser : isUnread(doc)
  return {
    id: doc._id || doc.id,
    category: doc.category,
    categoryLabel: CATEGORY_LABELS[doc.category] || doc.category,
    content: doc.content || '',
    createdAt: toMs(doc.createdAt),
    replyText: doc.replyText ? String(doc.replyText) : null,
    repliedAt: toMs(doc.repliedAt),
    unread: !!unread
  }
}

module.exports = {
  CONTENT_MAX,
  UNREAD_SORT_BASE,
  CATEGORY_LABELS,
  toMs,
  validateCreate,
  isUnread,
  computeSortKey,
  shapeFeedback
}
