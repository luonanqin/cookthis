'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { allocateUserNo } = require('./allocateUserNo.js')

function createFakeDb(opts) {
  const options = opts || {}
  let doc = options.doc === undefined ? null : options.doc
  const getMode = options.getMode || 'throw-if-missing'
  const events = []
  let inTx = false

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
      inTx = true
      events.push('tx-start')
      const txDoc = {
        async get() {
          assert.equal(inTx, true, 'get must run inside runTransaction')
          events.push('get')
          if (doc == null) {
            if (getMode === 'empty') return { data: null }
            const err = new Error('document not found')
            err.code = 'DATABASE.DOC_NOT_EXIST'
            throw err
          }
          return { data: { ...doc } }
        },
        async update({ data }) {
          assert.equal(inTx, true, 'update must run inside runTransaction')
          events.push('update')
          if (doc == null) throw new Error('cannot update missing doc')
          doc = Object.assign({}, doc, data)
        },
        async set({ data }) {
          assert.equal(inTx, true, 'set must run inside runTransaction')
          events.push('set')
          doc = Object.assign({}, data)
        }
      }
      const tx = {
        collection(name) {
          assert.equal(name, 'counters')
          return {
            doc(id) {
              assert.equal(id, 'userNo')
              return txDoc
            }
          }
        }
      }
      const result = await fn(tx)
      events.push('tx-end')
      inTx = false
      return result
    }
  }
  return db
}

describe('allocateUserNo', () => {
  it('creates counters/userNo at 1 when the doc is missing (get throws)', async () => {
    const db = createFakeDb({ doc: null })
    const n = await allocateUserNo(db)
    assert.equal(n, 1)
    assert.deepEqual(db.getDoc(), { value: 1, updatedAt: { SERVER_DATE: true } })
    assert.deepEqual(db.events, ['tx-start', 'get', 'set', 'tx-end'])
  })

  it('creates counters/userNo at 1 when get returns empty data', async () => {
    const db = createFakeDb({ doc: null, getMode: 'empty' })
    const n = await allocateUserNo(db)
    assert.equal(n, 1)
    assert.equal(db.getDoc().value, 1)
    assert.deepEqual(db.events, ['tx-start', 'get', 'set', 'tx-end'])
  })

  it('increments an existing numeric value inside the same transaction', async () => {
    const db = createFakeDb({ doc: { value: 7, updatedAt: 'old' } })
    const n = await allocateUserNo(db)
    assert.equal(n, 8)
    assert.equal(db.getDoc().value, 8)
    assert.deepEqual(db.getDoc().updatedAt, { SERVER_DATE: true })
    assert.deepEqual(db.events, ['tx-start', 'get', 'update', 'tx-end'])
  })

  it('issues consecutive numbers across calls', async () => {
    const db = createFakeDb({ doc: null })
    assert.equal(await allocateUserNo(db), 1)
    assert.equal(await allocateUserNo(db), 2)
    assert.equal(await allocateUserNo(db), 3)
  })

  it('treats a missing or non-number value as 0 and still writes in-transaction', async () => {
    const db = createFakeDb({ doc: { updatedAt: 'old' } })
    const n = await allocateUserNo(db)
    assert.equal(n, 1)
    assert.equal(db.getDoc().value, 1)
    assert.ok(db.events.includes('get'))
    assert.ok(db.events.includes('update'))
  })

  it('rethrows unexpected get errors so the transaction can retry', async () => {
    const db = {
      serverDate() {
        return { SERVER_DATE: true }
      },
      async runTransaction(fn) {
        return fn({
          collection() {
            return {
              doc() {
                return {
                  async get() {
                    const err = new Error('transaction conflict')
                    err.code = 'DATABASE.TRANSACTION_CONFLICT'
                    throw err
                  },
                  async set() {
                    throw new Error('set should not run after unexpected get error')
                  },
                  async update() {
                    throw new Error('update should not run after unexpected get error')
                  }
                }
              }
            }
          }
        })
      }
    }
    await assert.rejects(() => allocateUserNo(db), /transaction conflict/)
  })
})
