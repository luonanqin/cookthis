'use strict'
const { callCloud } = require('./cloud.js')
const { loadAliases, buildAliasIndex, normalizeCityKey } = require('../utils/aliasMatch.js')
const { track } = require('../utils/track.js')

const ALIASES_KEY = 'cookthis_aliases_v1'
/** 别名表不兼容变更时 +1：读到旧 epoch 会 removeStorage 再拉 */
const ALIASES_CACHE_EPOCH = 2
const SUGGEST_KEY = 'cookthis_manual_suggest_v1'
/** 手补联想索引不兼容变更时 +1：读到旧 epoch 会 removeStorage 再拉 */
const SUGGEST_CACHE_EPOCH = 1
const SHELF_PREFIX = 'cookthis_shelf_v1_'
/** 进行中的 getAliases，别名与联想索引共用，避免同一次冷启动打两次 */
let aliasesInflight = null

function shelfStorageKey(cityKey) {
  return SHELF_PREFIX + cityKey
}

function readJson(key) {
  try {
    return wx.getStorageSync(key) || null
  } catch (e) {
    return null
  }
}

function writeJson(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {}
}

function removeKey(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {}
}

function clearAliasesCache() {
  removeKey(ALIASES_KEY)
  // 短暂用过的升 key 残留
  removeKey('cookthis_aliases_v2')
  removeKey(SUGGEST_KEY)
}

function readAliasesTable() {
  const raw = readJson(ALIASES_KEY)
  if (!raw || typeof raw !== 'object') return null
  if (Number(raw._cacheEpoch) !== ALIASES_CACHE_EPOCH) {
    clearAliasesCache()
    return null
  }
  return loadAliases(raw)
}

function writeAliasesTable(aliases) {
  const table = aliases && typeof aliases === 'object' ? aliases : {}
  writeJson(
    ALIASES_KEY,
    Object.assign({}, table, { _cacheEpoch: ALIASES_CACHE_EPOCH })
  )
}

function readSuggestIndex() {
  const raw = readJson(SUGGEST_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw._cacheEpoch) !== SUGGEST_CACHE_EPOCH) {
    removeKey(SUGGEST_KEY)
    return null
  }
  if (!Array.isArray(raw.entries)) return null
  return raw.entries.slice()
}

function writeSuggestIndex(entries) {
  const list = Array.isArray(entries) ? entries.slice() : []
  writeJson(SUGGEST_KEY, {
    _cacheEpoch: SUGGEST_CACHE_EPOCH,
    entries: list
  })
}

/**
 * 一次 getAliases 同时落地别名表和手补联想索引。
 * @returns {Promise<{ table: object, entries: object[] }>}
 */
function fetchAliasesBundle() {
  if (aliasesInflight) return aliasesInflight
  aliasesInflight = callCloud('catalog', { action: 'getAliases' })
    .then((res) => {
      const table = loadAliases((res && res.aliases) || {})
      const suggestIndex = res && res.suggestIndex
      writeAliasesTable(table)
      // 缺字段或非数组不能落成 entries:[]，否则旧云函数会把空索引冻成命中
      if (!Array.isArray(suggestIndex)) {
        return { table, entries: [] }
      }
      writeSuggestIndex(suggestIndex)
      return { table, entries: suggestIndex }
    })
    .catch((err) => {
      track('catalog_aliases_fetch_fail', {
        error: (err && err.error) || (err && err.errMsg) || 'unknown'
      })
      throw err
    })
    .finally(() => {
      aliasesInflight = null
    })
  return aliasesInflight
}

function readShelfOrder(city) {
  const cityKey = normalizeCityKey(city)
  if (!cityKey) return null
  const raw = readJson(shelfStorageKey(cityKey))
  if (!raw || !Array.isArray(raw.shelfOrder)) return null
  return raw.shelfOrder
}

function writeShelfOrder(city, shelfOrder) {
  const cityKey = normalizeCityKey(city)
  if (!cityKey) return
  writeJson(shelfStorageKey(cityKey), {
    cityKey,
    shelfOrder: Array.isArray(shelfOrder) ? shelfOrder : []
  })
}

function clearShelfCache(city) {
  const cityKey = normalizeCityKey(city)
  if (!cityKey) return
  removeKey(shelfStorageKey(cityKey))
}

/**
 * @returns {Promise<object>} aliases table (may be empty on failure)
 */
function ensureAliases() {
  const cached = readAliasesTable()
  if (cached && Object.keys(cached).length) {
    return Promise.resolve(cached)
  }
  return fetchAliasesBundle()
    .then((bundle) => bundle.table)
    .catch(() => cached || {})
}

/**
 * @returns {Promise<object[]>}
 */
function ensureSuggestIndex() {
  const cached = readSuggestIndex()
  // 空列表与未缓存一样要重拉：旧客户端可能已把缺字段写成 []
  if (cached && cached.length) return Promise.resolve(cached)
  return fetchAliasesBundle()
    .then((bundle) => bundle.entries)
    .catch(() => [])
}

/**
 * 确认页手补：联想条目 + 别名索引（规范名解析）。
 * @returns {Promise<{ entries: object[], aliasIndex: object }>}
 */
function loadManualSuggestContext() {
  return Promise.all([ensureSuggestIndex(), ensureAliases()]).then(
    ([entries, aliases]) => ({
      entries: Array.isArray(entries) ? entries : [],
      aliasIndex: buildAliasIndex(aliases || {})
    })
  )
}

/**
 * @param {string} city
 * @returns {Promise<string[]>}
 */
function ensureShelfOrder(city) {
  const cityKey = normalizeCityKey(city)
  if (!cityKey) return Promise.resolve([])
  const cached = readShelfOrder(cityKey)
  if (cached) return Promise.resolve(cached)
  return callCloud('catalog', { action: 'getCityShelf' })
    .then((res) => {
      const order = (res && res.shelfOrder) || []
      writeShelfOrder(cityKey, order)
      return order
    })
    .catch(() => [])
}

/** 登录后预拉：失败静默 */
function prefetchCatalog(user) {
  const u = user || {}
  const tasks = [ensureAliases()]
  if (String(u.city || '').trim()) {
    tasks.push(ensureShelfOrder(u.city))
  }
  return Promise.all(tasks).catch(() => null)
}

/**
 * 购物清单：等待别名+货架就绪（别名失败不抛、不 Toast）
 * @returns {Promise<{ index: object, shelfOrder: string[] }>}
 */
function loadShoppingCatalog(city) {
  return Promise.all([ensureAliases(), ensureShelfOrder(city)]).then(
    ([aliases, shelfOrder]) => ({
      index: buildAliasIndex(aliases || {}),
      shelfOrder: shelfOrder || []
    })
  )
}

module.exports = {
  ALIASES_KEY,
  ALIASES_CACHE_EPOCH,
  SUGGEST_KEY,
  SUGGEST_CACHE_EPOCH,
  shelfStorageKey,
  ensureAliases,
  ensureSuggestIndex,
  ensureShelfOrder,
  prefetchCatalog,
  loadShoppingCatalog,
  loadManualSuggestContext,
  clearAliasesCache,
  clearShelfCache,
  readAliasesTable,
  readShelfOrder,
  readSuggestIndex,
  writeSuggestIndex
}
