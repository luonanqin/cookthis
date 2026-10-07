const { callCloud } = require('../../services/cloud.js')
const { ensureLogin, getUser } = require('../../services/session.js')
const { track } = require('../../utils/track.js')

Page({
  data: {
    showConfirm: false,
    candidates: [],
    selected: {},
    busy: false,
    requestId: null,
    recommendationId: null
  },

  onShow() {
    ensureLogin()
      .then((user) => {
        if (user && !user.onboardingDone) {
          wx.redirectTo({ url: '/pages/onboarding/onboarding' })
        }
      })
      .catch(() => {})
  },

  goMarket() {
    if (this.data.busy) return
    const user = getUser()
    if (user && !user.onboardingDone) {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' })
      return
    }
    track('market_entry', {})
    this.setData({ busy: true })
    callCloud('meals', { action: 'confirmCandidates' })
      .then((result) => {
        if (result && result.show && (result.dishNames || []).length) {
          const selected = {}
          for (const name of result.dishNames) selected[name] = false
          track('confirm_sheet_show', { candidateCount: result.dishNames.length })
          this.setData({
            showConfirm: true,
            candidates: result.dishNames,
            selected,
            requestId: result.requestId || null,
            recommendationId: result.recommendationId || null,
            busy: false
          })
          return
        }
        this.setData({ busy: false })
        this._goConfirm()
      })
      .catch((err) => {
        console.error(err)
        this.setData({ busy: false })
        // fail open: still allow market flow
        this._goConfirm()
      })
  },

  onToggleDish(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const selected = Object.assign({}, this.data.selected)
    selected[name] = !selected[name]
    this.setData({ selected })
  },

  onSelectAll() {
    const selected = {}
    for (const name of this.data.candidates) selected[name] = true
    this.setData({ selected })
  },

  onConfirmSkip() {
    track('confirm_sheet_skip', {})
    this.setData({ showConfirm: false })
    this._goConfirm()
  },

  onConfirmSubmit() {
    if (this.data.busy) return
    const dishNames = this.data.candidates.filter((n) => this.data.selected[n])
    const candidateCount = this.data.candidates.length
    this.setData({ busy: true, showConfirm: false })
    const finish = () => {
      this.setData({ busy: false })
      this._goConfirm()
    }
    if (!dishNames.length) {
      track('confirm_sheet_submit', { selectedCount: 0, candidateCount })
      finish()
      return
    }
    track('confirm_sheet_submit', {
      selectedCount: dishNames.length,
      candidateCount
    })
    callCloud('meals', {
      action: 'confirmWrite',
      dishNames,
      requestId: this.data.requestId,
      recommendationId: this.data.recommendationId
    })
      .then(() => {
        track('meal_log_confirm', { dishCount: dishNames.length })
        finish()
      })
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '记录失败，已跳过', icon: 'none' })
        finish()
      })
  },

  _goConfirm() {
    wx.navigateTo({ url: '/pages/confirm/confirm' })
  },

  goRecord() {
    wx.navigateTo({ url: '/pages/record/record' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/mine/mine' })
  }
})
