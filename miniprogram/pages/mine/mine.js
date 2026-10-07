const { ensureLogin, getUser } = require('../../services/session.js')
const { callCloud } = require('../../services/cloud.js')

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
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    defaultPeopleCount: 2,
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
      this.setData({
        familyAvoids: p.familyAvoids || [],
        dishFormPrefs: prefs,
        defaultPeopleCount: p.defaultPeopleCount ?? 2,
        nickname: p.nickname || this.data.nickname,
        avatarSrc: resolveAvatar(p.avatarUrl)
      })
    })
  },

  onToggleAvoid(e) {
    const id = e.currentTarget.dataset.id
    const set = new Set(this.data.familyAvoids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    this.setData({ familyAvoids: Array.from(set) })
  },

  onFormPref(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.currentTarget.dataset.value
    if (!tag || !value) return
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onPeopleInput(e) {
    const n = Number(e.detail.value)
    this.setData({ defaultPeopleCount: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2 })
  },

  onSave() {
    if (this.data.busy) return
    this.setData({ busy: true })
    callCloud('profile', {
      action: 'updateFamily',
      familyAvoids: this.data.familyAvoids,
      dishFormPrefs: this.data.dishFormPrefs,
      defaultPeopleCount: this.data.defaultPeopleCount
    })
      .then(() => {
        wx.showToast({ title: '已保存', icon: 'success' })
        return ensureLogin()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.error) || '保存失败', icon: 'none' })
      })
      .then(() => this.setData({ busy: false }))
  }
})
