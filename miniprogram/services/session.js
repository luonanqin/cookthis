const { callCloud } = require('./cloud.js')

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

function ensureLogin() {
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
      profileLiteSkipped: !!user.profileLiteSkipped,
      profileLitePromptedAt: user.profileLitePromptedAt || null,
      defaultPeopleCount: members.length,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 },
      members
    }
    setUser(slim)
    return slim
  })
}

module.exports = { ensureLogin, getUser, setUser, patchUser }
