'use strict'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function matches(doc, query) {
  if (!query || typeof query !== 'object') return true
  for (const key of Object.keys(query)) {
    if (doc[key] !== query[key]) return false
  }
  return true
}

function cmp(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** In-memory stand-in for wx-server-sdk database, used by membership tests. */
function createMemoryDb() {
  const store = {}
  let seq = 1

  function colMap(name) {
    if (!store[name]) store[name] = {}
    return store[name]
  }

  const db = {
    serverDate() {
      return new Date().toISOString()
    },
    collection(name) {
      const col = colMap(name)
      return {
        where(query) {
          const state = { query, order: null, limitN: null }
          const chain = {
            orderBy(field, dir) {
              state.order = { field, dir: dir === 'desc' ? 'desc' : 'asc' }
              return chain
            },
            limit(n) {
              state.limitN = n
              return chain
            },
            async get() {
              let rows = Object.values(col).filter((doc) => matches(doc, state.query))
              if (state.order) {
                const { field, dir } = state.order
                rows = rows.slice().sort((a, b) => {
                  const c = cmp(a[field], b[field])
                  return dir === 'desc' ? -c : c
                })
              }
              if (state.limitN != null) rows = rows.slice(0, state.limitN)
              return { data: rows.map(clone) }
            },
            async update({ data }) {
              let updated = 0
              for (const id of Object.keys(col)) {
                if (!matches(col[id], state.query)) continue
                Object.assign(col[id], clone(data))
                updated++
              }
              return { stats: { updated } }
            }
          }
          return chain
        },
        async add({ data }) {
          const _id = 'doc_' + seq++
          col[_id] = Object.assign({ _id }, clone(data))
          return { _id }
        },
        doc(id) {
          return {
            async get() {
              if (!col[id]) {
                const err = new Error('not found')
                err.errCode = -1
                throw err
              }
              return { data: clone(col[id]) }
            },
            async update({ data }) {
              if (!col[id]) {
                const err = new Error('not found')
                err.errCode = -1
                throw err
              }
              Object.assign(col[id], clone(data))
              return { stats: { updated: 1 } }
            }
          }
        }
      }
    },
    _dump(name) {
      return Object.values(colMap(name)).map(clone)
    }
  }
  return db
}

module.exports = { createMemoryDb }
