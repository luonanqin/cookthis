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

module.exports = { planAteOnDecision, planAteOffDecision }
