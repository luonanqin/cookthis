const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const { formatSceneSummary } = require('../../utils/sceneSummary.js')

const TIP_SEEN_KEY = 'cookthis_plan_ate_tip_seen'
const HINT = '点选标记已吃，再点取消'

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object') {
    if (typeof value.$date === 'number') return new Date(value.$date)
    if (typeof value.valueOf === 'function') {
      const n = Number(value.valueOf())
      if (Number.isFinite(n)) return new Date(n)
    }
  }
  return null
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

function formatTimeText(value) {
  const d = toDate(value)
  if (!d) return ''
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes())
  )
}

function mapItem(raw) {
  const dishes = (raw && raw.dishes) || []
  return {
    requestId: raw.requestId,
    recommendationId: raw.recommendationId,
    acceptedAt: raw.acceptedAt,
    timeText: formatTimeText(raw.acceptedAt),
    sceneSummary: formatSceneSummary(raw.scene, { omitSlots: true }),
    dishes: dishes.map((d) => ({
      name: d.name,
      recipeId: d.recipeId,
      meatVeg: d.meatVeg,
      ate: !!d.ate
    }))
  }
}

function dishKey(requestId, name) {
  return String(requestId || '') + '::' + String(name || '')
}

/** Off noop (confirm/manual ate, no plan_ate row) must not stay unchecked. */
function planAteOffUiDecision(result) {
  if (result && result.noop) {
    return { restoreAte: true, toast: '请到已吃记录删除' }
  }
  return { restoreAte: false, toast: null }
}

function readTipSeen() {
  try {
    return wx.getStorageSync(TIP_SEEN_KEY)
  } catch (e) {
    return ''
  }
}

function writeTipSeen() {
  try {
    wx.setStorageSync(TIP_SEEN_KEY, 1)
  } catch (e) {}
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    items: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    hint: HINT,
    showTip: false,
    tipStep: 1,
    tipText: '可点击记录已吃',
    tipSpot: null,
    tipBubbleTop: 120,
    tipBubbleLeft: 28
  },

  _loadGen: 0,
  /** 进行中的云同步：key → true */
  _syncing: {},
  /** 用户最终期望的 ate：key → boolean */
  _desiredAte: {},

  onShow() {
    this.applyTypeScale()
    this.setData({
      showTip: !readTipSeen(),
      tipStep: 1,
      tipText: '可点击记录已吃',
      tipSpot: null
    })
    this.loadFirst()
  },

  onReachBottom() {
    this.loadMore()
  },

  noop() {},

  finishTip() {
    writeTipSeen()
    this.setData({ showTip: false, tipSpot: null, tipStep: 1 })
  },

  /** 测量首卡第一道菜；小 tip 贴在菜右上角 */
  measureTipSpot() {
    if (!this.data.showTip) return
    const first = (this.data.items || [])[0]
    const dish = first && first.dishes && first.dishes[0]
    if (!first || !dish) {
      this.setData({ tipSpot: null })
      return
    }
    wx.createSelectorQuery()
      .in(this)
      .select('#tipSpotChip')
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) {
          this.setData({ tipSpot: null })
          return
        }
        // 小 tip 贴在首菜右上角外侧（约 108×28）
        const bubbleW = 108
        const bubbleH = 28
        const left = Math.max(8, Math.min(
          rect.left + rect.width - 36,
          (typeof wx.getWindowInfo === 'function'
            ? wx.getWindowInfo().windowWidth
            : wx.getSystemInfoSync().windowWidth) - bubbleW - 8
        ))
        const top = Math.max(4, rect.top - bubbleH - 2)
        this.setData({
          tipSpot: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            requestId: first.requestId,
            recommendationId: first.recommendationId,
            name: dish.name,
            ate: !!dish.ate
          },
          tipBubbleTop: top,
          tipBubbleLeft: left
        })
      })
      .exec()
  },

  loadFirst() {
    this._loadGen += 1
    const gen = this._loadGen
    this.setData({ loading: true, loadingMore: false, nextCursor: null, tipSpot: null })
    callCloud('recommend', { action: 'listAccepted' })
      .then((result) => {
        if (gen !== this._loadGen) return
        const items = ((result && result.items) || []).map(mapItem)
        const nextCursor = (result && result.nextCursor) || null
        this.setData({ items, nextCursor, loading: false }, () => {
          if (this.data.showTip) {
            setTimeout(() => this.measureTipSpot(), 50)
          }
        })
        track('accepted_plans_list', { page: 1, count: items.length })
      })
      .catch((err) => {
        if (gen !== this._loadGen) return
        this.setData({ loading: false })
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  loadMore() {
    const cursor = this.data.nextCursor
    if (!cursor || this.data.loading || this.data.loadingMore) return
    const gen = this._loadGen
    this.setData({ loadingMore: true })
    callCloud('recommend', { action: 'listAccepted', cursor })
      .then((result) => {
        if (gen !== this._loadGen) {
          this.setData({ loadingMore: false })
          return
        }
        const more = ((result && result.items) || []).map(mapItem)
        const nextCursor = (result && result.nextCursor) || null
        this.setData({
          items: this.data.items.concat(more),
          nextCursor,
          loadingMore: false
        })
        track('accepted_plans_list', {
          page: 'more',
          count: more.length
        })
      })
      .catch((err) => {
        if (gen !== this._loadGen) {
          this.setData({ loadingMore: false })
          return
        }
        this.setData({ loadingMore: false })
        wx.showToast({
          title: (err && err.error) || '加载失败',
          icon: 'none'
        })
      })
  },

  onToggleDish(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const requestId = ds.requestId
    const recommendationId = ds.recommendationId
    const name = ds.name
    if (!requestId || !name) return

    const loc = this.findDish(requestId, name)
    if (!loc) return

    // tips 期间只允许首卡第一道菜；蒙层外点不动
    if (this.data.showTip) {
      if (loc.itemIndex !== 0 || loc.dishIndex !== 0) return
    }

    const ate = !!loc.dish.ate
    const tipStep = this.data.showTip ? this.data.tipStep : 0
    // 引导第 1 步期望「记上」；第 2 步期望「取消」
    if (tipStep === 1 && ate) return
    if (tipStep === 2 && !ate) return

    const nextAte = !ate
    const key = dishKey(requestId, name)

    tapFeedback()
    this.setDishAte(loc.itemIndex, loc.dishIndex, nextAte)
    if (this.data.showTip && this.data.tipSpot) {
      this.setData({
        tipSpot: Object.assign({}, this.data.tipSpot, { ate: nextAte })
      })
    }
    this._desiredAte[key] = nextAte

    // 已有同步在飞：只更新期望态，等当前请求结束后补一次
    if (this._syncing[key]) return
    this.syncDishAte(key, requestId, recommendationId, name, tipStep)
  },

  /**
   * 按 _desiredAte 同步到云端；请求返回后若期望又变了则继续补同步。
   * tipStep 取自触发本次同步链的那次点击（引导只在成功落到对应步时推进）。
   */
  syncDishAte(key, requestId, recommendationId, name, tipStep) {
    const desired = this._desiredAte[key]
    if (typeof desired !== 'boolean') {
      delete this._syncing[key]
      return
    }

    this._syncing[key] = true
    const action = desired ? 'planAteOn' : 'planAteOff'
    callCloud('meals', {
      action,
      requestId,
      recommendationId,
      dishName: name
    })
      .then((result) => {
        if (!desired) {
          const ui = planAteOffUiDecision(result)
          if (ui.restoreAte) {
            delete this._desiredAte[key]
            const again = this.findDish(requestId, name)
            if (again) this.setDishAte(again.itemIndex, again.dishIndex, true)
            if (this.data.showTip && this.data.tipSpot) {
              this.setData({
                tipSpot: Object.assign({}, this.data.tipSpot, { ate: true })
              })
            }
            wx.showToast({ title: ui.toast, icon: 'none' })
            return
          }
        }
        track('plan_ate_toggle', {
          onOff: desired ? 'on' : 'off',
          requestId,
          dishName: name
        })
        // 仅当最终仍是这次引导意图时推进 tips
        if (this._desiredAte[key] === desired) {
          if (tipStep === 1 && desired) {
            this.setData({
              tipStep: 2,
              tipText: '再点击取消记录'
            })
            setTimeout(() => this.measureTipSpot(), 40)
          } else if (tipStep === 2 && !desired) {
            this.finishTip()
          }
        }
      })
      .catch((err) => {
        // 失败：若用户没再点，回滚到请求前；若已改期望，留给后续补同步
        if (this._desiredAte[key] === desired) {
          delete this._desiredAte[key]
          const again = this.findDish(requestId, name)
          if (again) this.setDishAte(again.itemIndex, again.dishIndex, !desired)
          if (this.data.showTip && this.data.tipSpot) {
            this.setData({
              tipSpot: Object.assign({}, this.data.tipSpot, { ate: !desired })
            })
          }
          wx.showToast({
            title: (err && err.error) || '操作失败',
            icon: 'none'
          })
        }
      })
      .then(() => {
        if (this._desiredAte[key] !== desired && typeof this._desiredAte[key] === 'boolean') {
          this.syncDishAte(key, requestId, recommendationId, name, 0)
          return
        }
        delete this._desiredAte[key]
        delete this._syncing[key]
      })
  },

  findDish(requestId, name) {
    const items = this.data.items || []
    for (let i = 0; i < items.length; i++) {
      const dishes = items[i].dishes || []
      for (let j = 0; j < dishes.length; j++) {
        if (items[i].requestId === requestId && dishes[j].name === name) {
          return { itemIndex: i, dishIndex: j, dish: dishes[j] }
        }
      }
    }
    return null
  },

  setDishAte(itemIndex, dishIndex, ate) {
    const items = this.data.items.slice()
    const cur = items[itemIndex]
    if (!cur || !cur.dishes || !cur.dishes[dishIndex]) return
    const item = Object.assign({}, cur)
    const dishes = item.dishes.slice()
    dishes[dishIndex] = Object.assign({}, dishes[dishIndex], { ate: !!ate })
    item.dishes = dishes
    items[itemIndex] = item
    this.setData({ items })
  }
})
