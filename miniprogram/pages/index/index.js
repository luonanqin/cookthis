const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

Page({
  behaviors: [typeScaleBehavior],

  data: {
    showConfirm: false,
    candidates: [],
    candidatesPeek: false,
    selected: {},
    selectAllLabel: '全选',
    busy: false,
    requestId: null,
    recommendationId: null
  },

  onShow() {
    this.applyTypeScale()
    // 进场确认预取：点「今天菜场」时多数已有结果，少等一轮云函数
    this._prefetchConfirmCandidates()
    // Do not force onboarding — Slice 1-4 stay usable. Guide is Slice 5 / MVP-gap.
    ensureLogin()
      .then((user) => {
        const app = getApp()
        // 仅显式 false 才弹；true / 缺字段都不弹
        if (!user || user.onboardingDone !== false) return
        if (!app || app.globalData.onboardingTipShown) return
        app.globalData.onboardingTipShown = true
        wx.showModal({
          title: '家庭设置',
          content: '可先试用买菜推荐；完整引导可点「暂时跳过」或稍后在「我的偏好」完善。',
          confirmText: '去设置',
          cancelText: '先逛逛',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/onboarding/onboarding' })
              return
            }
            // 「先逛逛」= 跳过引导，写入 onboardingDone，避免每次进首页再弹
            callCloud('profile', { action: 'skipOnboarding' })
              .then(() => ensureLogin())
              .catch(() => {})
          }
        })
      })
      .catch(() => {})
  },

  _prefetchConfirmCandidates() {
    const gen = (this._confirmPrefetchGen || 0) + 1
    this._confirmPrefetchGen = gen
    this._confirmPrefetchResult = null
    this._confirmPrefetchPromise = callCloud('meals', { action: 'confirmCandidates' })
      .then((result) => {
        if (gen !== this._confirmPrefetchGen) return null
        this._confirmPrefetchResult = result
        return result
      })
      .catch((err) => {
        if (gen !== this._confirmPrefetchGen) return null
        console.warn('confirmCandidates prefetch failed', err)
        this._confirmPrefetchResult = { ok: true, show: false, dishNames: [] }
        return this._confirmPrefetchResult
      })
  },

  _applyConfirmCandidates(result) {
    if (result && result.show && (result.dishNames || []).length) {
      const selected = {}
      for (const name of result.dishNames) selected[name] = false
      track('confirm_sheet_show', { candidateCount: result.dishNames.length })
      this.setData({
        showConfirm: true,
        candidates: result.dishNames,
        candidatesPeek: result.dishNames.length > 6,
        selected,
        selectAllLabel: '全选',
        requestId: result.requestId || null,
        recommendationId: result.recommendationId || null,
        busy: false
      })
      return
    }
    this.setData({ busy: false })
    this._goConfirm()
  },

  onHide() {
    // 半屏 catchtouchmove 留在栈底时，上层页会出现「什么都点不动」
    if (this.data.showConfirm || this.data.busy) {
      this.setData({ showConfirm: false, busy: false })
    }
  },

  goMarket() {
    if (this.data.busy) return
    tapFeedback()
    track('market_entry', {})
    this.setData({ busy: true })

    // 预取已完成 → 立刻弹层或进确认页；否则等进行中的预取 / 再请求一次
    const ready = this._confirmPrefetchResult
    if (ready) {
      this._confirmPrefetchResult = null
      this._applyConfirmCandidates(ready)
      this._prefetchConfirmCandidates()
      return
    }

    const pending = this._confirmPrefetchPromise
    const req = pending || callCloud('meals', { action: 'confirmCandidates' })
    req
      .then((result) => {
        this._confirmPrefetchResult = null
        this._applyConfirmCandidates(result || { show: false, dishNames: [] })
        this._prefetchConfirmCandidates()
      })
      .catch((err) => {
        console.error(err)
        this.setData({ busy: false })
        this._goConfirm()
        this._prefetchConfirmCandidates()
      })
  },

  _selectAllLabel(candidates, selected) {
    const list = candidates || []
    const all = list.length > 0 && list.every((n) => selected[n])
    return all ? '取消全选' : '全选'
  },

  onToggleDish(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    tapFeedback()
    const selected = Object.assign({}, this.data.selected)
    selected[name] = !selected[name]
    this.setData({
      selected,
      selectAllLabel: this._selectAllLabel(this.data.candidates, selected)
    })
  },

  onSelectAll() {
    tapFeedback()
    const candidates = this.data.candidates || []
    const allSelected =
      candidates.length > 0 && candidates.every((n) => this.data.selected[n])
    const selected = {}
    for (const name of candidates) selected[name] = !allSelected
    this.setData({
      selected,
      selectAllLabel: allSelected ? '全选' : '取消全选'
    })
  },

  _markEntryHandled() {
    return callCloud('meals', {
      action: 'confirmSkip',
      requestId: this.data.requestId,
      recommendationId: this.data.recommendationId
    })
  },

  onConfirmSkip() {
    if (this.data.busy) return
    tapFeedback()
    track('confirm_sheet_skip', {})
    this.setData({ busy: true, showConfirm: false })
    const finish = () => {
      this.setData({ busy: false })
      this._goConfirm()
    }
    // 跳过必须尽量打上 handled；失败再试一次
    this._markEntryHandled()
      .catch((err) => {
        console.error(err)
        return this._markEntryHandled()
      })
      .catch((err) => console.error(err))
      .then(finish)
  },

  onConfirmSubmit() {
    if (this.data.busy) return
    tapFeedback()
    const dishNames = this.data.candidates.filter((n) => this.data.selected[n])
    const candidateCount = this.data.candidates.length
    this.setData({ busy: true, showConfirm: false })
    const finish = () => {
      this.setData({ busy: false })
      this._goConfirm()
    }
    track('confirm_sheet_submit', {
      selectedCount: dishNames.length,
      candidateCount
    })
    // 勾 0 道也走 confirmWrite，服务端会标 entryConfirmHandled
    callCloud('meals', {
      action: 'confirmWrite',
      dishNames,
      requestId: this.data.requestId,
      recommendationId: this.data.recommendationId
    })
      .then(() => {
        if (dishNames.length) {
          track('meal_log_confirm', { dishCount: dishNames.length })
        }
        finish()
      })
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '记录失败，已跳过', icon: 'none' })
        // 写菜失败时仍尽量 mark handled，避免同批反复弹
        this._markEntryHandled()
          .catch(() => this._markEntryHandled())
          .catch(() => {})
          .then(finish)
      })
  },

  _goConfirm() {
    wx.navigateTo({ url: '/pages/confirm/confirm' })
  },

  goRecord() {
    tapFeedback()
    wx.navigateTo({ url: '/pages/record/record' })
  },

  goAcceptedPlans() {
    tapFeedback()
    wx.navigateTo({ url: '/pages/acceptedPlans/acceptedPlans' })
  },

  goMine() {
    tapFeedback()
    wx.navigateTo({ url: '/pages/mine/mine' })
  }
})
