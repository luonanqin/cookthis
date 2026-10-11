const { ensureLogin } = require('./services/session.js')
const { track } = require('./utils/track.js')
const typeScale = require('./utils/typeScale.js')

App({
  globalData: {
    user: null,
    onboardingTipShown: false,
    largeText: false
  },
  onLaunch() {
    this.globalData.largeText = typeScale.isLarge()
    if (!wx.cloud) {
      console.error('请使用支持云开发的基础库')
      return
    }
    wx.cloud.init({
      env: 'cloud1-d1g4vi08i047a43ed',
      traceUser: true
    })
    track('app_open', {})
    track('session_start', {})
    ensureLogin()
      .then((user) => {
        track('login_ok', { isNewUser: !!(user && user.isNewUser) })
      })
      .catch(err => {
        console.error(err)
        wx.showToast({ title: '登录失败', icon: 'none' })
      })
  }
})
