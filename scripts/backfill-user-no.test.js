'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  toCreatedAtMs,
  parseArgs,
  parseCounterValue,
  decideCounterAdvance,
  parseUsersDumpText,
  planUserNoBackfill,
  formatBackfillReport,
  applyPlan
} = require('./lib/backfillUserNo.js')
const { runCli, fetchCounterValue, cloudWriter } = require('./backfill-user-no.js')

function users(rows) {
  return rows.map((row) => ({ ...row }))
}

describe('toCreatedAtMs', () => {
  it('reads numbers, Dates, ISO strings, and $date objects', () => {
    assert.equal(toCreatedAtMs(1700000000000), 1700000000000)
    assert.equal(toCreatedAtMs(new Date(1700000000000)), 1700000000000)
    assert.equal(toCreatedAtMs('2023-11-14T22:13:20.000Z'), Date.parse('2023-11-14T22:13:20.000Z'))
    assert.equal(toCreatedAtMs({ $date: 1700000000000 }), 1700000000000)
    assert.equal(
      toCreatedAtMs({ $date: '2026-10-06T17:37:02.318Z' }),
      Date.parse('2026-10-06T17:37:02.318Z')
    )
  })

  it('treats missing or unreadable values as 0', () => {
    assert.equal(toCreatedAtMs(null), 0)
    assert.equal(toCreatedAtMs(undefined), 0)
    assert.equal(toCreatedAtMs('not-a-date'), 0)
    assert.equal(toCreatedAtMs({}), 0)
  })
})

describe('parseUsersDumpText', () => {
  it('parses cloud-console NDJSON (one user object per line)', () => {
    const text =
      '{"_id":"a","uid":"u_a","createdAt":{"$date":"2026-10-06T17:37:02.318Z"}}\n' +
      '{"_id":"b","uid":"u_b","createdAt":{"$date":"2026-10-30T03:16:14.246Z"}}\n'
    const dump = parseUsersDumpText(text)
    assert.equal(dump.users.length, 2)
    assert.equal(dump.users[0].uid, 'u_a')
    assert.equal(dump.counterValue, 0)
    const plan = planUserNoBackfill(dump.users, 0)
    assert.equal(plan.assignments.length, 2)
    assert.equal(plan.assignments[0].uid, 'u_a')
    assert.equal(plan.assignments[0].userNo, 1)
    assert.equal(plan.assignments[1].uid, 'u_b')
    assert.equal(plan.assignments[1].userNo, 2)
  })

  it('still accepts a JSON array and { users } envelope', () => {
    assert.equal(parseUsersDumpText('[{"uid":"u1"}]').users[0].uid, 'u1')
    assert.equal(
      parseUsersDumpText('{"users":[{"uid":"u2"}],"counterValue":3}').counterValue,
      3
    )
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

describe('parseCounterValue', () => {
  it('treats missing or empty counter docs as 0', () => {
    assert.equal(parseCounterValue(null), 0)
    assert.equal(parseCounterValue(undefined), 0)
    assert.equal(parseCounterValue({}), 0)
    assert.equal(parseCounterValue({ updatedAt: 'x' }), 0)
    assert.equal(parseCounterValue({ value: null }), 0)
  })

  it('returns an integer >= 0', () => {
    assert.equal(parseCounterValue({ value: 0 }), 0)
    assert.equal(parseCounterValue({ value: 12 }), 12)
  })

  it('aborts when value is present but not an integer >= 0', () => {
    assert.throws(() => parseCounterValue({ value: 1.5 }), /not an integer >= 0/)
    assert.throws(() => parseCounterValue({ value: -1 }), /not an integer >= 0/)
    assert.throws(() => parseCounterValue({ value: '12' }), /not an integer >= 0/)
    assert.throws(() => parseCounterValue({ value: NaN }), /not an integer >= 0/)
  })
})

describe('decideCounterAdvance', () => {
  it('returns next when the live counter still matches the plan', () => {
    assert.equal(decideCounterAdvance(5, 5, 8), 8)
    assert.equal(decideCounterAdvance(5, 5, 5), 5)
  })

  it('aborts when the live counter moved and never decreases it', () => {
    assert.throws(() => decideCounterAdvance(5, 6, 8), /counter moved/)
    assert.throws(() => decideCounterAdvance(8, 8, 5), /refusing to decrease counter/)
  })
})

describe('applyPlan', () => {
  function pendingPlan() {
    return planUserNoBackfill(
      users([
        { _id: 'kept', uid: 'u_kept', createdAt: 1, userNo: 1 },
        { _id: 'need', uid: 'u_need', createdAt: 2 }
      ]),
      1
    )
  }

  it('reserves the counter before writing users and never touches skipped rows', async () => {
    const plan = pendingPlan()
    const calls = []
    await applyPlan(plan, {
      reserveCounter: async (observed, next) => {
        calls.push(['reserve', observed, next])
      },
      readUser: async (id) => {
        calls.push(['read', id])
        return { _id: id, userNo: null }
      },
      updateUser: async (row) => {
        calls.push(['user', row.uid, row.userNo])
      }
    })
    assert.deepEqual(calls, [
      ['reserve', 1, 2],
      ['read', 'need'],
      ['user', 'u_need', 2]
    ])
  })

  it('does not write users when reserveCounter aborts', async () => {
    const calls = []
    await assert.rejects(
      () =>
        applyPlan(pendingPlan(), {
          reserveCounter: async () => {
            calls.push('reserve')
            throw new Error('counter moved since plan (1 → 2); aborting apply')
          },
          readUser: async () => {
            calls.push('read')
            return { userNo: null }
          },
          updateUser: async () => {
            calls.push('user')
          }
        }),
      /counter moved/
    )
    assert.deepEqual(calls, ['reserve'])
  })

  it('writes a planned number only when the stored userNo is still invalid', async () => {
    const plan = planUserNoBackfill(
      users([
        { _id: 'a', uid: 'u_a', createdAt: 1 },
        { _id: 'b', uid: 'u_b', createdAt: 2 }
      ]),
      0
    )
    const calls = []
    await applyPlan(plan, {
      reserveCounter: async () => {
        calls.push('reserve')
      },
      readUser: async (id) => {
        if (id === 'a') return { _id: 'a', userNo: 9 }
        return { _id: 'b', userNo: 0 }
      },
      updateUser: async (row) => {
        calls.push(['user', row.uid, row.userNo])
      }
    })
    assert.deepEqual(calls, ['reserve', ['user', 'u_b', 2]])
  })

  it('still reserves the counter when nobody needs a number', async () => {
    const plan = planUserNoBackfill(
      users([{ _id: 'a', uid: 'u_a', createdAt: 1, userNo: 9 }]),
      3
    )
    const calls = []
    await applyPlan(plan, {
      reserveCounter: async (observed, next) => {
        calls.push(['reserve', observed, next])
      },
      readUser: async () => {
        calls.push('read')
      },
      updateUser: async () => {
        calls.push('user')
      }
    })
    assert.deepEqual(calls, [['reserve', 3, 9]])
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
          reserveCounter: async () => {},
          readUser: async () => ({}),
          updateUser: async () => {}
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
      assert.match(result.report, /skip\tu_kept\t1/)
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

  it('refuses --apply together with --counter', async () => {
    await assert.rejects(
      () =>
        runCli(['node', 'backfill-user-no.js', '--apply', '--counter', '12'], {
          stdoutWrite: () => {}
        }),
      /refusing --apply with --counter/
    )
  })

  it('prints the apply report only after successful writes', async () => {
    const events = []
    const result = await runCli(['node', 'backfill-user-no.js', '--apply'], {
      db: {},
      fetchAllUsers: async () =>
        users([
          { _id: 'kept', uid: 'u_kept', createdAt: 1, userNo: 1 },
          { _id: 'need', uid: 'u_need', createdAt: 2 }
        ]),
      fetchCounterValue: async () => 1,
      writer: {
        reserveCounter: async () => {
          events.push('reserve')
        },
        readUser: async () => ({ userNo: null }),
        updateUser: async () => {
          events.push('user')
        }
      },
      stdoutWrite: (text) => {
        events.push('stdout')
        events.push(text)
      }
    })
    assert.deepEqual(
      events.filter((item) => item === 'reserve' || item === 'user' || item === 'stdout'),
      ['reserve', 'user', 'stdout']
    )
    assert.match(result.report, /mode: apply/)
    assert.match(events[events.length - 1], /mode: apply/)
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
    assert.match(report, /skip\tu_kept\t1/)
    assert.match(report, /no writes/)
  })
})

describe('fetchCounterValue', () => {
  function counterDb(getImpl) {
    return {
      collection(name) {
        assert.equal(name, 'counters')
        return {
          doc(id) {
            assert.equal(id, 'userNo')
            return { get: getImpl }
          }
        }
      }
    }
  }

  it('returns 0 when the counter doc is missing or empty', async () => {
    const missing = Object.assign(new Error('document not found'), {
      code: 'DATABASE.DOC_NOT_EXIST'
    })
    assert.equal(
      await fetchCounterValue(
        counterDb(async () => {
          throw missing
        })
      ),
      0
    )
    assert.equal(await fetchCounterValue(counterDb(async () => ({ data: null }))), 0)
    assert.equal(await fetchCounterValue(counterDb(async () => ({ data: [] }))), 0)
    assert.equal(await fetchCounterValue(counterDb(async () => ({ data: {} }))), 0)
  })

  it('returns the stored integer', async () => {
    assert.equal(
      await fetchCounterValue(counterDb(async () => ({ data: { value: 12 } }))),
      12
    )
  })

  it('aborts on unexpected read errors', async () => {
    await assert.rejects(
      () =>
        fetchCounterValue(
          counterDb(async () => {
            throw new Error('permission denied')
          })
        ),
      /permission denied/
    )
  })

  it('aborts when value is present but not an integer >= 0', async () => {
    await assert.rejects(
      () => fetchCounterValue(counterDb(async () => ({ data: { value: 1.5 } }))),
      /not an integer >= 0/
    )
  })
})

describe('cloudWriter.reserveCounter', () => {
  function createCounterDb(opts) {
    let doc = opts.doc === undefined ? null : opts.doc
    const events = []
    const db = {
      events,
      getDoc() {
        return doc
      },
      serverDate() {
        return { SERVER_DATE: true }
      },
      collection() {
        return {
          doc() {
            return {
              async get() {
                throw new Error('unlocked get is not allowed')
              },
              async update() {
                throw new Error('unlocked update is not allowed')
              },
              async set() {
                throw new Error('unlocked set is not allowed')
              }
            }
          }
        }
      },
      async runTransaction(fn) {
        events.push('tx-start')
        const txDoc = {
          async get() {
            events.push('get')
            if (doc == null) {
              const err = new Error('document not found')
              err.code = 'DATABASE.DOC_NOT_EXIST'
              throw err
            }
            return { data: { ...doc } }
          },
          async update(payload) {
            events.push('update')
            if (doc == null) throw new Error('cannot update missing doc')
            doc = Object.assign({}, doc, payload)
          },
          async set(payload) {
            events.push('set')
            doc = Object.assign({}, payload)
          }
        }
        const result = await fn({
          collection() {
            return {
              doc() {
                return txDoc
              }
            }
          }
        })
        events.push('tx-end')
        return result
      }
    }
    return db
  }

  it('creates or advances the counter with read-modify-write and never decreases it', async () => {
    const created = createCounterDb({ doc: null })
    const writer = cloudWriter(created)
    assert.equal(await writer.reserveCounter(0, 3), 3)
    assert.equal(created.getDoc().value, 3)
    assert.ok(created.events.includes('set'))

    const advanced = createCounterDb({ doc: { value: 5 } })
    assert.equal(await cloudWriter(advanced).reserveCounter(5, 8), 8)
    assert.equal(advanced.getDoc().value, 8)
    assert.deepEqual(advanced.events, ['tx-start', 'get', 'update', 'tx-end'])
  })

  it('aborts without writing when the live counter moved', async () => {
    const db = createCounterDb({ doc: { value: 6 } })
    await assert.rejects(() => cloudWriter(db).reserveCounter(5, 8), /counter moved/)
    assert.equal(db.getDoc().value, 6)
    assert.equal(db.events.includes('update'), false)
    assert.equal(db.events.includes('set'), false)
  })

  it('aborts without writing when next would rewind the counter', async () => {
    const db = createCounterDb({ doc: { value: 8 } })
    await assert.rejects(
      () => cloudWriter(db).reserveCounter(8, 5),
      /refusing to decrease counter/
    )
    assert.equal(db.getDoc().value, 8)
  })
})
