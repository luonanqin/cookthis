const { callCloud } = require('../../services/cloud.js')
const { ensureLogin, getUser, patchUser } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const { computeProfileGaps } = require('../../utils/profileGaps.js')
const {
  shouldShowMarketScaleSheet,
  effectiveFromChoice,
  labelForChoice,
  chosenAtToMs,
  RELOCATE_MIN_METERS,
  RELOCATE_COOLDOWN_MS
} = require('../../utils/marketScale.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

/** 同一小程序会话内规模半屏最多一次（模块级，随 App 进程存活） */
let marketScaleSessionShown = false

/** 开发调试：强制 getLocation 失败，模拟未授权/无定位 */
let debugForceNoLocation = false

/** ~1.2km north of fix（略大于 RELOCATE_MIN_METERS） */
const DEBUG_RELOCATE_OFFSET_LAT = 0.011

function isNonReleaseEnv() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    return env === 'develop' || env === 'trial'
  } catch (e) {
    return false
  }
}

function formatChosenAtAge(chosenAt, now) {
  const ms = chosenAtToMs(chosenAt)
  if (ms == null) return '未选过'
  const mins = Math.floor((now - ms) / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/** 不取定位时的粗判：方便调试面板说明「为什么不弹」 */
function predictMarketScaleShow(user, now) {
  if (debugForceNoLocation) {
    const hasChoice = !!(user && user.marketScaleChoice)
    return hasChoice
      ? '模拟无定位：有档位 → 不弹半屏、不改档'
      : '模拟无定位：无档位 → 不弹，静默写默认中档'
  }
  if (marketScaleSessionShown) {
    return '下次不弹：本会话已弹过（点「清会话已弹」或重开）'
  }
  const chosenMs = chosenAtToMs(user && user.marketScaleChosenAt)
  if (chosenMs == null) {
    return '下次可弹首次（需有定位；无定位则静默默认中档）'
  }
  const remain = RELOCATE_COOLDOWN_MS - (now - chosenMs)
  if (remain > 0) {
    const mins = Math.max(1, Math.ceil(remain / 60000))
    return `下次不弹：冷却还剩约 ${mins} 分（用「设为可再弹」或「清规模状态」）`
  }
  const anchor = user && user.marketScaleAnchor
  if (
    !anchor ||
    typeof anchor.lat !== 'number' ||
    typeof anchor.lng !== 'number'
  ) {
    return '下次不弹：无锚点，无法判定挪地（用「设为可再弹」）'
  }
  return '下次可弹挪地（需定位且距锚点≥1km；「设为可再弹」已写偏锚点）'
}

const MARKET_SCALE_LOCATION_TIMEOUT_MS = 5000
const MARKET_SCALE_COPY = {
  first: {
    title: '你常去的菜场大概多大？',
    hint: '用来决定今天展示多少常见菜，可随时改'
  },
  relocate: {
    title: '换地方了？再确认一下菜场规模',
    hint: '用来决定今天展示多少常见菜，可随时改'
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    showConfirm: false,
    showMarketScale: false,
    marketScaleTitle: '',
    marketScaleHint: '',
    marketScaleHighlight: '',
    marketScaleDefaultOn: false,
    candidates: [],
    candidatesPeek: false,
    selected: {},
    hasSelected: false,
    selectAllLabel: '全选',
    busy: false,
    requestId: null,
    recommendationId: null,
    profileGapCount: 0,
    feedbackHasUnread: false,
    showMarketScaleDebug: false,
    marketScaleDebugStatus: '',
    debugForceNoLocationLabel: '模拟无定位：关'
  },

  onLoad(query) {
    this._maybeOpenFeedback(query)
    this.setData({ showMarketScaleDebug: isNonReleaseEnv() })
  },

  onShow() {
    this.applyTypeScale()
    // 进场确认预取：点「今天菜场」时多数已有结果，少等一轮云函数
    this._prefetchConfirmCandidates()
    // 先用本地缓存（我的页保存后已 patch），红点立刻对；再拉 auth
    this.refreshProfileGapBadge(getUser())
    this.refreshMarketScaleDebugStatus()
    // Do not force onboarding — Slice 1-4 stay usable. Guide is Slice 5 / MVP-gap.
    ensureLogin({ preferLocalStance: true })
      .then((user) => {
        this.refreshProfileGapBadge(user)
        this.refreshMarketScaleDebugStatus(user)
        const app = getApp()
        // 仅显式 false 才弹；true / 缺字段都不弹
        if (!user || user.onboardingDone !== false) return
        if (!app || app.globalData.onboardingTipShown) return
        app.globalData.onboardingTipShown = true
        wx.showModal({
          title: '完善家庭设置',
          content: '建议先设置家庭成员和忌口，推荐会更准哦。',
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
    this.refreshFeedbackDot()
    // 冷启动有时 query 只在 onLoad；热启动可从 launch options 再读一次
    try {
      const enter = wx.getEnterOptionsSync && wx.getEnterOptionsSync()
      if (enter && enter.query) this._maybeOpenFeedback(enter.query)
    } catch (e) {}
  },

  refreshFeedbackDot() {
    callCloud('feedback', { action: 'hasUnread' })
      .then((res) => {
        this.setData({ feedbackHasUnread: !!(res && res.hasUnread) })
      })
      .catch(() => {})
  },

  _maybeOpenFeedback(query) {
    if (!query || String(query.openFeedback) !== '1') return
    if (this._openedFeedbackOnce) return
    this._openedFeedbackOnce = true
    track('feedback_open_from_subscribe', {})
    if (this._openFeedbackTimer) clearTimeout(this._openFeedbackTimer)
    this._openFeedbackTimer = setTimeout(() => {
      this._openFeedbackTimer = null
      wx.navigateTo({ url: '/pages/feedback/list' })
    }, 0)
  },

  refreshProfileGapBadge(user) {
    const u = user || {}
    const members = u.members || []
    const gaps = computeProfileGaps({
      familyAvoids: u.familyAvoids,
      familyAvoidsNone: u.familyAvoidsNone,
      membersCount: members.length,
      city: u.city,
      cuisinePrefs: u.cuisinePrefs,
      cuisinePrefsConfirmedAt: u.cuisinePrefsConfirmedAt
    })
    const profileGapCount = (gaps.gaps || []).length
    this.setData({ profileGapCount })
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
        hasSelected: false,
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

  onUnload() {
    if (this._openFeedbackTimer) {
      clearTimeout(this._openFeedbackTimer)
      this._openFeedbackTimer = null
    }
  },

  onHide() {
    // 半屏 catchtouchmove 留在栈底时，上层页会出现「什么都点不动」
    if (this.data.showConfirm || this.data.showMarketScale || this.data.busy) {
      if (this.data.showMarketScale) {
        marketScaleSessionShown = false
      }
      this.setData({ showConfirm: false, showMarketScale: false, busy: false })
    }
    this._disableMarketScaleBackGuard()
  },

  noop() {},

  goMarket() {
    if (this.data.busy || this.data.showConfirm || this.data.showMarketScale) return
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

  _hasSelected(candidates, selected) {
    const list = candidates || []
    return list.some((n) => selected && selected[n])
  },

  onToggleDish(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    tapFeedback()
    const selected = Object.assign({}, this.data.selected)
    selected[name] = !selected[name]
    this.setData({
      selected,
      hasSelected: this._hasSelected(this.data.candidates, selected),
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
      hasSelected: this._hasSelected(candidates, selected),
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
    if (this.data.busy || !this.data.hasSelected) return
    tapFeedback()
    const dishNames = this.data.candidates.filter((n) => this.data.selected[n])
    if (!dishNames.length) return
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
    this._afterEntryConfirm()
  },

  _navigateConfirm() {
    this._disableMarketScaleBackGuard()
    wx.navigateTo({ url: '/pages/confirm/confirm' })
  },

  _afterEntryConfirm() {
    // 定位判定期间挡住再次点「今天菜场」；弹层展示或进确认页时再放行
    this.setData({ busy: true })
    this._maybeShowMarketScaleSheet()
      .then((shown) => {
        if (!shown) {
          this.setData({ busy: false })
          this._navigateConfirm()
        }
      })
      .catch((err) => {
        console.warn('market scale sheet gate failed', err)
        this.setData({ busy: false })
        this._navigateConfirm()
      })
  },

  _getLocationGcJ02() {
    if (debugForceNoLocation && isNonReleaseEnv()) {
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      let settled = false
      const finish = (fix) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fix)
      }
      const timer = setTimeout(() => finish(null), MARKET_SCALE_LOCATION_TIMEOUT_MS)
      try {
        wx.getLocation({
          type: 'gcj02',
          success: (res) => {
            const lat = res && res.latitude
            const lng = res && res.longitude
            if (typeof lat === 'number' && typeof lng === 'number') {
              finish({ lat, lng })
              return
            }
            finish(null)
          },
          fail: () => finish(null)
        })
      } catch (e) {
        finish(null)
      }
    })
  },

  _applyMarketScaleSnapshot(res) {
    if (!res || !res.ok) return
    patchUser({
      marketScaleChoice: res.marketScaleChoice || null,
      marketScaleEffective: res.marketScaleEffective || null,
      marketScaleChosenAt: res.marketScaleChosenAt || null,
      marketScaleAnchor: res.marketScaleAnchor || null
    })
  },

  _setMarketScale(payload) {
    return callCloud('profile', Object.assign({ action: 'setMarketScale' }, payload || {}))
      .then((res) => {
        this._applyMarketScaleSnapshot(res)
        return res
      })
  },

  _enableMarketScaleBackGuard() {
    // 物理返回 / 右滑：尽量拦截；部分基础库与开发者工具无法真正挡住退出
    if (typeof wx.enableAlertBeforeUnload !== 'function') return
    try {
      wx.enableAlertBeforeUnload({
        message: '请先选择菜场规模'
      })
      this._marketScaleBackGuardOn = true
    } catch (e) {}
  },

  _disableMarketScaleBackGuard() {
    if (!this._marketScaleBackGuardOn) return
    this._marketScaleBackGuardOn = false
    if (typeof wx.disableAlertBeforeUnload !== 'function') return
    try {
      wx.disableAlertBeforeUnload()
    } catch (e) {}
  },

  _maybeShowMarketScaleSheet() {
    if (marketScaleSessionShown) {
      return Promise.resolve(false)
    }

    return this._getLocationGcJ02().then((fix) => {
      if (!fix) {
        const user = getUser() || {}
        if (!user.marketScaleChoice) {
          return this._setMarketScale({
            choice: 'default_medium',
            source: 'system_default'
          })
            .catch((err) => {
              console.warn('setMarketScale system_default failed', err)
            })
            .then(() => false)
        }
        return false
      }

      this._marketScaleFix = fix
      const user = getUser() || {}
      const decision = shouldShowMarketScaleSheet({
        hasFix: true,
        fix,
        anchor: user.marketScaleAnchor || null,
        chosenAt: user.marketScaleChosenAt || null,
        sessionShown: marketScaleSessionShown
      })

      if (!decision.show) {
        return false
      }

      marketScaleSessionShown = true
      const copy = MARKET_SCALE_COPY[decision.reason] || MARKET_SCALE_COPY.first
      track('market_scale_sheet_show', { reason: decision.reason || 'first' })
      this._enableMarketScaleBackGuard()
      const prior = (getUser() || {}).marketScaleChoice || null
      this.setData({
        showConfirm: false,
        showMarketScale: true,
        marketScaleTitle: copy.title,
        marketScaleHint: copy.hint,
        marketScaleHighlight: prior ? effectiveFromChoice(prior) : '',
        marketScaleDefaultOn: prior === 'default_medium',
        busy: false
      })
      return true
    })
  },

  onMarketScaleSelect(e) {
    if (this.data.busy || !this.data.showMarketScale) return
    const choice = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.choice
      : null
    if (!choice) return
    tapFeedback()
    const fix = this._marketScaleFix || null
    const payload = {
      choice,
      source: 'sheet'
    }
    if (fix) {
      payload.lat = fix.lat
      payload.lng = fix.lng
    }
    this.setData({
      busy: true,
      marketScaleHighlight: effectiveFromChoice(choice),
      marketScaleDefaultOn: choice === 'default_medium'
    })
    track('market_scale_sheet_select', { choice, source: 'sheet' })
    this._setMarketScale(payload)
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '保存失败，已按中档继续', icon: 'none' })
      })
      .then(() => {
        this._disableMarketScaleBackGuard()
        this.setData({ showMarketScale: false, busy: false })
        this.refreshMarketScaleDebugStatus(getUser())
        this._navigateConfirm()
      })
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
  },

  onResetPreferenceTest() {
    tapFeedback()
    wx.showModal({
      title: '重置偏好（测试）',
      content:
        '清空忌口/菜系表态、所在城市、菜式偏好，并删除全部家庭成员；不改家庭引导是否完成。重置后红点应为 4。确定？',
      confirmText: '重置',
      success: (res) => {
        if (!res.confirm) return
        callCloud('profile', { action: 'resetPreferenceTest' })
          .then(() => ensureLogin())
          .then((user) => {
            this.refreshProfileGapBadge(user)
            const n = this.data.profileGapCount
            wx.showToast({
              title: n ? `已重置 · 缺口 ${n}` : '已重置',
              icon: 'none'
            })
          })
          .catch((err) => {
            console.error(err)
            wx.showToast({ title: '重置失败，请部署 profile', icon: 'none' })
          })
      }
    })
  },

  refreshMarketScaleDebugStatus(user) {
    if (!this.data.showMarketScaleDebug && !isNonReleaseEnv()) return
    if (!this.data.showMarketScaleDebug) {
      this.setData({ showMarketScaleDebug: true })
    }
    const u = user || getUser() || {}
    const now = Date.now()
    const choice = u.marketScaleChoice
      ? labelForChoice(u.marketScaleChoice)
      : '无'
    const age = formatChosenAtAge(u.marketScaleChosenAt, now)
    const anchor = u.marketScaleAnchor
    const anchorText =
      anchor && typeof anchor.lat === 'number' && typeof anchor.lng === 'number'
        ? `${anchor.lat.toFixed(4)}, ${anchor.lng.toFixed(4)}`
        : '无'
    const session = marketScaleSessionShown ? '已弹过' : '未弹'
    const locSim = debugForceNoLocation ? '强制无定位' : '真实定位'
    const predict = predictMarketScaleShow(u, now)
    this.setData({
      debugForceNoLocationLabel: debugForceNoLocation
        ? '模拟无定位：开'
        : '模拟无定位：关',
      marketScaleDebugStatus: `档位 ${choice} · 选档 ${age}\n锚点 ${anchorText}\n本会话 ${session} · ${locSim}\n${predict}`
    })
  },

  onDebugToggleForceNoLocation() {
    if (!isNonReleaseEnv()) return
    tapFeedback()
    debugForceNoLocation = !debugForceNoLocation
    this.refreshMarketScaleDebugStatus(getUser())
    wx.showToast({
      title: debugForceNoLocation ? '已开：模拟无定位' : '已关：用真实定位',
      icon: 'none'
    })
  },

  onDebugMarketScaleClear() {
    if (!isNonReleaseEnv()) return
    tapFeedback()
    callCloud('profile', { action: 'debugMarketScale', mode: 'clear' })
      .then((res) => {
        this._applyMarketScaleSnapshot(res)
        marketScaleSessionShown = false
        this.refreshMarketScaleDebugStatus(getUser())
        wx.showToast({ title: '已清规模状态', icon: 'none' })
      })
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '失败，请部署 profile', icon: 'none' })
      })
  },

  onDebugMarketScaleReadyRelocate() {
    if (!isNonReleaseEnv()) return
    tapFeedback()
    wx.showLoading({ title: '取定位…', mask: true })
    this._getLocationGcJ02()
      .then((fix) => {
        if (!fix) {
          wx.hideLoading()
          wx.showToast({ title: '需要定位（请开模拟位置）', icon: 'none' })
          return null
        }
        const anchorLat = fix.lat - DEBUG_RELOCATE_OFFSET_LAT
        const anchorLng = fix.lng
        return callCloud('profile', {
          action: 'debugMarketScale',
          mode: 'readyRelocate',
          lat: fix.lat,
          lng: fix.lng,
          anchorLat,
          anchorLng
        }).then((res) => {
          wx.hideLoading()
          this._applyMarketScaleSnapshot(res)
          marketScaleSessionShown = false
          this.refreshMarketScaleDebugStatus(getUser())
          const meters = Math.round(RELOCATE_MIN_METERS * 1.2)
          wx.showToast({
            title: `可再弹 · 锚点约偏 ${meters}m`,
            icon: 'none'
          })
        })
      })
      .catch((err) => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '失败，请部署 profile', icon: 'none' })
      })
  },

  onDebugMarketScaleClearSession() {
    if (!isNonReleaseEnv()) return
    tapFeedback()
    marketScaleSessionShown = false
    this.refreshMarketScaleDebugStatus(getUser())
    wx.showToast({ title: '已清会话已弹', icon: 'none' })
  },

  goFeedback() {
    tapFeedback()
    track('feedback_entry_tap', { hasUnread: !!this.data.feedbackHasUnread })
    wx.navigateTo({ url: '/pages/feedback/list' })
  }
})
