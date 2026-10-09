'use strict'

/**
 * 删除已吃记录决策（§4.2）：校验 logId / 归属后给出物理删除用的 docId。
 * @param {{ uid: string, logId: string, row: object|null|undefined }} input
 */
function planRemoveMealLog(input) {
  const uid = input && input.uid
  const logId = String((input && input.logId) || '').trim()
  if (!logId) {
    return { ok: false, error: 'LOG_ID_REQUIRED' }
  }
  const row = input && input.row
  if (!row) {
    return { ok: false, error: 'NOT_FOUND' }
  }
  if (!uid || row.uid !== uid) {
    return { ok: false, error: 'FORBIDDEN' }
  }
  const docId = row._id
  if (!docId) {
    return { ok: false, error: 'NOT_FOUND' }
  }
  return {
    ok: true,
    docId,
    logId: row.logId || logId,
    source: row.source || null
  }
}

module.exports = { planRemoveMealLog }
