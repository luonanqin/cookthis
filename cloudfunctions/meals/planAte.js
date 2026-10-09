'use strict'

/**
 * 已选方案点选已吃（§4.3）：On/Off 幂等决策，不含 DB 读写。
 */

function trimDishName(name) {
  return String(name || '').trim()
}

function planAteOnDecision(input) {
  const uid = input && input.uid
  const requestId = String((input && input.requestId) || '').trim()
  const recommendationId = (input && input.recommendationId) || null
  const dishName = trimDishName(input && input.dishName)
  const existingRow = input && input.existingRow

  if (!requestId) {
    return { ok: false, error: 'REQUEST_ID_REQUIRED' }
  }
  if (!dishName) {
    return { ok: false, error: 'DISH_NAME_REQUIRED' }
  }

  if (existingRow) {
    return {
      ok: true,
      noop: true,
      logId: existingRow.logId || null
    }
  }

  return {
    ok: true,
    noop: false,
    record: {
      uid,
      logId: null,
      dishNames: [dishName],
      source: 'plan_ate',
      recommendationId,
      requestId
    }
  }
}

function planAteOffDecision(input) {
  const existingRow = input && input.existingRow

  if (!existingRow) {
    return { ok: true, noop: true }
  }

  return {
    ok: true,
    noop: false,
    logId: existingRow.logId || null
  }
}

/** Client: Off noop (confirm/manual ate, no plan_ate row) must not stay unchecked. */
function planAteOffUiDecision(result) {
  if (result && result.noop) {
    return { restoreAte: true, toast: '请到已吃记录删除' }
  }
  return { restoreAte: false, toast: null }
}

module.exports = { planAteOnDecision, planAteOffDecision, planAteOffUiDecision }
