const { ensureLogin, getUser, patchUser } = require('../../services/session.js')
const { callCloud } = require('../../services/cloud.js')
const {
  clearShelfCache,
  prefetchCatalog
} = require('../../services/catalogCache.js')
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
  normalizeAgeBand,
  sanitizeMemberName
} = require('../../utils/members.js')
const { COMBO_RANGE, indexOfValue } = require('../../utils/formRanges.js')
const { computeProfileGaps } = require('../../utils/profileGaps.js')
const { retakeLinkLabel } = require('../../utils/cookSkillRetake.js')
const typeScaleBehavior = require('../../behaviors/typeScale.js')

function resolveAvatar(url) {
  return url ? url : '/assets/avatar-default.png'
}

function normalizeDefaultCombo(combo) {
  const c = combo || {}
  const meat = Number(c.meat)
  const veg = Number(c.veg)
  const soup = Number(c.soup)
  const out = {
    meat: Number.isFinite(meat) ? meat : 1,
    veg: Number.isFinite(veg) ? veg : 1,
    soup: Number.isFinite(soup) ? soup : 0
  }
  if (out.meat + out.veg + out.soup <= 0) {
    return { meat: 1, veg: 1, soup: 0 }
  }
  return out
}

const { AVOID_OPTIONS } = require('../../utils/avoidOptions.js')

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
  { id: '5_15', label: '5–15' },
  { id: '16_25', label: '16–25' },
  { id: '26_40', label: '26–40' },
  { id: '41_59', label: '41–59' },
  { id: '60_plus', label: '60+' }
]

const NAME_QUICK_OPTIONS = ['我', '偶', '爸', '妈', '爷', '奶', '公', '婆', '孩']

function nameQuickVisible(editName) {
  const cur = String(editName || '').trim()
  if (!cur) return NAME_QUICK_OPTIONS.slice()
  return NAME_QUICK_OPTIONS.filter((n) => n !== cur)
}

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

function hasCuisinePreferOrAvoid(prefs) {
  const p = prefs || {}
  return Object.keys(p).some((k) => p[k] === 'prefer' || p[k] === 'avoid')
}

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
  const cuisinePrefs = p.cuisinePrefs || {}
  const cuisinePrefsConfirmedAt = p.cuisinePrefsConfirmedAt || null
  // 「都还行」= 已表态且无任何喜欢/不喜欢
  const cuisineOkChecked =
    !!cuisinePrefsConfirmedAt && !hasCuisinePreferOrAvoid(cuisinePrefs)
  const members = shapeMembers(p.members || [])
  const summary = summarizeHousehold(members)
  const defaultCombo = normalizeDefaultCombo(p.defaultCombo)
  return {
    familyAvoids,
    familyAvoidChecked,
    familyAvoidsNone: !!p.familyAvoidsNone,
    noneAvoidChecked: !!p.familyAvoidsNone,
    familyAvoidsConfirmedAt: p.familyAvoidsConfirmedAt || null,
    dishFormPrefs: prefs,
    cuisinePrefs,
    cuisinePrefsConfirmedAt,
    cuisineOkChecked,
    defaultCombo,
    meatIndex: indexOfValue(COMBO_RANGE, defaultCombo.meat, 1),
    vegIndex: indexOfValue(COMBO_RANGE, defaultCombo.veg, 1),
    soupIndex: indexOfValue(COMBO_RANGE, defaultCombo.soup, 0),
    city: p.city || '',
    region: [],
    cookSkillRetakeLabel: retakeLinkLabel(p.cookSkill),
    nickname: p.nickname || '',
    avatarSrc: resolveAvatar(p.avatarUrl),
    members,
    householdLabel: summary.label
  }
}

function formatAvoidDisplay(avoids) {
  const labels = (avoids || [])
    .map((id) => {
      const hit = AVOID_OPTIONS.find((o) => o.id === id)
      return hit ? hit.label : id
    })
    .filter(Boolean)
  if (!labels.length) return '无忌口'
  if (labels.length <= 2) return labels.join('、')
  return labels.slice(0, 2).join('、') + '…'
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
      avoidLabel: formatAvoidDisplay(avoids)
    }
  })
}

/** 与首页小红点同一套缺口：区块标题标红，填完即消 */
function gapMarksFromState(state) {
  const s = state || {}
  const gaps = computeProfileGaps({
    familyAvoids: s.familyAvoids || [],
    familyAvoidsNone: !!(s.noneAvoidChecked || s.familyAvoidsNone),
    membersCount: (s.members || []).length,
    city: s.city || '',
    cuisinePrefs: s.cuisinePrefs || {},
    cuisinePrefsConfirmedAt: s.cuisineOkChecked
      ? true
      : s.cuisinePrefsConfirmedAt || null
  })
  return {
    gapMembersOpen: !!gaps.membersOpen,
    gapAvoidsOpen: !!gaps.familyAvoidsOpen,
    gapCityOpen: !!gaps.cityOpen,
    gapCuisineOpen: !!gaps.cuisineOpen
  }
}

Page({
  behaviors: [typeScaleBehavior],

  data: {
    nickname: '',
    avatarSrc: '/assets/avatar-default.png',
    avoidOptions: AVOID_OPTIONS,
    formOptions: FORM_OPTIONS,
    formValues: FORM_VALUES,
    familyAvoids: [],
    familyAvoidChecked: {},
    familyAvoidsNone: false,
    noneAvoidChecked: false,
    familyAvoidsConfirmedAt: null,
    dishFormPrefs: { hotpot: 'neutral', noodle: 'neutral', dumpling: 'neutral' },
    cuisineOptions: CUISINE_OPTIONS,
    cuisinePrefs: {},
    cuisinePrefsConfirmedAt: null,
    cuisineOkChecked: false,
    comboRange: COMBO_RANGE,
    defaultCombo: { meat: 1, veg: 1, soup: 0 },
    meatIndex: indexOfValue(COMBO_RANGE, 1, 1),
    vegIndex: indexOfValue(COMBO_RANGE, 1, 1),
    soupIndex: indexOfValue(COMBO_RANGE, 0, 0),
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
    nameQuickOptions: NAME_QUICK_OPTIONS.slice(),
    editAgeBand: '26_40',
    editTaste: 'normal',
    editAvoidChecked: {},
    editAvoidsNone: false,
    gapMembersOpen: false,
    gapAvoidsOpen: false,
    gapCityOpen: false,
    gapCuisineOpen: false,
    cookSkillRetakeLabel: retakeLinkLabel(null)
  },

  applyProfile(user) {
    const view = profileViewFromUser(user)
    // 与 data 同步的草稿，避免 setData 未刷完就点保存读到旧值
    this._draftFamilyAvoidsNone = !!view.familyAvoidsNone
    this._draftFamilyAvoids = view.familyAvoids.slice()
    this._draftCuisineOk = !!view.cuisineOkChecked
    this.setData(Object.assign({}, view, gapMarksFromState(view)))
  },

  _syncGapMarks() {
    this.setData(gapMarksFromState(this.data))
  },

  onUnload() {
    if (this._afterSaveTimer) {
      clearTimeout(this._afterSaveTimer)
      this._afterSaveTimer = null
    }
  },

  onShow() {
    this.applyTypeScale()
    // auth 已带 members：本地缓存立刻上屏，无需再打 profile.get
    const cached = getUser()
    if (cached) this.applyProfile(cached)

    const gen = (this._profileLoadGen || 0) + 1
    this._profileLoadGen = gen
    ensureLogin()
      .then((user) => {
        // 保存后或二次 onShow 会使 gen 前进；丢弃过期 login，避免旧菜系盖掉「都还行」
        if (gen !== this._profileLoadGen) return
        this.applyProfile(user)
      })
      .catch((err) => {
        if (gen !== this._profileLoadGen) return
        console.error(err)
        if (!cached) wx.showToast({ title: '登录失败', icon: 'none' })
      })
  },

  /** 成员增删改后刷新：走 auth 带回最新 members */
  refreshFromAuth() {
    const gen = (this._profileLoadGen || 0) + 1
    this._profileLoadGen = gen
    return ensureLogin().then((user) => {
      if (gen !== this._profileLoadGen) return
      this.applyProfile(user)
    })
  },

  onToggleCuisineOk() {
    const on = !this.data.cuisineOkChecked
    this._draftCuisineOk = on
    this.setData({
      cuisineOkChecked: on,
      cuisinePrefs: on ? {} : this.data.cuisinePrefs,
      cuisinePrefsConfirmedAt: on ? true : null
    })
    this._syncGapMarks()
  },

  onToggleAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    if (id === 'none') {
      const on = !this.data.noneAvoidChecked
      this._draftFamilyAvoidsNone = on
      this._draftFamilyAvoids = on ? [] : this.data.familyAvoids.slice()
      this.setData({
        noneAvoidChecked: on,
        familyAvoidChecked: on ? {} : this.data.familyAvoidChecked,
        familyAvoids: on ? [] : this.data.familyAvoids,
        familyAvoidsNone: on
      })
      this._syncGapMarks()
      return
    }
    const familyAvoidChecked = Object.assign({}, this.data.familyAvoidChecked)
    familyAvoidChecked[id] = !familyAvoidChecked[id]
    const familyAvoids = Object.keys(familyAvoidChecked).filter((k) => familyAvoidChecked[k])
    this._draftFamilyAvoidsNone = false
    this._draftFamilyAvoids = familyAvoids.slice()
    this.setData({
      noneAvoidChecked: false,
      familyAvoidsNone: false,
      familyAvoidChecked,
      familyAvoids
    })
    this._syncGapMarks()
  },

  onFormPrefRadio(e) {
    const tag = e.currentTarget.dataset.tag
    const value = e.detail && e.detail.value
    if (!tag || !value) return
    const dishFormPrefs = Object.assign({}, this.data.dishFormPrefs, { [tag]: value })
    this.setData({ dishFormPrefs })
  },

  onCuisinePrefer(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this._draftCuisineOk = false
    this.setData({
      cuisineOkChecked: false,
      cuisinePrefsConfirmedAt: null,
      cuisinePrefs: toggleCuisinePrefer(this.data.cuisinePrefs, id)
    })
    this._syncGapMarks()
  },

  onCuisineAvoid(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this._draftCuisineOk = false
    this.setData({
      cuisineOkChecked: false,
      cuisinePrefsConfirmedAt: null,
      cuisinePrefs: toggleCuisineAvoid(this.data.cuisinePrefs, id)
    })
    this._syncGapMarks()
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    const city = region[1] || region[0] || ''
    const next = String(city || '').trim()
    const prevCity = String(this.data.city || '').trim()
    // 首次选城不弹；真实换城：确认后才写入草稿（仍需点保存）
    if (!prevCity || !next || next === prevCity) {
      this.setData({ region, city: next || city })
      this._syncGapMarks()
      return
    }
    wx.showModal({
      title: '确认更换城市',
      content:
        '确定换成「' + next + '」？本周最多可换城 2 次，保存后生效。',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ region, city: next })
        this._syncGapMarks()
      }
    })
  },

  onComboPick(e) {
    const field = e.currentTarget.dataset.field
    const idx = Number(e.detail.value)
    if (!field || idx < 0 || idx >= COMBO_RANGE.length) return
    const defaultCombo = Object.assign({}, this.data.defaultCombo || {})
    defaultCombo[field] = COMBO_RANGE[idx]
    const indexKey =
      field === 'meat' ? 'meatIndex' : field === 'veg' ? 'vegIndex' : 'soupIndex'
    this.setData({ defaultCombo, [indexKey]: idx })
  },

  openAddMember() {
    this.setData({
      showMemberEditor: true,
      editingMemberId: '',
      editName: '',
      nameQuickOptions: nameQuickVisible(''),
      editAgeBand: '26_40',
      editTaste: 'normal',
      editAvoidChecked: {},
      editAvoidsNone: false
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
    const hasAvoid = Object.keys(editAvoidChecked).some((k) => editAvoidChecked[k])
    this.setData({
      showMemberEditor: true,
      editingMemberId: m.memberId,
      editName: m.name,
      nameQuickOptions: nameQuickVisible(m.name),
      editAgeBand: m.ageBand,
      editTaste: m.taste,
      editAvoidChecked,
      editAvoidsNone: !hasAvoid
    })
  },

  noop() {},

  closeMemberEditor() {
    this.setData({ showMemberEditor: false })
  },

  onEditName(e) {
    const editName = sanitizeMemberName((e.detail && e.detail.value) || '')
    this.setData({
      editName,
      nameQuickOptions: nameQuickVisible(editName)
    })
  },

  onPickQuickName(e) {
    const name = sanitizeMemberName(e.currentTarget.dataset.name)
    if (!name) return
    this.setData({
      editName: name,
      nameQuickOptions: nameQuickVisible(name)
    })
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
    if (id === 'none') {
      const on = !this.data.editAvoidsNone
      this.setData({
        editAvoidsNone: on,
        editAvoidChecked: on ? {} : this.data.editAvoidChecked
      })
      return
    }
    const editAvoidChecked = Object.assign({}, this.data.editAvoidChecked)
    editAvoidChecked[id] = !editAvoidChecked[id]
    this.setData({
      editAvoidsNone: false,
      editAvoidChecked
    })
  },

  saveMember() {
    const name = sanitizeMemberName(this.data.editName).trim()
    if (!name) {
      wx.showToast({ title: '请填写称呼', icon: 'none' })
      return
    }
    const avoids = this.data.editAvoidsNone
      ? []
      : Object.keys(this.data.editAvoidChecked || {}).filter(
          (k) => this.data.editAvoidChecked[k]
        )
    const editingMemberId = this.data.editingMemberId
    const ageBand = this.data.editAgeBand
    const taste = this.data.editTaste
    const tempId =
      editingMemberId ||
      'm_tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const shaped = shapeMembers([
      {
        memberId: tempId,
        name,
        ageBand,
        taste,
        avoids
      }
    ])[0]

    // 先关弹层、立刻渲染列表，再异步落库
    const members = (this.data.members || []).slice()
    if (editingMemberId) {
      const idx = members.findIndex((m) => m.memberId === editingMemberId)
      if (idx >= 0) members[idx] = shaped
      else members.push(shaped)
    } else {
      members.push(shaped)
    }
    const summary = summarizeHousehold(members)
    const next = {
      showMemberEditor: false,
      members,
      householdLabel: summary.label
    }
    Object.assign(next, gapMarksFromState(Object.assign({}, this.data, next)))
    tapFeedback()
    this.setData(next)
    patchUser({
      members: members.map((m) => ({
        memberId: m.memberId,
        name: m.name,
        ageBand: m.ageBand,
        taste: m.taste,
        avoids: m.avoids || []
      })),
      defaultPeopleCount: members.length
    })

    const payload = editingMemberId
      ? {
          action: 'updateMember',
          memberId: editingMemberId,
          name,
          ageBand,
          taste,
          avoids
        }
      : {
          action: 'addMember',
          name,
          ageBand,
          taste,
          avoids
        }
    callCloud('profile', payload)
      .then((res) => {
        track(editingMemberId ? 'member_update' : 'member_add', {})
        if (!editingMemberId && res && res.memberId) {
          const list = (this.data.members || []).slice()
          const i = list.findIndex((m) => m.memberId === tempId)
          if (i >= 0) {
            list[i] = Object.assign({}, list[i], { memberId: res.memberId })
            this.setData({ members: list })
            patchUser({
              members: list.map((m) => ({
                memberId: m.memberId,
                name: m.name,
                ageBand: m.ageBand,
                taste: m.taste,
                avoids: m.avoids || []
              })),
              defaultPeopleCount: list.length
            })
          }
        }
        return this.refreshFromAuth()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.error) || '保存失败', icon: 'none' })
        return this.refreshFromAuth()
      })
  },

  removeMember(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const self = this
    wx.showModal({
      title: '删除家庭成员',
      content: '确定删除这位家庭成员吗？',
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
    const prevCity = String(((getUser() || {}).city) || '').trim()
    const noneAvoid =
      this._draftFamilyAvoidsNone != null
        ? !!this._draftFamilyAvoidsNone
        : !!this.data.noneAvoidChecked
    const avoidsDraft =
      this._draftFamilyAvoids != null ? this._draftFamilyAvoids : this.data.familyAvoids
    const cuisineOk =
      this._draftCuisineOk != null
        ? !!this._draftCuisineOk
        : !!this.data.cuisineOkChecked
    const cuisinePrefs = cuisineOk ? {} : this.data.cuisinePrefs || {}
    const cuisineHasStance = hasCuisinePreferOrAvoid(cuisinePrefs)
    const defaultCombo = normalizeDefaultCombo(this.data.defaultCombo)
    const patch = {
      familyAvoids: noneAvoid ? [] : avoidsDraft || [],
      familyAvoidsNone: noneAvoid,
      dishFormPrefs: this.data.dishFormPrefs,
      cuisinePrefs,
      city: this.data.city || '',
      defaultCombo
    }
    if (cuisineOk) patch.cuisinePrefsNoPreference = true
    callCloud('profile', Object.assign({ action: 'updateFamily' }, patch))
      .then((res) => {
        // 作废进行中的 onShow login，防止旧 auth 在保存后把菜系打回喜欢/不喜欢
        this._profileLoadGen = (this._profileLoadGen || 0) + 1
        const savedNone =
          res && typeof res.familyAvoidsNone === 'boolean'
            ? res.familyAvoidsNone
            : noneAvoid
        const savedAvoids =
          res && Array.isArray(res.familyAvoids) ? res.familyAvoids : patch.familyAvoids
        // 只写本地缓存再返回；勿在此处 ensureLogin，避免旧 auth 盖掉刚保存的表态
        const savedCuisine =
          res && res.cuisinePrefs && typeof res.cuisinePrefs === 'object'
            ? res.cuisinePrefs
            : cuisinePrefs
        const savedCuisineConfirmed =
          res && res.cuisinePrefsConfirmedAt != null
            ? !!res.cuisinePrefsConfirmedAt
            : cuisineOk || cuisineHasStance
              ? true
              : null
        const next = patchUser(
          Object.assign({}, patch, {
            familyAvoidsNone: savedNone,
            familyAvoids: savedAvoids,
            familyAvoidsConfirmedAt: savedNone
              ? true
              : savedAvoids && savedAvoids.length
                ? true
                : null,
            city: patch.city || '',
            cuisinePrefs: savedCuisine,
            cuisinePrefsConfirmedAt: savedCuisineConfirmed,
            defaultCombo
          })
        )
        const nextCity = String(next.city || '').trim()
        if (prevCity && nextCity && prevCity !== nextCity) {
          clearShelfCache(prevCity)
        }
        if (nextCity) {
          try {
            prefetchCatalog(next)
          } catch (e) {}
        }
        if (cuisineOk) {
          track('cuisine_prefs_no_preference', { source: 'mine' })
        }
        track('profile_update', {
          fields: [
            'familyAvoids',
            'familyAvoidsNone',
            'dishFormPrefs',
            'cuisinePrefs',
            'city',
            'defaultCombo'
          ]
        })
        wx.showToast({ title: '已保存', icon: 'success' })
        this.applyProfile(next)
        if (this._afterSaveTimer) clearTimeout(this._afterSaveTimer)
        this._afterSaveTimer = setTimeout(() => {
          this._afterSaveTimer = null
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
        let title = code || '保存失败'
        if (code === 'UNKNOWN_ACTION') {
          title = '云函数过旧，请重新部署 profile'
        } else if (code === 'CITY_CHANGE_WEEKLY_LIMIT') {
          title = '本周换城已达上限（2次）'
        }
        wx.showToast({ title, icon: 'none' })
        this.setData({ busy: false })
      })
  },

  goCookSkillProbe() {
    if (this.data.busy) return
    tapFeedback()
    wx.navigateTo({ url: '/pages/cookSkillProbe/cookSkillProbe' })
  },

  goOnboarding() {
    tapFeedback()
    // confirmText / cancelText 最多 4 个汉字，超长会导致弹窗直接失败、点击无反应
    wx.showModal({
      title: '重新设置偏好',
      content: '将清空现有家庭成员与偏好（忌口、城市、菜系、菜式、日常搭配），再从头填写。确定？',
      confirmText: '确定清空',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '清空中', mask: true })
        callCloud('profile', { action: 'resetPreferenceTest' })
          .then(() => ensureLogin())
          .then(() => {
            wx.hideLoading()
            try {
              const pages = getCurrentPages() || []
              for (let i = 0; i < pages.length; i++) {
                const p = pages[i]
                if (p && p.route === 'pages/index/index' && typeof p.setData === 'function') {
                  p.setData({ showConfirm: false, busy: false })
                }
              }
            } catch (e) {}
            wx.redirectTo({ url: '/pages/onboarding/onboarding?restart=1' })
          })
          .catch((err) => {
            wx.hideLoading()
            const code = err && err.error
            wx.showToast({
              title:
                code === 'UNKNOWN_ACTION'
                  ? '请重新部署云函数 profile'
                  : code || '清空失败',
              icon: 'none'
            })
          })
      },
      fail: (err) => {
        console.error(err)
        wx.showToast({ title: '无法打开确认框', icon: 'none' })
      }
    })
  }
})
