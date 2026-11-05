const { callCloud } = require('./cloud.js')
const { COOK_SKILL_VALUES } = require('../utils/cookSkill.js')

const KEY = 'cookthis_user'

function getUser() {
  return wx.getStorageSync(KEY) || null
}

function setUser(user) {
  if (!user || typeof user !== 'object') return
  wx.setStorageSync(KEY, user)
  const app = getApp()
  if (app) app.globalData.user = user
}

/** 合并写入本地用户缓存（保存偏好后即时可用） */
function patchUser(partial) {
  const cur = getUser() || {}
  const next = Object.assign({}, cur, partial || {})
  setUser(next)
  return next
}

function storedCookSkill(value) {
  return COOK_SKILL_VALUES.includes(value) ? value : null
}

function storedProbeCounts(counts) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null
  const n = (value) => {
    const x = Number(value)
    if (!Number.isFinite(x) || x <= 0) return 0
    return Math.min(5, Math.floor(x))
  }
  return { easy: n(counts.easy), home: n(counts.home), advanced: n(counts.advanced) }
}

function hasCuisineStance(prefs) {
  const p = prefs || {}
  return Object.keys(p).some((k) => p[k] === 'prefer' || p[k] === 'avoid')
}

/**
 * @param {{ preferLocalStance?: boolean }} [opts]
 * preferLocalStance: 首页返回时用。profile 刚写入的忌口/菜系/城市，auth 偶发仍读到旧值；
 * 若本地已填而 auth 仍空，保留本地，避免小红点回跳。
 * 重置偏好等需要权威云端结果的路径不要开此选项。
 */
function ensureLogin(opts) {
  const preferLocalStance = !!(opts && opts.preferLocalStance)
  const prev = getUser()
  // 仍每次调 login 刷新；缓存用于页面首屏
  return callCloud('auth', { platform: 'mp' }).then((user) => {
    const members = Array.isArray(user.members) ? user.members : []
    const slim = {
      uid: user.uid,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      city: user.city,
      isNewUser: user.isNewUser,
      familyAvoids: user.familyAvoids || [],
      familyAvoidsNone: !!user.familyAvoidsNone,
      familyAvoidsConfirmedAt: user.familyAvoidsConfirmedAt || null,
      dishFormPrefs: user.dishFormPrefs || {},
      cuisinePrefs: user.cuisinePrefs || {},
      cuisinePrefsConfirmedAt: user.cuisinePrefsConfirmedAt || null,
      // 与 auth 一致：缺字段按已完成；仅显式 false 才引导
      onboardingDone: user.onboardingDone == null ? true : !!user.onboardingDone,
      cookSkill: storedCookSkill(user.cookSkill),
      cookSkillProbeCounts: storedProbeCounts(user.cookSkillProbeCounts),
      profileLiteSkipped: !!user.profileLiteSkipped,
      profileLitePromptedAt: user.profileLitePromptedAt || null,
      defaultPeopleCount: members.length,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 },
      // confirm / scale sheet：档位、冷淡期与锚点
      marketScaleChoice: user.marketScaleChoice || null,
      marketScaleEffective: user.marketScaleEffective || null,
      marketScaleChosenAt: user.marketScaleChosenAt || null,
      marketScaleAnchor: user.marketScaleAnchor || null,
      members
    }
    if (preferLocalStance && prev) {
      if (prev.familyAvoidsNone && !slim.familyAvoidsNone) {
        slim.familyAvoidsNone = true
        slim.familyAvoids = []
        slim.familyAvoidsConfirmedAt =
          slim.familyAvoidsConfirmedAt || prev.familyAvoidsConfirmedAt || true
      }
      const prevCity = String(prev.city || '').trim()
      const slimCity = String(slim.city || '').trim()
      if (prevCity && !slimCity) {
        slim.city = prev.city
      }
      const prevCuisineStance = hasCuisineStance(prev.cuisinePrefs)
      const slimCuisineStance = hasCuisineStance(slim.cuisinePrefs)
      if (prevCuisineStance && !slimCuisineStance) {
        slim.cuisinePrefs = prev.cuisinePrefs || {}
      }
      if (
        (prev.cuisinePrefsConfirmedAt || prevCuisineStance) &&
        !slim.cuisinePrefsConfirmedAt &&
        !hasCuisineStance(slim.cuisinePrefs)
      ) {
        slim.cuisinePrefsConfirmedAt =
          prev.cuisinePrefsConfirmedAt || true
      }
    }
    setUser(slim)
    return slim
  })
}

module.exports = { ensureLogin, getUser, setUser, patchUser }
