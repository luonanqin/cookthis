const { callCloud } = require('./cloud.js')

const KEY = 'cookthis_user'

function getUser() {
  return wx.getStorageSync(KEY) || null
}

function ensureLogin() {
  const cached = getUser()
  // 仍每次调 login 刷新；缓存用于页面首屏
  return callCloud('auth', { platform: 'mp' }).then(user => {
    const slim = {
      uid: user.uid,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      city: user.city,
      isNewUser: user.isNewUser,
      familyAvoids: user.familyAvoids || [],
      dishFormPrefs: user.dishFormPrefs || {},
      cuisinePrefs: user.cuisinePrefs || {},
      onboardingDone: !!user.onboardingDone,
      defaultPeopleCount: user.defaultPeopleCount ?? 2,
      defaultCombo: user.defaultCombo || { meat: 1, veg: 1, soup: 0 }
    }
    wx.setStorageSync(KEY, slim)
    const app = getApp()
    if (app) app.globalData.user = slim
    return slim
  })
}

module.exports = { ensureLogin, getUser }
