'use strict'

const membership = require('../../services/membership.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const {
  NOTICE_ITEMS,
  PAY_UNAVAILABLE,
  applyStatus,
  isIosPlatform,
  orderErrorToast,
  payFailToast,
  shouldContinuePoll
} = require('./view.js')

function readNoticeAcked() {
  try {
    return !!wx.getStorageSync('cookthis_membership_notice_acked')
  } catch (e) {
    return false
  }
}

function writeNoticeAcked() {
  try {
    wx.setStorageSync('cookthis_membership_notice_acked', 1)
  } catch (e) {}
}

function readPlatform() {
  try {
    const sys = wx.getSystemInfoSync() || {}
    return sys.platform || ''
  } catch (e) {
    return ''
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    from: 'direct',
    status: null,
    offers: [],
    selectedSku: 'month',
    busy: false,
    showNotice: false,
    noticeAcked: false,
    isMember: false,
    statusText: '加载中…',
    usageText: '',
    tierLabel: '',
    expiresLabel: '',
    buyExpanded: false,
    ctaLabel: '立即开通',
    payUnavailable: false,
    noticeItems: NOTICE_ITEMS
  },

  _platform: '',
  _pollTimer: null,
  _loadGen: 0,

  onLoad(q) {
    const from = (q && q.from) || 'direct'
    this._platform = readPlatform()
    this.setData({
      from,
      noticeAcked: readNoticeAcked(),
      payUnavailable: isIosPlatform(this._platform)
    })
    track('membership_page_show', { from })
  },

  onShow() {
    this.applyTypeScale()
    if (this.data.busy) return
    this._loadStatus()
  },

  onUnload() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  },

  noop() {},

  onSelectSku(e) {
    const sku = e.currentTarget.dataset.sku
    if (!sku || sku === this.data.selectedSku) return
    tapFeedback('light')
    this.setData({ selectedSku: sku })
    track('membership_sku_select', { sku, from: this.data.from })
  },

  onExpandBuy() {
    tapFeedback('light')
    this.setData({ buyExpanded: true })
  },

  onOpenNotice() {
    tapFeedback('light')
    this.setData({ showNotice: true })
  },

  onCloseNotice() {
    this.setData({ showNotice: false })
  },

  onAckNotice() {
    tapFeedback('medium')
    writeNoticeAcked()
    this.setData({ showNotice: false, noticeAcked: true })
  },

  onRefresh() {
    if (this.data.busy) return
    tapFeedback('medium')
    track('membership_refresh_tap', { from: this.data.from })
    this._loadGen += 1
    this.setData({ busy: true })
    membership
      .refresh()
      .then((res) => {
        this._applyStatus(res)
        this.setData({ busy: false })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({
          title: (err && err.error) || '刷新失败',
          icon: 'none'
        })
      })
  },

  onPay() {
    if (this.data.busy) return
    if (!this.data.noticeAcked) {
      this.setData({ showNotice: true })
      return
    }
    const sku = this.data.selectedSku
    if (!sku) {
      wx.showToast({ title: '请选择套餐', icon: 'none' })
      return
    }
    tapFeedback('medium')
    track('membership_pay_click', { sku, from: this.data.from })
    this.setData({ busy: true })
    membership
      .createOrder(sku)
      .then((res) => {
        const p = res && res.payment
        if (!p || typeof wx.requestVirtualPayment !== 'function') {
          this.setData({ busy: false })
          wx.showToast({ title: PAY_UNAVAILABLE, icon: 'none' })
          return
        }
        wx.requestVirtualPayment({
          signData:
            typeof p.signData === 'string' ? p.signData : JSON.stringify(p.signData),
          paySig: p.paySig,
          signature: p.signature,
          mode: 'short_series_goods',
          success: () => {
            track('membership_pay_success', { sku })
            // 不授会员；轮询 refresh 1～3 次
            this._pollRefresh()
          },
          fail: (e) => {
            this.setData({ busy: false })
            if (e && e.errCode === -2) track('membership_pay_cancel', { sku })
            wx.showToast({
              title: payFailToast(e, this.data.payUnavailable),
              icon: 'none'
            })
          }
        })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({
          title: orderErrorToast(err, this._platform),
          icon: 'none'
        })
      })
  },

  _loadStatus() {
    this._loadGen += 1
    const gen = this._loadGen
    membership
      .getStatus()
      .then((res) => {
        if (gen !== this._loadGen) return
        this._applyStatus(res)
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  _applyStatus(res) {
    this.setData(applyStatus(res, this.data.selectedSku, this.data.buyExpanded))
  },

  _pollRefresh() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
    this._loadGen += 1
    let attempt = 0
    const tick = () => {
      membership
        .refresh()
        .then((res) => {
          this._applyStatus(res)
          attempt += 1
          if (!shouldContinuePoll(attempt, !!(res && res.isMember))) {
            this.setData({ busy: false })
            return
          }
          this._pollTimer = setTimeout(tick, 800 * attempt)
        })
        .catch(() => {
          attempt += 1
          if (!shouldContinuePoll(attempt, false)) {
            this.setData({ busy: false })
            return
          }
          this._pollTimer = setTimeout(tick, 800 * attempt)
        })
    }
    this.setData({ busy: true })
    tick()
  }
})
