const { callCloud } = require('../../services/cloud.js')
const { getUser, ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const { buildPlanIngredientSummary } = require('../../utils/planIngredientSummary.js')
const { clearChecksForRequest } = require('../../utils/shoppingChecks.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const { formatSceneSummary } = require('../../utils/sceneSummary.js')
const { computeProfileGaps } = require('../../utils/profileGaps.js')

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
  behaviors: [typeScaleBehavior],

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
    showEmptyDialog: false,
    showProfileBanner: false,
    showQuickLite: false,
    rejectReasons: REJECT_REASONS,
    fabDimmed: false
  },

  _visibleMs: 0,
  _visibleSince: 0,
  _engagedSent: false,
  /** 当前这批方案的停留是否已随 swap/reject/accept/离开上报 */
  _batchDwellReported: false,
  _tickTimer: null,
  _fabScrollTimer: null,

  onLoad() {
    this.applySnap(readSnap())
  },

  onShow() {
    this.applyTypeScale()
    // 切后台只暂停；回前台继续累计同一批方案的停留
    if (!this._batchDwellReported) {
      this._visibleSince = Date.now()
    }
    this._tickTimer = setInterval(() => this._checkEngage(), 5000)
    this.refreshProfileBanner()
    ensureLogin()
      .then(() => this.refreshProfileBanner())
      .catch(() => {})
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
    this._reportBatchDwell('leave')
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

  /** 取出「当前这批方案」已看时长，并清零计时（换一批后重新计） */
  _takeBatchDwellMs() {
    this._pauseVisible()
    const ms = this._visibleMs
    this._visibleMs = 0
    return ms
  },

  _syncDwellToCloud(dwellMs) {
    if (!this.data.requestId || !(dwellMs > 0)) return
    callCloud('recommend', {
      action: 'engage',
      requestId: this.data.requestId,
      dwellMs,
      planIndex: 0
    }).catch(() => {})
  },

  /**
   * 上报当前方案停留：越长越说明这批更合适。
   * endReason: swap | reject | accept | leave
   * @returns {number} dwellMs
   */
  _reportBatchDwell(endReason, trackEvent, trackProps) {
    if (this._batchDwellReported) return 0
    const dwellMs = this._takeBatchDwellMs()
    this._batchDwellReported = true
    if (trackEvent) {
      track(trackEvent, Object.assign({ dwellMs }, trackProps || {}))
    } else if (dwellMs > 0) {
      track('recommend_batch_dwell', { dwellMs, endReason: endReason || 'leave' })
    }
    this._syncDwellToCloud(dwellMs)
    return dwellMs
  },

  _startBatchDwellClock() {
    this._visibleMs = 0
    this._engagedSent = false
    this._batchDwellReported = false
    this._visibleSince = Date.now()
  },

  _checkEngage() {
    // 满 30s 仍记 engage（进场确认锚点）；不等同于最终认可度
    if (this._engagedSent || !this.data.requestId) return
    const ms = this._currentVisibleMs()
    if (ms < 30000) return
    this._engagedSent = true
    track('recommend_engage', { planIndex: 0, dwellMs: ms })
    this._syncDwellToCloud(ms)
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
    this.refreshProfileBanner()
  },

  refreshProfileBanner() {
    const u = getUser() || {}
    const members = u.members || []
    const gaps = computeProfileGaps({
      familyAvoids: u.familyAvoids,
      familyAvoidsNone: u.familyAvoidsNone,
      membersCount: members.length,
      city: u.city,
      cuisinePrefs: u.cuisinePrefs,
      cuisinePrefsConfirmedAt: u.cuisinePrefsConfirmedAt
    })
    if (gaps.recommendBanner) {
      track('profile_reminder_show', {
        surface: 'recommend_banner',
        gaps: gaps.gaps
      })
    }
    this.setData({ showProfileBanner: gaps.recommendBanner })
  },

  onOpenQuickLite() {
    track('profile_lite_quick_open', { source: 'recommend_banner' })
    this.setData({ showQuickLite: true })
  },

  onQuickLiteClose() {
    this.setData({ showQuickLite: false })
  },

  onQuickLiteNone() {
    if (this.data.busy) return
    this.setData({ busy: true, showQuickLite: false })
    track('profile_lite_quick_none', { source: 'recommend_banner' })
    callCloud('profile', { action: 'confirmFamilyAvoidsNone' })
      .then(() => ensureLogin())
      .then(() => this._recreateRecommendAfterProfile())
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '保存失败', icon: 'none' })
        this.setData({ busy: false })
        this.refreshProfileBanner()
      })
  },

  onQuickLiteSave(e) {
    if (this.data.busy) return
    const familyAvoids = (e.detail && e.detail.familyAvoids) || []
    const love = (e.detail && e.detail.love) || {}
    const dishFormPrefs = {}
    if (love.hotpot) dishFormPrefs.hotpot = 'prefer'
    if (love.noodle) dishFormPrefs.noodle = 'prefer'
    this.setData({ busy: true, showQuickLite: false })
    track('profile_lite_quick_save', {
      source: 'recommend_banner',
      avoidCount: familyAvoids.length
    })
    callCloud('profile', {
      action: 'saveProfileLite',
      familyAvoids,
      dishFormPrefs
    })
      .then(() => ensureLogin())
      .then(() => this._recreateRecommendAfterProfile())
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '保存失败', icon: 'none' })
        this.setData({ busy: false })
      })
  },

  _recreateRecommendAfterProfile() {
    let selected = []
    let scene = null
    try {
      const sel = wx.getStorageSync(SELECTED_KEY) || null
      selected = (sel && sel.selected) || []
      scene = (sel && sel.scene) || null
      const rec = wx.getStorageSync(RECOMMEND_KEY) || null
      if (!scene && rec) scene = rec.scene
      if ((!selected || !selected.length) && rec && rec.selectedIngredients) {
        selected = rec.selectedIngredients
      }
    } catch (e) {}
    if (!selected.length || !scene) {
      this.setData({ busy: false })
      this.refreshProfileBanner()
      wx.showToast({ title: '无法刷新，请返回重选食材', icon: 'none' })
      return
    }
    return callCloud('recommend', { action: 'create', selected, scene })
      .then((result) => {
        const plans = (result && result.plans) || []
        const snap = {
          requestId: result.requestId,
          plans,
          scene,
          selectedIngredients: selected,
          emptyReason: result.emptyReason || null,
          swapCount: 0
        }
        writeSnap(snap)
        this.applySnap(snap)
        this._startBatchDwellClock()
        this.setData({ busy: false })
        if (!plans.length) {
          wx.showToast({ title: '暂无方案，可返回改食材', icon: 'none' })
        }
      })
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '刷新失败', icon: 'none' })
        this.setData({ busy: false })
        this.refreshProfileBanner()
      })
  },

  onBack() {
    tapFeedback()
    wx.navigateBack({ delta: 1 })
  },

  onEmptyDialogOk() {
    tapFeedback()
    this.setData({ showEmptyDialog: false })
  },

  onSwap() {
    tapFeedback()
    this._reportBatchDwell('swap', 'recommend_swap', { swapIndex: 1 })
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
    this._reportBatchDwell('reject', 'recommend_reject', { skippedReason: true })
    this._rerun('reject', {})
  },

  onRejectReason(e) {
    tapFeedback()
    const reason = e.currentTarget.dataset.id
    this.setData({ showReject: false })
    this._reportBatchDwell('reject', 'recommend_reject', {
      reason,
      skippedReason: false
    })
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
        const newPlans = (result && result.plans) || []
        // 凑不出新方案：保留当前方案，弹窗告知（不切到空页）
        if (result.noNewPlans || newPlans.length === 0) {
          track('empty_recommend', {
            reasonCode: (result && result.emptyReason) || null,
            action
          })
          if (this._batchDwellReported) {
            this._batchDwellReported = false
            this._visibleSince = Date.now()
          }
          this.setData({ showEmptyDialog: true })
          return
        }
        // 换一批 / 不行后方案变了，清掉本会话清单勾选
        try {
          const prev = wx.getStorageSync(CHECKS_KEY) || {}
          wx.setStorageSync(CHECKS_KEY, clearChecksForRequest(prev, requestId))
        } catch (e) {}
        const snap = Object.assign({}, readSnap() || {}, {
          requestId,
          plans: newPlans,
          emptyReason: null,
          swapCount: result.swapCount
        })
        writeSnap(snap)
        this.applySnap(snap)
        // 新一批方案重新计停留（认可度按批）
        this._startBatchDwellClock()
      })
      .catch((err) => {
        // 失败则允许同一批继续累计停留
        if (this._batchDwellReported) {
          this._batchDwellReported = false
          this._visibleSince = Date.now()
        }
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
    const requestId = this.data.requestId
    this.setData({ busy: true, busyAction: 'accept', busyPlanIndex: idx })
    this._reportBatchDwell('accept', 'recommend_accept', { planIndex: idx })
    track('recommend_plan_click', { planIndex: idx })
    // 清单靠本地方案聚合，先跳转；accept 只写采纳标记，后台跑不挡进页
    wx.navigateTo({
      url: '/pages/shopping/shopping?accepted=true&planIndex=' + idx
    })
    callCloud('recommend', {
      action: 'accept',
      requestId,
      planIndex: idx
    })
      .then((result) => {
        if (result && Array.isArray(result.plans) && result.plans.length) {
          const prev = readSnap() || {}
          writeSnap(
            Object.assign({}, prev, {
              requestId: result.requestId || requestId,
              plans: result.plans,
              scene: result.scene || prev.scene
            })
          )
        }
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '采纳未同步',
          icon: 'none'
        })
      })
      .then(() => this.setData({ busy: false, busyAction: '', busyPlanIndex: -1 }))
  },

})

