const {
  buildShoppingList,
  flattenShoppingList
} = require('../../utils/shoppingList.js')
const { buildRecipeSheet } = require('../../utils/recipeSheet.js')
const {
  shoppingCheckKey,
  checkedNamesFromMap
} = require('../../utils/shoppingChecks.js')
const {
  loadAliases,
  buildAliasIndex,
  normalizeCityKey,
  applyShoppingDisplay
} = require('../../utils/aliasMatch.js')
const { shoppingAdSlots } = require('../../utils/ads.js')
const { track } = require('../../utils/track.js')
const { callCloud } = require('../../services/cloud.js')
const { getUser } = require('../../services/session.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

const RECOMMEND_KEY = 'cookthis_last_recommend'
const SELECTED_KEY = 'cookthis_last_selected'
const CHECKS_KEY = 'cookthis_shopping_checks'

let _aliasIndex = null
function getAliasIndex() {
  if (_aliasIndex) return _aliasIndex
  const raw = require('../../data/aliases.json')
  _aliasIndex = buildAliasIndex(loadAliases(raw))
  return _aliasIndex
}

function loadShelfOrder(city) {
  const key = normalizeCityKey(city)
  if (!key) return []
  try {
    const shelves = {
      北京: () => require('../../data/city-shelves/北京.json'),
      天津: () => require('../../data/city-shelves/天津.json'),
      广州: () => require('../../data/city-shelves/广州.json'),
      成都: () => require('../../data/city-shelves/成都.json'),
      拉萨: () => require('../../data/city-shelves/拉萨.json'),
      武汉: () => require('../../data/city-shelves/武汉.json'),
      西宁: () => require('../../data/city-shelves/西宁.json'),
      西安: () => require('../../data/city-shelves/西安.json'),
      重庆: () => require('../../data/city-shelves/重庆.json'),
      银川: () => require('../../data/city-shelves/银川.json')
    }
    const loader = shelves[key]
    return loader ? loader() : []
  } catch (e) {
    return []
  }
}

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

function categoryByNameFromStorage() {
  const snap = readJson(SELECTED_KEY)
  const selected = (snap && snap.selected) || []
  const map = {}
  selected.forEach((x) => {
    if (x && x.name) map[x.name] = x.category || 'other'
  })
  return map
}

function planHasIngredients(plan) {
  const meals = (plan && plan.meals) || []
  for (let i = 0; i < meals.length; i++) {
    const dishes = meals[i].dishes || []
    for (let j = 0; j < dishes.length; j++) {
      const d = dishes[j]
      if ((d.mainIngredients && d.mainIngredients.length) || (d.seasonings && d.seasonings.length)) {
        return true
      }
    }
  }
  return false
}

function pickPlan(plans, idx) {
  const list = Array.isArray(plans) ? plans : []
  return list[idx] || list[0] || null
}

function withBought(groups, checkedNames) {
  return (groups || []).map((g) => {
    const items = (g.items || []).map((it) =>
      Object.assign({}, it, { bought: !!checkedNames[it.name] })
    )
    const rows = []
    for (let i = 0; i < items.length; i += 2) {
      rows.push(items.slice(i, i + 2))
    }
    return Object.assign({}, g, { items, rows })
  })
}

function decorateRecipeSheet(sheet) {
  const dishes = []
  ;((sheet && sheet.meals) || []).forEach((meal) => {
    ;(meal.dishes || []).forEach((dish) => {
      dishes.push({
        recipeId: dish.recipeId,
        name: dish.name,
        ingredientText: (dish.ingredients || []).map((x) => x.name).join('、')
      })
    })
  })
  return dishes
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    groups: [],
    accepted: false,
    emptyText: '暂无清单',
    empty: true,
    loading: true,
    adSlots: [],
    recipeDishes: [],
    showRecipeSheet: false,
    recipeScrollTop: 0
  },

  _requestId: '',
  _planIndex: 0,
  _swapCount: 0,
  _recipeScrollTop: 0,
  _recipeSheetOpenedAt: 0,
  _recipeSheetScrolled: false,

  onLoad(query) {
    const accepted = String(query.accepted || '') === 'true'
    const planIndex = Number(query.planIndex)
    const idx = Number.isFinite(planIndex) ? planIndex : 0
    this._planIndex = idx
    this.setData({ accepted, loading: true })

    const recommend = readJson(RECOMMEND_KEY) || {}
    this._requestId = recommend.requestId || ''
    this._swapCount = Number(recommend.swapCount) || 0
    const selectedSnap = readJson(SELECTED_KEY) || {}
    const mealType =
      (recommend.scene && recommend.scene.mealType) ||
      (selectedSnap.scene && selectedSnap.scene.mealType) ||
      'daily'
    const categoryByName = categoryByNameFromStorage()
    let plan = pickPlan(recommend.plans, idx)

    const finish = (finalPlan, sourceMealType) => {
      const built = finalPlan
        ? buildShoppingList({ plan: finalPlan, categoryByName })
        : { groups: [] }
      const user = getUser() || {}
      const index = getAliasIndex()
      const shelfOrder = loadShelfOrder(user.city)
      const labeled = applyShoppingDisplay(built.groups || [], {
        city: user.city,
        shelfOrder,
        index
      })
      const flatNames = flattenShoppingList({ groups: labeled }).map((x) => x.name)
      const checksMap = readJson(CHECKS_KEY) || {}
      const key = shoppingCheckKey(this._requestId, idx, this._swapCount)
      const restored = checkedNamesFromMap(checksMap, key, flatNames)
      const checkedNames = {}
      restored.forEach((n) => {
        checkedNames[n] = true
      })

      const groups = withBought(labeled, checkedNames)
      const flat = flattenShoppingList({ groups })
      const recipeDishes = finalPlan
        ? decorateRecipeSheet(buildRecipeSheet({ plan: finalPlan, categoryByName }))
        : []

      track('shopping_list_open', { accepted })
      this.setData({
        groups,
        recipeDishes,
        accepted,
        loading: false,
        empty: flat.length === 0,
        emptyText: flat.length === 0
          ? '暂无清单食材。请确认云函数 recommend 已重新部署，并返回推荐页重试「去买菜」。'
          : '',
        adSlots: shoppingAdSlots(sourceMealType || mealType)
      })
    }

    if (plan && planHasIngredients(plan)) {
      finish(plan, mealType)
      return
    }

    if (!this._requestId) {
      finish(plan, mealType)
      return
    }

    callCloud('recommend', { action: 'get', requestId: this._requestId })
      .then((res) => {
        const plans = (res && res.plans) || []
        const cloudPlan = pickPlan(plans, idx)
        if (cloudPlan) {
          const snap = Object.assign({}, recommend, {
            plans,
            scene: (res && res.scene) || recommend.scene
          })
          writeJson(RECOMMEND_KEY, snap)
          plan = cloudPlan
        }
        finish(plan, (res && res.scene && res.scene.mealType) || mealType)
      })
      .catch((err) => {
        console.error(err)
        finish(plan, mealType)
      })
  },

  onToggle(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    tapFeedback()
    const groups = this.data.groups.map((g) => {
      const items = (g.items || []).map((it) => {
        if (it.name !== name) return it
        const bought = !it.bought
        track('shopping_list_item_check', { name, checked: bought })
        return Object.assign({}, it, { bought })
      })
      const rows = []
      for (let i = 0; i < items.length; i += 2) {
        rows.push(items.slice(i, i + 2))
      }
      return Object.assign({}, g, { items, rows })
    })
    this.setData({ groups })
    this._persistChecks(groups)
  },

  _persistChecks(groups) {
    const checksMap = readJson(CHECKS_KEY) || {}
    const key = shoppingCheckKey(this._requestId, this._planIndex, this._swapCount)
    const names = []
    ;(groups || []).forEach((g) => {
      ;(g.items || []).forEach((it) => {
        if (it.bought) names.push(it.name)
      })
    })
    checksMap[key] = names
    writeJson(CHECKS_KEY, checksMap)
  },

  noop() {},

  onUnload() {
    this._recipeScrollTop = 0
    this._recipeSheetScrolled = false
    this._recipeSheetOpenedAt = 0
  },

  onRecipeSheetOpen() {
    if (!(this.data.recipeDishes || []).length) {
      wx.showToast({ title: '暂无菜谱', icon: 'none' })
      return
    }
    tapFeedback()
    this._recipeSheetOpenedAt = Date.now()
    this._recipeSheetScrolled = false
    track('shopping_recipe_sheet_open', { planIndex: this._planIndex })
    // 先置一个略不同的值，确保 scroll-view 能吃到恢复的 scrollTop
    const top = this._recipeScrollTop || 0
    this.setData({ showRecipeSheet: true, recipeScrollTop: top === 0 ? 0.01 : top - 0.01 })
    setTimeout(() => {
      this.setData({ recipeScrollTop: top })
    }, 30)
  },

  onRecipeSheetClose() {
    if (!this.data.showRecipeSheet) return
    tapFeedback()
    const dwellMs = this._recipeSheetOpenedAt
      ? Date.now() - this._recipeSheetOpenedAt
      : 0
    track('shopping_recipe_sheet_close', {
      planIndex: this._planIndex,
      dwellMs,
      scrolled: !!this._recipeSheetScrolled
    })
    this._recipeSheetOpenedAt = 0
    this.setData({ showRecipeSheet: false })
  },

  onRecipeSheetScroll(e) {
    const top = (e.detail && e.detail.scrollTop) || 0
    this._recipeScrollTop = top
    if (top > 8) this._recipeSheetScrolled = true
  },

  onBack() {
    tapFeedback()
    let checkedCount = 0
    ;(this.data.groups || []).forEach((g) => {
      ;(g.items || []).forEach((it) => {
        if (it.bought) checkedCount++
      })
    })
    track('shopping_list_done', { checkedCount })
    wx.navigateBack({ delta: 1 })
  }
})
