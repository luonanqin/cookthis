const { ensureLogin, getUser } = require('../../services/session.js')

function resolveAvatar(url) {
  return url ? url : '/assets/avatar-default.png'
}

Page({
  data: {
    nickname: '',
    avatarSrc: '/assets/avatar-default.png'
  },

  onShow() {
    const cached = getUser()
    if (cached) {
      this.setData({
        nickname: cached.nickname || '',
        avatarSrc: resolveAvatar(cached.avatarUrl)
      })
    }
    ensureLogin()
      .then(user => {
        this.setData({
          nickname: user.nickname || '',
          avatarSrc: resolveAvatar(user.avatarUrl)
        })
      })
      .catch(err => {
        console.error(err)
        wx.showToast({ title: '登录失败', icon: 'none' })
      })
  }
})
