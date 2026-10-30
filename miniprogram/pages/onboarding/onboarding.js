const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const {
  CUISINE_OPTIONS,
  toggleCuisinePrefer,
  toggleCuisineAvoid
} = require('../../utils/cuisinePrefs.js')
const { COMBO_RANGE, indexOfValue } = require('../../utils/formRanges.js')
const {
  summarizeHousehold,
  AGE_BANDS: AGE_BAND_IDS,
  sanitizeMemberName
} = require('../../utils/members.js')
const { tapFeedback } = require('../../utils/haptic.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

const AVOID_OPTIONS = [
  { id: 'pork', label: '猪肉类' },
  { id: 'seafood', label: '海鲜' },
  { id: 'offal', label: '内脏' },
  { id: 'coriander', label: '香菜' },
  { id: 'peanut', label: '花生' },
  { id: 'dairy', label: '乳制品' }
]

const FORM_OPTIONS = [
  { id: 'hotpot', label: '火锅' },
  { id: 'noodle', label: '面条' },
  { id: 'dumpling', label: '水饺' }
]

const FORM_VALUES = [
  { id: 'prefer', label: '喜欢' },
  { id: 'neutral', label: '无所谓' },
  { id: 'avoid', label: '少来' }
]

const AGE_BANDS = [
  { id: '5_15', label: '5–15' },
  { id: '16_25', label: '16–25' },
  { id: '26_40', label: '26–40' },
  { id: '41_59', label: '41–59' },
  { id: '60_plus', label: '60+' }
]

const AGE_LABEL = {}
AGE_BANDS.forEach((x) => {
  AGE_LABEL[x.id] = x.label
})

const NAME_QUICK_OPTIONS = ['我', '偶', '爸', '妈', '爷', '奶', '公', '婆', '孩']

function nameQuickVisible(name) {
  const cur = String(name || '').trim()
  if (!cur) return NAME_QUICK_OPTIONS.slice()
  return NAME_QUICK_OPTIONS.filter((n) => n !== cur)
}

const TASTES = [
  { id: 'light', label: '清淡' },
  { id: 'normal', label: '适中' },
  { id: 'heavy', label: '偏重' },
  { id: 'spicy', label: '辣' }
]

const TASTE_LABEL = {}
TASTES.forEach((x) => {
  TASTE_LABEL[x.id] = x.label
})

/** 与「我的」画像区块顺序对齐 */
const STEPS = ['家庭成员', '日常搭配', '家庭忌口', '所在城市', '菜系偏好', '菜式偏好']

let _keySeq = 0
function nextKey() {
  _keySeq += 1
  return `m${_keySeq}`
}

function avoidLabelFrom(m) {
  if (m.avoidsNone) return '无'
  const avoids = m.avoids || []
  if (!avoids.length) return '未选'
  return avoids
    .map((id) => {
      const hit = AVOID_OPTIONS.find((o) => o.id === id)
      return hit ? hit.label : id
    })
    .join('、')
}

function decorateMember(m) {
  const ageBand = m.ageBand || ''
  const taste = m.taste || 'normal'
  return Object.assign({}, m, {
    ageLabel: AGE_LABEL[ageBand] || '未选',
    tasteLabel: TASTE_LABEL[taste] || '适中',
    avoidLabel: avoidLabelFrom(m),
    nameQuickOptions: nameQuickVisible(m.name),
    title: String(m.name || '').trim() || '新成员'
  })
}

function blankMember() {
  return decorateMember({
    key: nextKey(),
    name: '',
    ageBand: '',
    taste: 'normal',
    avoids: [],
    avoidChecked: {},
    avoidsNone: false,
    warnFields: {},
    warnPulse: false
  })
}

function memberMissingFields(m) {
  if (!m) return { name: true, age: true, avoids: true }
  return {
    name: !String(m.name || '').trim(),
    age: !AGE_BAND_IDS.includes(m.ageBand),
    avoids: !(m.avoidsNone || (m.avoids && m.avoids.length > 0))
  }
}

function isMemberComplete(m) {
  if (!m) return false
  const miss = memberMissingFields(m)
  return !miss.name && !miss.age && !miss.avoids
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    step: 0,
    steps: STEPS,
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    ageBands: AGE_BANDS,
    tastes: TASTES,
    draftMembers: [],
    expandedKey: '',
    familyAvoids: [],
    familyAvoidChecked: {},
    noneAvoidChecked: false,
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    cuisineOptions: CUISINE_OPTIONS,
    cuisinePrefs: {},
    cuisineOkChecked: false,
    comboRange: COMBO_RANGE,
    householdPreview: '共0人 · 0大 0小 0老',
    meat: 1,
    veg: 1,
    soup: 0,
    meatIndex: indexOfValue(COMBO_RANGE, 1, 1),
    vegIndex: indexOfValue(COMBO_RANGE, 1, 1),
    soupIndex: indexOfValue(COMBO_RANGE, 0, 0),
    city: '',
    region: [],
    busy: false
  },

  onLoad(query) {
    const first = blankMember()
    this.setData({
      busy: false,
      step: 0,
      draftMembers: [first],
      expandedKey: first.key
    })
    this._restart = !!(query && (query.restart === '1' || query.restart === 'true'))
    track('onboarding_start', { restart: !!this._restart })
    track('onboarding_step', { step: 0 })
    this._refreshHouseholdPreview()
  },

  onShow() {
    this.applyTypeScale()
    if (this.data.busy) this.setData({ busy: false })
  },

  _patchMember(key, patch) {
    const draftMembers = (this.data.draftMembers || []).slice()
    const idx = draftMembers.findIndex((m) => m.key === key)
    if (idx < 0) return
    draftMembers[idx] = decorateMember(
      Object.assign({}, draftMembers[idx], patch, { warnFields: {}, warnPulse: false })
    )
    this.setData({ draftMembers })
    this._refreshHouseholdPreview()
  },

  onUnload() {
    this._clearFlashTimers()
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

  _flashWarn(key) {
    this._clearFlashTimers()
    const draftMembers = (this.data.draftMembers || []).slice()
    const idx = draftMembers.findIndex((m) => m.key === key)
    if (idx < 0) return
    const warnFields = memberMissingFields(draftMembers[idx])
    draftMembers[idx] = Object.assign({}, draftMembers[idx], {
      warnFields,
      warnPulse: false
    })
    this.setData({ draftMembers })
    // 下一帧再开动画，保证 class 切换能触发
    this._flashOnTimer = setTimeout(() => {
      this._flashOnTimer = null
      const list = (this.data.draftMembers || []).slice()
      const i = list.findIndex((m) => m.key === key)
      if (i < 0) return
      list[i] = Object.assign({}, list[i], { warnPulse: true })
      this.setData({ draftMembers: list })
    }, 20)
    this._flashOffTimer = setTimeout(() => {
      this._flashOffTimer = null
      const list = (this.data.draftMembers || []).slice()
      const i = list.findIndex((m) => m.key === key)
      if (i < 0) return
      list[i] = Object.assign({}, list[i], { warnFields: {}, warnPulse: false })
      this.setData({ draftMembers: list })
    }, 980)
  },

  /** @returns {boolean} 当前展开卡是否完整 */
  _ensureExpandedComplete() {
    const key = this.data.expandedKey
    if (!key) return true
    const m = (this.data.draftMembers || []).find((x) => x.key === key)
    if (isMemberComplete(m)) return true
    this._flashWarn(key)
    return false
  },

  _ensureAllComplete() {
    const list = this.data.draftMembers || []
    if (!list.length) return false
    for (let i = 0; i < list.length; i++) {
      if (!isMemberComplete(list[i])) {
        this.setData({ expandedKey: list[i].key })
        this._flashWarn(list[i].key)
        return false
      }
    }
    return true
  },

  onExpandMember(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.expandedKey) return
    if (!this._ensureExpandedComplete()) return
    this.setData({ expandedKey: key })
  },

  onAddMember() {
    if (!this._ensureExpandedComplete()) return
    const next = blankMember()
    const draftMembers = (this.data.draftMembers || []).concat([next])
    this.setData({
      draftMembers,
      expandedKey: next.key
    })
    this._refreshHouseholdPreview()
  },

  onRemoveMember(e) {
    const key = e.currentTarget.dataset.key
    const list = this.data.draftMembers || []
    if (list.length <= 1) {
      wx.showToast({ title: '至少保留一位', icon: 'none' })
      return
    }
    const draftMembers = list.filter((m) => m.key !== key)
    // 删掉当前展开卡时不自动展开其它卡，保持全部收起
    const expandedKey =
      this.data.expandedKey === key ? '' : this.data.expandedKey
    this.setData({ draftMembers, expandedKey })
    this._refreshHouseholdPreview()
  },

  onMemberName(e) {
    const key = e.currentTarget.dataset.key
    this._patchMember(key, {
      name: sanitizeMemberName((e.detail && e.detail.value) || '')
    })
  },

  onPickQuickName(e) {
    const key = e.currentTarget.dataset.key
    const name = sanitizeMemberName(e.currentTarget.dataset.name)
    if (!key || !name) return
    this._patchMember(key, { name })
  },

  onPickAge(e) {
    const key = e.currentTarget.dataset.key
    const id = e.currentTarget.dataset.id
    if (!key || !id) return
    this._patchMember(key, { ageBand: id })
  },

  onPickTaste(e) {
    const key = e.currentTarget.dataset.key
    const id = e.currentTarget.dataset.id
    if (!key || !id) return
    this._patchMember(key, { taste: id })
  },

  onToggleMemberAvoid(e) {
    const key = e.currentTarget.dataset.key
    const id = e.currentTarget.dataset.id
    if (!key || !id) return
    const m = (this.data.draftMembers || []).find((x) => x.key === key)
    if (!m) return
    if (id === 'none') {
      const on = !m.avoidsNone
      this._patchMember(key, {
        avoidsNone: on,
        avoidChecked: on ? {} : m.avoidChecked,
        avoids: on ? [] : m.avoids
      })
      return
    }
    const avoidChecked = Object.assign({}, m.avoidChecked || {})
    avoidChecked[id] = !avoidChecked[id]
    const avoids = Object.keys(avoidChecked).filter((k) => avoidChecked[k])
    this._patchMember(key, {
      avoidsNone: false,
      avoidChecked,
      avoids
    })
  },

  onToggleFamilyAvoid(e) {
    const id = e.currentTarget.dataset.id || e.currentTarget.dataset.avoidId
    if (!id) return
    if (id === 'none') {
      const on = !this.data.noneAvoidChecked
      this.setData({
        noneAvoidChecked: on,
        familyAvoidChecked: on ? {} : this.data.familyAvoidChecked,
        familyAvoids: on ? [] : this.data.familyAvoids
      })
      return
    }
    const familyAvoidChecked = Object.assign({}, this.data.familyAvoidChecked)
    familyAvoidChecked[id] = !familyAvoidChecked[id]
    const familyAvoids = Object.keys(familyAvoidChecked).filter((k) => familyAvoidChecked[k])
    this.setData({
      noneAvoidChecked: false,
      familyAvoidChecked,
      familyAvoids
    })
  },

  onFormPrefRadio(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.detail && e.detail.value
    if (!tag || !value) return
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onToggleCuisineOk() {
    const on = !this.data.cuisineOkChecked
    this.setData({
      cuisineOkChecked: on,
      cuisinePrefs: on ? {} : this.data.cuisinePrefs
    })
  },

  onCuisinePrefer(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({
      cuisineOkChecked: false,
      cuisinePrefs: toggleCuisinePrefer(this.data.cuisinePrefs, id)
    })
  },

  onCuisineAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({
      cuisineOkChecked: false,
      cuisinePrefs: toggleCuisineAvoid(this.data.cuisinePrefs, id)
    })
  },

  _refreshHouseholdPreview() {
    const summary = summarizeHousehold(this.data.draftMembers || [])
    this.setData({ householdPreview: summary.label })
  },

  onComboPick(e) {
    const field = e.currentTarget.dataset.field
    const idx = Number(e.detail.value)
    if (!field || idx < 0 || idx >= COMBO_RANGE.length) return
    const indexKey =
      field === 'meat' ? 'meatIndex' : field === 'veg' ? 'vegIndex' : 'soupIndex'
    this.setData({
      [field]: COMBO_RANGE[idx],
      [indexKey]: idx
    })
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    const city = region[1] || region[0] || ''
    this.setData({ region, city })
  },

  onNext() {
    tapFeedback()
    const step = this.data.step
    const last = this.data.steps.length - 1
    if (step === 0) {
      if (!this._ensureAllComplete()) return
    }
    if (step >= last) {
      this.finish()
      return
    }
    const next = step + 1
    if (next === 1) this._refreshHouseholdPreview()
    this.setData({ step: next })
    track('onboarding_step', { step: next })
  },

  onBackStep() {
    if (this.data.step <= 0) return
    tapFeedback()
    const next = this.data.step - 1
    this.setData({ step: next })
    track('onboarding_step', { step: next })
  },

  cloudErrorTitle(err) {
    const code = err && err.error
    if (code === 'UNKNOWN_ACTION') {
      return (err && err.hint) || '请重新部署云函数 profile'
    }
    return code || (err && err.message) || '保存失败'
  },

  /** 跳过当前步骤（不校验本步）；家庭成员步不可跳；末步则按已填内容完成引导 */
  onSkip() {
    if (this.data.busy) return
    const step = this.data.step
    // 第一步家庭成员必填，不可跳过
    if (step <= 0) return
    tapFeedback()
    const last = this.data.steps.length - 1
    if (step >= last) {
      this.finish({ allowPartial: true })
      return
    }
    const next = step + 1
    if (next === 1) this._refreshHouseholdPreview()
    this.setData({ step: next })
    track('onboarding_step', { step: next, skipped: true })
  },

  /**
   * @param {{ allowPartial?: boolean }} [opts]
   * allowPartial：末步点「跳过」——只提交已填完整的成员，不拦回第一步
   */
  finish(opts) {
    if (this.data.busy) return
    const allowPartial = !!(opts && opts.allowPartial)
    if (!allowPartial) {
      if (!this._ensureAllComplete()) {
        this.setData({ step: 0 })
        return
      }
    }
    this.setData({ busy: true })
    const noneAvoid = !!this.data.noneAvoidChecked
    const cuisineOk = !!this.data.cuisineOkChecked
    const rawMembers = this.data.draftMembers || []
    const members = (allowPartial
      ? rawMembers.filter((m) => isMemberComplete(m))
      : rawMembers
    ).map((m) => ({
      name: sanitizeMemberName(m.name).trim(),
      ageBand: m.ageBand,
      taste: m.taste || 'normal',
      avoids: m.avoidsNone ? [] : m.avoids || []
    }))
    // 一路跳过且无有效填写：标完成即可，勿写入默认成员；重走须 reset 保空态
    if (allowPartial && !members.length && !this._hasDraftStance()) {
      callCloud('profile', {
        action: 'skipOnboarding',
        resetProfile: !!this._restart
      })
        .then(() => {
          track('onboarding_done', {
            skipped: true,
            restart: !!this._restart,
            emptySkip: true
          })
          return ensureLogin()
        })
        .then(() => this._leaveOnboardingDone())
        .catch((err) => {
          this.setData({ busy: false })
          wx.showToast({ title: this.cloudErrorTitle(err), icon: 'none' })
        })
      return
    }
    callCloud('profile', {
      action: 'completeOnboarding',
      familyAvoids: noneAvoid ? [] : this.data.familyAvoids,
      familyAvoidsNone: noneAvoid,
      dishFormPrefs: this.data.dishFormPrefs,
      cuisinePrefs: cuisineOk ? {} : this.data.cuisinePrefs,
      cuisinePrefsNoPreference: cuisineOk,
      defaultCombo: {
        meat: this.data.meat,
        veg: this.data.veg,
        soup: this.data.soup
      },
      city: this.data.city || null,
      members
    })
      .then(() => {
        track('onboarding_done', {
          memberCount: members.length,
          partial: allowPartial
        })
        return ensureLogin()
      })
      .then(() => this._leaveOnboardingDone())
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: this.cloudErrorTitle(err), icon: 'none' })
      })
  },

  _hasDraftStance() {
    if (this.data.noneAvoidChecked) return true
    if ((this.data.familyAvoids || []).length) return true
    if (this.data.cuisineOkChecked) return true
    const prefs = this.data.cuisinePrefs || {}
    if (Object.keys(prefs).some((k) => prefs[k] === 'prefer' || prefs[k] === 'avoid')) {
      return true
    }
    if (String(this.data.city || '').trim()) return true
    return false
  },

  _leaveOnboardingDone() {
    const app = getApp()
    if (app) {
      app.globalData.onboardingTipShown = true
      if (app.globalData.user) app.globalData.user.onboardingDone = true
    }
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
