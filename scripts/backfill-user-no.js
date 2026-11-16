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
 * --counter is dump dry-run only; refuse it with --apply.
 *
 * Ops: scripts/backfill-user-no.md
 */
const fs = require('fs')
const {
  parseArgs,
  parseCounterValue,
  decideCounterAdvance,
  isMissingCounterDoc,
  parseUsersDumpText,
  planUserNoBackfill,
  applyPlan,
  formatBackfillReport
} = require('./lib/backfillUserNo.js')

const PAGE_SIZE = 100

function loadDump(filePath) {
  return parseUsersDumpText(fs.readFileSync(filePath, 'utf8'))
}

function unwrapDoc(snap) {
  if (!snap) return null
  const data = snap.data
  if (typeof data === 'function') {
    const out = data()
    if (Array.isArray(out)) return out[0] || null
    return out || null
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
  let snap
  try {
    snap = await db.collection('counters').doc('userNo').get()
  } catch (err) {
    if (isMissingCounterDoc(err)) return 0
    throw err
  }
  return parseCounterValue(unwrapDoc(snap))
}

function cloudWriter(db) {
  const now = () => (typeof db.serverDate === 'function' ? db.serverDate() : new Date())

  async function reserveOnDoc(getDoc, setDoc, updateDoc, observed, next) {
    let snap
    try {
      snap = await getDoc()
    } catch (err) {
      if (!isMissingCounterDoc(err)) throw err
      snap = null
    }
    const data = unwrapDoc(snap)
    const live = parseCounterValue(data)
    const target = decideCounterAdvance(observed, live, next)
    if (target === live && data) return target
    const payload = { value: target, updatedAt: now() }
    if (data) await updateDoc(payload)
    else await setDoc(payload)
    return target
  }

  return {
    async reserveCounter(observed, next) {
      if (typeof db.runTransaction === 'function') {
        return db.runTransaction(async (tx) => {
          const doc = tx.collection('counters').doc('userNo')
          return reserveOnDoc(
            () => doc.get(),
            (payload) => doc.set(payload),
            (payload) => doc.update(payload),
            observed,
            next
          )
        })
      }
      const ref = db.collection('counters').doc('userNo')
      return reserveOnDoc(
        () => ref.get(),
        (payload) => ref.set(payload),
        (payload) => ref.update(payload),
        observed,
        next
      )
    },
    async readUser(id) {
      const snap = await db.collection('users').doc(id).get()
      return unwrapDoc(snap)
    },
    async updateUser(row) {
      await db.collection('users').doc(row._id).update({
        userNo: row.userNo,
        updatedAt: now()
      })
    }
  }
}

async function runCli(argv = process.argv, io = {}) {
  const args = parseArgs(argv)
  if (args.apply && args.usersJson) {
    throw new Error('refusing --apply with --users-json; apply must use live cloud data')
  }
  if (args.apply && args.counter != null) {
    throw new Error('refusing --apply with --counter; --counter is dump dry-run only')
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

  if (!args.apply) {
    writeOut(report)
    return { plan, report, written: 0 }
  }

  const writer = io.writer || cloudWriter(db)
  await applyPlan(plan, writer)
  writeOut(report)
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
