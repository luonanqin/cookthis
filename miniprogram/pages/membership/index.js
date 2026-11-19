'use strict'

const membership = require('../../services/membership.js')
const { MEMBERSHIP_ENABLED } = membership
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const {
  BENEFITS,
  NOTICE_ITEMS,
  ORDER_CANCELLED_TOAST,
  PAY_UNAVAILABLE,
  TIER_LABEL,
  applyStatus,
  canUseVirtualPayOnClient,
  orderErrorToast,
  payFailToast,
  pendingOtherSkuCopy,
  shouldContinuePoll,
  tickOrderRemains
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

function readClientEnv() {
  try {
    const sys = wx.getSystemInfoSync() || {}
    return {
      platform: sys.platform || '',
      version: sys.version || ''
    }
  } catch (e) {
    return { platform: '', version: '' }
  }
}

function isNonReleaseEnv() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    return env === 'develop' || env === 'trial'
  } catch (e) {
    return false
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    from: 'direct',
    status: null,
    offers: [],
    orders: [],
    selectedSku: 'month',
    selectedSkuLabel: '月卡',
    busy: true,
    pageReady: false,
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
    showDevTools: false,
    noticeItems: NOTICE_ITEMS,
    benefitRows: BENEFITS
  },

  _platform: '',
  _wechatVersion: '',
  _pollTimer: null,
  _countdownTimer: null,
  _loadGen: 0,
  _ordersAppliedAt: 0,

  onLoad(q) {
    if (!MEMBERSHIP_ENABLED) {
      wx.showToast({ title: '会员暂未开放', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
      }, 400)
      return
    }
    const from = (q && q.from) || 'direct'
    const env = readClientEnv()
    this._platform = env.platform
    this._wechatVersion = env.version
    const gate = canUseVirtualPayOnClient({
      platform: env.platform,
      version: env.version
    })
    this.setData({
      from,
      noticeAcked: readNoticeAcked(),
      payUnavailable: !gate.ok,
      showDevTools: isNonReleaseEnv(),
      busy: true,
      pageReady: false
    })
    track('membership_page_show', { from })
    this._loadStatus({ initial: true })
  },

  onShow() {
    this.applyTypeScale()
    if (!MEMBERSHIP_ENABLED) return
    if (this.data.busy) return
    if (!this.data.pageReady) return
    this._loadStatus()
  },

  onHide() {
    this._stopCountdown()
  },

  onUnload() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
    this._stopCountdown()
  },

  noop() {},

  onSelectSku(e) {
    const sku = e.currentTarget.dataset.sku
    if (!sku || sku === this.data.selectedSku) return
    tapFeedback('light')
    this.setData({
      selectedSku: sku,
      selectedSkuLabel: TIER_LABEL[sku] || sku
    })
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

  onDevGrant(e) {
    if (!this.data.showDevTools || this.data.busy) return
    if ((this.data.orders || []).some((o) => o && o.canPay)) {
      wx.showToast({ title: '请先处理待支付订单', icon: 'none' })
      return
    }
    const sku = (e && e.currentTarget && e.currentTarget.dataset.sku) || 'month'
    tapFeedback('light')
    this._runDev(membership.devGrant(sku))
  },

  onDevClear() {
    if (!this.data.showDevTools || this.data.busy) return
    tapFeedback('light')
    this._runDev(membership.devClear())
  },

  onDevExpireSoon() {
    if (!this.data.showDevTools || this.data.busy) return
    tapFeedback('light')
    this._runDev(membership.devExpireSoon())
  },

  onDevResetFirstPurchase() {
    if (!this.data.showDevTools || this.data.busy) return
    tapFeedback('light')
    this._runDev(membership.devResetFirstPurchase())
  },

  onDevClearOrders() {
    if (!this.data.showDevTools || this.data.busy) return
    tapFeedback('light')
    this._runDev(membership.devClearOrders())
  },

  onDevCreatePending() {
    if (!this.data.showDevTools || this.data.busy) return
    const sku = this.data.selectedSku || 'month'
    tapFeedback('light')
    this._runDev(membership.devCreatePending(sku))
  },

  _runDev(promise) {
    this.setData({ busy: true })
    Promise.resolve(promise)
      .then((res) => {
        if (!res || res.ok === false) {
          const err = new Error((res && res.error) || '调试失败')
          err.error = (res && res.error) || '调试失败'
          throw err
        }
        this._applyStatus(res)
        this.setData({ busy: false })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({
          title: orderErrorToast(err, this._platform) || '调试失败',
          icon: 'none'
        })
      })
  },

  onPay() {
    if (this.data.busy) return
    if (!this._assertPayClientReady()) return
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
    this._startCreatePay(sku, false)
  },

  onPayOrder(e) {
    if (this.data.busy) return
    if (!this._assertPayClientReady()) return
    const orderId = e.currentTarget.dataset.orderId
    if (!orderId) return
    if (!this.data.noticeAcked) {
      this.setData({ showNotice: true })
      return
    }
    tapFeedback('medium')
    this.setData({ busy: true })
    membership
      .payOrder(orderId)
      .then((res) => {
        this._launchPayment(res, (res && res.sku) || '')
      })
      .catch((err) => {
        this._handleOrderActionError(err)
      })
  },

  onCancelOrder(e) {
    if (this.data.busy) return
    const orderId = e.currentTarget.dataset.orderId
    if (!orderId) return
    tapFeedback('light')
    wx.showModal({
      title: '取消订单',
      content: '确定取消这笔待支付订单？',
      confirmText: '取消订单',
      cancelText: '再想想',
      success: (r) => {
        if (!r.confirm) return
        this.setData({ busy: true })
        membership
          .cancelOrder(orderId)
          .then(() => this._reloadAfterOrderChange())
          .catch((err) => {
            this._handleOrderActionError(err)
          })
      }
    })
  },

  _assertPayClientReady() {
    const gate = canUseVirtualPayOnClient({
      platform: this._platform,
      version: this._wechatVersion
    })
    if (gate.ok) return true
    wx.showModal({
      title: '提示',
      content: gate.message || PAY_UNAVAILABLE,
      showCancel: false
    })
    return false
  },

  _startCreatePay(sku, replacePending) {
    this.setData({ busy: true })
    membership
      .createOrder(sku, replacePending ? { replacePending: true } : undefined)
      .then((res) => {
        this._launchPayment(res, sku)
      })
      .catch((err) => {
        if (err && err.error === 'PENDING_OTHER_SKU' && !replacePending) {
          this.setData({ busy: false })
          this._confirmReplacePending(sku, err.pending)
          return
        }
        this.setData({ busy: false })
        if (err && err.error === 'ORDER_EXPIRED') {
          this._toastExpiredAndReload()
          return
        }
        wx.showToast({
          title: orderErrorToast(err, this._platform),
          icon: 'none'
        })
      })
  },

  _confirmReplacePending(sku, pending) {
    wx.showModal({
      title: '已有待支付订单',
      content: pendingOtherSkuCopy(pending, sku),
      confirmText: '换档下单',
      cancelText: '去支付原单',
      success: (r) => {
        if (r.confirm) {
          this._startCreatePay(sku, true)
          return
        }
        if (pending && pending.orderId) {
          this.setData({ busy: true })
          membership
            .payOrder(pending.orderId)
            .then((res) => {
              this._launchPayment(res, pending.sku || '')
            })
            .catch((err) => {
              this._handleOrderActionError(err)
            })
        }
      }
    })
  },

  _launchPayment(res, sku) {
    const p = res && res.payment
    if (!p || typeof wx.requestVirtualPayment !== 'function') {
      this.setData({ busy: false })
      wx.showToast({ title: PAY_UNAVAILABLE, icon: 'none' })
      this._loadStatus()
      return
    }
    wx.requestVirtualPayment({
      signData:
        typeof p.signData === 'string' ? p.signData : JSON.stringify(p.signData),
      paySig: p.paySig,
      signature: p.signature,
      mode: 'short_series_goods',
      success: () => {
        track('membership_pay_success', { sku: sku || '' })
        this._pollRefresh()
      },
      fail: (e) => {
        this.setData({ busy: false })
        if (e && e.errCode === -2) track('membership_pay_cancel', { sku: sku || '' })
        wx.showToast({
          title: payFailToast(e, this.data.payUnavailable),
          icon: 'none'
        })
        this._loadStatus()
      }
    })
  },

  _handleOrderActionError(err) {
    this.setData({ busy: false })
    if (err && err.error === 'ORDER_EXPIRED') {
      this._toastExpiredAndReload()
      return
    }
    wx.showToast({
      title: orderErrorToast(err, this._platform),
      icon: 'none'
    })
    this._loadStatus()
  },

  _toastExpiredAndReload() {
    wx.showToast({ title: ORDER_CANCELLED_TOAST, icon: 'none' })
    this._loadStatus()
  },

  _reloadAfterOrderChange() {
    membership
      .getStatus()
      .then((res) => {
        this._applyStatus(res)
        this.setData({ busy: false })
      })
      .catch(() => {
        this.setData({ busy: false })
        this._loadStatus()
      })
  },

  _loadStatus(opts) {
    const initial = !!(opts && opts.initial)
    this._loadGen += 1
    const gen = this._loadGen
    if (initial || !this.data.pageReady) {
      this.setData({ busy: true })
    }
    membership
      .getStatus()
      .then((res) => {
        if (gen !== this._loadGen) return
        this._applyStatus(res, { clearBusy: true })
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        this.setData({
          busy: false,
          pageReady: true,
          statusText: '加载失败',
          offers: [],
          orders: []
        })
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  _applyStatus(res, opts) {
    const next = applyStatus(
      res,
      this.data.selectedSku,
      this.data.buyExpanded,
      Date.now()
    )
    this._ordersAppliedAt = next._ordersAppliedAt || Date.now()
    const patch = Object.assign({}, next, { pageReady: true })
    if (opts && opts.clearBusy) patch.busy = false
    this.setData(patch)
    this._startCountdown()
  },

  _startCountdown() {
    this._stopCountdown()
    const hasActive = (this.data.orders || []).some((o) => o && o.canPay)
    if (!hasActive) return
    this._countdownTimer = setInterval(() => {
      const appliedAt = this._ordersAppliedAt || Date.now()
      const next = tickOrderRemains(this.data.orders, appliedAt, Date.now())
      const still = next.some((o) => o && o.canPay && o.remainMsLocal > 0)
      this.setData({ orders: next })
      if (!still) {
        this._stopCountdown()
        this._loadStatus()
      }
    }, 1000)
  },

  _stopCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
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
