const { callCloud } = require('../../services/cloud.js')

Page({
  data: {
    showConfirm: false,
    candidates: [],
    selected: {},
    busy: false,
    requestId: null,
    recommendationId: null
  },

  goMarket() {
    if (this.data.busy) return
    this.setData({ busy: true })
    callCloud('meals', { action: 'confirmCandidates' })
      .then((result) => {
        if (result && result.show && (result.dishNames || []).length) {
          const selected = {}
          for (const name of result.dishNames) selected[name] = false
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
    this.setData({ showConfirm: false })
    this._goConfirm()
  },

  onConfirmSubmit() {
    if (this.data.busy) return
    const dishNames = this.data.candidates.filter((n) => this.data.selected[n])
    this.setData({ busy: true, showConfirm: false })
    const finish = () => {
      this.setData({ busy: false })
      this._goConfirm()
    }
    if (!dishNames.length) {
      finish()
      return
    }
    callCloud('meals', {
      action: 'confirmWrite',
      dishNames,
      requestId: this.data.requestId,
      recommendationId: this.data.recommendationId
    })
      .then(finish)
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
