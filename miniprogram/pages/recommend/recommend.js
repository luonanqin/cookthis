const { callCloud } = require('../../services/cloud.js')

const RECOMMEND_KEY = 'cookthis_last_recommend'

const EMPTY_REASONS = {
  cannot_fill_combo: '当前食材凑不出完整搭配，可返回改场景或换食材',
  empty_recommend: '暂无可用方案，可返回改场景或换食材'
}

const REJECT_REASONS = [
  { id: 'dont_want', label: '不想吃' },
  { id: 'wrong_ingredients', label: '食材不对' },
  { id: 'too_hard', label: '太麻烦' },
  { id: 'ate_recently', label: '最近吃过' }
]

function emptyMessage(reason) {
  if (!reason) return '暂无推荐方案，可返回改场景或换食材'
  return EMPTY_REASONS[reason] || String(reason)
}

function readSnap() {
  try {
    return wx.getStorageSync(RECOMMEND_KEY) || null
  } catch (e) {
    return null
  }
}

function writeSnap(snap) {
  try {
    wx.setStorageSync(RECOMMEND_KEY, snap)
  } catch (e) {}
}

Page({
  data: {
    plans: [],
    empty: true,
    emptyText: '暂无推荐方案，可返回改场景或换食材',
    requestId: '',
    busy: false,
    showReject: false,
    rejectReasons: REJECT_REASONS,
    hint: '换一批随便看看；不行会长期少推这些菜'
  },

  _visibleMs: 0,
  _visibleSince: 0,
  _engagedSent: false,
  _tickTimer: null,

  onLoad() {
    this.applySnap(readSnap())
  },

  onShow() {
    this._visibleSince = Date.now()
    this._tickTimer = setInterval(() => this._checkEngage(), 5000)
  },

  onHide() {
    this._pauseVisible()
    if (this._tickTimer) {
      clearInterval(this._tickTimer)
      this._tickTimer = null
    }
  },

  onUnload() {
    this._pauseVisible()
    if (this._tickTimer) {
      clearInterval(this._tickTimer)
      this._tickTimer = null
    }
  },

  _pauseVisible() {
    if (this._visibleSince) {
      this._visibleMs += Date.now() - this._visibleSince
      this._visibleSince = 0
    }
  },

  _currentVisibleMs() {
    let ms = this._visibleMs
    if (this._visibleSince) ms += Date.now() - this._visibleSince
    return ms
  },

  _checkEngage() {
    if (this._engagedSent || !this.data.requestId) return
    const ms = this._currentVisibleMs()
    if (ms < 30000) return
    this._engagedSent = true
    callCloud('recommend', {
      action: 'engage',
      requestId: this.data.requestId,
      dwellMs: ms,
      planIndex: 0
    }).catch(() => {
      this._engagedSent = false
    })
  },

  applySnap(snap) {
    const plans = (snap && Array.isArray(snap.plans) ? snap.plans : []).slice(0, 3)
    const empty = plans.length === 0
    this.setData({
      plans,
      empty,
      emptyText: emptyMessage(snap && snap.emptyReason),
      requestId: (snap && snap.requestId) || ''
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onSwap() {
    this._rerun('swap')
  },

  onRejectOpen() {
    this.setData({ showReject: true })
  },

  onRejectClose() {
    this.setData({ showReject: false })
  },

  onRejectSkip() {
    this.setData({ showReject: false })
    this._rerun('reject', {})
  },

  onRejectReason(e) {
    const reason = e.currentTarget.dataset.id
    this.setData({ showReject: false })
    this._rerun('reject', { reason, planIndex: 0 })
  },

  _rerun(action, extra) {
    if (this.data.busy || !this.data.requestId) return
    this.setData({ busy: true })
    callCloud('recommend', Object.assign({
      action,
      requestId: this.data.requestId
    }, extra || {}))
      .then((result) => {
        const snap = Object.assign({}, readSnap() || {}, {
          requestId: result.requestId || this.data.requestId,
          plans: result.plans || [],
          emptyReason: result.emptyReason || null,
          swapCount: result.swapCount
        })
        writeSnap(snap)
        this.applySnap(snap)
        // after swap/reject, continue engage clock on new plans
        this._pauseVisible()
        this._visibleSince = Date.now()
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '操作失败',
          icon: 'none'
        })
      })
      .then(() => this.setData({ busy: false }))
  },

  onAccept() {
    if (this.data.busy || this.data.empty || !this.data.requestId) return
    this.setData({ busy: true })
    callCloud('recommend', {
      action: 'accept',
      requestId: this.data.requestId,
      planIndex: 0
    })
      .then(() => {
        wx.navigateTo({
          url: '/pages/shopping/shopping?accepted=true&planIndex=0'
        })
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '采纳失败',
          icon: 'none'
        })
      })
      .then(() => this.setData({ busy: false }))
  },

  onViewList() {
    if (this.data.empty) return
    wx.navigateTo({
      url: '/pages/shopping/shopping?accepted=false&planIndex=0'
    })
  }
})
