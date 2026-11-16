#!/usr/bin/env node
'use strict'
/**
 * One-shot userNo backfill for existing users.
 *
 * Default: dry-run (print the assignment plan; no writes).
 * Never rearranges a user who already has a valid userNo.
 *
 * Offline:
 *   node scripts/backfill-user-no.js --users-json dump.json
 *   node scripts/backfill-user-no.js --users-json dump.json --counter 12
 *
 * Live cloud (optional @cloudbase/node-sdk + TCB_* env):
 *   node scripts/backfill-user-no.js
 *   node scripts/backfill-user-no.js --apply
 *
 * Ops: scripts/backfill-user-no.md
 */
const fs = require('fs')
const {
  parseArgs,
  planUserNoBackfill,
  applyPlan,
  formatBackfillReport
} = require('./lib/backfillUserNo.js')

const PAGE_SIZE = 100

function loadDump(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (Array.isArray(raw)) return { users: raw, counterValue: 0 }
  if (raw && Array.isArray(raw.users)) {
    const n = raw.counterValue
    const counterValue = Number.isInteger(n) && n >= 0 ? n : 0
    return { users: raw.users, counterValue }
  }
  throw new Error('users json must be an array or { users, counterValue }')
}

function unwrapDoc(snap) {
  if (!snap) return null
  const data = snap.data
  if (typeof data === 'function') {
    try {
      const out = data()
      if (Array.isArray(out)) return out[0] || null
      return out || null
    } catch (err) {
      return null
    }
  }
  if (Array.isArray(data)) return data[0] || null
  if (data && typeof data === 'object') return data
  return null
}

function initCloudDb() {
  const env = process.env.TCB_ENV || process.env.TCB_ENV_ID
  const secretId = process.env.TCB_SECRET_ID
  const secretKey = process.env.TCB_SECRET_KEY
  if (!env || !secretId || !secretKey) {
    throw new Error(
      'cloud mode needs TCB_ENV, TCB_SECRET_ID, TCB_SECRET_KEY (or pass --users-json). See scripts/backfill-user-no.md'
    )
  }
  let cloudbase
  try {
    cloudbase = require('@cloudbase/node-sdk')
  } catch (err) {
    throw new Error(
      'optional dependency @cloudbase/node-sdk is not installed. Dry-run with --users-json, or npm i @cloudbase/node-sdk'
    )
  }
  const app = cloudbase.init({ env, secretId, secretKey })
  return app.database()
}

async function fetchAllUsers(db) {
  const _ = db.command
  const all = []
  let lastId = null
  for (;;) {
    let query = db.collection('users')
    if (lastId != null) {
      query = query.where({ _id: _.gt(lastId) })
    }
    const res = await query.orderBy('_id', 'asc').limit(PAGE_SIZE).get()
    const rows = (res && res.data) || []
    if (!rows.length) break
    all.push(...rows)
    lastId = rows[rows.length - 1]._id
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

async function fetchCounterValue(db) {
  try {
    const snap = await db.collection('counters').doc('userNo').get()
    const data = unwrapDoc(snap)
    const value = data && data.value
    if (Number.isInteger(value) && value >= 0) return value
    return 0
  } catch (err) {
    return 0
  }
}

function cloudWriter(db) {
  const now = () => (typeof db.serverDate === 'function' ? db.serverDate() : new Date())
  return {
    async updateUser(row) {
      await db.collection('users').doc(row._id).update({
        userNo: row.userNo,
        updatedAt: now()
      })
    },
    async upsertCounter(value) {
      const payload = { value, updatedAt: now() }
      const ref = db.collection('counters').doc('userNo')
      try {
        await ref.update(payload)
      } catch (err) {
        await ref.set(payload)
      }
    }
  }
}

async function runCli(argv = process.argv, io = {}) {
  const args = parseArgs(argv)
  if (args.apply && args.usersJson) {
    throw new Error('refusing --apply with --users-json; apply must use live cloud data')
  }

  let users
  let counterValue
  let db = null

  if (args.usersJson) {
    const dump = (io.loadDump || loadDump)(args.usersJson)
    users = dump.users
    counterValue = dump.counterValue
  } else {
    db = io.db || initCloudDb()
    users = await (io.fetchAllUsers || fetchAllUsers)(db)
    counterValue = await (io.fetchCounterValue || fetchCounterValue)(db)
  }

  if (args.counter != null) counterValue = args.counter

  const plan = planUserNoBackfill(users, counterValue)
  const mode = args.apply ? 'apply' : 'dry-run'
  const report = formatBackfillReport(plan, { mode })
  const writeOut = io.stdoutWrite || ((text) => process.stdout.write(text))
  writeOut(report)

  if (!args.apply) return { plan, report, written: 0 }

  const writer = io.writer || cloudWriter(db)
  await applyPlan(plan, writer)
  return { plan, report, written: plan.assignments.length }
}

async function main(argv = process.argv) {
  try {
    await runCli(argv)
  } catch (err) {
    console.error(err && err.message ? err.message : err)
    process.exitCode = 1
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  loadDump,
  fetchAllUsers,
  fetchCounterValue,
  cloudWriter,
  runCli,
  main
}
