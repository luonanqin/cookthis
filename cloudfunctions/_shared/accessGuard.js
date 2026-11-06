'use strict'

/** 改城：每自然周最多次数（中国时区周一起；不同城才计数） */
const CITY_CHANGE_MAX_PER_WEEK = 2
/** 拉确认食材名单：每用户每天上限 */
const INGREDIENTS_MAX_PER_DAY = 60
/** 同 action 最小间隔（弱 QPS） */
const INGREDIENTS_MIN_INTERVAL_MS = 300
/** catalog 别名拉取 */
const CATALOG_ALIASES_MAX_PER_DAY = 30
const CATALOG_ALIASES_MIN_INTERVAL_MS = 500
/** catalog 城货架拉取 */
const CATALOG_SHELF_MAX_PER_DAY = 40
const CATALOG_SHELF_MIN_INTERVAL_MS = 300

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(nowMs) {
  const d = new Date(nowMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 中国时区（UTC+8）所在周的周一日期 YYYY-MM-DD。
 * @param {number} nowMs
 * @returns {string}
 */
function weekKeyChina(nowMs) {
  const shifted = nowMs + CHINA_OFFSET_MS
  const d = new Date(shifted)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const dow = d.getUTCDay() // 0=周日 … 6=周六（中国本地）
  const daysFromMon = (dow + 6) % 7
  const mondayUtcMs = Date.UTC(y, m, day) - daysFromMon * DAY_MS
  const mon = new Date(mondayUtcMs)
  const wy = mon.getUTCFullYear()
  const wm = String(mon.getUTCMonth() + 1).padStart(2, '0')
  const wd = String(mon.getUTCDate()).padStart(2, '0')
  return `${wy}-${wm}-${wd}`
}

/**
 * #1：确认名单城市只信账号，忽略客户端传入。
 * @param {{ eventCity?: string|null, userCity?: string|null }} input
 * @returns {string|null}
 */
function resolveIngredientsCity(input) {
  const userCity = input && input.userCity
  if (userCity == null) return null
  const s = String(userCity).trim()
  return s || null
}

/**
 * @param {object|null|undefined} guard users.accessGuard
 * @param {number} nowMs
 * @param {{ maxPerDay?: number, minIntervalMs?: number }} [opts]
 * @returns {{ ok: true, next: object } | { ok: false, error: string }}
 */
function consumeIngredientsCall(guard, nowMs, opts) {
  const maxPerDay =
    opts && opts.maxPerDay != null ? opts.maxPerDay : INGREDIENTS_MAX_PER_DAY
  const minIntervalMs =
    opts && opts.minIntervalMs != null
      ? opts.minIntervalMs
      : INGREDIENTS_MIN_INTERVAL_MS
  const g = Object.assign({}, guard || {})
  const day = dayKey(nowMs)
  let count = 0
  if (g.ingredientsDay === day) count = Number(g.ingredientsCount) || 0

  const lastAt = Number(g.ingredientsLastAtMs) || 0
  if (lastAt > 0 && nowMs - lastAt < minIntervalMs) {
    return { ok: false, error: 'RATE_LIMITED' }
  }
  if (count >= maxPerDay) {
    return { ok: false, error: 'INGREDIENTS_DAILY_LIMIT' }
  }

  g.ingredientsDay = day
  g.ingredientsCount = count + 1
  g.ingredientsLastAtMs = nowMs
  return { ok: true, next: g }
}

/**
 * @param {object|null|undefined} guard
 * @param {number} nowMs
 * @param {{ day: string, count: string, lastAt: string }} keys
 * @param {{ maxPerDay: number, minIntervalMs: number, dailyError: string }} limits
 */
function consumeKeyedDayCall(guard, nowMs, keys, limits) {
  const g = Object.assign({}, guard || {})
  const day = dayKey(nowMs)
  let count = 0
  if (g[keys.day] === day) count = Number(g[keys.count]) || 0
  const lastAt = Number(g[keys.lastAt]) || 0
  if (lastAt > 0 && nowMs - lastAt < limits.minIntervalMs) {
    return { ok: false, error: 'RATE_LIMITED' }
  }
  if (count >= limits.maxPerDay) {
    return { ok: false, error: limits.dailyError }
  }
  g[keys.day] = day
  g[keys.count] = count + 1
  g[keys.lastAt] = nowMs
  return { ok: true, next: g }
}

function consumeCatalogAliasesCall(guard, nowMs, opts) {
  return consumeKeyedDayCall(
    guard,
    nowMs,
    {
      day: 'catalogAliasesDay',
      count: 'catalogAliasesCount',
      lastAt: 'catalogAliasesLastAtMs'
    },
    {
      maxPerDay:
        opts && opts.maxPerDay != null
          ? opts.maxPerDay
          : CATALOG_ALIASES_MAX_PER_DAY,
      minIntervalMs:
        opts && opts.minIntervalMs != null
          ? opts.minIntervalMs
          : CATALOG_ALIASES_MIN_INTERVAL_MS,
      dailyError: 'CATALOG_ALIASES_DAILY_LIMIT'
    }
  )
}

function consumeCatalogShelfCall(guard, nowMs, opts) {
  return consumeKeyedDayCall(
    guard,
    nowMs,
    {
      day: 'catalogShelfDay',
      count: 'catalogShelfCount',
      lastAt: 'catalogShelfLastAtMs'
    },
    {
      maxPerDay:
        opts && opts.maxPerDay != null ? opts.maxPerDay : CATALOG_SHELF_MAX_PER_DAY,
      minIntervalMs:
        opts && opts.minIntervalMs != null
          ? opts.minIntervalMs
          : CATALOG_SHELF_MIN_INTERVAL_MS,
      dailyError: 'CATALOG_SHELF_DAILY_LIMIT'
    }
  )
}

/**
 * 是否允许把城市从 prev 改成 next。
 * 空 → 首次设置：允许且不计入周额度。
 * 相同：允许，不计入。
 * 真实换城：每周最多 CITY_CHANGE_MAX_PER_WEEK 次，无间隔限制。
 * @returns {{ ok: true, countChange: boolean, next?: object } | { ok: false, error: string }}
 */
function checkCityChange(guard, prevCity, nextCity, nowMs, opts) {
  const maxPerWeek =
    opts && opts.maxPerWeek != null ? opts.maxPerWeek : CITY_CHANGE_MAX_PER_WEEK

  const prev = prevCity == null ? '' : String(prevCity).trim()
  const next = nextCity == null ? '' : String(nextCity).trim()

  if (!next || next === prev) {
    return { ok: true, countChange: false }
  }
  if (!prev) {
    return { ok: true, countChange: false }
  }

  const g = Object.assign({}, guard || {})
  const week = weekKeyChina(nowMs)
  let count = 0
  if (g.cityChangeWeek === week) count = Number(g.cityChangeCount) || 0

  if (count >= maxPerWeek) {
    return { ok: false, error: 'CITY_CHANGE_WEEKLY_LIMIT' }
  }

  g.cityChangeWeek = week
  g.cityChangeCount = count + 1
  g.cityChangedAtMs = nowMs
  return { ok: true, countChange: true, next: g }
}

module.exports = {
  CITY_CHANGE_MAX_PER_WEEK,
  INGREDIENTS_MAX_PER_DAY,
  INGREDIENTS_MIN_INTERVAL_MS,
  CATALOG_ALIASES_MAX_PER_DAY,
  CATALOG_SHELF_MAX_PER_DAY,
  dayKey,
  weekKeyChina,
  resolveIngredientsCity,
  consumeIngredientsCall,
  consumeCatalogAliasesCall,
  consumeCatalogShelfCall,
  checkCityChange
}
