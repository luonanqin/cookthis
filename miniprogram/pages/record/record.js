const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { recognizeOnce, stopRecognize } = require('../../utils/voice.js')
const { parseFoodNames } = require('../../utils/parseFoodNames.js')

Page({
  data: {
    input: '',
    items: [],
    busy: false,
    empty: true,
    listening: false,
    showVoiceConfirm: false,
    voiceCandidates: [],
    voiceSelected: {},
    transcript: ''
  },

  onShow() {
    this.loadList()
  },

  onHide() {
    if (this.data.listening) stopRecognize()
  },

  onUnload() {
    if (this.data.listening) stopRecognize()
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

  onVoiceTap() {
    if (this.data.listening || this.data.busy) return
    track('meal_log_voice_start', {})
    this.setData({ listening: true })
    wx.showToast({ title: '请说话…', icon: 'none', duration: 2000 })
    recognizeOnce({ duration: 12000 })
      .then((text) => {
        const names = parseFoodNames(text)
        track('meal_log_voice_result', {
          success: names.length > 0,
          count: names.length
        })
        if (!names.length) {
          this.setData({ listening: false })
          wx.showToast({ title: '没听清菜名，可手动输入', icon: 'none' })
          return
        }
        const voiceSelected = {}
        names.forEach((n) => {
          voiceSelected[n] = true
        })
        this.setData({
          listening: false,
          showVoiceConfirm: true,
          transcript: text,
          voiceCandidates: names,
          voiceSelected
        })
      })
      .catch((err) => {
        this.setData({ listening: false })
        track('meal_log_voice_result', { success: false })
        const code = err && err.error
        let title = '语音失败，请手动输入'
        if (code === 'VOICE_PLUGIN_UNAVAILABLE') title = '请先开通同声传译插件'
        if (code === 'VOICE_EMPTY') title = '没听清，请再说一次'
        wx.showToast({ title, icon: 'none' })
      })
  },

  onStopVoice() {
    stopRecognize()
  },

  onToggleVoiceName(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const voiceSelected = Object.assign({}, this.data.voiceSelected)
    voiceSelected[name] = !voiceSelected[name]
    this.setData({ voiceSelected })
  },

  onVoiceCancel() {
    this.setData({ showVoiceConfirm: false, voiceCandidates: [], transcript: '' })
  },

  onVoiceConfirm() {
    if (this.data.busy) return
    const dishNames = this.data.voiceCandidates.filter((n) => this.data.voiceSelected[n])
    if (!dishNames.length) {
      wx.showToast({ title: '请至少选一道菜', icon: 'none' })
      return
    }
    this.setData({ busy: true, showVoiceConfirm: false })
    callCloud('meals', { action: 'addVoice', dishNames })
      .then(() => {
        this.setData({ busy: false, voiceCandidates: [], transcript: '' })
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
