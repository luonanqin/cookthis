'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

const originalLoad = Module._load

function installWxServerSdkMock() {
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') {
      return {
        init() {},
        DYNAMIC_CURRENT_ENV: 'test-env',
        getWXContext() {
          return { OPENID: 'openid-test' }
        },
        database() {
          return {
            serverDate() {
              return new Date(0)
            },
            collection(name) {
              return {
                where() {
                  return {
                    limit() {
                      return {
                        async get() {
                          if (name === 'user_identities') {
                            return { data: [{ uid: 'u1' }] }
                          }
                          if (name === 'users') {
                            return {
                              data: [
                                {
                                  _id: 'doc1',
                                  uid: 'u1',
                                  city: '北京',
                                  accessGuard: {}
                                }
                              ]
                            }
                          }
                          return { data: [] }
                        }
                      }
                    }
                  }
                },
                doc() {
                  return {
                    async update() {
                      return {}
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return originalLoad.apply(this, arguments)
  }
}

describe('catalog getAliases suggestIndex', () => {
  let catalog

  before(() => {
    installWxServerSdkMock()
    const indexPath = require.resolve('../../cloudfunctions/catalog/index.js')
    delete require.cache[indexPath]
    catalog = require('../../cloudfunctions/catalog/index.js')
  })

  after(() => {
    Module._load = originalLoad
  })

  it('returns alias table and bundled suggestIndex entries', async () => {
    const res = await catalog.main({ action: 'getAliases' })
    assert.equal(res.ok, true)
    assert.ok(Array.isArray(res.aliases['五花肉']))
    assert.ok(res.aliases['五花肉'].includes('三线肉'))
    assert.equal(res.aliases._meta, undefined)

    assert.ok(Array.isArray(res.suggestIndex))
    assert.ok(res.suggestIndex.length > 100)
    const pork = res.suggestIndex.find((row) => row && row.surface === '三线肉')
    assert.ok(pork)
    assert.equal(pork.canonical, '五花肉')
    assert.equal(pork.py, 'sanxianrou')
    assert.equal(pork.initials, 'sxr')
    assert.equal(res.suggestIndex._meta, undefined)
  })
})
