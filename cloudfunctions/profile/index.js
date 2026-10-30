'use strict'
const cloud = require('wx-server-sdk')
const { sanitizeCuisinePrefs } = require('./cuisinePrefs.js')
// Vendored: keep in sync with cloudfunctions/_shared/members.js
const {
  normalizeAgeBand,
  AGE_BANDS,
  TASTE_VALUES,
  summarizeHousehold
} = require('./members.js')
// Vendored: keep in sync with cloudfunctions/_shared/marketScale.js
const { effectiveFromChoice, appendHistory } = require('./marketScale.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const AVOID_CODES = ['pork', 'seafood', 'offal', 'coriander', 'peanut', 'dairy', 'other']
const FORM_TAGS = ['hotpot', 'noodle', 'dumpling']
const FORM_VALUES = ['prefer', 'neutral', 'avoid']
const MARKET_SCALE_CHOICES = ['small', 'medium', 'large', 'default_medium']
const MARKET_SCALE_SOURCES = ['sheet', 'page_switch', 'system_default']

function marketScaleSnapshot(user) {
  const u = user || {}
  return {
    marketScaleChoice: u.marketScaleChoice || null,
    marketScaleEffective: u.marketScaleEffective || null,
    marketScaleChosenAt: u.marketScaleChosenAt || null,
    marketScaleAnchor: u.marketScaleAnchor || null,
    marketScaleHistory: Array.isArray(u.marketScaleHistory) ? u.marketScaleHistory : []
  }
}

async function resolveUid(openid) {
  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()
  if (!idRes.data[0]) return null
  return idRes.data[0].uid
}

async function loadUserDoc(uid) {
  const res = await db.collection('users').where({ uid }).limit(1).get()
  return res.data[0] || null
}

async function countMembers(uid) {
  try {
    const res = await db.collection('members').where({ uid }).limit(50).get()
    return (res.data || []).length
  } catch (e) {
    return 0
  }
}

async function syncPeopleCountCache(uid, userDoc) {
  const n = await countMembers(uid)
  const doc = userDoc || (await loadUserDoc(uid))
  if (!doc) return n
  await db.collection('users').doc(doc._id).update({
    data: {
      defaultPeopleCount: n,
      updatedAt: db.serverDate()
    }
  })
  return n
}

function sanitizeAgeBand(band) {
  return normalizeAgeBand(band) || '26_40'
}

function sanitizeTaste(taste) {
  return TASTE_VALUES.includes(taste) ? taste : 'normal'
}

function sanitizeAvoids(list) {
  if (!Array.isArray(list)) return []
  return list.filter((x) => AVOID_CODES.includes(x))
}

function sanitizeDishFormPrefs(prefs) {
  const out = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const tag of FORM_TAGS) {
    const v = prefs[tag]
    if (FORM_VALUES.includes(v)) out[tag] = v
  }
  return out
}

async function handleGet(uid) {
  const user = await loadUserDoc(uid)
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }
  let members = []
  try {
    const mRes = await db.collection('members').where({ uid }).limit(50).get()
    members = mRes.data || []
  } catch (e) {
    members = []
  }
  const household = summarizeHousehold(members)
  return {
    ok: true,
    profile: {
      uid: user.uid,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || null,
      city: user.city || null,
      // 人数以成员列表为准（缓存字段可能旧）
      defaultPeopleCount: household.total,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 },
      mealTimes: user.mealTimes || {},
      cookBudget: user.cookBudget || 'about30',
      familyAvoids: user.familyAvoids || [],
      familyAvoidsNone: !!user.familyAvoidsNone,
      familyAvoidsConfirmedAt: user.familyAvoidsConfirmedAt || null,
      dishFormPrefs: user.dishFormPrefs || {},
      cuisinePrefs: user.cuisinePrefs || {},
      cuisinePrefsConfirmedAt: user.cuisinePrefsConfirmedAt || null,
      onboardingDone: !!user.onboardingDone,
      profileLiteSkipped: !!user.profileLiteSkipped,
      profileLitePromptedAt: user.profileLitePromptedAt || null,
      householdSummary: household.label,
      householdCounts: {
        adult: household.adult,
        child: household.child,
        elder: household.elder
      },
      ...marketScaleSnapshot(user)
    },
    members,
    ageBands: AGE_BANDS
  }
}

async function handleSetMarketScale(event, uid, user) {
  const choice = event && event.choice
  const source = event && event.source
  if (!MARKET_SCALE_CHOICES.includes(choice)) {
    return { ok: false, error: 'INVALID_CHOICE' }
  }
  if (!MARKET_SCALE_SOURCES.includes(source)) {
    return { ok: false, error: 'INVALID_SOURCE' }
  }

  const effective = effectiveFromChoice(choice)
  const at = new Date().toISOString()
  const lat = event && event.lat
  const lng = event && event.lng
  const hasFix =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)

  const historyItem = {
    choice,
    effective,
    source,
    at
  }
  if (hasFix) {
    historyItem.lat = lat
    historyItem.lng = lng
  }

  const patch = {
    marketScaleChoice: choice,
    marketScaleEffective: effective,
    marketScaleChosenAt: at,
    marketScaleHistory: appendHistory(user.marketScaleHistory, historyItem),
    updatedAt: db.serverDate()
  }
  if (hasFix) {
    patch.marketScaleAnchor = { lat, lng }
  }

  await db.collection('users').doc(user._id).update({ data: patch })

  return {
    ok: true,
    ...marketScaleSnapshot({
      ...user,
      ...patch
    })
  }
}

async function handleUpdateFamily(event, uid, user) {
  const patch = {}
  if (Array.isArray(event.familyAvoids)) {
    const avoids = sanitizeAvoids(event.familyAvoids)
    patch.familyAvoids = avoids
    if (avoids.length > 0) {
      patch.familyAvoidsNone = false
      patch.familyAvoidsConfirmedAt = db.serverDate()
    }
  }
  // Explicit none wins over concurrent non-empty familyAvoids
  if (event.familyAvoidsNone === true) {
    patch.familyAvoidsNone = true
    patch.familyAvoids = []
    patch.familyAvoidsConfirmedAt = db.serverDate()
  } else if (event.familyAvoidsNone === false && !(patch.familyAvoids && patch.familyAvoids.length)) {
    // clear stance when client turns off「无」without picking other chips
    patch.familyAvoidsNone = false
  }
  if (event.dishFormPrefs && typeof event.dishFormPrefs === 'object') {
    patch.dishFormPrefs = Object.assign(
      {},
      user.dishFormPrefs || {},
      sanitizeDishFormPrefs(event.dishFormPrefs)
    )
  }
  if (event.cuisinePrefsNoPreference === true) {
    // 「都还行」：清空喜欢/不喜欢，记已表态
    patch.cuisinePrefs = {}
    patch.cuisinePrefsConfirmedAt = db.serverDate()
  } else if (event.cuisinePrefs && typeof event.cuisinePrefs === 'object') {
    patch.cuisinePrefs = sanitizeCuisinePrefs(event.cuisinePrefs)
    const hasStance = Object.keys(patch.cuisinePrefs).some(
      (k) => patch.cuisinePrefs[k] === 'prefer' || patch.cuisinePrefs[k] === 'avoid'
    )
    if (hasStance) {
      patch.cuisinePrefsConfirmedAt = db.serverDate()
    } else {
      // 显式提交空菜系且非「都还行」→ 撤回表态（与 UI 取消「都还行」一致）
      patch.cuisinePrefsConfirmedAt = _.remove()
    }
  }
  // 人数唯一来源 = members；忽略客户端 defaultPeopleCount
  if (event.defaultCombo && typeof event.defaultCombo === 'object') {
    patch.defaultCombo = {
      meat: Number(event.defaultCombo.meat) || 0,
      veg: Number(event.defaultCombo.veg) || 0,
      soup: Number(event.defaultCombo.soup) || 0
    }
  }
  if (typeof event.city === 'string') patch.city = event.city
  if (typeof event.cookBudget === 'string') patch.cookBudget = event.cookBudget
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'NO_FIELDS' }
  }
  // 在「我的」保存过家庭设置，视为已完成引导，不再弹首页提示
  if (!user.onboardingDone) patch.onboardingDone = true
  patch.updatedAt = db.serverDate()
  await db.collection('users').doc(user._id).update({ data: patch })
  const nextNone =
    patch.familyAvoidsNone != null ? !!patch.familyAvoidsNone : !!user.familyAvoidsNone
  const nextAvoids =
    patch.familyAvoids != null ? patch.familyAvoids : user.familyAvoids || []
  return {
    ok: true,
    updated: Object.keys(patch).filter((k) => k !== 'updatedAt'),
    familyAvoidsNone: nextNone,
    familyAvoids: nextAvoids,
    familyAvoidsConfirmedAt: patch.familyAvoidsConfirmedAt
      ? true
      : !!user.familyAvoidsConfirmedAt
  }
}

async function handleUpdateDisplay(event, uid, user) {
  const patch = {}
  if (typeof event.nickname === 'string') {
    const n = event.nickname.trim()
    if (n) patch.nickname = n.slice(0, 32)
  }
  if (typeof event.avatarUrl === 'string') {
    patch.avatarUrl = event.avatarUrl || null
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'NO_FIELDS' }
  }
  patch.updatedAt = db.serverDate()
  await db.collection('users').doc(user._id).update({ data: patch })
  return { ok: true }
}

function makeMemberId() {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

async function handleAddMember(event, uid, user) {
  const name = String((event && event.name) || '').trim()
  if (!name) return { ok: false, error: 'NAME_REQUIRED' }
  const ageBand = sanitizeAgeBand(event && event.ageBand)
  const taste = sanitizeTaste(event && event.taste)
  const now = db.serverDate()
  const memberId = makeMemberId()
  await db.collection('members').add({
    data: {
      uid,
      memberId,
      name,
      role: (event && event.role) || 'other',
      ageBand,
      taste,
      avoids: sanitizeAvoids((event && event.avoids) || []),
      dishFormPrefs: null,
      sort: Number(event && event.sort) || 0,
      createdAt: now,
      updatedAt: now
    }
  })
  const peopleCount = await syncPeopleCountCache(uid, user)
  return { ok: true, memberId, defaultPeopleCount: peopleCount }
}

async function handleUpdateMember(event, uid, user) {
  const memberId = event && event.memberId
  if (!memberId) return { ok: false, error: 'MEMBER_ID_REQUIRED' }
  const res = await db.collection('members').where({ uid, memberId }).limit(1).get()
  const row = res.data[0]
  if (!row) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  const patch = { updatedAt: db.serverDate() }
  if (typeof event.name === 'string' && event.name.trim()) patch.name = event.name.trim()
  if (typeof event.ageBand === 'string') patch.ageBand = sanitizeAgeBand(event.ageBand)
  if (typeof event.taste === 'string') patch.taste = sanitizeTaste(event.taste)
  if (Array.isArray(event.avoids)) patch.avoids = sanitizeAvoids(event.avoids)
  await db.collection('members').doc(row._id).update({ data: patch })
  const peopleCount = await syncPeopleCountCache(uid, user)
  return { ok: true, defaultPeopleCount: peopleCount }
}

async function handleRemoveMember(event, uid, user) {
  const memberId = event && event.memberId
  if (!memberId) return { ok: false, error: 'MEMBER_ID_REQUIRED' }
  const res = await db.collection('members').where({ uid, memberId }).limit(1).get()
  const row = res.data[0]
  if (!row) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  await db.collection('members').doc(row._id).remove()
  const peopleCount = await syncPeopleCountCache(uid, user)
  return { ok: true, defaultPeopleCount: peopleCount }
}

async function handleCompleteOnboarding(event, uid, user) {
  const familyAvoidsNone = event && event.familyAvoidsNone === true
  const familyAvoids = familyAvoidsNone
    ? []
    : sanitizeAvoids((event && event.familyAvoids) || [])
  const dishFormPrefs = sanitizeDishFormPrefs((event && event.dishFormPrefs) || {})
  let defaultCombo = user.defaultCombo || { meat: 1, veg: 1, soup: 0 }
  if (event.defaultCombo && typeof event.defaultCombo === 'object') {
    defaultCombo = {
      meat: Number(event.defaultCombo.meat) || 0,
      veg: Number(event.defaultCombo.veg) || 0,
      soup: Number(event.defaultCombo.soup) || 0
    }
  }
  const city = typeof event.city === 'string' ? event.city : user.city || null
  const cookBudget =
    typeof event.cookBudget === 'string' ? event.cookBudget : user.cookBudget || 'about30'
  const cuisineNoPref = event && event.cuisinePrefsNoPreference === true
  const cuisinePrefs = cuisineNoPref
    ? {}
    : sanitizeCuisinePrefs((event && event.cuisinePrefs) || {})
  const cuisineHasStance = Object.keys(cuisinePrefs).some(
    (k) => cuisinePrefs[k] === 'prefer' || cuisinePrefs[k] === 'avoid'
  )

  // 优先 members[]；兼容旧客户端 selfMember
  let memberInputs = []
  if (Array.isArray(event && event.members) && event.members.length > 0) {
    memberInputs = event.members
  } else if (event && event.selfMember) {
    memberInputs = [event.selfMember]
  }
  if (!memberInputs.length) {
    memberInputs = [{ name: '我', ageBand: '26_40', taste: 'normal', avoids: [] }]
  }

  const now = db.serverDate()
  const userPatch = {
    familyAvoids,
    familyAvoidsNone: !!familyAvoidsNone,
    dishFormPrefs,
    cuisinePrefs,
    defaultPeopleCount: memberInputs.length,
    defaultCombo,
    city,
    cookBudget,
    onboardingDone: true,
    updatedAt: now
  }
  if (familyAvoidsNone || familyAvoids.length > 0) {
    userPatch.familyAvoidsConfirmedAt = now
  } else {
    userPatch.familyAvoidsConfirmedAt = _.remove()
  }
  if (cuisineNoPref || cuisineHasStance) {
    userPatch.cuisinePrefsConfirmedAt = now
  } else {
    userPatch.cuisinePrefsConfirmedAt = _.remove()
  }
  await db.collection('users').doc(user._id).update({ data: userPatch })

  try {
    // 完成引导以本次名单为准：先清旧成员再批量写入
    const existing = await db.collection('members').where({ uid }).limit(50).get()
    for (const row of existing.data || []) {
      if (row && row._id) await db.collection('members').doc(row._id).remove()
    }

    const memberIds = []
    for (let i = 0; i < memberInputs.length; i++) {
      const src = memberInputs[i] || {}
      const name =
        String(src.name || '').trim() || (i === 0 ? '我' : `成员${i + 1}`)
      const memberId = makeMemberId()
      await db.collection('members').add({
        data: {
          uid,
          memberId,
          name,
          role: i === 0 ? 'self' : 'other',
          ageBand: sanitizeAgeBand(src.ageBand),
          taste: sanitizeTaste(src.taste),
          avoids: sanitizeAvoids(src.avoids || []),
          dishFormPrefs: null,
          sort: i,
          createdAt: now,
          updatedAt: now
        }
      })
      memberIds.push(memberId)
    }
    const peopleCount = memberIds.length
    await db.collection('users').doc(user._id).update({
      data: { defaultPeopleCount: peopleCount, updatedAt: now }
    })
    return {
      ok: true,
      memberId: memberIds[0] || null,
      memberIds,
      onboardingDone: true,
      defaultPeopleCount: peopleCount
    }
  } catch (e) {
    // members 集合未建时仍算引导完成，避免卡在完成页
    console.warn('completeOnboarding members.add failed', e)
    return { ok: true, memberId: null, onboardingDone: true, memberSkipped: true }
  }
}

/**
 * Mark done without collecting fields — for skip / later fill-in via「我的」.
 * resetProfile=true：清空家庭成员与偏好（「重新走一遍」后跳过须落空态，不能留旧数据）。
 */
async function handleSkipOnboarding(event, uid, user) {
  if (event && event.resetProfile === true) {
    await clearPreferenceProfile(uid, user)
  }
  await db.collection('users').doc(user._id).update({
    data: {
      onboardingDone: true,
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, onboardingDone: true, skipped: true, resetProfile: !!(event && event.resetProfile) }
}

/** 清空家庭成员 + 忌口/菜系/菜式/城市/搭配/轻量表态（供重置与重新引导） */
async function clearPreferenceProfile(uid, user) {
  if (!user || !user._id) return { removedMembers: 0 }
  let removedMembers = 0
  try {
    const mRes = await db.collection('members').where({ uid }).limit(50).get()
    const rows = mRes.data || []
    for (const row of rows) {
      if (!row || !row._id) continue
      await db.collection('members').doc(row._id).remove()
      removedMembers += 1
    }
  } catch (e) {
    console.warn('clearPreferenceProfile members.remove failed', e)
  }
  await db.collection('users').doc(user._id).update({
    data: {
      familyAvoids: [],
      familyAvoidsNone: false,
      familyAvoidsConfirmedAt: _.remove(),
      cuisinePrefs: {},
      cuisinePrefsConfirmedAt: _.remove(),
      dishFormPrefs: {},
      profileLiteSkipped: false,
      profileLitePromptedAt: _.remove(),
      city: '',
      defaultCombo: { meat: 1, veg: 1, soup: 0 },
      defaultPeopleCount: 0,
      updatedAt: db.serverDate()
    }
  })
  return { removedMembers }
}

/** 日常轻量补全：保存忌口 / 可选爱吃 → 标记已提示 */
async function handleSaveProfileLite(event, uid, user) {
  const patch = {
    profileLitePromptedAt: db.serverDate(),
    profileLiteSkipped: false,
    updatedAt: db.serverDate()
  }
  if (Array.isArray(event.familyAvoids)) {
    const avoids = sanitizeAvoids(event.familyAvoids)
    patch.familyAvoids = avoids
    if (avoids.length > 0) {
      patch.familyAvoidsNone = false
      patch.familyAvoidsConfirmedAt = db.serverDate()
    }
    // empty array: do not set familyAvoidsNone / ConfirmedAt
  }
  if (event.dishFormPrefs && typeof event.dishFormPrefs === 'object') {
    patch.dishFormPrefs = Object.assign(
      {},
      user.dishFormPrefs || {},
      sanitizeDishFormPrefs(event.dishFormPrefs)
    )
  }
  if (typeof event.city === 'string' && event.city.trim()) {
    patch.city = event.city.trim()
  }
  await db.collection('users').doc(user._id).update({ data: patch })
  return {
    ok: true,
    familyAvoids: patch.familyAvoids != null ? patch.familyAvoids : user.familyAvoids || [],
    dishFormPrefs: patch.dishFormPrefs || user.dishFormPrefs || {},
    city: patch.city != null ? patch.city : user.city || null,
    profileLitePromptedAt: true
  }
}

/** 日常轻量补全：跳过 → 标记已提示，不挡推荐；不改表态字段 */
async function handleSkipProfileLite(uid, user) {
  await db.collection('users').doc(user._id).update({
    data: {
      profileLiteSkipped: true,
      profileLitePromptedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, skipped: true, profileLiteSkipped: true }
}

async function handleConfirmFamilyAvoidsNone(event, uid, user) {
  const data = {
    familyAvoidsNone: true,
    familyAvoids: [],
    familyAvoidsConfirmedAt: db.serverDate(),
    // 轻量层点「无」也算已处理，避免确认页反复弹出
    profileLitePromptedAt: db.serverDate(),
    profileLiteSkipped: false,
    updatedAt: db.serverDate()
  }
  if (event && typeof event.city === 'string' && event.city.trim()) {
    data.city = event.city.trim()
  }
  await db.collection('users').doc(user._id).update({ data })
  return {
    ok: true,
    familyAvoidsNone: true,
    familyAvoids: [],
    city: data.city != null ? data.city : user.city || null
  }
}

/**
 * 测试用：清空偏好内容（等同未填就跳过），不改 onboardingDone。
 * 同时清轻量弹层标记，便于再测自动/顶栏补全。
 * 注意：users 文档主键是 _id，业务 uid 只是字段。
 */
async function handleResetPreferenceTest(uid, user) {
  if (!user || !user._id) return { ok: false, error: 'USER_NOT_FOUND' }
  const { removedMembers } = await clearPreferenceProfile(uid, user)
  return { ok: true, reset: true, removedMembers }
}

/**
 * 开发/体验版测试：菜场规模半屏触发条件。
 * mode=clear：清空 choice / chosenAt / anchor（下次可走首次弹层）
 * mode=readyRelocate：chosenAt 调到 cooldown 前，并写入距当前位置 ≥1km 的锚点
 */
async function handleDebugMarketScale(event, uid, user) {
  if (!user || !user._id) return { ok: false, error: 'USER_NOT_FOUND' }
  const mode = event && event.mode
  if (mode !== 'clear' && mode !== 'readyRelocate') {
    return { ok: false, error: 'INVALID_MODE' }
  }

  if (mode === 'clear') {
    await db.collection('users').doc(user._id).update({
      data: {
        marketScaleChoice: _.remove(),
        marketScaleEffective: _.remove(),
        marketScaleChosenAt: _.remove(),
        marketScaleAnchor: _.remove(),
        updatedAt: db.serverDate()
      }
    })
    return {
      ok: true,
      mode: 'clear',
      ...marketScaleSnapshot({})
    }
  }

  const lat = event && event.lat
  const lng = event && event.lng
  const anchorLat = event && event.anchorLat
  const anchorLng = event && event.anchorLng
  const hasAnchor =
    typeof anchorLat === 'number' &&
    Number.isFinite(anchorLat) &&
    typeof anchorLng === 'number' &&
    Number.isFinite(anchorLng)
  if (!hasAnchor) {
    return { ok: false, error: 'NEED_ANCHOR' }
  }

  // 略大于 RELOCATE_COOLDOWN_MS（30min），避免边界
  const chosenAt = new Date(Date.now() - 31 * 60 * 1000).toISOString()
  const choice = user.marketScaleChoice || 'medium'
  const effective = effectiveFromChoice(choice)
  const patch = {
    marketScaleChoice: choice,
    marketScaleEffective: effective,
    marketScaleChosenAt: chosenAt,
    marketScaleAnchor: { lat: anchorLat, lng: anchorLng },
    updatedAt: db.serverDate()
  }
  await db.collection('users').doc(user._id).update({ data: patch })

  return {
    ok: true,
    mode: 'readyRelocate',
    fix:
      typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)
        ? { lat, lng }
        : null,
    ...marketScaleSnapshot({ ...user, ...patch })
  }
}

async function handleConfirmCuisineNoPreference(uid, user) {
  await db.collection('users').doc(user._id).update({
    data: {
      cuisinePrefsConfirmedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, cuisinePrefsConfirmedAt: true }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }
  const uid = await resolveUid(openid)
  if (!uid) return { ok: false, error: 'USER_NOT_FOUND' }
  const user = await loadUserDoc(uid)
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }

  const action = (event && event.action) || 'get'
  if (action === 'get') return handleGet(uid)
  if (action === 'updateFamily') return handleUpdateFamily(event, uid, user)
  if (action === 'updateDisplay') return handleUpdateDisplay(event, uid, user)
  if (action === 'addMember') return handleAddMember(event, uid, user)
  if (action === 'updateMember') return handleUpdateMember(event, uid, user)
  if (action === 'removeMember') return handleRemoveMember(event, uid, user)
  if (action === 'completeOnboarding') return handleCompleteOnboarding(event, uid, user)
  if (action === 'skipOnboarding') return handleSkipOnboarding(event, uid, user)
  if (action === 'saveProfileLite') return handleSaveProfileLite(event, uid, user)
  if (action === 'skipProfileLite') return handleSkipProfileLite(uid, user)
  if (action === 'confirmFamilyAvoidsNone') {
    return handleConfirmFamilyAvoidsNone(event, uid, user)
  }
  if (action === 'confirmCuisineNoPreference') return handleConfirmCuisineNoPreference(uid, user)
  if (action === 'resetPreferenceTest') return handleResetPreferenceTest(uid, user)
  if (action === 'setMarketScale') return handleSetMarketScale(event, uid, user)
  if (action === 'debugMarketScale') return handleDebugMarketScale(event, uid, user)
  console.warn('profile UNKNOWN_ACTION', action)
  return {
    ok: false,
    error: 'UNKNOWN_ACTION',
    hint: '请重新上传并部署云函数 profile（需含 saveProfileLite / skipProfileLite / confirmFamilyAvoidsNone / confirmCuisineNoPreference / setMarketScale / debugMarketScale）',
    action: action || null
  }
}
