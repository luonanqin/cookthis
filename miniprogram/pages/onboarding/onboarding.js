const { callCloud } = require('../../services/cloud.js')
const { ensureLogin } = require('../../services/session.js')
const { track } = require('../../utils/track.js')

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
  { id: '16_25', label: '16–25' },
  { id: '26_40', label: '26–40' },
  { id: '41_60', label: '41–60' },
  { id: '60_plus', label: '60+' }
]

const TASTES = [
  { id: 'light', label: '清淡' },
  { id: 'normal', label: '适中' },
  { id: 'heavy', label: '偏重' },
  { id: 'spicy', label: '辣' }
]

Page({
  data: {
    step: 0,
    steps: ['家庭忌口', '菜式偏好', '本人', '日常默认'],
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    ageBands: AGE_BANDS,
    tastes: TASTES,
    familyAvoids: [],
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    selfName: '本人',
    selfAgeBand: '26_40',
    selfTaste: 'normal',
    selfAvoids: [],
    defaultPeopleCount: 2,
    meat: 1,
    veg: 1,
    soup: 0,
    city: '',
    busy: false
  },

  onLoad() {
    track('onboarding_start', {})
    track('onboarding_step', { step: 0 })
  },

  onToggleFamilyAvoid(e) {
    const id = e.currentTarget.dataset.id
    const set = new Set(this.data.familyAvoids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    this.setData({ familyAvoids: Array.from(set) })
  },

  onFormPref(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.currentTarget.dataset.value
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onToggleSelfAvoid(e) {
    const id = e.currentTarget.dataset.id
    const set = new Set(this.data.selfAvoids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    this.setData({ selfAvoids: Array.from(set) })
  },

  onSelfName(e) {
    this.setData({ selfName: e.detail.value || '本人' })
  },

  onPickAge(e) {
    this.setData({ selfAgeBand: e.currentTarget.dataset.id })
  },

  onPickTaste(e) {
    this.setData({ selfTaste: e.currentTarget.dataset.id })
  },

  onPeople(e) {
    const n = Number(e.detail.value)
    this.setData({ defaultPeopleCount: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2 })
  },

  onMeat(e) {
    this.setData({ meat: Number(e.detail.value) || 0 })
  },

  onVeg(e) {
    this.setData({ veg: Number(e.detail.value) || 0 })
  },

  onSoup(e) {
    this.setData({ soup: Number(e.detail.value) || 0 })
  },

  onCity(e) {
    this.setData({ city: e.detail.value || '' })
  },

  onNext() {
    const step = this.data.step
    if (step >= 3) {
      this.finish()
      return
    }
    const next = step + 1
    this.setData({ step: next })
    track('onboarding_step', { step: next })
  },

  onBackStep() {
    if (this.data.step <= 0) return
    const next = this.data.step - 1
    this.setData({ step: next })
    track('onboarding_step', { step: next })
  },

  finish() {
    if (this.data.busy) return
    this.setData({ busy: true })
    callCloud('profile', {
      action: 'completeOnboarding',
      familyAvoids: this.data.familyAvoids,
      dishFormPrefs: this.data.dishFormPrefs,
      defaultPeopleCount: this.data.defaultPeopleCount,
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
        wx.reLaunch({ url: '/pages/index/index' })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: (err && err.error) || '保存失败', icon: 'none' })
      })
  }
})
