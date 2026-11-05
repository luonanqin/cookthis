'use strict'

const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const { FEEDBACK_SUBSCRIBE_TMPL_ID } = require('../../utils/subscribe.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

const CACHE_KEY = 'cookthis_feedback_list_v1'
const TTL = 7 * 24 * 60 * 60 * 1000
const PAGE_SIZE = 5
/** 收起高度：与 .clip max-height（两行半 + 渐隐）对齐 */
function collapseMaxPx(largeText) {
  const collapseRpx = largeText ? 135 : 105
  try {
    const sys = wx.getSystemInfoSync()
    return (collapseRpx / 750) * (sys.windowWidth || 375)
  } catch (e) {
    return (collapseRpx / 750) * 375
  }
}

const CATEGORY_LABELS = {
  recipe: '菜谱',
  ingredient: '食材',
  feature: '功能',
  other: '其他'
}

const CATEGORIES = [
  { id: 'recipe', label: CATEGORY_LABELS.recipe },
  { id: 'ingredient', label: CATEGORY_LABELS.ingredient },
  { id: 'feature', label: CATEGORY_LABELS.feature },
  { id: 'other', label: CATEGORY_LABELS.other }
]

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

function formatTimeText(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return ''
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes())
  )
}

function readCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch (e) {
    return null
  }
}

function writeCache(payload) {
  try {
    wx.setStorageSync(CACHE_KEY, payload)
  } catch (e) {}
}

function decorateItem(raw) {
  const id = raw && (raw.id || raw._id)
  return {
    id,
    category: raw.category,
    categoryLabel: raw.categoryLabel || CATEGORY_LABELS[raw.category] || '',
    content: raw.content || '',
    replyText: raw.replyText ? String(raw.replyText) : null,
    createdAt: raw.createdAt,
    repliedAt: raw.repliedAt,
    unread: !!raw.unread,
    timeText: formatTimeText(raw.createdAt),
    replyTimeText: formatTimeText(raw.repliedAt),
    contentExpanded: false,
    replyExpanded: false,
    contentOverflow: false,
    replyOverflow: false
  }
}

function toCacheItem(item) {
  return {
    id: item.id,
    category: item.category,
    categoryLabel: item.categoryLabel,
    content: item.content,
    replyText: item.replyText,
    createdAt: item.createdAt,
    repliedAt: item.repliedAt,
    unread: !!item.unread
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    categories: CATEGORIES,
    category: '',
    draft: '',
    draftLen: 0,
    submitting: false,
    items: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    headerHeight: 140,
    composerHeight: 220
  },

  _loadGen: 0,
  _epoch: 0,
  _measureTimer: null,
  _composerMeasureTimer: null,

  onHeaderHeight(e) {
    const height = e && e.detail && e.detail.height
    if (!height || height === this.data.headerHeight) return
    this.setData({ headerHeight: height }, () => this._measureComposer())
  },

  _measureComposer() {
    if (this._composerMeasureTimer) {
      clearTimeout(this._composerMeasureTimer)
      this._composerMeasureTimer = null
    }
    this._composerMeasureTimer = setTimeout(() => {
      this._composerMeasureTimer = null
      const query = wx.createSelectorQuery()
      query.select('.composer').boundingClientRect()
      query.exec((res) => {
        const rect = res && res[0]
        if (!rect || !rect.height) return
        const next = Math.ceil(rect.height)
        if (next !== this.data.composerHeight) {
          this.setData({ composerHeight: next })
        }
      })
    }, 16)
  },

  onShow() {
    this.applyTypeScale()
    this.refreshList()
    this._measureComposer()
  },

  onReady() {
    this._measureComposer()
  },

  onReachBottom() {
    this.loadMore()
  },

  onUnload() {
    if (this._measureTimer) {
      clearTimeout(this._measureTimer)
      this._measureTimer = null
    }
    if (this._composerMeasureTimer) {
      clearTimeout(this._composerMeasureTimer)
      this._composerMeasureTimer = null
    }
  },

  onPickCategory(e) {
    const id = e.currentTarget.dataset.id
    if (!id || !CATEGORY_LABELS[id]) return
    tapFeedback('light')
    // 不缓存未提交的选择；点已选项可取消
    this.setData({ category: this.data.category === id ? '' : id })
  },

  onDraftInput(e) {
    const draft = (e.detail && e.detail.value) || ''
    this.setData({ draft, draftLen: draft.length })
  },

  onSubmit() {
    if (this.data.submitting) return
    if (!CATEGORY_LABELS[this.data.category]) {
      wx.showToast({ title: '请选择反馈类型', icon: 'none' })
      return
    }
    const content = String(this.data.draft || '').trim()
    if (!content) {
      wx.showToast({ title: '请填写内容', icon: 'none' })
      return
    }
    if (content.length > 100) {
      wx.showToast({ title: '最多100字', icon: 'none' })
      return
    }
    tapFeedback('medium')
    this.setData({ submitting: true })
    const tmplId = FEEDBACK_SUBSCRIBE_TMPL_ID || ''
    const afterAuth = (subscribeReady) => {
      track('feedback_subscribe_result', { accepted: !!subscribeReady })
      return callCloud('feedback', {
        action: 'create',
        category: this.data.category,
        content,
        subscribeReady: !!subscribeReady
      })
        .then((res) => {
          const item = res && res.item
          if (!item) throw new Error('CREATE_FAILED')
          track('feedback_compose_submit', {
            category: this.data.category,
            contentLen: content.length,
            subscribeReady: !!subscribeReady
          })
          const items = [decorateItem(item)].concat(this.data.items || [])
          this.setData({
            draft: '',
            draftLen: 0,
            category: '',
            items,
            submitting: false
          })
          this._persistCache()
          this._scheduleMeasure()
          wx.showModal({
            title: '',
            content: '感谢您的反馈',
            showCancel: false
          })
        })
        .catch((err) => {
          this.setData({ submitting: false })
          const code = err && (err.error || err.message)
          wx.showToast({
            title: code === 'RATE_LIMITED' ? '提交太频繁，稍后再试' : '提交失败',
            icon: 'none'
          })
        })
    }
    if (!tmplId) {
      afterAuth(false)
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (r) => afterAuth(r[tmplId] === 'accept'),
      fail: () => afterAuth(false)
    })
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id
    this._markReadLocal(id)
  },

  onExpand(e) {
    const id = e.currentTarget.dataset.id
    const which = e.currentTarget.dataset.which
    if (!id || (which !== 'content' && which !== 'reply')) return
    tapFeedback('light')
    const items = (this.data.items || []).map((it) => {
      if (it.id !== id) return it
      if (which === 'content') {
        return Object.assign({}, it, { contentExpanded: !it.contentExpanded })
      }
      return Object.assign({}, it, { replyExpanded: !it.replyExpanded })
    })
    this.setData({ items })
    track('feedback_expand', { id, which })
    this._markReadLocal(id)
  },

  refreshList() {
    this._loadGen += 1
    const gen = this._loadGen
    this.setData({ loading: true, loadingMore: false })

    callCloud('feedback', { action: 'hasUnread' })
      .then((res) => {
        if (gen !== this._loadGen) return
        const epoch = (res && res.feedbackListEpoch) || 0
        this._epoch = epoch
        const cache = readCache()
        const now = Date.now()
        const fresh =
          cache &&
          Array.isArray(cache.items) &&
          Number(cache.cachedAt) > 0 &&
          now - Number(cache.cachedAt) < TTL &&
          Number(cache.feedbackListEpoch) === Number(epoch)
        if (fresh) {
          const items = cache.items.map(decorateItem)
          this.setData({
            items,
            nextCursor: cache.nextCursor || null,
            loading: false
          })
          track('feedback_list_show', {
            fromCache: true,
            itemCount: items.length
          })
          this._scheduleMeasure()
          return
        }
        return this._fetchFirst(gen)
      })
      .catch(() => {
        if (gen !== this._loadGen) return
        const cache = readCache()
        if (cache && Array.isArray(cache.items) && cache.items.length) {
          const items = cache.items.map(decorateItem)
          this._epoch = Number(cache.feedbackListEpoch) || 0
          this.setData({
            items,
            nextCursor: cache.nextCursor || null,
            loading: false
          })
          track('feedback_list_show', {
            fromCache: true,
            itemCount: items.length
          })
          this._scheduleMeasure()
          return
        }
        return this._fetchFirst(gen)
      })
  },

  _fetchFirst(gen) {
    return callCloud('feedback', { action: 'listMine', limit: PAGE_SIZE })
      .then((res) => {
        if (gen !== this._loadGen) return
        const items = ((res && res.items) || []).map(decorateItem)
        const nextCursor = (res && res.nextCursor) || null
        if (res && res.feedbackListEpoch != null) {
          this._epoch = res.feedbackListEpoch
        }
        this.setData({ items, nextCursor, loading: false })
        this._persistCache()
        track('feedback_list_show', {
          fromCache: false,
          itemCount: items.length
        })
        this._scheduleMeasure()
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        console.error(err)
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  loadMore() {
    const cursor = this.data.nextCursor
    if (!cursor || this.data.loading || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    const gen = this._loadGen
    callCloud('feedback', {
      action: 'listMine',
      limit: PAGE_SIZE,
      cursor
    })
      .then((res) => {
        if (gen !== this._loadGen) return
        const more = ((res && res.items) || []).map(decorateItem)
        const nextCursor = (res && res.nextCursor) || null
        if (res && res.feedbackListEpoch != null) {
          this._epoch = res.feedbackListEpoch
        }
        const items = (this.data.items || []).concat(more)
        this.setData({ items, nextCursor, loadingMore: false })
        this._persistCache()
        this._scheduleMeasure()
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        console.error(err)
        this.setData({ loadingMore: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  _persistCache() {
    writeCache({
      cachedAt: Date.now(),
      feedbackListEpoch: this._epoch || 0,
      items: (this.data.items || []).map(toCacheItem),
      nextCursor: this.data.nextCursor || null
    })
  },

  _markReadLocal(id) {
    if (!id) return
    const items = this.data.items || []
    const idx = items.findIndex((it) => it.id === id)
    if (idx < 0) return
    const target = items[idx]
    if (!target.unread) return
    const hadReply = !!target.replyText
    const next = items.slice()
    next[idx] = Object.assign({}, target, { unread: false })
    this.setData({ items: next })
    this._persistCache()
    track('feedback_mark_read', { id, hadReply })
    callCloud('feedback', { action: 'markRead', id }).catch((err) => {
      console.error(err)
    })
  },

  _scheduleMeasure() {
    if (this._measureTimer) clearTimeout(this._measureTimer)
    this._measureTimer = setTimeout(() => {
      this._measureTimer = null
      this._measureOverflow()
    }, 50)
  },

  _measureOverflow() {
    const items = this.data.items || []
    if (!items.length) return
    const maxPx = collapseMaxPx(!!this.data.largeText)

    const q = wx.createSelectorQuery().in(this)
    q.selectAll('.js-content-inner').boundingClientRect()
    q.selectAll('.js-reply-inner').boundingClientRect()
    q.exec((rects) => {
      const contentRects = (rects && rects[0]) || []
      const replyRects = (rects && rects[1]) || []
      const contentMap = {}
      const replyMap = {}
      // Prefer dataset.id; fall back to DOM order (content: all items; reply: with replyText)
      contentRects.forEach((r, i) => {
        const id =
          (r && r.dataset && r.dataset.id) || (items[i] && items[i].id)
        if (id) contentMap[id] = (r && r.height) || 0
      })
      const withReply = items.filter((it) => it.replyText)
      replyRects.forEach((r, i) => {
        const id =
          (r && r.dataset && r.dataset.id) ||
          (withReply[i] && withReply[i].id)
        if (id) replyMap[id] = (r && r.height) || 0
      })
      let changed = false
      const next = items.map((it) => {
        const cH = contentMap[it.id]
        const rH = replyMap[it.id]
        const contentOverflow =
          cH != null ? cH > maxPx + 1 : !!it.contentOverflow
        const replyOverflow =
          rH != null ? rH > maxPx + 1 : !!it.replyOverflow
        if (
          contentOverflow === it.contentOverflow &&
          replyOverflow === it.replyOverflow
        ) {
          return it
        }
        changed = true
        return Object.assign({}, it, { contentOverflow, replyOverflow })
      })
      if (changed) this.setData({ items: next })
    })
  }
})
