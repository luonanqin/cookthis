const { callCloud } = require('../../services/cloud.js')

const STORAGE_KEY = 'cookthis_last_selected'

const CATEGORY_LABELS = {
  leaf: '叶菜',
  root: '根茎',
  fruit_veg: '茄果',
  bean: '豆类',
  mushroom: '菌菇',
  meat: '肉类',
  seafood: '水产',
  egg_dairy: '蛋奶',
  tofu: '豆制品',
  other: '其他'
}

function defaultYearRoundChecked(items, familyAvoids) {
  const avoids = new Set(familyAvoids || [])
  const checked = {}
  items.forEach(it => {
    const tags = it.avoidTags || []
    const hit = tags.some(t => avoids.has(t))
    checked[it.id] = !hit
  })
  return checked
}

function groupByCategory(items) {
  const map = new Map()
  ;(items || []).forEach(it => {
    const c = it.category || 'other'
    if (!map.has(c)) map.set(c, [])
    map.get(c).push(it)
  })
  return Array.from(map.entries()).map(([category, list]) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
    list
  }))
}

function countTrue(map) {
  return Object.keys(map || {}).filter(k => map[k]).length
}

Page({
  data: {
    loading: true,
    error: '',
    seasonal: [],
    yearRound: [],
    seasonalGroups: [],
    seasonalChecked: {},
    yearRoundChecked: {},
    yearRoundExpanded: false,
    manuals: [],
    manualInput: '',
    count: 0,
    yearRoundCount: 0
  },

  onLoad() {
    this.loadList()
  },

  loadList() {
    this.setData({ loading: true, error: '' })
    callCloud('ingredients', {})
      .then(res => {
        const seasonal = res.seasonal || []
        const yearRound = res.yearRound || []
        const seasonalChecked = {}
        seasonal.forEach(it => {
          seasonalChecked[it.id] = true
        })
        const yearRoundChecked = defaultYearRoundChecked(yearRound, [])
        const manuals = []
        this.setData({
          loading: false,
          seasonal,
          yearRound,
          seasonalGroups: groupByCategory(seasonal),
          seasonalChecked,
          yearRoundChecked,
          manuals,
          ...this._counts(seasonalChecked, yearRoundChecked, manuals)
        })
      })
      .catch(err => {
        console.error(err)
        this.setData({ loading: false, error: '加载失败' })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  _counts(seasonalChecked, yearRoundChecked, manuals) {
    const sc = countTrue(seasonalChecked)
    const yc = countTrue(yearRoundChecked)
    const mc = (manuals || []).length
    return {
      count: sc + yc + mc,
      yearRoundCount: yc
    }
  },

  toggleSeasonal(e) {
    const id = e.currentTarget.dataset.id
    const seasonalChecked = Object.assign({}, this.data.seasonalChecked)
    seasonalChecked[id] = !seasonalChecked[id]
    this.setData({
      seasonalChecked,
      ...this._counts(seasonalChecked, this.data.yearRoundChecked, this.data.manuals)
    })
  },

  selectAllSeasonal() {
    const seasonalChecked = {}
    this.data.seasonal.forEach(it => {
      seasonalChecked[it.id] = true
    })
    this.setData({
      seasonalChecked,
      ...this._counts(seasonalChecked, this.data.yearRoundChecked, this.data.manuals)
    })
  },

  clearSeasonal() {
    const seasonalChecked = {}
    this.data.seasonal.forEach(it => {
      seasonalChecked[it.id] = false
    })
    this.setData({
      seasonalChecked,
      ...this._counts(seasonalChecked, this.data.yearRoundChecked, this.data.manuals)
    })
  },

  toggleYearRoundSection() {
    this.setData({ yearRoundExpanded: !this.data.yearRoundExpanded })
  },

  toggleYearRound(e) {
    const id = e.currentTarget.dataset.id
    const yearRoundChecked = Object.assign({}, this.data.yearRoundChecked)
    yearRoundChecked[id] = !yearRoundChecked[id]
    this.setData({
      yearRoundChecked,
      ...this._counts(this.data.seasonalChecked, yearRoundChecked, this.data.manuals)
    })
  },

  onManualInput(e) {
    this.setData({ manualInput: e.detail.value })
  },

  addManual() {
    const name = (this.data.manualInput || '').trim()
    if (!name) return
    const item = {
      id: 'custom_' + Date.now(),
      name,
      source: 'manual'
    }
    const manuals = this.data.manuals.concat(item)
    this.setData({
      manuals,
      manualInput: '',
      ...this._counts(this.data.seasonalChecked, this.data.yearRoundChecked, manuals)
    })
  },

  removeManual(e) {
    const id = e.currentTarget.dataset.id
    const manuals = this.data.manuals.filter(m => m.id !== id)
    this.setData({
      manuals,
      ...this._counts(this.data.seasonalChecked, this.data.yearRoundChecked, manuals)
    })
  },

  buildSelected() {
    const selected = []
    const { seasonal, yearRound, seasonalChecked, yearRoundChecked, manuals } = this.data
    seasonal.forEach(it => {
      if (seasonalChecked[it.id]) {
        selected.push({
          id: it.id,
          name: it.name,
          category: it.category,
          source: 'seasonal'
        })
      }
    })
    yearRound.forEach(it => {
      if (yearRoundChecked[it.id]) {
        selected.push({
          id: it.id,
          name: it.name,
          category: it.category,
          source: 'year_round'
        })
      }
    })
    manuals.forEach(it => {
      selected.push({
        id: it.id,
        name: it.name,
        source: 'manual'
      })
    })
    return selected
  },

  onConfirm() {
    const selected = this.buildSelected()
    const methodsUsed = ['default_list']
    if (this.data.manuals.length) methodsUsed.push('manual')
    wx.setStorageSync(STORAGE_KEY, { selected, methodsUsed })
    const content = '已选 ' + selected.length + ' 样，推荐下一版接'
    wx.showModal({
      title: '已确认',
      content,
      showCancel: false,
      success: () => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        }
      }
    })
  }
})
