const { callCloud } = require('../../services/cloud.js')
const { getUser, ensureLogin, patchUser } = require('../../services/session.js')
const confirmIngredientsCache = require('../../services/confirmIngredientsCache.js')
const catalogCache = require('../../services/catalogCache.js')
const {
  suggestManualIngredients,
  resolveManualAdd
} = require('../../utils/manualSuggest.js')
const { suggestPartyCombo, suggestComboByPeople } = require('../../utils/suggestCombo.js')
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
  FREE_DAILY_MEAL_MAX,
  MEMBER_DAILY_MEAL_MAX,
  MORE_MEAL_COUNTS,
  buildDailySlotsByCount,
  formatMealCountChipLabel,
  formatMealSlotsSummary,
  canUseDailyMealCount,
  canAccessMoreDailyMeals,
  isMealGateActionTooSoon,
  clampMoreMealCount
} = require('../../utils/dailyMealSlots.js')
const {
  getStatus,
  unlockDailyMealCustom,
  getMembershipLite,
  setMembershipLite
} = require('../../services/membership.js')
const { AD_UNITS, canOfferDailyMealRewardAd } = require('../../utils/ads.js')
const {
  effectiveFromChoice,
  labelForChoice
} = require('../../utils/marketScale.js')
const {
  CATEGORY_ORDER,
  CATEGORY_LABEL: CATEGORY_LABELS,
  normalizeCategory
} = require('../../utils/categoryTaxonomy.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')
const holidaysPack = require('../../data/holidays.js')

const MARKET_SCALE_PAGE_COPY = {
  title: '你常去的菜场大概多大？',
  hint: '用来决定今天展示多少常见菜，可随时改'
}

const STORAGE_KEY = 'cookthis_last_selected'
const RECOMMEND_KEY = 'cookthis_last_recommend'

const MEAL_TYPE_OPTIONS = [
  { id: 'daily', label: '日常' },
  { id: 'friends_party', label: '聚会' }
]

/** 大/小/老每档可选人数（与搭配 picker 同交互） */
const TIER_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** 无家庭成员时：当次访客 1 大人 + 一荤一素（不写 members / defaultPeopleCount） */
const EMPTY_MEMBER_GUESTS = { adult: 1, child: 0, elder: 0 }
const EMPTY_MEMBER_COMBO = { meat: 1, veg: 1, soup: 0 }

function householdTotal(counts) {
  const c = normalizeTierCounts(counts)
  return c.adult + c.child + c.elder
}

// 与家庭忌口词表一致（含新增组）；硬排除靠 ingredients.avoidTags
const { AVOID_OPTIONS: PARTY_AVOID_OPTIONS } = require('../../utils/avoidOptions.js')

const DAILY_MEAL_COUNT_PRESETS = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: 'count_' + n,
  label: String(n),
  count: n
}))

function isNonReleaseEnv() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    return env === 'develop' || env === 'trial'
  } catch (e) {
    return false
  }
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

/** 旧列表中按 id 或 name 命中的勾选态；未命中返回 null（表示新进项） */
function prevCheckedState(oldItems, oldChecked, item) {
  const id = item && item.id
  const name = item && item.name
  const list = oldItems || []
  for (let i = 0; i < list.length; i++) {
    const it = list[i]
    if (!it) continue
    if ((id && it.id === id) || (name && it.name === name)) {
      return !!(oldChecked && oldChecked[it.id])
    }
  }
  return null
}

function mergeSeasonalChecked(oldItems, oldChecked, newItems) {
  const checked = {}
  ;(newItems || []).forEach((it) => {
    const prev = prevCheckedState(oldItems, oldChecked, it)
    checked[it.id] = prev == null ? true : prev
  })
  return checked
}

function mergeYearRoundChecked(oldItems, oldChecked, newItems, familyAvoids) {
  const defaults = defaultYearRoundChecked(newItems, familyAvoids)
  const checked = {}
  ;(newItems || []).forEach((it) => {
    const prev = prevCheckedState(oldItems, oldChecked, it)
    checked[it.id] = prev == null ? !!defaults[it.id] : prev
  })
  return checked
}

function groupByCategory(items) {
  const map = new Map()
  ;(items || []).forEach((it) => {
    const c = normalizeCategory(it && it.category, '其他')
    if (!map.has(c)) map.set(c, [])
    map.get(c).push(it)
  })
  const rank = (category) => {
    const i = CATEGORY_ORDER.indexOf(category)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return Array.from(map.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([category, list]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      list
    }))
}

/** 按类别顺序展平，供时令收起预览（无分组标题） */
function flattenSeasonalGroups(groups) {
  const out = []
  ;(groups || []).forEach((g) => {
    ;(g.list || []).forEach((it) => out.push(it))
  })
  return out
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
  const count = Math.max(1, Math.min(3, Number(n) || 1))
  const slots = []
  for (let i = 0; i < count; i++) {
    slots.push({
      meal: 'other',
      label: count === 1 ? '本场' : '第' + (i + 1) + '餐'
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
    holdBlank: false,
    submitting: false,
    seasonal: [],
    yearRound: [],
    seasonalGroups: [],
    seasonalFlat: [],
    yearRoundGroups: [],
    seasonalChecked: {},
    seasonalSelectAllLabel: '全选',
    yearRoundChecked: {},
    yearRoundExpanded: false,
    seasonalExpanded: false,
    headerHeight: 140,
    manuals: [],
    manualInput: '',
    manualSuggestions: [],
    manualSuggestEmpty: false,
    manualDedupeHint: '',
    count: 0,
    seasonalCount: 0,
    yearRoundCount: 0,
    seasonalTotal: 0,
    yearRoundTotal: 0,

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
    dailyMealCountPresets: DAILY_MEAL_COUNT_PRESETS,
    dailySlotMode: 'preset',
    dailySlotPresetId: 'count_1',
    mealSlots: buildDailySlotsByCount(1),
    customMealCount: 0,
    moreMealCounts: MORE_MEAL_COUNTS,
    customChipLabel: '更多',
    showMoreMeals: false,
    showMealGate: false,
    isMember: false,
    dailyMealUnlockedToday: false,
    adRewardEnabled: canOfferDailyMealRewardAd(),
    partySlotCount: 1,
    partySlotOptions: [1, 2, 3],
    partyAvoidOptions: PARTY_AVOID_OPTIONS,
    partyAvoidChecked: {},
    warnSeason: false,
    warnPeople: false,
    warnCombo: false,
    warnSlots: false,
    warnPulse: false,
    upcomingHolidays: [],
    holidayId: '',
    holidayDate: '',

    showProfileLite: false,
    profileLiteNeedCity: false,
    showEmptyDialog: false,
    liteBusy: false,

    marketScaleEntryLabel: labelForChoice('default_medium'),
    showMarketScale: false,
    marketScaleBusy: false,
    marketScaleTitle: MARKET_SCALE_PAGE_COPY.title,
    marketScaleHint: MARKET_SCALE_PAGE_COPY.hint,
    marketScaleHighlight: 'medium',
    marketScaleDefaultOn: true
  },

  _pendingSelected: null,
  _pendingScene: null,
  _suggestTimer: null,
  _suggestEntries: null,
  _aliasIndex: null,

  onLoad() {
    this._loadManualSuggestContext()
    try {
      this._initSceneFromSession()
    } catch (err) {
      console.error('confirm init failed', err)
      this.setData({ loading: false, error: '页面初始化失败' })
      return
    }
    // 首页已预取时同步灌入，避免进页后再闪 loading
    const entryScale = confirmIngredientsCache.resolveScale()
    const prefetched = confirmIngredientsCache.take(entryScale)
    if (prefetched) {
      this._applyIngredientPayload(prefetched, { preserveSelection: false })
    }
    this.loadHousehold()
    this._ensureSystemDefaultMarketScale()
      .then(() => {
        this._syncMarketScaleEntry()
        const nextScale = confirmIngredientsCache.resolveScale()
        if (prefetched && nextScale === entryScale) return
        this.loadList(
          prefetched && nextScale !== entryScale
            ? { preserveSelection: true }
            : undefined
        )
      })
      .catch((err) => {
        console.warn('market scale init failed', err)
        this._syncMarketScaleEntry()
        if (!prefetched) this.loadList()
      })
  },

  onShow() {
    this.applyTypeScale()
    const lite = getMembershipLite()
    const user = getUser() || {}
    const accessPatch = {}
    if (lite) accessPatch.isMember = !!lite.isMember
    if (user.dailyMealCustomUnlockDay === todayStr()) {
      accessPatch.dailyMealUnlockedToday = true
    }
    if (Object.keys(accessPatch).length) this.setData(accessPatch)
    getStatus()
      .then((res) => this._applyDailyMealAccess(res))
      .catch(() => {})
    this._loadManualSuggestContext()
    // 从推荐页返回时清 busy，避免遮罩一直挡住
    if (this.data.submitting || this.data.liteBusy) {
      this.setData({ submitting: false, liteBusy: false })
    }
  },

  _loadManualSuggestContext() {
    return catalogCache
      .loadManualSuggestContext()
      .then((ctx) => {
        this._suggestEntries = (ctx && Array.isArray(ctx.entries) && ctx.entries) || []
        this._aliasIndex = (ctx && ctx.aliasIndex) || null
        const q = this.data.manualInput
        if (q) this._refreshManualSuggest(q)
      })
      .catch((err) => {
        console.warn('loadManualSuggestContext failed', err)
        if (!Array.isArray(this._suggestEntries)) this._suggestEntries = []
      })
  },

  _clearSuggestTimer() {
    if (this._suggestTimer) {
      clearTimeout(this._suggestTimer)
      this._suggestTimer = null
    }
  },

  _canonicalOfName(name) {
    const s = String(name || '')
    if (!s) return ''
    const idx = this._aliasIndex
    if (idx && typeof idx.canonicalOf === 'function') return idx.canonicalOf(s)
    return s
  },

  _shelfCheckedCanonicalSet() {
    const set = new Set()
    const add = (name) => {
      const c = this._canonicalOfName(name)
      if (c) set.add(c)
    }
    const { seasonal, yearRound, seasonalChecked, yearRoundChecked } = this.data
    ;(seasonal || []).forEach((it) => {
      if (it && seasonalChecked && seasonalChecked[it.id]) add(it.name)
    })
    ;(yearRound || []).forEach((it) => {
      if (it && yearRoundChecked && yearRoundChecked[it.id]) add(it.name)
    })
    return set
  },

  _selectedCanonicalSet() {
    const set = this._shelfCheckedCanonicalSet()
    const add = (name) => {
      const c = this._canonicalOfName(name)
      if (c) set.add(c)
    }
    ;(this.data.manuals || []).forEach((it) => {
      if (!it) return
      if (it.canonical) set.add(String(it.canonical))
      else add(it.name)
    })
    return set
  },

  _dedupeHintFor(canonical) {
    if (!canonical) return '已添加'
    if (this._shelfCheckedCanonicalSet().has(canonical)) return '已在菜场'
    return '已添加'
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
    const omit = this._emptyTier()
    const user = getUser() || {}
    // 无成员：不当次空白；用访客 1 大人（不落库），便于直接出推荐
    const guests = list.length > 0 ? this._emptyTier() : Object.assign({}, EMPTY_MEMBER_GUESTS)
    const patch = this._tierPatch(hh, guests, omit)
    patch.members = list
    const savedCombo = cloneCombo(user.defaultCombo)
    if (savedCombo && isComboPresent(savedCombo)) {
      this._setComboIndexes(patch, savedCombo)
    } else if (list.length > 0) {
      const n = patch.peopleCount || 0
      this._setComboIndexes(
        patch,
        suggestComboByPeople(n) || Object.assign({}, EMPTY_MEMBER_COMBO)
      )
    } else {
      this._setComboIndexes(patch, Object.assign({}, EMPTY_MEMBER_COMBO))
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
    // 人数/搭配等 loadHousehold 覆盖；无成员时先按 1 大人 + 一荤一素占位
    const tier = this._tierPatch(
      this._emptyTier(),
      Object.assign({}, EMPTY_MEMBER_GUESTS),
      this._emptyTier()
    )
    const upcomingHolidays = filterHolidays(holidaysPack.items || [], todayStr(), 30)
    this.setData(
      Object.assign(
        {
          mealType: 'daily',
          isDaily: true,
          isHoliday: false,
          peopleIndex: 0,
          dailySlotPresetId: 'count_1',
          mealSlots: buildDailySlotsByCount(1),
          partySlotCount: 1,
          partyAvoidChecked: {},
          upcomingHolidays,
          holidayId: '',
          holidayDate: ''
        },
        tier,
        this._setComboIndexes({}, Object.assign({}, EMPTY_MEMBER_COMBO))
      )
    )
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
    return callCloud('profile', Object.assign({ action: 'setMarketScale' }, payload || {})).then(
      (res) => {
        this._applyMarketScaleSnapshot(res)
        return res
      }
    )
  },

  _syncMarketScaleEntry() {
    const user = getUser() || {}
    const choice = user.marketScaleChoice || 'default_medium'
    const effective =
      user.marketScaleEffective || effectiveFromChoice(choice) || 'medium'
    this.setData({
      marketScaleEntryLabel: labelForChoice(choice),
      marketScaleHighlight: effective,
      marketScaleDefaultOn: choice === 'default_medium'
    })
  },

  /** 无 choice 时写一次 system_default，避免每次进首页写（Task 4） */
  _ensureSystemDefaultMarketScale() {
    const user = getUser() || {}
    if (user.marketScaleChoice) {
      return Promise.resolve()
    }
    return this._setMarketScale({
      choice: 'default_medium',
      source: 'system_default'
    }).catch((err) => {
      console.warn('setMarketScale system_default failed', err)
      patchUser({
        marketScaleChoice: 'default_medium',
        marketScaleEffective: 'medium'
      })
    })
  },

  /**
   * @param {{ scale?: string, seasonal?: any[], yearRound?: any[] }} payload
   * @param {{ preserveSelection?: boolean }} [opts]
   */
  _applyIngredientPayload(payload, opts) {
    const preserveSelection = !!(opts && opts.preserveSelection)
    const seasonal = (payload && payload.seasonal) || []
    const yearRound = (payload && payload.yearRound) || []
    const manuals = preserveSelection ? this.data.manuals || [] : []
    const user = getUser() || {}
    const familyAvoids = user.familyAvoids || []
    let seasonalChecked
    let yearRoundChecked
    if (preserveSelection) {
      seasonalChecked = mergeSeasonalChecked(
        this.data.seasonal || [],
        this.data.seasonalChecked || {},
        seasonal
      )
      yearRoundChecked = mergeYearRoundChecked(
        this.data.yearRound || [],
        this.data.yearRoundChecked || {},
        yearRound,
        familyAvoids
      )
    } else {
      seasonalChecked = {}
      seasonal.forEach((it) => {
        seasonalChecked[it.id] = true
      })
      yearRoundChecked = defaultYearRoundChecked(yearRound, familyAvoids)
    }
    const seasonalGroups = groupByCategory(seasonal)
    this.setData({
      loading: false,
      error: '',
      holdBlank: false,
      seasonal,
      yearRound,
      seasonalGroups,
      seasonalFlat: flattenSeasonalGroups(seasonalGroups),
      yearRoundGroups: groupByCategory(yearRound),
      seasonalChecked,
      seasonalSelectAllLabel: this._seasonalSelectAllLabel(seasonal, seasonalChecked),
      yearRoundChecked,
      yearRoundExpanded: preserveSelection ? this.data.yearRoundExpanded : false,
      seasonalExpanded: preserveSelection ? this.data.seasonalExpanded : false,
      manuals,
      listEmpty: seasonal.length === 0 && yearRound.length === 0,
      ...this._counts(seasonalChecked, yearRoundChecked, manuals, {
        seasonal,
        yearRound
      })
    })
  },

  /**
   * @param {{ preserveSelection?: boolean }} [opts]
   */
  loadList(opts) {
    const preserveSelection = !!(opts && opts.preserveSelection)
    const scale = confirmIngredientsCache.resolveScale()
    if (!preserveSelection) {
      const cached = confirmIngredientsCache.take(scale)
      if (cached) {
        this._applyIngredientPayload(cached, { preserveSelection: false })
        return
      }
    }

    this.setData({ loading: true, error: '', holdBlank: false, listEmpty: false })
    confirmIngredientsCache.clear()
    callCloud('ingredients', { scale })
      .then((res) => {
        this._applyIngredientPayload(
          {
            scale: (res && res.scale) || scale,
            seasonal: (res && res.seasonal) || [],
            yearRound: (res && res.yearRound) || []
          },
          { preserveSelection }
        )
      })
      .catch((err) => {
        console.error(err)
        const code = err && err.error
        const busy =
          code === 'RATE_LIMITED' || code === 'INGREDIENTS_DAILY_LIMIT'
        if (busy) {
          this.setData({ loading: false, error: '', holdBlank: true })
          wx.showToast({ title: '请求太频繁，请稍后再试', icon: 'none' })
          return
        }
        const msg =
          (err && (err.errMsg || err.message || err.error)) || '加载失败'
        this.setData({ loading: false, error: String(msg), listEmpty: false })
        wx.showToast({ title: '食材加载失败', icon: 'none' })
      })
  },

  onOpenMarketScaleSheet() {
    if (this.data.marketScaleBusy || this.data.submitting || this.data.liteBusy) {
      return
    }
    tapFeedback()
    const user = getUser() || {}
    const choice = user.marketScaleChoice || 'default_medium'
    const effective =
      user.marketScaleEffective || effectiveFromChoice(choice) || 'medium'
    track('market_scale_sheet_show', { reason: 'page_switch' })
    this.setData({
      showMarketScale: true,
      marketScaleTitle: MARKET_SCALE_PAGE_COPY.title,
      marketScaleHint: MARKET_SCALE_PAGE_COPY.hint,
      marketScaleHighlight: effective,
      marketScaleDefaultOn: choice === 'default_medium'
    })
  },

  onMarketScalePick(e) {
    if (this.data.marketScaleBusy || !this.data.showMarketScale) return
    const choice =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.choice
        : null
    if (!choice || (choice !== 'small' && choice !== 'medium' && choice !== 'large')) {
      return
    }
    tapFeedback()
    this.setData({
      marketScaleHighlight: choice,
      marketScaleDefaultOn: false
    })
  },

  /** 页内切换：取消只关层，不改档、不写库 */
  onMarketScaleCancel() {
    if (this.data.marketScaleBusy) return
    tapFeedback()
    track('market_scale_sheet_cancel', { source: 'page_switch' })
    this.setData({ showMarketScale: false })
  },

  onMarketScaleConfirm() {
    const choice = this.data.marketScaleHighlight
    if (!choice) {
      wx.showToast({ title: '请先选择菜场规模', icon: 'none' })
      return
    }
    this._commitMarketScale(choice)
  },

  _commitMarketScale(choice) {
    if (this.data.marketScaleBusy || !this.data.showMarketScale || !choice) return
    const user = getUser() || {}
    const current = user.marketScaleChoice || null
    const effective = effectiveFromChoice(choice)
    this.setData({
      marketScaleHighlight: effective,
      marketScaleDefaultOn: choice === 'default_medium'
    })
    // 与当前已选档相同：关层不写库，避免重复 history
    if (choice === current) {
      tapFeedback()
      this.setData({ showMarketScale: false })
      return
    }
    tapFeedback()
    this.setData({ marketScaleBusy: true })
    track('market_scale_sheet_select', { choice, source: 'page_switch' })
    // 勿 ensureLogin()：auth 可能仍是旧档，会盖掉刚 patch 的 marketScale*
    this._setMarketScale({ choice, source: 'page_switch' })
      .then(() => {
        this._syncMarketScaleEntry()
        this.setData({ showMarketScale: false, marketScaleBusy: false })
        this.loadList({ preserveSelection: true })
      })
      .catch((err) => {
        console.error(err)
        const fallbackChoice =
          (getUser() || {}).marketScaleChoice || current || 'default_medium'
        this.setData({
          marketScaleBusy: false,
          marketScaleHighlight: effectiveFromChoice(fallbackChoice),
          marketScaleDefaultOn: fallbackChoice === 'default_medium'
        })
        wx.showToast({ title: '切换失败，请重试', icon: 'none' })
      })
  },

  _counts(seasonalChecked, yearRoundChecked, manuals, lists) {
    const seasonal = (lists && lists.seasonal) || this.data.seasonal || []
    const yearRound = (lists && lists.yearRound) || this.data.yearRound || []
    const sc = countTrue(seasonalChecked)
    const yc = countTrue(yearRoundChecked)
    const mc = (manuals || []).length
    return {
      count: sc + yc + mc,
      seasonalCount: sc,
      yearRoundCount: yc,
      seasonalTotal: seasonal.length,
      yearRoundTotal: yearRound.length
    }
  },

  onHeaderHeight(e) {
    const height = e && e.detail && e.detail.height
    if (!height || height === this.data.headerHeight) return
    this.setData({ headerHeight: height })
  },

  onOpenSeasonalDrawer() {
    if (this.data.listEmpty) return
    this.setData({ seasonalExpanded: true })
  },

  onCloseSeasonalDrawer() {
    this.setData({ seasonalExpanded: false })
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
    this._syncWarnClears()
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
    this._syncWarnClears()
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
    this._syncWarnClears()
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
    this._syncWarnClears()
  },

  onManualInput(e) {
    const v = e.detail.value
    this.setData({ manualInput: v, manualDedupeHint: '' })
    this._clearSuggestTimer()
    this._suggestTimer = setTimeout(() => this._refreshManualSuggest(v), 200)
  },

  _manualSuggestFor(q) {
    const entries = this._suggestEntries || []
    const excludeCanonicals = this._selectedCanonicalSet()
    const r = suggestManualIngredients(q, entries, {
      limit: 10,
      excludeCanonicals
    })
    const candidates = r.candidates || []
    const trimmed = String(q || '').trim()
    let manualSuggestEmpty = false
    let manualDedupeHint = ''
    if (trimmed && entries.length && !candidates.length) {
      const open = suggestManualIngredients(q, entries, { limit: 1 })
      if (open.candidates && open.candidates.length) {
        manualDedupeHint = this._dedupeHintFor(open.candidates[0].canonical)
      } else {
        manualSuggestEmpty = true
      }
    }
    return {
      entries,
      excludeCanonicals,
      candidates,
      manualSuggestEmpty,
      manualDedupeHint
    }
  },

  _refreshManualSuggest(q) {
    const view = this._manualSuggestFor(q)
    if (view.candidates.length) {
      track('ingredient_manual_suggest_show', {
        queryLen: String(q || '').trim().length,
        hitCount: view.candidates.length
      })
    }
    this.setData({
      manualSuggestions: view.candidates,
      manualSuggestEmpty: view.manualSuggestEmpty,
      manualDedupeHint: view.manualDedupeHint
    })
  },

  onPickManualSuggest(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const canonical = dataset.canonical
    const surface = dataset.surface
    this._commitManual({
      matched: true,
      name: canonical,
      displayName: surface,
      canonical,
      via: 'pick'
    })
  },

  addManual() {
    const q = (this.data.manualInput || '').trim()
    if (!q) return
    this._clearSuggestTimer()
    const view = this._manualSuggestFor(q)
    const sug = view.candidates
    this.setData({
      manualSuggestions: sug,
      manualSuggestEmpty: view.manualSuggestEmpty,
      manualDedupeHint: view.manualDedupeHint
    })
    let resolved
    if (sug.length === 1) {
      resolved = {
        matched: true,
        name: sug[0].canonical,
        displayName: sug[0].surface,
        canonical: sug[0].canonical,
        via: 'pick'
      }
    } else {
      // 含「已在菜场」唯一强命中：仍解析为 matched，提交时静默去重
      resolved = Object.assign(
        { via: 'free' },
        resolveManualAdd(q, view.entries, { excludeCanonicals: view.excludeCanonicals })
      )
    }
    this._commitManual(resolved)
  },

  _commitManual(resolved) {
    if (!resolved || resolved.name == null || String(resolved.name).trim() === '') return
    const canonical = resolved.canonical || resolved.name
    if (resolved.matched && canonical && this._selectedCanonicalSet().has(canonical)) {
      this._clearSuggestTimer()
      this.setData({
        manualInput: '',
        manualSuggestions: [],
        manualSuggestEmpty: false,
        manualDedupeHint: this._dedupeHintFor(canonical)
      })
      return
    }
    const item = {
      id: 'custom_' + Date.now(),
      name: resolved.name,
      displayName: resolved.displayName || resolved.name,
      canonical: resolved.canonical,
      matched: !!resolved.matched,
      source: 'manual'
    }
    const manuals = this.data.manuals.concat(item)
    this._clearSuggestTimer()
    this.setData({
      manuals,
      manualInput: '',
      manualSuggestions: [],
      manualSuggestEmpty: false,
      manualDedupeHint: '',
      ...this._counts(this.data.seasonalChecked, this.data.yearRoundChecked, manuals)
    })
    track('ingredient_manual_add', {
      matched: !!resolved.matched,
      via: resolved.via || 'free'
    })
    if (!resolved.matched) {
      track('ingredient_manual_unmatched', {
        nameLen: String(resolved.name || '').length
      })
    }
    this._syncWarnClears()
  },

  removeManual(e) {
    const id = e.currentTarget.dataset.id
    const manuals = this.data.manuals.filter(m => m.id !== id)
    this.setData({
      manuals,
      ...this._counts(this.data.seasonalChecked, this.data.yearRoundChecked, manuals)
    })
    this._syncWarnClears()
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
      const combo = cloneCombo(user.defaultCombo) || Object.assign({}, EMPTY_MEMBER_COMBO)
      const hh = this.data.householdCounts
      // 无档案成员时保留「1 大人」访客默认，避免切回日常又变空白
      const guests =
        householdTotal(hh) > 0
          ? this._emptyTier()
          : Object.assign({}, EMPTY_MEMBER_GUESTS)
      const tier = this._tierPatch(hh, guests, this._emptyTier())
      Object.assign(patch, tier)
      patch.combo = combo
      patch.meatIndex = indexOfValue(COMBO_RANGE, combo.meat, 1)
      patch.vegIndex = indexOfValue(COMBO_RANGE, combo.veg, 1)
      patch.soupIndex = indexOfValue(COMBO_RANGE, combo.soup, 0)
      patch.dailySlotMode = 'preset'
      patch.dailySlotPresetId = 'count_1'
      patch.mealSlots = buildDailySlotsByCount(1)
      patch.customChipLabel = '更多'
      patch.showMoreMeals = false
      patch.showMealGate = false
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
      this._syncWarnClears()
      return
    }

    const partyCounts = normalizeTierCounts(this.data.partyCounts)
    partyCounts[tier] = target
    const patch = this._partyPatch(partyCounts)
    this._applyPartyCombo(patch, partyCounts)
    this.setData(patch)
    this._syncWarnClears()
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
    this._syncWarnClears()
  },

  _applyDailyMealAccess(res) {
    if (res) setMembershipLite(res)
    const today = todayStr()
    const user = getUser() || {}
    const lite = getMembershipLite()
    const unlockDay =
      (res && res.dailyMealCustomUnlockDay) || user.dailyMealCustomUnlockDay || ''
    this.setData({
      isMember: !!(res && res.isMember) || !!(lite && lite.isMember),
      dailyMealUnlockedToday: unlockDay === today
    })
  },

  _canCustomDailyMeals() {
    const lite = getMembershipLite()
    return canAccessMoreDailyMeals({
      isMember: !!(this.data.isMember || (lite && lite.isMember)),
      unlockedToday: !!this.data.dailyMealUnlockedToday
    })
  },

  onPickDailyMealCount(e) {
    const id = e.currentTarget.dataset.id
    const preset = DAILY_MEAL_COUNT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    const mealSlots = buildDailySlotsByCount(preset.count, FREE_DAILY_MEAL_MAX)
    this.setData({
      dailySlotMode: 'preset',
      dailySlotPresetId: id,
      mealSlots,
      customMealCount: 0,
      customChipLabel: '更多',
      showMoreMeals: false
    })
    this._syncWarnClears()
    track('confirm_slot_pick', { mode: 'preset', mealCount: preset.count })
  },

  onOpenCustomMealCount() {
    const lite = getMembershipLite()
    const isMember = !!(this.data.isMember || (lite && lite.isMember))
    const unlockedToday = !!this.data.dailyMealUnlockedToday
    if (isMember && !this.data.isMember) {
      this.setData({ isMember: true })
    }
    if (canAccessMoreDailyMeals({ isMember, unlockedToday })) {
      this.setData({ showMoreMeals: true, showMealGate: false })
      return
    }
    track('daily_meal_custom_gate_show', {})
    this._mealGateOpenedAt = Date.now()
    this.setData({ showMealGate: true, showMoreMeals: false })
  },

  onCloseMealGate() {
    this.setData({ showMealGate: false, showMoreMeals: false })
  },

  onMealGateGoMember() {
    if (isMealGateActionTooSoon(this._mealGateOpenedAt, Date.now())) return
    tapFeedback()
    track('daily_meal_custom_gate_member', {})
    this.setData({ showMealGate: false })
    wx.navigateTo({ url: '/pages/membership/index?from=daily_meal_custom' })
  },

  onMealGateWatchAd() {
    if (isMealGateActionTooSoon(this._mealGateOpenedAt, Date.now())) return
    tapFeedback()
    track('daily_meal_custom_gate_ad', {})
    this._watchDailyMealUnlockAd()
  },

  _watchDailyMealUnlockAd() {
    const unitId = AD_UNITS.rewardedDailyMealCustom
    if (unitId && typeof wx.createRewardedVideoAd === 'function') {
      try {
        if (!this._dailyMealRewardAd) {
          this._dailyMealRewardAd = wx.createRewardedVideoAd({ adUnitId: unitId })
          this._dailyMealRewardAd.onClose((res) => {
            if (res && res.isEnded) this._finishDailyMealUnlock()
            else wx.showToast({ title: '需看完广告才能解锁', icon: 'none' })
          })
          this._dailyMealRewardAd.onError(() => {
            wx.showToast({ title: '广告加载失败', icon: 'none' })
          })
        }
        this._dailyMealRewardAd
          .show()
          .catch(() =>
            this._dailyMealRewardAd
              .load()
              .then(() => this._dailyMealRewardAd.show())
              .catch(() => wx.showToast({ title: '广告加载失败', icon: 'none' }))
          )
        return
      } catch (e) {
        /* fall through */
      }
    }
    if (isNonReleaseEnv()) {
      this._finishDailyMealUnlock()
      return
    }
    wx.showToast({ title: '广告暂未开通', icon: 'none' })
  },

  _finishDailyMealUnlock() {
    unlockDailyMealCustom()
      .then((res) => {
        const day = (res && res.dailyMealCustomUnlockDay) || ''
        patchUser({ dailyMealCustomUnlockDay: day })
        this.setData({
          dailyMealUnlockedToday: true,
          showMealGate: false,
          showMoreMeals: true
        })
        track('daily_meal_custom_unlock', {})
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.error) || '解锁失败',
          icon: 'none'
        })
      })
  },

  noop() {},

  onCloseMoreMeals() {
    this.setData({ showMoreMeals: false })
  },

  onPickMoreMealCount(e) {
    const n = clampMoreMealCount(e.currentTarget.dataset.count)
    if (
      !canUseDailyMealCount(n, {
        isMember: this.data.isMember,
        unlockedToday: this.data.dailyMealUnlockedToday
      }).ok
    ) {
      wx.showToast({ title: '开通会员或看广告后可选更多餐', icon: 'none' })
      return
    }
    const mealSlots = buildDailySlotsByCount(n, MEMBER_DAILY_MEAL_MAX)
    this.setData({
      showMoreMeals: false,
      dailySlotMode: 'custom',
      dailySlotPresetId: '',
      customMealCount: n,
      customChipLabel: formatMealCountChipLabel(n),
      mealSlots
    })
    this._syncWarnClears()
    track('confirm_slot_pick', { mode: 'more', mealCount: n })
  },

  onPartySlotPick(e) {
    const next = Math.max(1, Math.min(3, Number(e.currentTarget.dataset.count) || 1))
    if (next === this.data.partySlotCount) return
    this.setData({
      partySlotCount: next,
      mealSlots: buildPartySlots(next)
    })
    this._syncWarnClears()
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
    seasonal.forEach((it) => {
      if (seasonalChecked[it.id]) {
        selected.push({
          id: it.id,
          name: it.name,
          category: normalizeCategory(it.category, '其他'),
          source: 'seasonal'
        })
      }
    })
    yearRound.forEach((it) => {
      if (yearRoundChecked[it.id]) {
        selected.push({
          id: it.id,
          name: it.name,
          category: normalizeCategory(it.category, '其他'),
          source: 'year_round'
        })
      }
    })
    manuals.forEach((it) => {
      selected.push({
        id: it.id,
        name: it.name,
        category: normalizeCategory(it.category, '其他'),
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
      // 以页面展示人数为准（含无成员时的默认访客 1 大人）
      const td = this.data.tierDisplay || {}
      scene.peopleCount =
        (Number(td.adult) || 0) + (Number(td.child) || 0) + (Number(td.elder) || 0)
      scene.mealSlotsSummary = formatMealSlotsSummary(mealSlots)
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

  onUnload() {
    this._clearFlashTimers()
    this._clearSuggestTimer()
  },

  _clearFlashTimers() {
    if (this._flashOnTimer) {
      clearTimeout(this._flashOnTimer)
      this._flashOnTimer = null
    }
    if (this._flashOffTimer) {
      clearTimeout(this._flashOffTimer)
      this._flashOffTimer = null
    }
  },

  /** 缺填标题标红 + 闪两下；红字保留到补全 */
  _flashWarnTitles(flags) {
    this._clearFlashTimers()
    this.setData(
      Object.assign(
        {
          warnSeason: false,
          warnPeople: false,
          warnCombo: false,
          warnSlots: false,
          warnPulse: false
        },
        flags || {}
      )
    )
    this._flashOnTimer = setTimeout(() => {
      this._flashOnTimer = null
      this.setData({ warnPulse: true })
    }, 20)
    this._flashOffTimer = setTimeout(() => {
      this._flashOffTimer = null
      this.setData({ warnPulse: false })
    }, 980)
  },

  /** 用户改完对应项后去掉标红 */
  _syncWarnClears() {
    const patch = {}
    if (this.data.warnSeason && this.buildSelected().length) {
      patch.warnSeason = false
    }
    if (this.data.warnPeople && this.data.peopleCount >= 1) {
      // 聚会无有效搭配时人数标题也红：人数够且 combo 在再清
      if (this.data.isDaily || isComboPresent(this.data.combo)) {
        patch.warnPeople = false
      }
    }
    if (this.data.warnCombo && this.data.isDaily && isComboPresent(this.data.combo)) {
      patch.warnCombo = false
    }
    if (this.data.warnSlots && this.data.mealSlots && this.data.mealSlots.length) {
      patch.warnSlots = false
    }
    if (Object.keys(patch).length) this.setData(patch)
  },

  onConfirm() {
    if (this.data.submitting || this.data.liteBusy) return
    tapFeedback('heavy')
    const selected = this.buildSelected()
    const scene = this.buildScene()
    const warnSeason = !selected.length
    const peopleMissing = !(scene.peopleCount >= 1)
    const comboMissing = !isComboPresent(scene.combo)
    const warnCombo = this.data.isDaily && comboMissing
    const warnPeople = peopleMissing || (!this.data.isDaily && comboMissing)
    const warnSlots = !scene.mealSlots || !scene.mealSlots.length

    if (warnSeason || warnPeople || warnCombo || warnSlots) {
      this._flashWarnTitles({
        warnSeason,
        warnPeople,
        warnCombo,
        warnSlots
      })
      if (warnSeason) {
        wx.showToast({ title: '请先选择食材', icon: 'none' })
      } else if (peopleMissing) {
        wx.showToast({ title: '请选择人数', icon: 'none' })
      } else if (comboMissing) {
        wx.showToast({
          title: scene.mealType === 'daily' ? '请选择荤素搭配' : '请设置本场人数',
          icon: 'none'
        })
      } else {
        wx.showToast({
          title:
            this.data.isDaily && this.data.dailySlotMode === 'custom'
              ? '请先选择吃几餐'
              : '请选择几餐',
          icon: 'none'
        })
      }
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
      mealCount: (scene.mealSlots || []).length,
      slotCount: (scene.mealSlots || []).length
    })

    this._pendingSelected = selected
    this._pendingScene = scene

    const user = getUser() || {}
    if (
      shouldShowProfileLite({
        mealType: scene.mealType,
        familyAvoids: user.familyAvoids || [],
        familyAvoidsNone: user.familyAvoidsNone,
        profileLiteSkipped: user.profileLiteSkipped,
        profileLitePromptedAt: user.profileLitePromptedAt
      })
    ) {
      track('profile_lite_show', { source: 'pre_create_sheet' })
      const needCity = !String(user.city || '').trim()
      this.setData({ showProfileLite: true, profileLiteNeedCity: needCity })
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

  onProfileLiteNone(e) {
    if (this.data.liteBusy) return
    tapFeedback('heavy')
    const city = (e && e.detail && e.detail.city) || ''
    this.setData({ liteBusy: true, showProfileLite: false })
    track('profile_lite_none', { source: 'pre_create_sheet' })
    const selected = this._pendingSelected
    const scene = this._pendingScene
    const payload = { action: 'confirmFamilyAvoidsNone' }
    if (city) payload.city = city
    callCloud('profile', payload)
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

  onProfileLiteSave(e) {
    if (this.data.liteBusy) return
    tapFeedback('heavy')
    const detail = (e && e.detail) || {}
    const familyAvoids = detail.familyAvoids || []
    const city = detail.city || ''
    this.setData({ liteBusy: true, showProfileLite: false })
    track('profile_lite_save', {
      source: 'pre_create_sheet',
      avoidCount: familyAvoids.length
    })
    const selected = this._pendingSelected
    const scene = this._pendingScene
    const payload = {
      action: 'saveProfileLite',
      familyAvoids
    }
    if (city) payload.city = city
    callCloud('profile', payload)
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
          const pf = (result && result.planFill) || null
          track('empty_recommend', {
            reasonCode: (result && result.emptyReason) || null,
            action: 'create',
            planFillAction: pf && pf.action,
            planFillBefore: pf && pf.before,
            planFillCount: pf && pf.count,
            planFillTarget: pf && pf.target,
            planFillPool: pf && pf.pool,
            planFillExhausted: !!(pf && pf.exhausted),
            planFillRefills: pf && pf.refills,
            planUnderfilled: !!(pf && pf.underfilled)
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
        if (err && err.error === 'MEAL_COUNT_GATE') {
          const mealSlots = buildDailySlotsByCount(FREE_DAILY_MEAL_MAX)
          this.setData({
            mealSlots,
            dailySlotMode: 'preset',
            dailySlotPresetId: 'count_' + FREE_DAILY_MEAL_MAX,
            customChipLabel: '更多',
            customMealCount: 0
          })
          wx.showToast({ title: '多餐需会员或看广告解锁', icon: 'none' })
          return
        }
        const title = (err && (err.error || err.message)) || '推荐失败'
        wx.showToast({ title: String(title), icon: 'none' })
      })
  },

  onEmptyDialogOk() {
    tapFeedback()
    this.setData({ showEmptyDialog: false })
  }
})
