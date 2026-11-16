'use strict'

const { isValidUserNo } = require('../../cloudfunctions/_shared/userNo.js')

function toCreatedAtMs(value) {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) ? t : 0
  }
  if (typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : 0
  }
  if (typeof value === 'object') {
    if (typeof value.$date === 'number' && Number.isFinite(value.$date)) {
      return value.$date
    }
    if (typeof value.getTime === 'function') {
      const t = value.getTime()
      return Number.isFinite(t) ? t : 0
    }
  }
  return 0
}

function isMissingCounterDoc(err) {
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

function parseCounterValue(data) {
  if (data == null) return 0
  if (typeof data !== 'object') {
    throw new Error('counters/userNo doc is not an object')
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'value') || data.value == null) {
    return 0
  }
  const value = data.value
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('counters/userNo.value is not an integer >= 0: ' + String(value))
  }
  return value
}

function decideCounterAdvance(observed, live, next) {
  if (!Number.isInteger(observed) || observed < 0) {
    throw new Error('invalid observed counter: ' + observed)
  }
  if (!Number.isInteger(live) || live < 0) {
    throw new Error('invalid live counter: ' + live)
  }
  if (!Number.isInteger(next) || next < 0) {
    throw new Error('invalid next counter: ' + next)
  }
  if (live !== observed) {
    throw new Error(
      'counter moved since plan (' + observed + ' → ' + live + '); aborting apply'
    )
  }
  if (next < live) {
    throw new Error('refusing to decrease counter from ' + live + ' to ' + next)
  }
  return next
}

function parseArgs(argv) {
  const args = argv.slice(2)
  let apply = false
  let usersJson = null
  let counter = null
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--users-json') {
      const next = args[++i]
      if (!next || next.startsWith('--')) {
        throw new Error('missing value for --users-json')
      }
      usersJson = next
      continue
    }
    if (arg === '--counter') {
      const next = args[++i]
      if (!next || next.startsWith('--')) {
        throw new Error('missing value for --counter')
      }
      const n = Number(next)
      if (!Number.isInteger(n) || n < 0) {
        throw new Error('invalid --counter: ' + next)
      }
      counter = n
      continue
    }
    throw new Error('unknown argument: ' + arg)
  }
  return { apply, usersJson, counter }
}

function comparePending(a, b) {
  const da = toCreatedAtMs(a.createdAt)
  const db = toCreatedAtMs(b.createdAt)
  if (da !== db) return da - db
  const ua = String(a.uid || '')
  const ub = String(b.uid || '')
  if (ua < ub) return -1
  if (ua > ub) return 1
  return 0
}

function planUserNoBackfill(users, counterValue) {
  const list = Array.isArray(users) ? users : []
  const counter = Number.isInteger(counterValue) && counterValue >= 0 ? counterValue : 0
  const skipped = []
  const pending = []
  const seen = new Map()
  const duplicateUserNos = []

  for (const user of list) {
    if (user && isValidUserNo(user.userNo)) {
      skipped.push({
        _id: user._id,
        uid: user.uid,
        userNo: user.userNo
      })
      if (seen.has(user.userNo)) {
        if (!duplicateUserNos.includes(user.userNo)) duplicateUserNos.push(user.userNo)
      } else {
        seen.set(user.userNo, user.uid)
      }
      continue
    }
    pending.push(user)
  }

  pending.sort(comparePending)

  let maxExisting = 0
  for (const row of skipped) {
    if (row.userNo > maxExisting) maxExisting = row.userNo
  }

  const floor = Math.max(maxExisting, counter)
  const assignments = pending.map((user, index) => ({
    _id: user && user._id,
    uid: user && user.uid,
    createdAt: user && user.createdAt,
    userNo: floor + 1 + index
  }))
  const nextCounter = assignments.length ? floor + assignments.length : floor

  return {
    userCount: list.length,
    skipped,
    assignments,
    maxExisting,
    counterValue: counter,
    nextCounter,
    duplicateUserNos
  }
}

async function applyPlan(plan, writer) {
  if (!plan) throw new Error('missing plan')
  if (plan.duplicateUserNos && plan.duplicateUserNos.length) {
    throw new Error('duplicate existing userNo: ' + plan.duplicateUserNos.join(','))
  }
  if (!writer || typeof writer.reserveCounter !== 'function') {
    throw new Error('writer.reserveCounter required')
  }
  await writer.reserveCounter(plan.counterValue, plan.nextCounter)
  const assignments = (plan && plan.assignments) || []
  for (const row of assignments) {
    if (!row || row._id == null || row._id === '') {
      throw new Error('assignment missing _id for uid ' + (row && row.uid))
    }
    if (typeof writer.readUser === 'function') {
      const existing = await writer.readUser(row._id)
      if (!existing) {
        throw new Error('user missing for uid ' + (row.uid || row._id))
      }
      if (isValidUserNo(existing.userNo)) continue
    }
    await writer.updateUser(row)
  }
}

function formatBackfillReport(plan, options) {
  const mode = (options && options.mode) || 'dry-run'
  const lines = [
    `mode: ${mode}`,
    `users: ${plan.userCount}`,
    `skipped: ${plan.skipped.length}`,
    `pending: ${plan.assignments.length}`,
    `maxExisting: ${plan.maxExisting}`,
    `counterValue: ${plan.counterValue}`,
    `nextCounter: ${plan.nextCounter}`
  ]
  if (plan.duplicateUserNos && plan.duplicateUserNos.length) {
    lines.push('duplicate existing userNo: ' + plan.duplicateUserNos.join(','))
  }
  for (const row of plan.assignments) {
    lines.push(`assign\t${row.uid}\t${row.userNo}`)
  }
  if (mode === 'dry-run') {
    for (const row of plan.skipped || []) {
      lines.push(`skip\t${row.uid}\t${row.userNo}`)
    }
    lines.push('no writes (dry-run)')
  } else {
    lines.push(
      `writes: ${plan.assignments.length} users + counters.userNo.value=${plan.nextCounter}`
    )
  }
  return lines.join('\n') + '\n'
}

module.exports = {
  isValidUserNo,
  toCreatedAtMs,
  isMissingCounterDoc,
  parseCounterValue,
  decideCounterAdvance,
  parseArgs,
  planUserNoBackfill,
  applyPlan,
  formatBackfillReport
}
