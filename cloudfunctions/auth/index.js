'use strict'
const cloud = require('wx-server-sdk')
// Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
// Source of truth for tests: cloudfunctions/_shared/nickname.js — keep in sync when changing.
const { buildDefaultNickname } = require('./nickname.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { ok: false, error: 'NO_OPENID' }
  }
  const platform = (event && event.platform) || 'mp'
  if (platform !== 'mp') {
    return { ok: false, error: 'UNSUPPORTED_PLATFORM' }
  }

  const idRes = await db.collection('user_identities')
    .where({ provider: 'wechat_mp', providerUserId: openid })
    .limit(1)
    .get()

  const now = db.serverDate()

  if (idRes.data.length) {
    const row = idRes.data[0]
    await db.collection('user_identities').doc(row._id).update({
      data: { lastLoginAt: now }
    })
    const userRes = await db.collection('users').where({ uid: row.uid }).limit(1).get()
    const user = userRes.data[0]
    return {
      ok: true,
      uid: user.uid,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || null,
      isNewUser: false,
      city: user.city || null,
      familyAvoids: user.familyAvoids || [],
      defaultPeopleCount: user.defaultPeopleCount ?? 2,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 }
    }
  }

  const uid = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  let nickname = buildDefaultNickname(uid)
  // 可选：查重 nickname，冲突则 buildDefaultNickname(uid, 5)

  await db.collection('users').add({
    data: {
      uid,
      nickname,
      avatarUrl: null,
      phone: null,
      phoneVerified: false,
      city: null,
      defaultPeopleCount: 2,
      defaultCombo: { meat: 1, veg: 1, soup: 0 },
      mealTimes: { lunch: '12:00', dinner: '18:30' },
      cookBudget: 'about30',
      familyAvoids: [],
      dishFormPrefs: {},
      requirePhoneFor: [],
      createdAt: now,
      updatedAt: now
    }
  })

  await db.collection('user_identities').add({
    data: {
      uid,
      provider: 'wechat_mp',
      providerUserId: openid,
      unionId: wxContext.UNIONID || null,
      verified: true,
      createdAt: now,
      lastLoginAt: now
    }
  })

  return {
    ok: true,
    uid,
    nickname,
    avatarUrl: null,
    isNewUser: true,
    city: null,
    familyAvoids: [],
    defaultPeopleCount: 2,
    defaultCombo: { meat: 1, veg: 1, soup: 0 }
  }
}
