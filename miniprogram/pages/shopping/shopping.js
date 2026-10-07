const { buildShoppingList } = require('../../utils/shoppingList.js')

const RECOMMEND_KEY = 'cookthis_last_recommend'
const SELECTED_KEY = 'cookthis_last_selected'
const CHECKS_KEY = 'cookthis_shopping_checks'

function readJson(key) {
  try {
    return wx.getStorageSync(key) || null
  } catch (e) {
    return null
  }
}

function writeJson(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {}
}

function selectedNamesFromStorage() {
  const snap = readJson(SELECTED_KEY)
  const selected = (snap && snap.selected) || []
  return selected.map((x) => x && x.name).filter(Boolean)
}

function checkKey(requestId, planIndex) {
  return `${requestId || 'none'}:${planIndex}`
}

Page({
  data: {
    items: [],
    accepted: false,
    emptyText: '暂无清单',
    empty: true
  },

  _requestId: '',
  _planIndex: 0,

  onLoad(query) {
    const accepted = String(query.accepted || '') === 'true'
    const planIndex = Number(query.planIndex)
    const idx = Number.isFinite(planIndex) ? planIndex : 0
    const recommend = readJson(RECOMMEND_KEY) || {}
    const plans = Array.isArray(recommend.plans) ? recommend.plans : []
    const plan = plans[idx] || plans[0] || null
    const selectedNames = selectedNamesFromStorage()
    const built = plan ? buildShoppingList({ plan, selectedNames }) : []
    const checksMap = readJson(CHECKS_KEY) || {}
    const key = checkKey(recommend.requestId, idx)
    const checkedNames = new Set(checksMap[key] || [])

    const items = built.map((it) => ({
      name: it.name,
      kind: it.kind,
      alreadyHave: !!it.alreadyHave,
      bought: checkedNames.has(it.name),
      tag: it.alreadyHave ? '已有' : it.kind === 'seasoning' ? '调味' : '主料'
    }))

    this._requestId = recommend.requestId || ''
    this._planIndex = idx
    this.setData({
      items,
      accepted,
      empty: items.length === 0,
      emptyText: items.length === 0 ? '暂无清单，可返回推荐页' : ''
    })
  },

  onToggle(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const items = this.data.items.map((it) => {
      if (it.name !== name) return it
      return Object.assign({}, it, { bought: !it.bought })
    })
    this.setData({ items })
    this._persistChecks(items)
  },

  _persistChecks(items) {
    const checksMap = readJson(CHECKS_KEY) || {}
    const key = checkKey(this._requestId, this._planIndex)
    checksMap[key] = items.filter((it) => it.bought).map((it) => it.name)
    writeJson(CHECKS_KEY, checksMap)
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
