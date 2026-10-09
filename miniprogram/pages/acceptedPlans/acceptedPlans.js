const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
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
    sceneSummary: formatSceneSummary(raw.scene),
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
  data: {
    items: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    hint: HINT,
    showTip: false
  },

  _loadGen: 0,
  _pending: {},

  onShow() {
    this.setData({
      showTip: !readTipSeen()
    })
    this.loadFirst()
  },

  onReachBottom() {
    this.loadMore()
  },

  onDismissTip() {
    writeTipSeen()
    this.setData({ showTip: false })
  },

  loadFirst() {
    this._loadGen += 1
    const gen = this._loadGen
    this.setData({ loading: true, nextCursor: null })
    callCloud('recommend', { action: 'listAccepted' })
      .then((result) => {
        if (gen !== this._loadGen) return
        const items = ((result && result.items) || []).map(mapItem)
        const nextCursor = (result && result.nextCursor) || null
        this.setData({ items, nextCursor, loading: false })
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
        if (gen !== this._loadGen) return
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
        if (gen !== this._loadGen) return
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
    const ate = !!loc.dish.ate
    const key = dishKey(requestId, name)
    if (this._pending[key]) return

    tapFeedback()
    this._pending[key] = true
    this.setDishAte(loc.itemIndex, loc.dishIndex, !ate)

    const action = ate ? 'planAteOff' : 'planAteOn'
    callCloud('meals', {
      action,
      requestId,
      recommendationId,
      dishName: name
    })
      .then(() => {
        track('plan_ate_toggle', {
          onOff: ate ? 'off' : 'on',
          requestId,
          dishName: name
        })
      })
      .catch((err) => {
        const again = this.findDish(requestId, name)
        if (again) this.setDishAte(again.itemIndex, again.dishIndex, ate)
        wx.showToast({
          title: (err && err.error) || '操作失败',
          icon: 'none'
        })
      })
      .then(() => {
        delete this._pending[key]
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
