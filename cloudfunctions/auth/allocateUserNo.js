'use strict'
/**
 * 原子取下一 userNo。集合 counters / doc userNo / 字段 value。
 * 首次自动建 doc value=0 再 inc。
 *
 * WeChat wx-server-sdk Transaction API (current):
 *   transaction.collection(name).doc(id).get/update/set
 * Read and write stay in the same runTransaction callback.
 * Never unlocked max+1 (get outside tx, then write).
 */
function isDocNotFound(err) {
  if (!err) return false
  const code = String(err.code || err.errCode || '')
  const msg = String(err.message || err.errMsg || '')
  return (
    /NOT_EXIST/i.test(code) ||
    /NOT_FOUND/i.test(code) ||
    /not exist/i.test(msg) ||
    /not found/i.test(msg) ||
    /doesn'?t exist/i.test(msg)
  )
}

async function allocateUserNo(db) {
  const next = await db.runTransaction(async (tx) => {
    const doc = tx.collection('counters').doc('userNo')
    let snap
    try {
      snap = await doc.get()
    } catch (e) {
      if (!isDocNotFound(e)) throw e
      snap = null
    }
    const data = snap && snap.data
    const cur = data && typeof data.value === 'number' ? data.value : 0
    const value = cur + 1
    const payload = { value, updatedAt: db.serverDate() }
    if (data) {
      await doc.update({ data: payload })
    } else {
      await doc.set({ data: payload })
    }
    return value
  })
  return next
}

module.exports = { allocateUserNo }
