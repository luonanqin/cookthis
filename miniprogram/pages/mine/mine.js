const { ensureLogin, getUser, patchUser } = require('../../services/session.js')
const { callCloud } = require('../../services/cloud.js')
const { track } = require('../../utils/track.js')
const { tapFeedback } = require('../../utils/haptic.js')
const {
  CUISINE_OPTIONS,
  toggleCuisinePrefer,
  toggleCuisineAvoid
} = require('../../utils/cuisinePrefs.js')
const {
  AGE_BANDS,
  summarizeHousehold,
  normalizeAgeBand
} = require('../../utils/members.js')
const { computeProfileGaps } = require('../../utils/profileGaps.js')

function resolveAvatar(url) {
  return url ? url : '/assets/avatar-default.png'
}

function buildReminderItems(gaps) {
  const map = {
    family_avoids: {
      id: 'family_avoids',
      text: '还没填家庭忌口（或确认无忌口）',
      anchor: 'secAvoids'
    },
    members: {
      id: 'members',
      text: '添加至少一位家人（含本人）',
      anchor: 'secMembers'
    },
    city: {
      id: 'city',
      text: '选择城市，匹配当地常见食材',
      anchor: 'secCity'
    },
    cuisine: {
      id: 'cuisine',
      text: '选一下菜系偏好，或点暂无偏好',
      anchor: 'secCuisine'
    }
  }
  return (gaps.gaps || []).map((id) => map[id]).filter(Boolean)
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

const AGE_BAND_OPTIONS = [
  { id: '5_15', label: '5–15（小）' },
  { id: '16_25', label: '16–25' },
  { id: '26_40', label: '26–40' },
  { id: '41_59', label: '41–59' },
  { id: '60_plus', label: '60+（老）' }
]

const TASTE_OPTIONS = [
  { id: 'light', label: '清淡' },
  { id: 'normal', label: '适中' },
  { id: 'heavy', label: '偏重' },
  { id: 'spicy', label: '辣' }
]

const AGE_LABEL = {}
AGE_BAND_OPTIONS.forEach((x) => {
  AGE_LABEL[x.id] = x.label
})
const TASTE_LABEL = {}
TASTE_OPTIONS.forEach((x) => {
  TASTE_LABEL[x.id] = x.label
})

function profileViewFromUser(user) {
  const p = user || {}
  const prefs = Object.assign(
    { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    p.dishFormPrefs || {}
  )
  const familyAvoids = p.familyAvoids || []
  const familyAvoidChecked = {}
  familyAvoids.forEach((id) => {
    familyAvoidChecked[id] = true
  })
  const members = shapeMembers(p.members || [])
  const summary = summarizeHousehold(members)
  return {
    familyAvoids,
    familyAvoidChecked,
    familyAvoidsNone: !!p.familyAvoidsNone,
    familyAvoidsConfirmedAt: p.familyAvoidsConfirmedAt || null,
    dishFormPrefs: prefs,
    cuisinePrefs: p.cuisinePrefs || {},
    cuisinePrefsConfirmedAt: p.cuisinePrefsConfirmedAt || null,
    city: p.city || '',
    region: [],
    nickname: p.nickname || '',
    avatarSrc: resolveAvatar(p.avatarUrl),
    members,
    householdLabel: summary.label
  }
}

function shapeMembers(list) {
  return (list || []).map((m) => {
    const ageBand = normalizeAgeBand(m.ageBand) || '26_40'
    const avoids = m.avoids || []
    return {
      memberId: m.memberId,
      name: m.name || '',
      ageBand,
      taste: m.taste || 'normal',
      avoids,
      ageLabel: AGE_LABEL[ageBand] || ageBand,
      tasteLabel: TASTE_LABEL[m.taste] || m.taste || '适中',
      avoidLabel: avoids.length
        ? avoids
            .map((id) => {
              const hit = AVOID_OPTIONS.find((o) => o.id === id)
              return hit ? hit.label : id
            })
            .join('、')
        : '无'
    }
  })
}

Page({
  data: {
    nickname: '',
    avatarSrc: '/assets/avatar-default.png',
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    familyAvoids: [],
    familyAvoidChecked: {},
    familyAvoidsNone: false,
    familyAvoidsConfirmedAt: null,
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    cuisineOptions: CUISINE_OPTIONS,
    cuisinePrefs: {},
    cuisinePrefsConfirmedAt: null,
    city: '',
    region: [],
    busy: false,
    members: [],
    householdLabel: '共0人 · 0大 0小 0老',
    ageBandOptions: AGE_BAND_OPTIONS,
    tasteOptions: TASTE_OPTIONS,
    showMemberEditor: false,
    editingMemberId: '',
    editName: '',
    editAgeBand: '26_40',
    editTaste: 'normal',
    editAvoidChecked: {},
    reminderItems: []
  },

  applyProfile(user, opts) {
    const view = profileViewFromUser(user)
    const gaps = computeProfileGaps({
      familyAvoids: view.familyAvoids,
      familyAvoidsNone: view.familyAvoidsNone,
      membersCount: (view.members || []).length,
      city: view.city,
      cuisinePrefs: view.cuisinePrefs,
      cuisinePrefsConfirmedAt: view.cuisinePrefsConfirmedAt
    })
    const reminderItems = buildReminderItems(gaps)
    this.setData(Object.assign({}, view, { reminderItems }))
    if (opts && opts.trackShow && reminderItems.length) {
      track('profile_reminder_show', { surface: 'mine', gaps: gaps.gaps })
    }
  },

  onShow() {
    // auth 已带 members：本地缓存立刻上屏，无需再打 profile.get
    const cached = getUser()
    if (cached) this.applyProfile(cached)

    ensureLogin()
      .then((user) => {
        this.applyProfile(user, { trackShow: true })
      })
      .catch((err) => {
        console.error(err)
        if (!cached) wx.showToast({ title: '登录失败', icon: 'none' })
      })
  },

  /** 成员增删改后刷新：走 auth 带回最新 members */
  refreshFromAuth() {
    return ensureLogin().then((user) => {
      this.applyProfile(user)
    })
  },

  onReminderTap(e) {
    const anchor = e.currentTarget.dataset.anchor
    if (!anchor) return
    const query = wx.createSelectorQuery()
    query.select('#' + anchor).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      const rect = res && res[0]
      const viewport = res && res[1]
      if (!rect || !viewport) return
      wx.pageScrollTo({
        scrollTop: Math.max(0, viewport.scrollTop + rect.top - 24),
        duration: 280
      })
    })
  },

  onConfirmNoAvoids() {
    tapFeedback()
    callCloud('profile', { action: 'confirmFamilyAvoidsNone' })
      .then(() => {
        track('profile_lite_quick_none', { source: 'mine' })
        return this.refreshFromAuth()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.error) || '操作失败', icon: 'none' })
      })
  },

  onConfirmNoCuisine() {
    tapFeedback()
    callCloud('profile', { action: 'confirmCuisineNoPreference' })
      .then(() => {
        track('cuisine_prefs_no_preference', { source: 'mine' })
        return this.refreshFromAuth()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.error) || '操作失败', icon: 'none' })
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

  onRegionChange(e) {
    const region = e.detail.value || []
    const city = region[1] || region[0] || ''
    this.setData({ region, city })
  },

  openAddMember() {
    this.setData({
      showMemberEditor: true,
      editingMemberId: '',
      editName: '',
      editAgeBand: '26_40',
      editTaste: 'normal',
      editAvoidChecked: {}
    })
  },

  openEditMember(e) {
    const id = e.currentTarget.dataset.id
    const m = (this.data.members || []).find((x) => x.memberId === id)
    if (!m) return
    const editAvoidChecked = {}
    ;(m.avoids || []).forEach((a) => {
      editAvoidChecked[a] = true
    })
    this.setData({
      showMemberEditor: true,
      editingMemberId: m.memberId,
      editName: m.name,
      editAgeBand: m.ageBand,
      editTaste: m.taste,
      editAvoidChecked
    })
  },

  closeMemberEditor() {
    this.setData({ showMemberEditor: false })
  },

  onEditName(e) {
    this.setData({ editName: (e.detail && e.detail.value) || '' })
  },

  onEditAge(e) {
    const id = e.currentTarget.dataset.id
    if (AGE_BANDS.includes(id)) this.setData({ editAgeBand: id })
  },

  onEditTaste(e) {
    const id = e.currentTarget.dataset.id
    if (id) this.setData({ editTaste: id })
  },

  onEditAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const editAvoidChecked = Object.assign({}, this.data.editAvoidChecked)
    editAvoidChecked[id] = !editAvoidChecked[id]
    this.setData({ editAvoidChecked })
  },

  saveMember() {
    const name = String(this.data.editName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写称呼', icon: 'none' })
      return
    }
    const avoids = Object.keys(this.data.editAvoidChecked || {}).filter(
      (k) => this.data.editAvoidChecked[k]
    )
    const editingMemberId = this.data.editingMemberId
    const payload = editingMemberId
      ? {
          action: 'updateMember',
          memberId: editingMemberId,
          name,
          ageBand: this.data.editAgeBand,
          taste: this.data.editTaste,
          avoids
        }
      : {
          action: 'addMember',
          name,
          ageBand: this.data.editAgeBand,
          taste: this.data.editTaste,
          avoids
        }
    tapFeedback()
    callCloud('profile', payload)
      .then(() => {
        track(editingMemberId ? 'member_update' : 'member_add', {})
        this.setData({ showMemberEditor: false })
        return this.refreshFromAuth()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.error) || '保存失败', icon: 'none' })
      })
  },

  removeMember(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const self = this
    wx.showModal({
      title: '删除家人',
      content: '确定删除这位家人吗？',
      success(res) {
        if (!res.confirm) return
        callCloud('profile', { action: 'removeMember', memberId: id })
          .then(() => {
            track('member_remove', {})
            return self.refreshFromAuth()
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.error) || '删除失败', icon: 'none' })
          })
      }
    })
  },

  onSave() {
    if (this.data.busy) return
    tapFeedback('heavy')
    this.setData({ busy: true })
    const patch = {
      familyAvoids: this.data.familyAvoids,
      dishFormPrefs: this.data.dishFormPrefs,
      cuisinePrefs: this.data.cuisinePrefs,
      city: this.data.city || ''
    }
    callCloud('profile', Object.assign({ action: 'updateFamily' }, patch))
      .then(() => {
        patchUser(patch)
        track('profile_update', {
          fields: ['familyAvoids', 'dishFormPrefs', 'cuisinePrefs', 'city']
        })
        wx.showToast({ title: '已保存', icon: 'success' })
        return ensureLogin()
      })
      .then((user) => {
        this.applyProfile(user)
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

  goOnboarding() {
    tapFeedback()
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
