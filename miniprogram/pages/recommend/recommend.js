const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { buildPlanIngredientSummary } = require('../../utils/planIngredientSummary.js')
const { clearChecksForRequest } = require('../../utils/shoppingChecks.js')
const { tapFeedback } = require('../../utils/haptic.js')
const { formatSceneSummary } = require('../../utils/sceneSummary.js')

const RECOMMEND_KEY = 'cookthis_last_recommend'
const SELECTED_KEY = 'cookthis_last_selected'
const CHECKS_KEY = 'cookthis_shopping_checks'

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

function selectedNamesFromSnap(snap) {
  const fromRec = (snap && snap.selectedIngredients) || []
  if (fromRec.length) {
    return fromRec.map((x) => x && x.name).filter(Boolean)
  }
  try {
    const sel = wx.getStorageSync(SELECTED_KEY) || null
    const selected = (sel && sel.selected) || []
    return selected.map((x) => x && x.name).filter(Boolean)
  } catch (e) {
    return []
  }
}

const MEAT_VEG_ORDER = ['meat', 'veg', 'soup']
const MEAT_VEG_LABELS = { meat: '荤', veg: '素', soup: '汤' }

/** 顿内按荤素汤分组，供两列展示 */
function groupDishesByMeatVeg(dishes) {
  const buckets = { meat: [], veg: [], soup: [], other: [] }
  for (const d of dishes || []) {
    const k = d && d.meatVeg
    if (k === 'meat' || k === 'veg' || k === 'soup') buckets[k].push(d)
    else if (d) buckets.other.push(d)
  }
  const groups = []
  for (const k of MEAT_VEG_ORDER) {
    if (buckets[k].length) {
      groups.push({ type: k, label: MEAT_VEG_LABELS[k], dishes: buckets[k] })
    }
  }
  if (buckets.other.length) {
    groups.push({ type: 'other', label: '其他', dishes: buckets.other })
  }
  return groups
}

function decoratePlans(plans, selectedNames) {
  return plans.map((p) => {
    const summary = buildPlanIngredientSummary({
      plan: p,
      selectedNames
    })
    const meals = (p.meals || []).map((m) =>
      Object.assign({}, m, {
        dishGroups: groupDishesByMeatVeg(m.dishes)
      })
    )
    return Object.assign({}, p, {
      meals,
      ingredientTipText: summary.tipText || '',
      ingredientTipNames: summary.tipNames || []
    })
  })
}

Page({
  data: {
    plans: [],
    empty: true,
    emptyText: '暂无推荐方案，可返回改场景或换食材',
    requestId: '',
    sceneSummary: '',
    busy: false,
    busyAction: '',
    busyPlanIndex: -1,
    showReject: false,
    rejectReasons: REJECT_REASONS,
    fabDimmed: false,
    hint: '点方案右侧「就他了」进购买清单；换一批随便看看；不行会长期少推这些菜'
  },

  _visibleMs: 0,
  _visibleSince: 0,
  _engagedSent: false,
  _tickTimer: null,
  _fabScrollTimer: null,

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
    this._clearFabScrollTimer()
    if (this.data.fabDimmed) this.setData({ fabDimmed: false })
  },

  onUnload() {
    this._pauseVisible()
    if (this._tickTimer) {
      clearInterval(this._tickTimer)
      this._tickTimer = null
    }
    this._clearFabScrollTimer()
  },

  onPageScroll() {
    if (!this.data.fabDimmed) this.setData({ fabDimmed: true })
    this._clearFabScrollTimer()
    this._fabScrollTimer = setTimeout(() => {
      this._fabScrollTimer = null
      if (this.data.fabDimmed) this.setData({ fabDimmed: false })
    }, 180)
  },

  _clearFabScrollTimer() {
    if (this._fabScrollTimer) {
      clearTimeout(this._fabScrollTimer)
      this._fabScrollTimer = null
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
    track('recommend_engage', { planIndex: 0, dwellMs: ms })
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
    const raw = (snap && Array.isArray(snap.plans) ? snap.plans : []).slice(0, 3)
    const selectedNames = selectedNamesFromSnap(snap)
    const plans = decoratePlans(raw, selectedNames)
    const empty = plans.length === 0
    let scene = (snap && snap.scene) || null
    if (!scene) {
      try {
        const sel = wx.getStorageSync(SELECTED_KEY) || null
        scene = (sel && sel.scene) || null
      } catch (e) {}
    }
    this.setData({
      plans,
      empty,
      emptyText: emptyMessage(snap && snap.emptyReason),
      requestId: (snap && snap.requestId) || '',
      sceneSummary: formatSceneSummary(scene)
    })
    if (empty) {
      track('empty_recommend', { reasonCode: (snap && snap.emptyReason) || null })
    } else {
      track('recommend_show', {
        planCount: plans.length,
        planKinds: plans.map((p) => p.planKind || 'home')
      })
      plans.forEach((p) => {
        track('recommend_plan_impression', {
          planIndex: p.planIndex,
          planKind: p.planKind || 'home',
          ingredientTipText: p.ingredientTipText || ''
        })
      })
    }
  },

  onBack() {
    tapFeedback()
    wx.navigateBack({ delta: 1 })
  },

  onSwap() {
    tapFeedback()
    track('recommend_swap', { swapIndex: 1 })
    this._rerun('swap')
  },

  onRejectOpen() {
    tapFeedback()
    this.setData({ showReject: true })
  },

  onRejectClose() {
    tapFeedback()
    this.setData({ showReject: false })
  },

  onRejectSkip() {
    tapFeedback()
    this.setData({ showReject: false })
    track('recommend_reject', { skippedReason: true })
    this._rerun('reject', {})
  },

  onRejectReason(e) {
    tapFeedback()
    const reason = e.currentTarget.dataset.id
    this.setData({ showReject: false })
    track('recommend_reject', { reason, skippedReason: false })
    this._rerun('reject', { reason, planIndex: 0 })
  },

  _rerun(action, extra) {
    if (this.data.busy || !this.data.requestId) return
    this.setData({ busy: true, busyAction: action })
    callCloud('recommend', Object.assign({
      action,
      requestId: this.data.requestId
    }, extra || {}))
      .then((result) => {
        const requestId = result.requestId || this.data.requestId
        // 换一批 / 不行后方案变了，清掉本会话清单勾选
        try {
          const prev = wx.getStorageSync(CHECKS_KEY) || {}
          wx.setStorageSync(CHECKS_KEY, clearChecksForRequest(prev, requestId))
        } catch (e) {}
        const snap = Object.assign({}, readSnap() || {}, {
          requestId,
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
      .then(() => this.setData({ busy: false, busyAction: '' }))
  },

  onAccept(e) {
    if (this.data.busy || this.data.empty || !this.data.requestId) return
    tapFeedback('heavy')
    const planIndex = Number(e.currentTarget.dataset.planIndex)
    const idx = Number.isFinite(planIndex) ? planIndex : 0
    this.setData({ busy: true, busyAction: 'accept', busyPlanIndex: idx })
    track('recommend_accept', { planIndex: idx })
    track('recommend_plan_click', { planIndex: idx })
    callCloud('recommend', {
      action: 'accept',
      requestId: this.data.requestId,
      planIndex: idx
    })
      .then((result) => {
        if (result && Array.isArray(result.plans) && result.plans.length) {
          const prev = readSnap() || {}
          writeSnap(
            Object.assign({}, prev, {
              requestId: result.requestId || this.data.requestId,
              plans: result.plans,
              scene: result.scene || prev.scene
            })
          )
        }
        wx.navigateTo({
          url: '/pages/shopping/shopping?accepted=true&planIndex=' + idx
        })
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '采纳失败',
          icon: 'none'
        })
      })
      .then(() => this.setData({ busy: false, busyAction: '', busyPlanIndex: -1 }))
  },

})

