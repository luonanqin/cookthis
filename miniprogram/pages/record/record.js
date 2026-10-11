const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

const PAGE_SIZE = 10

function mapItem(it) {
  return {
    logId: it.logId,
    date: it.date,
    source: it.source,
    dishesText: (it.dishNames || []).join('、')
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    input: '',
    items: [],
    busy: false,
    empty: true,
    loading: false,
    loadingMore: false,
    nextCursor: null
  },

  onLoad() {
    this._loadGen = 0
  },

  onShow() {
    this.applyTypeScale()
    this.loadFirst()
  },

  onReachBottom() {
    this.loadMore()
  },

  onInput(e) {
    this.setData({ input: e.detail.value || '' })
  },

  loadFirst() {
    this._loadGen += 1
    const gen = this._loadGen
    this.setData({
      loading: true,
      loadingMore: false,
      nextCursor: null
    })
    callCloud('meals', { action: 'list', limit: PAGE_SIZE })
      .then((result) => {
        if (gen !== this._loadGen) return
        const items = ((result && result.items) || []).map(mapItem)
        const nextCursor = (result && result.nextCursor) || null
        this.setData({
          items,
          nextCursor,
          empty: items.length === 0,
          loading: false
        })
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        console.error(err)
        this.setData({ loading: false })
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  loadMore() {
    const cursor = this.data.nextCursor
    if (!cursor || this.data.loading || this.data.loadingMore) return
    const gen = this._loadGen
    this.setData({ loadingMore: true })
    callCloud('meals', { action: 'list', limit: PAGE_SIZE, cursor })
      .then((result) => {
        if (gen !== this._loadGen) {
          this.setData({ loadingMore: false })
          return
        }
        const more = ((result && result.items) || []).map(mapItem)
        const nextCursor = (result && result.nextCursor) || null
        this.setData({
          items: this.data.items.concat(more),
          nextCursor,
          empty: false,
          loadingMore: false
        })
      })
      .catch((err) => {
        if (gen !== this._loadGen) {
          this.setData({ loadingMore: false })
          return
        }
        console.error(err)
        this.setData({ loadingMore: false })
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  onSubmit() {
    if (this.data.busy) return
    tapFeedback('heavy')
    const raw = (this.data.input || '').trim()
    if (!raw) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    const dishNames = raw
      .split(/[,，、\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!dishNames.length) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    callCloud('meals', { action: 'addManual', dishNames })
      .then(() => {
        track('meal_log_manual', { dishCount: dishNames.length })
        this.setData({ input: '', busy: false })
        wx.showToast({ title: '已记录', icon: 'success' })
        this.loadFirst()
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({
          title: (err && err.error) || '记录失败',
          icon: 'none'
        })
      })
  },

  onDelete(e) {
    if (this.data.busy) return
    const logId = e.currentTarget.dataset.logId
    const source = e.currentTarget.dataset.source || null
    if (!logId) return
    tapFeedback()
    wx.showModal({
      title: '删除记录',
      content: '删掉这条已吃记录？',
      confirmText: '删除',
      confirmColor: '#b35c2e',
      success: (res) => {
        if (!res.confirm) return
        this._doRemove(logId, source)
      }
    })
  },

  _doRemove(logId, source) {
    this.setData({ busy: true })
    callCloud('meals', { action: 'remove', logId })
      .then(() => {
        track('meal_log_delete', { logId, source })
        wx.showToast({ title: '已删除', icon: 'success' })
        this.loadFirst()
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '删除失败',
          icon: 'none'
        })
      })
      .then(() => this.setData({ busy: false }))
  },

  onBack() {
    tapFeedback()
    wx.navigateBack({ delta: 1 })
  }
})
