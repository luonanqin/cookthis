'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const store = new Map()
const cloudCalls = []
let cloudResult = null
let cloudError = null

global.wx = {
  getStorageSync(key) {
    return store.has(key) ? store.get(key) : ''
  },
  setStorageSync(key, value) {
    store.set(key, value)
  },
  removeStorageSync(key) {
    store.delete(key)
  }
}

const cloudPath = require.resolve('../../miniprogram/services/cloud.js')
require.cache[cloudPath] = {
  id: cloudPath,
  filename: cloudPath,
  loaded: true,
  exports: {
    callCloud(name, data) {
      cloudCalls.push({ name, data })
      if (cloudError) return Promise.reject(cloudError)
      return Promise.resolve(cloudResult)
    }
  }
}

const cache = require('../../miniprogram/services/catalogCache.js')

const SAMPLE = [
  { surface: '西红柿', canonical: '番茄', py: 'xihongshi', initials: 'xhs' }
]

describe('catalogCache manual suggest index', () => {
  beforeEach(() => {
    store.clear()
    cloudCalls.length = 0
    cloudError = null
    cloudResult = {
      ok: true,
      aliases: { 番茄: ['西红柿'] },
      suggestIndex: SAMPLE.map((row) => Object.assign({}, row))
    }
  })

  it('round-trips entries at cookthis_manual_suggest_v1 with the cache epoch', () => {
    cache.writeSuggestIndex(SAMPLE)
    const raw = store.get('cookthis_manual_suggest_v1')
    assert.equal(typeof raw, 'object')
    assert.equal(raw._cacheEpoch, cache.SUGGEST_CACHE_EPOCH)
    assert.deepEqual(cache.readSuggestIndex(), SAMPLE)
  })

  it('drops a suggest cache whose epoch does not match', () => {
    store.set('cookthis_manual_suggest_v1', {
      _cacheEpoch: Number(cache.SUGGEST_CACHE_EPOCH) + 9,
      entries: [{ surface: '旧', canonical: '旧' }]
    })
    assert.equal(cache.readSuggestIndex(), null)
    assert.equal(store.has('cookthis_manual_suggest_v1'), false)
  })

  it('stores [] when writeSuggestIndex is given a non-array', () => {
    cache.writeSuggestIndex(null)
    assert.deepEqual(cache.readSuggestIndex(), [])
  })

  it('writes the alias table and suggestIndex from one getAliases success', async () => {
    const table = await cache.ensureAliases()
    assert.deepEqual(table, { 番茄: ['西红柿'] })
    assert.deepEqual(cloudCalls, [
      { name: 'catalog', data: { action: 'getAliases' } }
    ])
    assert.deepEqual(cache.readSuggestIndex(), SAMPLE)
    assert.deepEqual(cache.readAliasesTable(), { 番茄: ['西红柿'] })
  })

  it('does not cache a missing suggestIndex and ensureSuggestIndex retries getAliases', async () => {
    delete cloudResult.suggestIndex
    await cache.ensureAliases()
    assert.equal(cache.readSuggestIndex(), null)
    assert.deepEqual(cache.readAliasesTable(), { 番茄: ['西红柿'] })

    const entries = await cache.ensureSuggestIndex()
    assert.deepEqual(entries, [])
    assert.equal(cloudCalls.length, 2)
    assert.equal(cache.readSuggestIndex(), null)
  })

  it('does not cache a non-array suggestIndex and ensureSuggestIndex retries getAliases', async () => {
    cloudResult.suggestIndex = { entries: SAMPLE }
    await cache.ensureAliases()
    assert.equal(cache.readSuggestIndex(), null)

    const entries = await cache.ensureSuggestIndex()
    assert.deepEqual(entries, [])
    assert.equal(cloudCalls.length, 2)
    assert.equal(cache.readSuggestIndex(), null)
  })

  it('ensureSuggestIndex refetches when the stored suggest list is empty', async () => {
    store.set('cookthis_manual_suggest_v1', {
      _cacheEpoch: cache.SUGGEST_CACHE_EPOCH,
      entries: []
    })
    const entries = await cache.ensureSuggestIndex()
    assert.deepEqual(entries, SAMPLE)
    assert.equal(cloudCalls.length, 1)
    assert.deepEqual(cache.readSuggestIndex(), SAMPLE)
  })

  it('clearAliasesCache removes the suggest index key', () => {
    cache.writeSuggestIndex(SAMPLE)
    cache.clearAliasesCache()
    assert.equal(store.has('cookthis_manual_suggest_v1'), false)
    assert.equal(cache.readSuggestIndex(), null)
  })

  it('ensureSuggestIndex returns cached entries without calling catalog', async () => {
    cache.writeSuggestIndex([
      { surface: '番茄', canonical: '番茄', py: 'fanqie', initials: 'fq' }
    ])
    const entries = await cache.ensureSuggestIndex()
    assert.equal(entries[0].surface, '番茄')
    assert.equal(cloudCalls.length, 0)
  })

  it('ensureSuggestIndex loads entries via getAliases when the cache is cold', async () => {
    const entries = await cache.ensureSuggestIndex()
    assert.deepEqual(entries, SAMPLE)
    assert.equal(cloudCalls.length, 1)
    assert.deepEqual(cache.readAliasesTable(), { 番茄: ['西红柿'] })
  })

  it('ensureSuggestIndex resolves [] when getAliases fails', async () => {
    cloudError = { error: 'RATE_LIMITED' }
    const entries = await cache.ensureSuggestIndex()
    assert.deepEqual(entries, [])
    assert.equal(cache.readSuggestIndex(), null)
  })

  it('loadManualSuggestContext returns entries and aliasIndex from one fetch', async () => {
    const ctx = await cache.loadManualSuggestContext()
    assert.deepEqual(ctx.entries, SAMPLE)
    assert.equal(typeof ctx.aliasIndex.canonicalOf, 'function')
    assert.equal(ctx.aliasIndex.canonicalOf('西红柿'), '番茄')
    assert.equal(ctx.aliasIndex.canonicalOf('番茄'), '番茄')
    assert.equal(cloudCalls.length, 1)
  })
})
