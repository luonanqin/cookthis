const { ensureLogin, getUser } = require('../../services/session.js')
const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { PEOPLE_RANGE, indexOfValue } = require('../../utils/formRanges.js')
const { tapFeedback } = require('../../utils/haptic.js')

function resolveAvatar(url) {
  return url ? url : '/assets/avatar-default.png'
}

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

Page({
  data: {
    nickname: '',
    avatarSrc: '/assets/avatar-default.png',
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    familyAvoids: [],
    familyAvoidChecked: {},
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    peopleRange: PEOPLE_RANGE,
    defaultPeopleCount: 2,
    peopleIndex: indexOfValue(PEOPLE_RANGE, 2, 1),
    city: '',
    region: [],
    busy: false
  },

  onShow() {
    const cached = getUser()
    if (cached) {
      this.setData({
        nickname: cached.nickname || '',
        avatarSrc: resolveAvatar(cached.avatarUrl)
      })
    }
    ensureLogin()
      .then((user) => {
        this.setData({
          nickname: user.nickname || '',
          avatarSrc: resolveAvatar(user.avatarUrl)
        })
        return this.loadProfile()
      })
      .catch((err) => {
        console.error(err)
        wx.showToast({ title: '登录失败', icon: 'none' })
      })
  },

  loadProfile() {
    return callCloud('profile', { action: 'get' }).then((result) => {
      const p = (result && result.profile) || {}
      const prefs = Object.assign(
        { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
        p.dishFormPrefs || {}
      )
      const people = p.defaultPeopleCount != null ? p.defaultPeopleCount : 2
      const city = p.city || ''
      const familyAvoids = p.familyAvoids || []
      const familyAvoidChecked = {}
      familyAvoids.forEach((id) => {
        familyAvoidChecked[id] = true
      })
      this.setData({
        familyAvoids,
        familyAvoidChecked,
        dishFormPrefs: prefs,
        defaultPeopleCount: people,
        peopleIndex: indexOfValue(PEOPLE_RANGE, people, 1),
        city,
        // 仅持久化市名，无法反查省；picker 初始可不预填，展示文案用 city
        region: [],
        nickname: p.nickname || this.data.nickname,
        avatarSrc: resolveAvatar(p.avatarUrl)
      })
    })
  },

  onToggleAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const familyAvoidChecked = Object.assign({}, this.data.familyAvoidChecked)
    familyAvoidChecked[id] = !familyAvoidChecked[id]
    const familyAvoids = Object.keys(familyAvoidChecked).filter((k) => familyAvoidChecked[k])
    this.setData({ familyAvoidChecked, familyAvoids })
  },

  onFormPref(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.currentTarget.dataset.value
    if (!tag || !value) return
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onPeoplePick(e) {
    const idx = Number(e.detail.value)
    this.setData({
      peopleIndex: idx,
      defaultPeopleCount: PEOPLE_RANGE[idx]
    })
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    const city = region[1] || region[0] || ''
    this.setData({ region, city })
  },

  onSave() {
    if (this.data.busy) return
    tapFeedback('heavy')
    this.setData({ busy: true })
    callCloud('profile', {
      action: 'updateFamily',
      familyAvoids: this.data.familyAvoids,
      dishFormPrefs: this.data.dishFormPrefs,
      defaultPeopleCount: this.data.defaultPeopleCount,
      city: this.data.city || ''
    })
      .then(() => {
        track('profile_update', {
          fields: ['familyAvoids', 'dishFormPrefs', 'defaultPeopleCount', 'city']
        })
        wx.showToast({ title: '已保存', icon: 'success' })
        return ensureLogin()
      })
      .then(() => {
        // 等 toast 可见后再回首页（从首页 navigateTo 进入时可 navigateBack）
        setTimeout(() => {
          const pages = getCurrentPages() || []
          if (pages.length > 1) {
            wx.navigateBack()
          } else {
            wx.reLaunch({ url: '/pages/index/index' })
          }
        }, 500)
      })
      .catch((err) => {
        const code = err && err.error
        const title =
          code === 'UNKNOWN_ACTION'
            ? '云函数过旧，请重新部署 profile'
            : code || '保存失败'
        wx.showToast({ title, icon: 'none' })
        this.setData({ busy: false })
      })
  },

  goAcceptedPlans() {
    tapFeedback()
    wx.navigateTo({ url: '/pages/acceptedPlans/acceptedPlans' })
  },

  goRecord() {
    tapFeedback()
    wx.navigateTo({ url: '/pages/record/record' })
  },

  goOnboarding() {
    tapFeedback()
    // 引导结束会 reLaunch 首页，无需保留「我的」在栈里；也避免栈底半屏遮罩拦截点击
    try {
      const pages = getCurrentPages() || []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (p && p.route === 'pages/index/index' && typeof p.setData === 'function') {
          p.setData({ showConfirm: false, busy: false })
        }
      }
    } catch (e) {}
    wx.redirectTo({ url: '/pages/onboarding/onboarding' })
  }
})
