const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')

Page({
  data: {
    input: '',
    items: [],
    busy: false,
    empty: true
  },

  onShow() {
    this.loadList()
  },

  onInput(e) {
    this.setData({ input: e.detail.value || '' })
  },

  loadList() {
    callCloud('meals', { action: 'list', limit: 20 })
      .then((result) => {
        const items = ((result && result.items) || []).map((it) => ({
          logId: it.logId,
          date: it.date,
          source: it.source,
          dishesText: (it.dishNames || []).join('、')
        }))
        this.setData({ items, empty: items.length === 0 })
      })
      .catch((err) => {
        console.error(err)
      })
  },

  onSubmit() {
    if (this.data.busy) return
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
        this.loadList()
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({
          title: (err && err.error) || '记录失败',
          icon: 'none'
        })
      })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
