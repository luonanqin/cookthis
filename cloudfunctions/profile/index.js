'use strict'
const cloud = require('wx-server-sdk')

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
  return {
    ok: true,
    profile: {
      uid: user.uid,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || null,
      city: user.city || null,
      defaultPeopleCount: user.defaultPeopleCount ?? 2,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 },
      mealTimes: user.mealTimes || {},
      cookBudget: user.cookBudget || 'about30',
      familyAvoids: user.familyAvoids || [],
      dishFormPrefs: user.dishFormPrefs || {},
      onboardingDone: !!user.onboardingDone
    },
    members
  }
}

async function handleUpdateFamily(event, uid, user) {
  const patch = {}
  if (Array.isArray(event.familyAvoids)) {
    patch.familyAvoids = sanitizeAvoids(event.familyAvoids)
  }
  if (event.dishFormPrefs && typeof event.dishFormPrefs === 'object') {
    patch.dishFormPrefs = Object.assign(
      {},
      user.dishFormPrefs || {},
      sanitizeDishFormPrefs(event.dishFormPrefs)
    )
  }
  if (typeof event.defaultPeopleCount === 'number' && event.defaultPeopleCount >= 1) {
    patch.defaultPeopleCount = Math.floor(event.defaultPeopleCount)
  }
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

async function handleAddMember(event, uid) {
  const name = String((event && event.name) || '').trim()
  if (!name) return { ok: false, error: 'NAME_REQUIRED' }
  const now = db.serverDate()
  const memberId = makeMemberId()
  await db.collection('members').add({
    data: {
      uid,
      memberId,
      name,
      role: (event && event.role) || 'other',
      ageBand: (event && event.ageBand) || '26_40',
      taste: (event && event.taste) || 'normal',
      avoids: sanitizeAvoids((event && event.avoids) || []),
      dishFormPrefs: null,
      sort: Number(event && event.sort) || 0,
      createdAt: now,
      updatedAt: now
    }
  })
  return { ok: true, memberId }
}

async function handleUpdateMember(event, uid) {
  const memberId = event && event.memberId
  if (!memberId) return { ok: false, error: 'MEMBER_ID_REQUIRED' }
  const res = await db.collection('members').where({ uid, memberId }).limit(1).get()
  const row = res.data[0]
  if (!row) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  const patch = { updatedAt: db.serverDate() }
  if (typeof event.name === 'string' && event.name.trim()) patch.name = event.name.trim()
  if (typeof event.ageBand === 'string') patch.ageBand = event.ageBand
  if (typeof event.taste === 'string') patch.taste = event.taste
  if (Array.isArray(event.avoids)) patch.avoids = sanitizeAvoids(event.avoids)
  await db.collection('members').doc(row._id).update({ data: patch })
  return { ok: true }
}

async function handleRemoveMember(event, uid) {
  const memberId = event && event.memberId
  if (!memberId) return { ok: false, error: 'MEMBER_ID_REQUIRED' }
  const res = await db.collection('members').where({ uid, memberId }).limit(1).get()
  const row = res.data[0]
  if (!row) return { ok: false, error: 'MEMBER_NOT_FOUND' }
  await db.collection('members').doc(row._id).remove()
  return { ok: true }
}

async function handleCompleteOnboarding(event, uid, user) {
  const familyAvoids = sanitizeAvoids((event && event.familyAvoids) || [])
  const dishFormPrefs = sanitizeDishFormPrefs((event && event.dishFormPrefs) || {})
  const defaultPeopleCount =
    typeof event.defaultPeopleCount === 'number' && event.defaultPeopleCount >= 1
      ? Math.floor(event.defaultPeopleCount)
      : user.defaultPeopleCount || 2
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

  const now = db.serverDate()
  await db.collection('users').doc(user._id).update({
    data: {
      familyAvoids,
      dishFormPrefs,
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
  await db.collection('members').add({
    data: {
      uid,
      memberId,
      name,
      role: 'self',
      ageBand: self.ageBand || '26_40',
      taste: self.taste || 'normal',
      avoids: sanitizeAvoids(self.avoids || []),
      dishFormPrefs: null,
      sort: 0,
      createdAt: now,
      updatedAt: now
    }
  })

  return { ok: true, memberId, onboardingDone: true }
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
  if (action === 'addMember') return handleAddMember(event, uid)
  if (action === 'updateMember') return handleUpdateMember(event, uid)
  if (action === 'removeMember') return handleRemoveMember(event, uid)
  if (action === 'completeOnboarding') return handleCompleteOnboarding(event, uid, user)
  return { ok: false, error: 'UNKNOWN_ACTION' }
}
