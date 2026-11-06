'use strict'
const { callCloud } = require('./cloud.js')
const { loadAliases, buildAliasIndex, normalizeCityKey } = require('../utils/aliasMatch.js')
const { track } = require('../utils/track.js')

const ALIASES_KEY = 'cookthis_aliases_v1'
const SHELF_PREFIX = 'cookthis_shelf_v1_'

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

function readAliasesTable() {
  const raw = readJson(ALIASES_KEY)
  if (!raw || typeof raw !== 'object') return null
  return loadAliases(raw)
}

function writeAliasesTable(aliases) {
  writeJson(ALIASES_KEY, aliases || {})
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
  return callCloud('catalog', { action: 'getAliases' })
    .then((res) => {
      const table = loadAliases((res && res.aliases) || {})
      writeAliasesTable(table)
      return table
    })
    .catch((err) => {
      track('catalog_aliases_fetch_fail', {
        error: (err && err.error) || (err && err.errMsg) || 'unknown'
      })
      return cached || {}
    })
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
  shelfStorageKey,
  ensureAliases,
  ensureShelfOrder,
  prefetchCatalog,
  loadShoppingCatalog,
  clearShelfCache,
  readAliasesTable,
  readShelfOrder
}
