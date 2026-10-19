const { callCloud } = require('../../services/cloud.js')
const { getUser, ensureLogin, patchUser } = require('../../services/session.js')
const { suggestPartyCombo } = require('../../utils/suggestCombo.js')
const { filterHolidays } = require('../../utils/filterHolidays.js')
const { track } = require('../../utils/track.js')
const { PEOPLE_RANGE, COMBO_RANGE, indexOfValue } = require('../../utils/formRanges.js')
const { shouldShowProfileLite } = require('../../utils/profileLite.js')
const { tapFeedback } = require('../../utils/haptic.js')
const {
  computeHouseholdCounts,
  normalizeTierCounts
} = require('../../utils/members.js')
const {
  buildDailySlotsFromCounts,
  formatCustomChipLabel,
  clampMealCount,
  canIncrement
} = require('../../utils/dailyMealSlots.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const holidaysPack = require('../../data/holidays.js')

const STORAGE_KEY = 'cookthis_last_selected'
const RECOMMEND_KEY = 'cookthis_last_recommend'

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

const MEAL_TYPE_OPTIONS = [
  { id: 'daily', label: '日常' },
  { id: 'friends_party', label: '聚会' }
]

/** 大/小/老每档可选人数（与搭配 picker 同交互） */
const TIER_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Short list: vocab codes matching ingredients.avoidTags / 忌口词表
const PARTY_AVOID_OPTIONS = [
  { id: 'pork', label: '猪肉类' },
  { id: 'seafood', label: '海鲜' },
  { id: 'coriander', label: '香菜' },
  { id: 'offal', label: '内脏' }
]

const DAILY_SLOT_PRESETS = [
  {
    id: 'one_dinner',
    label: '一顿晚饭',
    slots: [{ meal: 'dinner', label: '晚饭①' }]
  },
  {
    id: 'one_lunch',
    label: '一顿午饭',
    slots: [{ meal: 'lunch', label: '午饭①' }]
  },
  {
    id: 'lunch_dinner',
    label: '1午+1晚',
    slots: [
      { meal: 'lunch', label: '午饭①' },
      { meal: 'dinner', label: '晚饭①' }
    ]
  }
]

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

function cloneCombo(combo) {
  if (!combo) return null
  return {
    meat: Number(combo.meat) || 0,
    veg: Number(combo.veg) || 0,
    soup: Number(combo.soup) || 0
  }
}

function isComboPresent(combo) {
  if (!combo) return false
  return (Number(combo.meat) || 0) + (Number(combo.veg) || 0) + (Number(combo.soup) || 0) > 0
}

function buildPartySlots(n) {
  const count = Math.max(1, Math.min(7, Number(n) || 1))
  const slots = []
  for (let i = 0; i < count; i++) {
    slots.push({
      meal: 'other',
      label: count === 1 ? '本场' : '第' + (i + 1) + '顿'
    })
  }
  return slots
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return y + '-' + m + '-' + day
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    loading: true,
    error: '',
    submitting: false,
    seasonal: [],
    yearRound: [],
    seasonalGroups: [],
    yearRoundGroups: [],
    seasonalChecked: {},
    seasonalSelectAllLabel: '全选',
    yearRoundChecked: {},
    yearRoundExpanded: false,
    manuals: [],
    manualInput: '',
    count: 0,
    yearRoundCount: 0,

    mealTypeOptions: MEAL_TYPE_OPTIONS,
    mealType: 'daily',
    isDaily: true,
    isHoliday: false,
    peopleRange: PEOPLE_RANGE,
    comboRange: COMBO_RANGE,
    peopleCount: 0,
    peopleCountLabel: '选择人数',
    peopleIndex: 0,
    householdCounts: { adult: 0, child: 0, elder: 0 },
    guestCounts: { adult: 0, child: 0, elder: 0 },
    omitCounts: { adult: 0, child: 0, elder: 0 },
    partyCounts: { adult: 0, child: 0, elder: 0 },
    tierRange: TIER_RANGE,
    tierDisplay: { adult: 0, child: 0, elder: 0 },
    adultIndex: 0,
    childIndex: 0,
    elderIndex: 0,
    householdLabel: '共0人 · 0大 0小 0老',
    members: [],
    meatIndex: 0,
    vegIndex: 0,
    soupIndex: 0,
    combo: { meat: 0, veg: 0, soup: 0 },
    partyComboSeed: '',
    listEmpty: false,
    dailySlotPresets: DAILY_SLOT_PRESETS,
    dailySlotMode: 'preset',
    dailySlotPresetId: 'one_dinner',
    mealSlots: DAILY_SLOT_PRESETS[0].slots,
    customLunchCount: 0,
    customDinnerCount: 0,
    customChipLabel: '自定义',
    showCustomSlots: false,
    draftLunchCount: 0,
    draftDinnerCount: 0,
    partySlotCount: 1,
    partyAvoidOptions: PARTY_AVOID_OPTIONS,
    partyAvoidChecked: {},
    upcomingHolidays: [],
    holidayId: '',
    holidayDate: '',

    showProfileLite: false,
    showEmptyDialog: false,
    liteBusy: false
  },

  _pendingSelected: null,
  _pendingScene: null,

  onLoad() {
    try {
      this._initSceneFromSession()
    } catch (err) {
      console.error('confirm init failed', err)
      this.setData({ loading: false, error: '页面初始化失败' })
      return
    }
    this.loadHousehold()
    this.loadList()
  },

  onShow() {
    this.applyTypeScale()
    // 从推荐页返回时恢复按钮，避免一直停在「脑壳飞速运转中」
    if (this.data.submitting || this.data.liteBusy) {
      this.setData({ submitting: false, liteBusy: false })
    }
  },

  _peopleLabel(n) {
    return n != null ? n + ' 人' : '选择人数'
  },

  _emptyTier() {
    return { adult: 0, child: 0, elder: 0 }
  },

  _tierPatch(householdCounts, guestCounts, omitCounts) {
    const hh = normalizeTierCounts(householdCounts)
    const guests = normalizeTierCounts(guestCounts)
    const omit = normalizeTierCounts(omitCounts)
    const tierDisplay = {
      adult: Math.max(0, hh.adult - omit.adult) + guests.adult,
      child: Math.max(0, hh.child - omit.child) + guests.child,
      elder: Math.max(0, hh.elder - omit.elder) + guests.elder
    }
    const peopleCount = tierDisplay.adult + tierDisplay.child + tierDisplay.elder
    return {
      householdCounts: hh,
      guestCounts: guests,
      omitCounts: omit,
      tierDisplay,
      adultIndex: indexOfValue(TIER_RANGE, tierDisplay.adult, 0),
      childIndex: indexOfValue(TIER_RANGE, tierDisplay.child, 0),
      elderIndex: indexOfValue(TIER_RANGE, tierDisplay.elder, 0),
      peopleCount,
      peopleCountLabel: this._peopleLabel(peopleCount),
      householdLabel: `共${peopleCount}人 · ${tierDisplay.adult}大 ${tierDisplay.child}小 ${tierDisplay.elder}老`
    }
  },

  /** 按目标档人数反推 guest / omit（不改 members） */
  _countsForTarget(householdCounts, tier, target) {
    const hh = normalizeTierCounts(householdCounts)
    const guests = normalizeTierCounts(this.data.guestCounts)
    const omit = normalizeTierCounts(this.data.omitCounts)
    const n = Math.max(0, Math.min(TIER_RANGE[TIER_RANGE.length - 1], Math.floor(Number(target) || 0)))
    const base = hh[tier] || 0
    if (n >= base) {
      omit[tier] = 0
      guests[tier] = n - base
    } else {
      guests[tier] = 0
      omit[tier] = base - n
    }
    return this._tierPatch(hh, guests, omit)
  },

  /** 非日常：partyCounts → 展示；不预填档案 */
  _partyPatch(partyCounts) {
    const counts = normalizeTierCounts(partyCounts)
    const peopleCount = counts.adult + counts.child + counts.elder
    return {
      partyCounts: counts,
      tierDisplay: {
        adult: counts.adult,
        child: counts.child,
        elder: counts.elder
      },
      adultIndex: indexOfValue(TIER_RANGE, counts.adult, 0),
      childIndex: indexOfValue(TIER_RANGE, counts.child, 0),
      elderIndex: indexOfValue(TIER_RANGE, counts.elder, 0),
      peopleCount,
      peopleCountLabel: peopleCount > 0 ? this._peopleLabel(peopleCount) : '选择人数',
      householdLabel: `共${peopleCount}人 · ${counts.adult}大 ${counts.child}小 ${counts.elder}老`
    }
  },

  _setComboIndexes(patch, combo) {
    const c = combo || { meat: 0, veg: 0, soup: 0 }
    patch.combo = c
    patch.meatIndex = indexOfValue(COMBO_RANGE, c.meat, 0)
    patch.vegIndex = indexOfValue(COMBO_RANGE, c.veg, 0)
    patch.soupIndex = indexOfValue(COMBO_RANGE, c.soup, 0)
    return patch
  },

  /** 聚会：按 partyCounts + 会话种子自动 combo（页上不展示编辑） */
  _ensurePartyComboSeed() {
    if (this._partyComboSeed) return this._partyComboSeed
    this._partyComboSeed =
      'party_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    return this._partyComboSeed
  },

  _applyPartyCombo(patch, partyCounts) {
    const counts = normalizeTierCounts(partyCounts)
    const n = counts.adult + counts.child + counts.elder
    if (!(n >= 1)) {
      return this._setComboIndexes(patch, { meat: 0, veg: 0, soup: 0 })
    }
    const seed = this._ensurePartyComboSeed()
    const suggested =
      suggestPartyCombo(counts, seed) || { meat: 1, veg: 1, soup: 0 }
    patch.partyComboSeed = seed
    return this._setComboIndexes(patch, suggested)
  },

  _applyMembersToScene(members) {
    const list = members || []
    const hh = computeHouseholdCounts(list)
    const guests = this._emptyTier()
    const omit = this._emptyTier()
    const patch = this._tierPatch(hh, guests, omit)
    patch.members = list
    if (list.length > 0) {
      const user = getUser() || {}
      const combo = cloneCombo(user.defaultCombo)
      if (combo && isComboPresent(combo)) {
        this._setComboIndexes(patch, combo)
      }
    } else {
      this._setComboIndexes(patch, { meat: 0, veg: 0, soup: 0 })
    }
    this.setData(patch)
    patchUser({ defaultPeopleCount: list.length, members: list })
  },

  loadHousehold() {
    // 优先用 auth 已缓存的 members，避免再打 profile.get
    const cached = getUser()
    if (cached && Array.isArray(cached.members)) {
      this._applyMembersToScene(cached.members)
      return Promise.resolve()
    }
    return ensureLogin()
      .then((user) => {
        this._applyMembersToScene((user && user.members) || [])
      })
      .catch((err) => {
        console.warn('loadHousehold failed', err)
      })
  },

  _initSceneFromSession() {
    // 人数/搭配等 loadHousehold：无成员则为 0，不臆造默认人数
    const tier = this._tierPatch(this._emptyTier(), this._emptyTier(), this._emptyTier())
    const upcomingHolidays = filterHolidays(holidaysPack.items || [], todayStr(), 30)
    this.setData(
      Object.assign(
        {
          mealType: 'daily',
          isDaily: true,
          isHoliday: false,
          peopleIndex: 0,
          dailySlotPresetId: 'one_dinner',
          mealSlots: DAILY_SLOT_PRESETS[0].slots.map((s) => Object.assign({}, s)),
          partySlotCount: 1,
          partyAvoidChecked: {},
          upcomingHolidays,
          holidayId: '',
          holidayDate: ''
        },
        tier,
        this._setComboIndexes({}, { meat: 0, veg: 0, soup: 0 })
      )
    )
  },

  loadList() {
    this.setData({ loading: true, error: '', listEmpty: false })
    const user = getUser() || {}
    const familyAvoids = user.familyAvoids || []
    callCloud('ingredients', {})
      .then(res => {
        const seasonal = (res && res.seasonal) || []
        const yearRound = (res && res.yearRound) || []
        const seasonalChecked = {}
        seasonal.forEach(it => {
          seasonalChecked[it.id] = true
        })
        const yearRoundChecked = defaultYearRoundChecked(yearRound, familyAvoids)
        const manuals = []
        this.setData({
          loading: false,
          error: '',
          seasonal,
          yearRound,
          seasonalGroups: groupByCategory(seasonal),
          yearRoundGroups: groupByCategory(yearRound),
          seasonalChecked,
          seasonalSelectAllLabel: this._seasonalSelectAllLabel(seasonal, seasonalChecked),
          yearRoundChecked,
          yearRoundExpanded: false,
          manuals,
          listEmpty: seasonal.length === 0 && yearRound.length === 0,
          ...this._counts(seasonalChecked, yearRoundChecked, manuals)
        })
      })
      .catch(err => {
        console.error(err)
        const msg =
          (err && (err.errMsg || err.message || err.error)) || '加载失败'
        this.setData({ loading: false, error: String(msg), listEmpty: false })
        wx.showToast({ title: '食材加载失败', icon: 'none' })
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

  _seasonalSelectAllLabel(seasonal, seasonalChecked) {
    const list = seasonal || []
    const all = list.length > 0 && list.every((it) => seasonalChecked[it.id])
    return all ? '取消全选' : '全选'
  },

  toggleSeasonal(e) {
    const id = e.currentTarget.dataset.id
    const seasonalChecked = Object.assign({}, this.data.seasonalChecked)
    seasonalChecked[id] = !seasonalChecked[id]
    this.setData({
      seasonalChecked,
      seasonalSelectAllLabel: this._seasonalSelectAllLabel(this.data.seasonal, seasonalChecked),
      ...this._counts(seasonalChecked, this.data.yearRoundChecked, this.data.manuals)
    })
  },

  selectAllSeasonal() {
    tapFeedback()
    const seasonal = this.data.seasonal || []
    const allSelected =
      seasonal.length > 0 && seasonal.every((it) => this.data.seasonalChecked[it.id])
    const seasonalChecked = {}
    seasonal.forEach((it) => {
      seasonalChecked[it.id] = !allSelected
    })
    this.setData({
      seasonalChecked,
      seasonalSelectAllLabel: allSelected ? '全选' : '取消全选',
      ...this._counts(seasonalChecked, this.data.yearRoundChecked, this.data.manuals)
    })
  },

  clearSeasonal() {
    tapFeedback()
    const seasonalChecked = {}
    this.data.seasonal.forEach((it) => {
      seasonalChecked[it.id] = false
    })
    this.setData({
      seasonalChecked,
      seasonalSelectAllLabel: '全选',
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

  onMealTypeTap(e) {
    const mealType = e.currentTarget.dataset.id
    if (!mealType || mealType === this.data.mealType) return
    const isDaily = mealType === 'daily'
    const user = getUser() || {}
    const patch = {
      mealType,
      isDaily,
      isHoliday: false
    }
    if (isDaily) {
      this._partyComboSeed = null
      const combo = cloneCombo(user.defaultCombo) || { meat: 1, veg: 1, soup: 0 }
      const tier = this._tierPatch(
        this.data.householdCounts,
        this._emptyTier(),
        this._emptyTier()
      )
      Object.assign(patch, tier)
      patch.combo = combo
      patch.meatIndex = indexOfValue(COMBO_RANGE, combo.meat, 1)
      patch.vegIndex = indexOfValue(COMBO_RANGE, combo.veg, 1)
      patch.soupIndex = indexOfValue(COMBO_RANGE, combo.soup, 0)
      patch.dailySlotMode = 'preset'
      patch.dailySlotPresetId = 'one_dinner'
      patch.mealSlots = DAILY_SLOT_PRESETS[0].slots.map(s => Object.assign({}, s))
      // 定稿：文案恢复「自定义」；保留 customLunchCount/customDinnerCount 供再开弹窗
      patch.customChipLabel = '自定义'
      patch.showCustomSlots = false
      patch.partyAvoidChecked = {}
      patch.holidayId = ''
      patch.holidayDate = ''
      patch.partyComboSeed = ''
    } else {
      // 聚会：三档从 0 起；combo 自动生成，不露编辑
      this._partyComboSeed = null
      const partyCounts = this._emptyTier()
      Object.assign(patch, this._partyPatch(partyCounts))
      this._applyPartyCombo(patch, partyCounts)
      patch.partySlotCount = 1
      patch.mealSlots = buildPartySlots(1)
      patch.partyAvoidChecked = {}
      patch.holidayId = ''
      patch.holidayDate = ''
    }
    this.setData(patch)
  },

  /**
   * 大/小/老 picker。
   * 日常：guest/omit；聚会：partyCounts，变人数时重算自动 combo（同会话种子）
   */
  onTierPick(e) {
    const tier = e.currentTarget.dataset.tier
    const idx = Number(e.detail.value)
    if (!['adult', 'child', 'elder'].includes(tier)) return
    if (idx < 0 || idx >= TIER_RANGE.length) return
    const target = TIER_RANGE[idx]

    if (this.data.isDaily) {
      this.setData(this._countsForTarget(this.data.householdCounts, tier, target))
      return
    }

    const partyCounts = normalizeTierCounts(this.data.partyCounts)
    partyCounts[tier] = target
    const patch = this._partyPatch(partyCounts)
    this._applyPartyCombo(patch, partyCounts)
    this.setData(patch)
  },

  onComboPick(e) {
    if (!this.data.isDaily) return
    const field = e.currentTarget.dataset.field
    const idx = Number(e.detail.value)
    if (!field || idx < 0 || idx >= COMBO_RANGE.length) return
    const base = this.data.combo || { meat: 0, veg: 0, soup: 0 }
    const next = cloneCombo(base)
    next[field] = COMBO_RANGE[idx]
    const indexKey = field + 'Index'
    this.setData({ combo: next, [indexKey]: idx })
  },

  onDailySlotPreset(e) {
    const id = e.currentTarget.dataset.id
    const preset = DAILY_SLOT_PRESETS.find(p => p.id === id)
    if (!preset) return
    this.setData({
      dailySlotMode: 'preset',
      dailySlotPresetId: id,
      mealSlots: preset.slots.map(s => Object.assign({}, s)),
      // 芯片上自定义文案仍可用上次 n/m；点回预设后 chip 显示「自定义」——见 format：
      // 规格：点回预设后自定义芯片文案恢复「自定义」
      customChipLabel: '自定义'
      // 保留 customLunchCount/customDinnerCount 供再次打开弹窗
    })
    track('scene_meal_slots_change', {
      meal_slots_mode: 'preset',
      presetId: id,
      slots: preset.slots.length
    })
  },

  onOpenCustomSlots() {
    // 定稿：首次进入固定 0+0；再次打开用上次确认的 n/m
    // 「再次」= 已有确认过的计数，或已是 custom 模式
    const useSaved =
      this.data.dailySlotMode === 'custom' ||
      this.data.customLunchCount > 0 ||
      this.data.customDinnerCount > 0
    this.setData({
      showCustomSlots: true,
      draftLunchCount: useSaved ? this.data.customLunchCount : 0,
      draftDinnerCount: useSaved ? this.data.customDinnerCount : 0
    })
  },

  noop() {},

  onCloseCustomSlots() {
    this.setData({ showCustomSlots: false })
  },

  bumpCustomDraft(e) {
    const which = e.currentTarget.dataset.which // 'lunch' | 'dinner'
    const delta = Number(e.currentTarget.dataset.delta) || 0
    let l = this.data.draftLunchCount
    let d = this.data.draftDinnerCount
    if (delta > 0) {
      if (!canIncrement(l, d, which)) return
      if (which === 'lunch') l += 1
      else d += 1
    } else {
      if (which === 'lunch') l = Math.max(0, l - 1)
      else d = Math.max(0, d - 1)
    }
    this.setData({
      draftLunchCount: clampMealCount(l),
      draftDinnerCount: clampMealCount(d)
    })
  },

  onConfirmCustomSlots() {
    const l = clampMealCount(this.data.draftLunchCount)
    const d = clampMealCount(this.data.draftDinnerCount)
    const mealSlots = buildDailySlotsFromCounts(l, d)
    this.setData({
      showCustomSlots: false,
      dailySlotMode: 'custom',
      dailySlotPresetId: '',
      customLunchCount: l,
      customDinnerCount: d,
      customChipLabel: formatCustomChipLabel(l, d),
      mealSlots
    })
    track('scene_meal_slots_change', {
      meal_slots_mode: 'custom',
      lunchCount: l,
      dinnerCount: d,
      slots: mealSlots.length
    })
  },

  bumpPartySlots(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0
    const next = Math.max(1, Math.min(7, (this.data.partySlotCount || 1) + delta))
    this.setData({
      partySlotCount: next,
      mealSlots: buildPartySlots(next)
    })
  },

  togglePartyAvoid(e) {
    const id = e.currentTarget.dataset.id
    const partyAvoidChecked = Object.assign({}, this.data.partyAvoidChecked)
    partyAvoidChecked[id] = !partyAvoidChecked[id]
    this.setData({ partyAvoidChecked })
  },

  onHolidayTap(e) {
    const id = e.currentTarget.dataset.id
    const date = e.currentTarget.dataset.date
    this.setData({ holidayId: id, holidayDate: date })
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

  buildScene() {
    const {
      mealType,
      isDaily,
      peopleCount,
      combo,
      mealSlots,
      partyAvoidChecked,
      holidayId,
      holidayDate,
      householdCounts,
      guestCounts,
      omitCounts,
      partyCounts
    } = this.data
    const scene = {
      mealType,
      peopleCount: peopleCount == null ? null : Number(peopleCount),
      combo: cloneCombo(combo),
      mealSlots: (mealSlots || []).map(s => ({ meal: s.meal, label: s.label })),
      persistComboToDefault: false
    }
    if (isDaily) {
      scene.householdCounts = normalizeTierCounts(householdCounts)
      scene.guestCounts = normalizeTierCounts(guestCounts)
      scene.omitCounts = normalizeTierCounts(omitCounts)
      // 以页面展示人数为准（无成员可为 0；不因 expand 兜底变成 1）
      const td = this.data.tierDisplay || {}
      scene.peopleCount =
        (Number(td.adult) || 0) + (Number(td.child) || 0) + (Number(td.elder) || 0)
      // 推荐顶栏几顿文案：与确认页芯片一致（预设名 / 自定义 n午+m晚）
      if (this.data.dailySlotMode === 'custom') {
        scene.mealSlotsSummary = this.data.customChipLabel || '自定义'
      } else {
        const preset = DAILY_SLOT_PRESETS.find(
          (p) => p.id === this.data.dailySlotPresetId
        )
        scene.mealSlotsSummary = (preset && preset.label) || ''
      }
      scene.partyAvoids = null
      scene.holidayId = null
      scene.holidayDate = null
    } else {
      scene.partyCounts = normalizeTierCounts(partyCounts)
      scene.peopleCount =
        scene.partyCounts.adult + scene.partyCounts.child + scene.partyCounts.elder
      scene.partyAvoids = Object.keys(partyAvoidChecked || {}).filter(k => partyAvoidChecked[k])
      const seed = this._ensurePartyComboSeed()
      scene.partyComboSeed = seed
      scene.combo =
        suggestPartyCombo(scene.partyCounts, seed) || cloneCombo(combo)
      // 节日选择暂时隐藏，不写入 scene
      scene.holidayId = null
      scene.holidayDate = null
    }
    return scene
  },

  onConfirm() {
    if (this.data.submitting || this.data.liteBusy) return
    tapFeedback('heavy')
    const selected = this.buildSelected()
    if (!selected.length) {
      wx.showToast({ title: '请先选择食材', icon: 'none' })
      return
    }
    const scene = this.buildScene()
    if (!(scene.peopleCount >= 1)) {
      wx.showToast({ title: '请选择人数', icon: 'none' })
      return
    }
    if (!isComboPresent(scene.combo)) {
      wx.showToast({
        title: scene.mealType === 'daily' ? '请选择荤素搭配' : '请设置本场人数',
        icon: 'none'
      })
      return
    }
    if (!scene.mealSlots || !scene.mealSlots.length) {
      wx.showToast({
        title:
          this.data.isDaily && this.data.dailySlotMode === 'custom'
            ? '请先选择吃几顿'
            : '请选择几顿',
        icon: 'none'
      })
      return
    }

    const methodsUsed = ['default_list']
    if (this.data.manuals.length) methodsUsed.push('manual')
    wx.setStorageSync(STORAGE_KEY, { selected, methodsUsed, scene })
    track('ingredient_confirm', {
      selectedCount: selected.length,
      methodsUsed,
      mealType: scene.mealType,
      people: scene.peopleCount,
      combo: scene.combo,
      meal_slots_mode: this.data.isDaily
        ? this.data.dailySlotMode
        : 'party',
      lunchCount: this.data.isDaily ? this.data.customLunchCount : undefined,
      dinnerCount: this.data.isDaily ? this.data.customDinnerCount : undefined,
      slotCount: (scene.mealSlots || []).length
    })

    this._pendingSelected = selected
    this._pendingScene = scene

    const user = getUser() || {}
    if (
      shouldShowProfileLite({
        mealType: scene.mealType,
        familyAvoids: user.familyAvoids || [],
        profileLiteSkipped: user.profileLiteSkipped,
        profileLitePromptedAt: user.profileLitePromptedAt
      })
    ) {
      track('profile_lite_show', { source: 'pre_create_sheet' })
      this.setData({ showProfileLite: true })
      return
    }

    this._submitRecommend(selected, scene)
  },

  onProfileLiteSkip() {
    if (this.data.liteBusy) return
    tapFeedback()
    this.setData({ liteBusy: true, showProfileLite: false })
    track('profile_lite_skip', { source: 'pre_create_sheet' })
    const selected = this._pendingSelected
    const scene = this._pendingScene
    callCloud('profile', { action: 'skipProfileLite' })
      .then(() =>
        ensureLogin().catch(() => {
          const u = getUser() || {}
          u.profileLiteSkipped = true
          u.profileLitePromptedAt = Date.now()
          try {
            wx.setStorageSync('cookthis_user', u)
          } catch (e) {}
        })
      )
      .catch((err) => console.error(err))
      .then(() => {
        this.setData({ liteBusy: false })
        this._submitRecommend(selected, scene)
      })
  },

  onProfileLiteSave(e) {
    if (this.data.liteBusy) return
    tapFeedback('heavy')
    const detail = (e && e.detail) || {}
    const familyAvoids = detail.familyAvoids || []
    const love = detail.love || {}
    const dishFormPrefs = {}
    if (love.hotpot) dishFormPrefs.hotpot = 'prefer'
    if (love.noodle) dishFormPrefs.noodle = 'prefer'
    this.setData({ liteBusy: true, showProfileLite: false })
    track('profile_lite_save', {
      source: 'pre_create_sheet',
      avoidCount: familyAvoids.length,
      loveHotpot: !!love.hotpot,
      loveNoodle: !!love.noodle
    })
    const selected = this._pendingSelected
    const scene = this._pendingScene
    callCloud('profile', {
      action: 'saveProfileLite',
      familyAvoids,
      dishFormPrefs
    })
      .then(() => ensureLogin().catch(() => null))
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '设置未保存，继续出方案', icon: 'none' })
      })
      .then(() => {
        this.setData({ liteBusy: false })
        this._submitRecommend(selected, scene)
      })
  },

  _submitRecommend(selected, scene) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    callCloud('recommend', { action: 'create', selected, scene })
      .then((result) => {
        const plans = (result && result.plans) || []
        if (!plans.length) {
          track('empty_recommend', {
            reasonCode: (result && result.emptyReason) || null,
            action: 'create'
          })
          this.setData({ submitting: false, showEmptyDialog: true })
          return
        }
        // 成功跳转前保持 submitting，避免文案闪回「确认」
        wx.setStorageSync(
          RECOMMEND_KEY,
          Object.assign({}, result, {
            scene,
            selectedIngredients: selected,
            swapCount: typeof result.swapCount === 'number' ? result.swapCount : 0
          })
        )
        wx.navigateTo({ url: '/pages/recommend/recommend' })
      })
      .catch((err) => {
        console.error(err)
        this.setData({ submitting: false })
        const title = (err && (err.error || err.message)) || '推荐失败'
        wx.showToast({ title: String(title), icon: 'none' })
      })
  },

  onEmptyDialogOk() {
    tapFeedback()
    this.setData({ showEmptyDialog: false })
  }
})
