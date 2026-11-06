'use strict'

const { getNavMetrics } = require('../../utils/navBar.js')

Component({
  options: {
    virtualHost: true
  },
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true }
  },
  data: {
    padTop: 20,
    navBarHeight: 44,
    spacerHeight: 140
  },
  lifetimes: {
    attached() {
      const m = getNavMetrics()
      this.setData({
        padTop: m.statusBarHeight,
        navBarHeight: m.navBarHeight
      })
    },
    ready() {
      this._measureSpacer()
      // 插画/字体偶发二次撑开，再测一次
      setTimeout(() => this._measureSpacer(), 50)
      setTimeout(() => this._measureSpacer(), 200)
    }
  },
  observers: {
    'title, subtitle': function () {
      // 标题换行可能导致高度变化
      setTimeout(() => this._measureSpacer(), 16)
    }
  },
  methods: {
    _measureSpacer() {
      const query = this.createSelectorQuery()
      query.select('.page-header').boundingClientRect()
      query.exec((res) => {
        const rect = res && res[0]
        if (!rect || !rect.height) return
        // fixed 页眉贴顶时，用 bottom 作为下方吸顶/固定条的 top 更稳
        const next = Math.ceil(rect.bottom > 0 ? rect.bottom : rect.height)
        if (next !== this.data.spacerHeight) {
          this.setData({ spacerHeight: next })
        }
        if (next !== this._emittedHeight) {
          this._emittedHeight = next
          this.triggerEvent('heightchange', { height: next })
        }
      })
    },
    onBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
        return
      }
      wx.reLaunch({ url: '/pages/index/index' })
    }
  }
})