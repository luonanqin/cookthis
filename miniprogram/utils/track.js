const { callCloud } = require('../services/cloud.js')

const QUEUE_KEY = 'cookthis_track_queue'
const MAX_QUEUE = 40
let sessionId = null
let flushTimer = null

function getSessionId() {
  if (sessionId) return sessionId
  try {
    sessionId = wx.getStorageSync('cookthis_session_id')
  } catch (e) {}
  if (!sessionId) {
    sessionId = `sess_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    try {
      wx.setStorageSync('cookthis_session_id', sessionId)
    } catch (e) {}
  }
  return sessionId
}

function readQueue() {
  try {
    const q = wx.getStorageSync(QUEUE_KEY)
    return Array.isArray(q) ? q : []
  } catch (e) {
    return []
  }
}

function writeQueue(q) {
  try {
    wx.setStorageSync(QUEUE_KEY, q.slice(-MAX_QUEUE))
  } catch (e) {}
}

function track(event, props) {
  if (!event) return
  const item = {
    event: String(event),
    props: props || {},
    platform: 'mp',
    loginProvider: 'wechat_mp',
    sessionId: getSessionId(),
    ts: new Date().toISOString()
  }
  const q = readQueue()
  q.push(item)
  writeQueue(q)
  if (q.length >= 10) {
    flush()
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, 5000)
  }
}

function flush() {
  const q = readQueue()
  if (!q.length) return
  writeQueue([])
  callCloud('analytics', { action: 'trackBatch', events: q }).catch(() => {
    // re-queue on failure
    writeQueue(readQueue().concat(q).slice(-MAX_QUEUE))
  })
}

module.exports = { track, flush }
