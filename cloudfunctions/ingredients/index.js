'use strict'
const cloud = require('wx-server-sdk')
// Vendored copy: WeChat upload only packs this function dir (../_shared is unreliable).
// Source of truth for tests: cloudfunctions/_shared/confirmList.js — keep in sync when changing.
const { buildConfirmList } = require('./confirmList.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX = 500

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'NO_OPENID' }

  let city = (event && event.city) || null
  if (!city) {
    const idRes = await db.collection('user_identities')
      .where({ provider: 'wechat_mp', providerUserId: openid })
      .limit(1)
      .get()
    if (idRes.data[0]) {
      const u = await db.collection('users').where({ uid: idRes.data[0].uid }).limit(1).get()
      city = (u.data[0] && u.data[0].city) || null
    }
  }

  const res = await db.collection('ingredients').limit(MAX).get()
  const built = buildConfirmList(res.data, city)
  return { ok: true, ...built }
}
