const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')
const {
  CUISINE_OPTIONS,
  toggleCuisinePrefer,
  toggleCuisineAvoid
} = require('../../utils/cuisinePrefs.js')
const { COMBO_RANGE, indexOfValue } = require('../../utils/formRanges.js')
const { ageBandToTier } = require('../../utils/members.js')
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
  { id: '5_15', label: '5–15（小）' },
  { id: '16_25', label: '16–25' },
  { id: '26_40', label: '26–40' },
  { id: '41_59', label: '41–59' },
  { id: '60_plus', label: '60+（老）' }
]

const TASTES = [
  { id: 'light', label: '清淡' },
  { id: 'normal', label: '适中' },
  { id: 'heavy', label: '偏重' },
  { id: 'spicy', label: '辣' }
]

Page({
  behaviors: [typeScaleBehavior],

  data: {
    step: 0,
    steps: ['家庭忌口', '菜式偏好', '菜系偏好', '本人', '日常默认'],
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    ageBands: AGE_BANDS,
    tastes: TASTES,
    familyAvoids: [],
    familyAvoidChecked: {},
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    cuisineOptions: CUISINE_OPTIONS,
    cuisinePrefs: {},
    selfName: '本人',
    selfAgeBand: '26_40',
    selfTaste: 'normal',
    selfAvoids: [],
    selfAvoidChecked: {},
    comboRange: COMBO_RANGE,
    householdPreview: '共1人 · 1大 0小 0老',
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

  onLoad() {
    this.setData({ busy: false, step: 0 })
    track('onboarding_start', {})
    track('onboarding_step', { step: 0 })
  },

  onShow() {
    this.applyTypeScale()
    if (this.data.busy) this.setData({ busy: false })
  },

  onToggleFamilyAvoid(e) {
    const id = e.currentTarget.dataset.avoidId || e.currentTarget.dataset.id
    if (!id) return
    const familyAvoidChecked = Object.assign({}, this.data.familyAvoidChecked)
    familyAvoidChecked[id] = !familyAvoidChecked[id]
    const familyAvoids = Object.keys(familyAvoidChecked).filter((k) => familyAvoidChecked[k])
    this.setData({ familyAvoidChecked, familyAvoids })
  },

  onFormPref(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.currentTarget.dataset.value
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onCuisinePrefer(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ cuisinePrefs: toggleCuisinePrefer(this.data.cuisinePrefs, id) })
  },

  onCuisineAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ cuisinePrefs: toggleCuisineAvoid(this.data.cuisinePrefs, id) })
  },

  onToggleSelfAvoid(e) {
    const id = e.currentTarget.dataset.avoidId || e.currentTarget.dataset.id
    if (!id) return
    const selfAvoidChecked = Object.assign({}, this.data.selfAvoidChecked)
    selfAvoidChecked[id] = !selfAvoidChecked[id]
    const selfAvoids = Object.keys(selfAvoidChecked).filter((k) => selfAvoidChecked[k])
    this.setData({ selfAvoidChecked, selfAvoids })
  },

  onSelfName(e) {
    this.setData({ selfName: e.detail.value || '本人' })
  },

  onPickAge(e) {
    this.setData({ selfAgeBand: e.currentTarget.dataset.id })
    this._refreshHouseholdPreview()
  },

  onPickTaste(e) {
    this.setData({ selfTaste: e.currentTarget.dataset.id })
  },

  _refreshHouseholdPreview() {
    const tier = ageBandToTier(this.data.selfAgeBand) || 'adult'
    const counts = { adult: 0, child: 0, elder: 0 }
    counts[tier] = 1
    this.setData({
      householdPreview: `共1人 · ${counts.adult}大 ${counts.child}小 ${counts.elder}老`
    })
  },

  onMeatPick(e) {
    const idx = Number(e.detail.value)
    this.setData({ meatIndex: idx, meat: COMBO_RANGE[idx] })
  },

  onVegPick(e) {
    const idx = Number(e.detail.value)
    this.setData({ vegIndex: idx, veg: COMBO_RANGE[idx] })
  },

  onSoupPick(e) {
    const idx = Number(e.detail.value)
    this.setData({ soupIndex: idx, soup: COMBO_RANGE[idx] })
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    // 取市级（第二级）；直辖市时第二级仍是市辖区名，第一级是市名——取「市」一级：
    // region = [省, 市, 区]。市一级用 region[1]；若只有两级则仍取 [1]。
    const city = region[1] || region[0] || ''
    this.setData({ region, city })
  },

  onNext() {
    tapFeedback()
    const step = this.data.step
    if (step >= 4) {
      this.finish()
      return
    }
    const next = step + 1
    if (next === 3) this._refreshHouseholdPreview()
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

  onSkip() {
    if (this.data.busy) return
    tapFeedback()
    this.setData({ busy: true })
    callCloud('profile', { action: 'skipOnboarding' })
      .then(() => {
        track('onboarding_done', { skipped: true })
        return ensureLogin()
      })
      .then(() => {
        const app = getApp()
        if (app) {
          app.globalData.onboardingTipShown = true
          if (app.globalData.user) app.globalData.user.onboardingDone = true
        }
        wx.reLaunch({ url: '/pages/index/index' })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: this.cloudErrorTitle(err) || '跳过失败', icon: 'none' })
      })
  },

  finish() {
    if (this.data.busy) return
    this.setData({ busy: true })
    callCloud('profile', {
      action: 'completeOnboarding',
      familyAvoids: this.data.familyAvoids,
      dishFormPrefs: this.data.dishFormPrefs,
      cuisinePrefs: this.data.cuisinePrefs,
      defaultCombo: {
        meat: this.data.meat,
        veg: this.data.veg,
        soup: this.data.soup
      },
      city: this.data.city || null,
      selfMember: {
        name: this.data.selfName,
        ageBand: this.data.selfAgeBand,
        taste: this.data.selfTaste,
        avoids: this.data.selfAvoids
      }
    })
      .then(() => {
        track('onboarding_done', {})
        return ensureLogin()
      })
      .then(() => {
        const app = getApp()
        if (app) {
          app.globalData.onboardingTipShown = true
          if (app.globalData.user) app.globalData.user.onboardingDone = true
        }
        wx.reLaunch({ url: '/pages/index/index' })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: this.cloudErrorTitle(err), icon: 'none' })
      })
  }
})
