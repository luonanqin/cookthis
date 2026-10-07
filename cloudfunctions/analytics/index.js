'use strict'
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_BATCH = 50

async function resolveUid(openid) {
  if (!openid) return null
  try {
    const idRes = await db.collection('user_identities')
      .where({ provider: 'wechat_mp', providerUserId: openid })
      .limit(1)
      .get()
    return idRes.data[0] ? idRes.data[0].uid : null
  } catch (e) {
    return null
  }
}

exports.main = async (event) => {
  const action = (event && event.action) || 'trackBatch'
  if (action !== 'trackBatch') {
    return { ok: false, error: 'UNKNOWN_ACTION' }
  }

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const uid = await resolveUid(openid)

  const events = (event && event.events) || []
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: true, written: 0 }
  }

  const slice = events.slice(0, MAX_BATCH)
  const serverTs = db.serverDate()
  let written = 0
  for (const ev of slice) {
    if (!ev || typeof ev.event !== 'string' || !ev.event) continue
    try {
      await db.collection('events').add({
        data: {
          uid: uid || null,
          event: String(ev.event).slice(0, 64),
          props: (ev.props && typeof ev.props === 'object') ? ev.props : {},
          platform: ev.platform || 'mp',
          loginProvider: ev.loginProvider || 'wechat_mp',
          appVersion: ev.appVersion || null,
          sessionId: ev.sessionId || null,
          requestId: ev.requestId || null,
          ts: ev.ts || new Date().toISOString(),
          serverTs
        }
      })
      written += 1
    } catch (e) {
      // swallow per-event errors to avoid blocking
    }
  }
  return { ok: true, written }
}
