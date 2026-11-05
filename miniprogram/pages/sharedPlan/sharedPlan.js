'use strict'

const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

function groupDishesByMeal(dishes) {
  const groups = []
  const indexByLabel = Object.create(null)
  ;(dishes || []).forEach((d) => {
    if (!d) return
    const name = d.name != null ? String(d.name) : ''
    if (!name) return
    const mealLabel = d.mealLabel != null ? String(d.mealLabel) : ''
    if (indexByLabel[mealLabel] == null) {
      indexByLabel[mealLabel] = groups.length
      groups.push({ mealLabel, dishes: [] })
    }
    groups[indexByLabel[mealLabel]].dishes.push({ name })
  })
  return groups
}

function pairRows(items) {
  const list = Array.isArray(items) ? items : []
  const rows = []
  for (let i = 0; i < list.length; i += 2) {
    const cells = list.slice(i, i + 2)
    const rowKey =
      cells.map((c) => (c && c.name != null ? String(c.name) : '')).join('|') ||
      'r' + i
    rows.push({ rowKey, cells })
  }
  return rows
}

function groupIngredientsByCategory(ingredients) {
  const groups = []
  const indexByCat = Object.create(null)
  ;(ingredients || []).forEach((ing) => {
    if (!ing) return
    const name = ing.name != null ? String(ing.name) : ''
    if (!name) return
    const category =
      ing.category != null && String(ing.category).trim()
        ? String(ing.category).trim()
        : '其他'
    if (indexByCat[category] == null) {
      indexByCat[category] = groups.length
      groups.push({ category, items: [] })
    }
    groups[indexByCat[category]].items.push({
      name,
      displayName:
        ing.displayName != null && String(ing.displayName).trim()
          ? String(ing.displayName).trim()
          : name
    })
  })
  return groups.map((g) => ({
    category: g.category,
    rows: pairRows(g.items)
  }))
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    loading: true,
    invalid: false,
    saved: false,
    saving: false,
    titleText: '来自好友的方案',
    mealGroups: [],
    ingredientGroups: [],
    shareId: ''
  },

  onLoad(query) {
    const raw = query && query.shareId != null ? String(query.shareId) : ''
    let shareId = raw
    try {
      shareId = decodeURIComponent(raw)
    } catch (e) {
      shareId = raw
    }
    shareId = String(shareId || '').trim()
    this._shareId = shareId

    if (!shareId) {
      this.setData({ loading: false, invalid: true })
      return
    }

    track('plan_share_open', { shareId })
    this._loadShare(shareId)
  },

  _loadShare(shareId) {
    this.setData({ loading: true, invalid: false })
    callCloud('share', { action: 'get', shareId })
      .then((res) => {
        const share = (res && res.share) || {}
        const nick =
          share.sharerNickname != null
            ? String(share.sharerNickname).trim()
            : ''
        this.setData({
          loading: false,
          invalid: false,
          saved: !!(res && res.saved),
          shareId,
          titleText: nick ? '来自' + nick + '的方案' : '来自好友的方案',
          mealGroups: groupDishesByMeal(share.dishes),
          ingredientGroups: groupIngredientsByCategory(share.ingredients)
        })
      })
      .catch(() => {
        this.setData({ loading: false, invalid: true })
      })
  },

  onSave() {
    if (this.data.saved || this.data.saving || this.data.invalid) return
    const shareId = this._shareId
    if (!shareId) return

    tapFeedback('medium')
    this.setData({ saving: true })
    ensureLogin()
      .then(() => callCloud('share', { action: 'save', shareId }))
      .then(() => {
        track('plan_share_save', { shareId })
        this.setData({ saved: true, saving: false })
        wx.showToast({ title: '已保存', icon: 'success', duration: 1500 })
      })
      .catch(() => {
        this.setData({ saving: false })
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
  }
})
