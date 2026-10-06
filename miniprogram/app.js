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
  }
})
