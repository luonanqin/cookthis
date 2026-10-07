const { ensureLogin } = require('./services/session.js')
const { track } = require('./utils/track.js')

App({
  globalData: {
    user: null
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用支持云开发的基础库')
      return
    }
    wx.cloud.init({
      // env: 'your-env-id',  // 开通云开发后填入
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
