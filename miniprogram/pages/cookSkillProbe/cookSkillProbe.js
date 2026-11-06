const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const { buildProbeGroups, retakeCloudCall } = require('../../utils/cookSkillRetake.js')

function leaveProbe() {
  const pages = getCurrentPages() || []
  if (pages.length > 1) {
    wx.navigateBack()
    return
  }
  wx.redirectTo({ url: '/pages/mine/mine' })
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    probeGroups: buildProbeGroups(),
    probeChecked: {},
    busy: false
  },

  onLoad() {
    this._settled = false
    this._submitting = false
  },

  onToggleProbeDish(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this._submitting) return
    const probeChecked = Object.assign({}, this.data.probeChecked)
    probeChecked[id] = !probeChecked[id]
    this.setData({ probeChecked })
  },

  onSubmit() {
    if (this._submitting || this._settled) return
    const plan = retakeCloudCall('submit', this.data.probeChecked)
    if (!plan.payload) {
      wx.showToast({
        title: plan.error === 'EMPTY_PROBE' ? '请至少勾选一道' : '请先勾选',
        icon: 'none'
      })
      return
    }
    tapFeedback()
    this._submitting = true
    this.setData({ busy: true })
    callCloud('profile', plan.payload)
      .then(() => ensureLogin())
      .then(() => {
        this._settled = true
        this._submitting = false
        track(plan.track, plan.trackProps)
        if (this._unloaded) return
        wx.showToast({ title: plan.toast, icon: 'none' })
        setTimeout(leaveProbe, 600)
      })
      .catch((err) => {
        this._submitting = false
        if (this._unloaded) return
        this.setData({ busy: false })
        const code = err && err.error
        wx.showToast({
          title:
            code === 'UNKNOWN_ACTION' ? '请重新部署云函数 profile' : code || '保存失败',
          icon: 'none'
        })
      })
  },

  onCancel() {
    if (this._submitting || this._settled) return
    tapFeedback()
    const plan = retakeCloudCall('cancel', this.data.probeChecked)
    this._settled = true
    track(plan.track, plan.trackProps)
    leaveProbe()
  },

  onUnload() {
    this._unloaded = true
    if (this._settled || this._submitting) return
    const plan = retakeCloudCall('back', this.data.probeChecked)
    this._settled = true
    track(plan.track, plan.trackProps)
  }
})
