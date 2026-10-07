const { callCloud } = require('../../services/cloud.js')
const { getUser } = require('../../services/session.js')
const { suggestComboByPeople } = require('../../utils/suggestCombo.js')
const { filterHolidays } = require('../../utils/filterHolidays.js')
const { track } = require('../../utils/track.js')
const { recognizeOnce, stopRecognize } = require('../../utils/voice.js')
const { parseFoodNames } = require('../../utils/parseFoodNames.js')
const holidaysPack = require('../../data/holidays.json')

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
  { id: 'family_party', label: '家庭聚餐' },
  { id: 'friends_party', label: '朋友聚会' },
  { id: 'holiday_party', label: '节日聚餐' }
]

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
    id: 'two_dinner',
    label: '两顿晚饭',
    slots: [
      { meal: 'dinner', label: '晚饭①' },
      { meal: 'dinner', label: '晚饭②' }
    ]
  },
  {
    id: 'one_lunch',
    label: '一顿午饭',
    slots: [{ meal: 'lunch', label: '午饭①' }]
  },
  {
    id: 'lunch_dinner',
    label: '午+晚',
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

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

Page({
  data: {
    loading: true,
    error: '',
    submitting: false,
    seasonal: [],
    yearRound: [],
    seasonalGroups: [],
    seasonalChecked: {},
    yearRoundChecked: {},
    yearRoundExpanded: false,
    manuals: [],
    manualInput: '',
    count: 0,
    yearRoundCount: 0,
    voiceListening: false,
    showVoiceConfirm: false,
    voiceCandidates: [],
    voiceSelected: {},
    voiceTranscript: '',

    mealTypeOptions: MEAL_TYPE_OPTIONS,
    mealType: 'daily',
    isDaily: true,
    isHoliday: false,
    peopleCount: 2,
    peopleCountText: '2',
    combo: { meat: 1, veg: 1, soup: 0 },
    dailySlotPresets: DAILY_SLOT_PRESETS,
    dailySlotPresetId: 'one_dinner',
    mealSlots: DAILY_SLOT_PRESETS[0].slots,
    partySlotCount: 1,
    partyAvoidOptions: PARTY_AVOID_OPTIONS,
    partyAvoidChecked: {},
    upcomingHolidays: [],
    holidayId: '',
    holidayDate: ''
  },

  onLoad() {
    this._initSceneFromSession()
    this.loadList()
  },

  _initSceneFromSession() {
    const user = getUser() || {}
    const peopleCount = user.defaultPeopleCount != null ? Number(user.defaultPeopleCount) : 2
    const combo = cloneCombo(user.defaultCombo) || { meat: 1, veg: 1, soup: 0 }
    const upcomingHolidays = filterHolidays(holidaysPack.items || [], todayStr(), 30)
    this.setData({
      mealType: 'daily',
      isDaily: true,
      isHoliday: false,
      peopleCount,
      peopleCountText: String(peopleCount),
      combo,
      dailySlotPresetId: 'one_dinner',
      mealSlots: DAILY_SLOT_PRESETS[0].slots.map(s => Object.assign({}, s)),
      partySlotCount: 1,
      partyAvoidChecked: {},
      upcomingHolidays,
      holidayId: '',
      holidayDate: ''
    })
  },

  loadList() {
    this.setData({ loading: true, error: '' })
    const user = getUser() || {}
    const familyAvoids = user.familyAvoids || []
    callCloud('ingredients', {})
      .then(res => {
        const seasonal = res.seasonal || []
        const yearRound = res.yearRound || []
        const seasonalChecked = {}
        seasonal.forEach(it => {
          seasonalChecked[it.id] = true
        })
        const yearRoundChecked = defaultYearRoundChecked(yearRound, familyAvoids)
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

  _knownIngredientNames() {
    const names = []
    for (const it of this.data.seasonal || []) {
      if (it && it.name) names.push(it.name)
    }
    for (const it of this.data.yearRound || []) {
      if (it && it.name) names.push(it.name)
    }
    return names
  },

  onVoiceAdd() {
    if (this.data.voiceListening || this.data.submitting) return
    track('ingredient_voice_start', {})
    this.setData({ voiceListening: true })
    wx.showToast({ title: '请说出菜名…', icon: 'none', duration: 2000 })
    recognizeOnce({ duration: 12000 })
      .then((text) => {
        const names = parseFoodNames(text, {
          knownNames: this._knownIngredientNames()
        })
        track('ingredient_voice_result', {
          success: names.length > 0,
          count: names.length
        })
        if (!names.length) {
          this.setData({ voiceListening: false })
          wx.showToast({ title: '没听清菜名', icon: 'none' })
          return
        }
        const voiceSelected = {}
        names.forEach((n) => {
          voiceSelected[n] = true
        })
        this.setData({
          voiceListening: false,
          showVoiceConfirm: true,
          voiceTranscript: text,
          voiceCandidates: names,
          voiceSelected
        })
      })
      .catch((err) => {
        this.setData({ voiceListening: false })
        track('ingredient_voice_result', { success: false, count: 0 })
        const code = err && err.error
        let title = '语音失败'
        if (code === 'VOICE_PLUGIN_UNAVAILABLE') title = '请先开通同声传译插件'
        if (code === 'VOICE_EMPTY') title = '没听清，请再说一次'
        wx.showToast({ title, icon: 'none' })
      })
  },

  onToggleVoiceCandidate(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const voiceSelected = Object.assign({}, this.data.voiceSelected)
    voiceSelected[name] = !voiceSelected[name]
    this.setData({ voiceSelected })
  },

  onVoiceSheetCancel() {
    this.setData({
      showVoiceConfirm: false,
      voiceCandidates: [],
      voiceTranscript: ''
    })
  },

  onVoiceSheetConfirm() {
    const picked = this.data.voiceCandidates.filter((n) => this.data.voiceSelected[n])
    if (!picked.length) {
      wx.showToast({ title: '请至少选一项', icon: 'none' })
      return
    }

    const seasonalChecked = Object.assign({}, this.data.seasonalChecked)
    const yearRoundChecked = Object.assign({}, this.data.yearRoundChecked)
    let manuals = this.data.manuals.slice()
    const seasonalByName = new Map((this.data.seasonal || []).map((x) => [x.name, x]))
    const yearRoundByName = new Map((this.data.yearRound || []).map((x) => [x.name, x]))
    const existingManual = new Set(manuals.map((m) => m.name))

    for (const name of picked) {
      if (seasonalByName.has(name)) {
        seasonalChecked[seasonalByName.get(name).id] = true
        continue
      }
      if (yearRoundByName.has(name)) {
        yearRoundChecked[yearRoundByName.get(name).id] = true
        continue
      }
      if (!existingManual.has(name)) {
        manuals.push({
          id: 'voice_' + Date.now() + '_' + manuals.length,
          name,
          source: 'voice'
        })
        existingManual.add(name)
      }
    }

    this.setData({
      showVoiceConfirm: false,
      voiceCandidates: [],
      voiceTranscript: '',
      seasonalChecked,
      yearRoundChecked,
      manuals,
      ...this._counts(seasonalChecked, yearRoundChecked, manuals)
    })
    wx.showToast({ title: '已加入', icon: 'success' })
  },

  onMealTypeTap(e) {
    const mealType = e.currentTarget.dataset.id
    if (!mealType || mealType === this.data.mealType) return
    const isDaily = mealType === 'daily'
    const isHoliday = mealType === 'holiday_party'
    const user = getUser() || {}
    const patch = {
      mealType,
      isDaily,
      isHoliday
    }
    if (isDaily) {
      const peopleCount = user.defaultPeopleCount != null ? Number(user.defaultPeopleCount) : 2
      patch.peopleCount = peopleCount
      patch.peopleCountText = String(peopleCount)
      patch.combo = cloneCombo(user.defaultCombo) || { meat: 1, veg: 1, soup: 0 }
      patch.dailySlotPresetId = 'one_dinner'
      patch.mealSlots = DAILY_SLOT_PRESETS[0].slots.map(s => Object.assign({}, s))
      patch.partyAvoidChecked = {}
      patch.holidayId = ''
      patch.holidayDate = ''
    } else {
      patch.peopleCount = null
      patch.peopleCountText = ''
      patch.combo = null
      patch.partySlotCount = 1
      patch.mealSlots = buildPartySlots(1)
      patch.partyAvoidChecked = {}
      if (!isHoliday) {
        patch.holidayId = ''
        patch.holidayDate = ''
      }
    }
    this.setData(patch)
  },

  onPeopleInput(e) {
    const text = (e.detail.value || '').trim()
    const n = parseInt(text, 10)
    const patch = { peopleCountText: text }
    if (!Number.isFinite(n) || n < 1) {
      patch.peopleCount = null
      if (!this.data.isDaily) patch.combo = null
      this.setData(patch)
      return
    }
    patch.peopleCount = n
    if (!this.data.isDaily) {
      const suggested = suggestComboByPeople(n)
      if (suggested) patch.combo = suggested
    }
    this.setData(patch)
  },

  bumpCombo(e) {
    const field = e.currentTarget.dataset.field
    const delta = Number(e.currentTarget.dataset.delta) || 0
    if (!field || !delta) return
    const base = this.data.combo || { meat: 0, veg: 0, soup: 0 }
    const next = cloneCombo(base)
    next[field] = Math.max(0, (Number(next[field]) || 0) + delta)
    this.setData({ combo: next })
  },

  onDailySlotPreset(e) {
    const id = e.currentTarget.dataset.id
    const preset = DAILY_SLOT_PRESETS.find(p => p.id === id)
    if (!preset) return
    this.setData({
      dailySlotPresetId: id,
      mealSlots: preset.slots.map(s => Object.assign({}, s))
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
      holidayDate
    } = this.data
    const scene = {
      mealType,
      peopleCount: peopleCount == null ? null : Number(peopleCount),
      combo: cloneCombo(combo),
      mealSlots: (mealSlots || []).map(s => ({ meal: s.meal, label: s.label })),
      persistComboToDefault: false
    }
    if (isDaily) {
      scene.partyAvoids = null
      scene.holidayId = null
      scene.holidayDate = null
    } else {
      scene.partyAvoids = Object.keys(partyAvoidChecked || {}).filter(k => partyAvoidChecked[k])
      if (mealType === 'holiday_party') {
        scene.holidayId = holidayId || null
        scene.holidayDate = holidayDate || null
      } else {
        scene.holidayId = null
        scene.holidayDate = null
      }
    }
    return scene
  },

  onConfirm() {
    if (this.data.submitting) return
    const selected = this.buildSelected()
    if (!selected.length) {
      wx.showToast({ title: '请先选择食材', icon: 'none' })
      return
    }
    const scene = this.buildScene()
    if (!isComboPresent(scene.combo)) {
      wx.showToast({ title: '请填写荤素汤搭配', icon: 'none' })
      return
    }
    if (!scene.mealSlots || !scene.mealSlots.length) {
      wx.showToast({ title: '请选择几顿', icon: 'none' })
      return
    }
    if (scene.mealType !== 'daily' && typeof scene.peopleCount !== 'number') {
      wx.showToast({ title: '请填写人数', icon: 'none' })
      return
    }
    if (scene.mealType === 'holiday_party' && (!scene.holidayId || !scene.holidayDate)) {
      wx.showToast({ title: '请选择节日', icon: 'none' })
      return
    }

    const methodsUsed = ['default_list']
    if (this.data.manuals.some((m) => m.source === 'manual')) methodsUsed.push('manual')
    if (this.data.manuals.some((m) => m.source === 'voice')) methodsUsed.push('voice')
    wx.setStorageSync(STORAGE_KEY, { selected, methodsUsed, scene })
    track('ingredient_confirm', {
      selectedCount: selected.length,
      methodsUsed,
      mealType: scene.mealType,
      people: scene.peopleCount,
      combo: scene.combo
    })

    this.setData({ submitting: true })
    callCloud('recommend', { action: 'create', selected, scene })
      .then(result => {
        this.setData({ submitting: false })
        if (result && result.emptyReason) {
          wx.showToast({ title: result.emptyReason, icon: 'none' })
        }
        wx.setStorageSync(RECOMMEND_KEY, Object.assign({}, result, { scene }))
        wx.navigateTo({ url: '/pages/recommend/recommend' })
      })
      .catch(err => {
        console.error(err)
        this.setData({ submitting: false })
        const title = (err && (err.error || err.message)) || '推荐失败'
        wx.showToast({ title: String(title), icon: 'none' })
      })
  }
})
