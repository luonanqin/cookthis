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

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const AVOID_CODES = ['pork', 'seafood', 'offal', 'coriander', 'peanut', 'dairy', 'other']
const FORM_TAGS = ['hotpot', 'noodle', 'dumpling']
const FORM_VALUES = ['prefer', 'neutral', 'avoid']

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
      }
    },
    members,
    ageBands: AGE_BANDS
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
  }
  if (event.dishFormPrefs && typeof event.dishFormPrefs === 'object') {
    patch.dishFormPrefs = Object.assign(
      {},
      user.dishFormPrefs || {},
      sanitizeDishFormPrefs(event.dishFormPrefs)
    )
  }
  if (event.cuisinePrefs && typeof event.cuisinePrefs === 'object') {
    patch.cuisinePrefs = sanitizeCuisinePrefs(event.cuisinePrefs)
    const hasStance = Object.keys(patch.cuisinePrefs).some(
      (k) => patch.cuisinePrefs[k] === 'prefer' || patch.cuisinePrefs[k] === 'avoid'
    )
    if (hasStance) patch.cuisinePrefsConfirmedAt = db.serverDate()
  }
  if (event.cuisinePrefsNoPreference === true) {
    patch.cuisinePrefsConfirmedAt = db.serverDate()
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
  return { ok: true, updated: Object.keys(patch).filter((k) => k !== 'updatedAt') }
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
  const familyAvoids = sanitizeAvoids((event && event.familyAvoids) || [])
  const dishFormPrefs = sanitizeDishFormPrefs((event && event.dishFormPrefs) || {})
  // 引导人数由随后创建的本人成员决定；此处先写 1，add 成功后再确认
  const defaultPeopleCount = 1
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
  const cuisinePrefs = sanitizeCuisinePrefs((event && event.cuisinePrefs) || {})

  const now = db.serverDate()
  await db.collection('users').doc(user._id).update({
    data: {
      familyAvoids,
      dishFormPrefs,
      cuisinePrefs,
      defaultPeopleCount,
      defaultCombo,
      city,
      cookBudget,
      onboardingDone: true,
      updatedAt: now
    }
  })

  const self = (event && event.selfMember) || {}
  const name = String(self.name || '本人').trim() || '本人'
  const memberId = makeMemberId()
  try {
    await db.collection('members').add({
      data: {
        uid,
        memberId,
        name,
        role: 'self',
        ageBand: sanitizeAgeBand(self.ageBand),
        taste: sanitizeTaste(self.taste),
        avoids: sanitizeAvoids(self.avoids || []),
        dishFormPrefs: null,
        sort: 0,
        createdAt: now,
        updatedAt: now
      }
    })
    await db.collection('users').doc(user._id).update({
      data: { defaultPeopleCount: 1, updatedAt: now }
    })
  } catch (e) {
    // members 集合未建时仍算引导完成，避免卡在完成页
    console.warn('completeOnboarding members.add failed', e)
    return { ok: true, memberId: null, onboardingDone: true, memberSkipped: true }
  }

  return { ok: true, memberId, onboardingDone: true, defaultPeopleCount: 1 }
}

/** Mark done without collecting fields — for skip / later fill-in via「我的」. */
async function handleSkipOnboarding(uid, user) {
  await db.collection('users').doc(user._id).update({
    data: {
      onboardingDone: true,
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, onboardingDone: true, skipped: true }
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
  await db.collection('users').doc(user._id).update({ data: patch })
  return {
    ok: true,
    familyAvoids: patch.familyAvoids != null ? patch.familyAvoids : user.familyAvoids || [],
    dishFormPrefs: patch.dishFormPrefs || user.dishFormPrefs || {},
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

async function handleConfirmFamilyAvoidsNone(uid, user) {
  await db.collection('users').doc(user._id).update({
    data: {
      familyAvoidsNone: true,
      familyAvoids: [],
      familyAvoidsConfirmedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return { ok: true, familyAvoidsNone: true, familyAvoids: [] }
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
  if (action === 'skipOnboarding') return handleSkipOnboarding(uid, user)
  if (action === 'saveProfileLite') return handleSaveProfileLite(event, uid, user)
  if (action === 'skipProfileLite') return handleSkipProfileLite(uid, user)
  if (action === 'confirmFamilyAvoidsNone') return handleConfirmFamilyAvoidsNone(uid, user)
  if (action === 'confirmCuisineNoPreference') return handleConfirmCuisineNoPreference(uid, user)
  console.warn('profile UNKNOWN_ACTION', action)
  return {
    ok: false,
    error: 'UNKNOWN_ACTION',
    hint: '请重新上传并部署云函数 profile（需含 saveProfileLite / skipProfileLite / confirmFamilyAvoidsNone / confirmCuisineNoPreference）',
    action: action || null
  }
}
