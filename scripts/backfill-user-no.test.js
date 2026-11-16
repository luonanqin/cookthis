'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  toCreatedAtMs,
  parseArgs,
  planUserNoBackfill,
  formatBackfillReport,
  applyPlan
} = require('./lib/backfillUserNo.js')
const { runCli } = require('./backfill-user-no.js')

function users(rows) {
  return rows.map((row) => ({ ...row }))
}

describe('toCreatedAtMs', () => {
  it('reads numbers, Dates, ISO strings, and $date objects', () => {
    assert.equal(toCreatedAtMs(1700000000000), 1700000000000)
    assert.equal(toCreatedAtMs(new Date(1700000000000)), 1700000000000)
    assert.equal(toCreatedAtMs('2023-11-14T22:13:20.000Z'), Date.parse('2023-11-14T22:13:20.000Z'))
    assert.equal(toCreatedAtMs({ $date: 1700000000000 }), 1700000000000)
  })

  it('treats missing or unreadable values as 0', () => {
    assert.equal(toCreatedAtMs(null), 0)
    assert.equal(toCreatedAtMs(undefined), 0)
    assert.equal(toCreatedAtMs('not-a-date'), 0)
    assert.equal(toCreatedAtMs({}), 0)
  })
})

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    assert.deepEqual(parseArgs(['node', 'backfill-user-no.js']), {
      apply: false,
      usersJson: null,
      counter: null
    })
  })

  it('accepts --apply, --users-json, and --counter', () => {
    assert.deepEqual(
      parseArgs([
        'node',
        'backfill-user-no.js',
        '--apply',
        '--users-json',
        'dump.json',
        '--counter',
        '12'
      ]),
      { apply: true, usersJson: 'dump.json', counter: 12 }
    )
  })

  it('rejects unknown flags', () => {
    assert.throws(
      () => parseArgs(['node', 'backfill-user-no.js', '--force']),
      /unknown argument: --force/
    )
  })
})

describe('planUserNoBackfill', () => {
  it('skips valid userNo and assigns remaining by createdAt then uid', () => {
    const snapshot = users([
      { _id: 'd', uid: 'u_d', createdAt: 100, userNo: 2 },
      { _id: 'c', uid: 'u_c', createdAt: 50, userNo: null },
      { _id: 'b', uid: 'u_b', createdAt: 50 },
      { _id: 'a', uid: 'u_a', createdAt: 10, userNo: 0 }
    ])
    const before = JSON.stringify(snapshot)
    const plan = planUserNoBackfill(snapshot, 2)

    assert.equal(plan.maxExisting, 2)
    assert.equal(plan.counterValue, 2)
    assert.equal(plan.nextCounter, 5)
    assert.deepEqual(
      plan.assignments.map((row) => [row.uid, row.userNo]),
      [
        ['u_a', 3],
        ['u_b', 4],
        ['u_c', 5]
      ]
    )
    assert.deepEqual(
      plan.skipped.map((row) => [row.uid, row.userNo]),
      [['u_d', 2]]
    )
    assert.equal(JSON.stringify(snapshot), before)
  })

  it('starts after max(maxExisting, counters.value) and never rearranges existing numbers', () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'old', uid: 'u_old', createdAt: 1, userNo: 1 },
        { _id: 'gap', uid: 'u_gap', createdAt: 2, userNo: 10 },
        { _id: 'new', uid: 'u_new', createdAt: 3 }
      ]),
      4
    )

    assert.equal(plan.maxExisting, 10)
    assert.deepEqual(
      plan.assignments.map((row) => [row.uid, row.userNo]),
      [['u_new', 11]]
    )
    assert.deepEqual(
      plan.skipped.map((row) => [row.uid, row.userNo]),
      [
        ['u_old', 1],
        ['u_gap', 10]
      ]
    )
    assert.equal(plan.nextCounter, 11)
  })

  it('is idempotent when every user already has a valid userNo', () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'a', uid: 'u_a', createdAt: 1, userNo: 1 },
        { _id: 'b', uid: 'u_b', createdAt: 2, userNo: 2 }
      ]),
      2
    )

    assert.deepEqual(plan.assignments, [])
    assert.equal(plan.nextCounter, 2)
    assert.equal(plan.skipped.length, 2)
  })

  it('bumps a stale counter even when nobody needs a number', () => {
    const plan = planUserNoBackfill(
      users([{ _id: 'a', uid: 'u_a', createdAt: 1, userNo: 9 }]),
      3
    )
    assert.deepEqual(plan.assignments, [])
    assert.equal(plan.nextCounter, 9)
  })

  it('assigns from 1 when the collection and counter are empty', () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'b', uid: 'u_b', createdAt: 20 },
        { _id: 'a', uid: 'u_a', createdAt: 10 }
      ]),
      0
    )
    assert.deepEqual(
      plan.assignments.map((row) => [row.uid, row.userNo]),
      [
        ['u_a', 1],
        ['u_b', 2]
      ]
    )
    assert.equal(plan.nextCounter, 2)
  })

  it('reports duplicate existing userNo without changing those rows', () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'a', uid: 'u_a', createdAt: 1, userNo: 5 },
        { _id: 'b', uid: 'u_b', createdAt: 2, userNo: 5 },
        { _id: 'c', uid: 'u_c', createdAt: 3 }
      ]),
      5
    )
    assert.deepEqual(plan.duplicateUserNos, [5])
    assert.equal(plan.assignments[0].userNo, 6)
    assert.equal(plan.skipped.length, 2)
  })
})

describe('applyPlan', () => {
  it('writes pending users first, then the counter, and never touches skipped rows', async () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'kept', uid: 'u_kept', createdAt: 1, userNo: 1 },
        { _id: 'need', uid: 'u_need', createdAt: 2 }
      ]),
      1
    )
    const calls = []
    await applyPlan(plan, {
      updateUser: async (row) => {
        calls.push(['user', row.uid, row.userNo])
      },
      upsertCounter: async (value) => {
        calls.push(['counter', value])
      }
    })
    assert.deepEqual(calls, [
      ['user', 'u_need', 2],
      ['counter', 2]
    ])
  })

  it('refuses apply when existing userNo values collide', async () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'a', uid: 'u_a', createdAt: 1, userNo: 5 },
        { _id: 'b', uid: 'u_b', createdAt: 2, userNo: 5 }
      ]),
      5
    )
    await assert.rejects(
      () =>
        applyPlan(plan, {
          updateUser: async () => {},
          upsertCounter: async () => {}
        }),
      /duplicate existing userNo/
    )
  })
})

describe('runCli', () => {
  it('dry-runs a users dump and does not call the writer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-user-no-'))
    const file = path.join(dir, 'users.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        counterValue: 1,
        users: [
          { _id: 'kept', uid: 'u_kept', createdAt: 1, userNo: 1 },
          { _id: 'need', uid: 'u_need', createdAt: 2 }
        ]
      })
    )
    const writes = []
    try {
      const result = await runCli(['node', 'backfill-user-no.js', '--users-json', file], {
        stdoutWrite: () => {},
        writer: {
          updateUser: async (row) => writes.push(row),
          upsertCounter: async (value) => writes.push(value)
        }
      })
      assert.equal(result.written, 0)
      assert.match(result.report, /mode: dry-run/)
      assert.match(result.report, /assign\tu_need\t2/)
      assert.deepEqual(writes, [])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses --apply together with --users-json', async () => {
    await assert.rejects(
      () =>
        runCli(['node', 'backfill-user-no.js', '--apply', '--users-json', 'dump.json'], {
          stdoutWrite: () => {}
        }),
      /refusing --apply with --users-json/
    )
  })
})

describe('formatBackfillReport', () => {
  it('prints dry-run mode, counts, and planned writes', () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'kept', uid: 'u_kept', createdAt: 1, userNo: 1 },
        { _id: 'need', uid: 'u_need', createdAt: 2 }
      ]),
      1
    )
    const report = formatBackfillReport(plan, { mode: 'dry-run' })
    assert.match(report, /mode: dry-run/)
    assert.match(report, /pending: 1/)
    assert.match(report, /skipped: 1/)
    assert.match(report, /nextCounter: 2/)
    assert.match(report, /assign\tu_need\t2/)
    assert.match(report, /no writes/)
  })
})
