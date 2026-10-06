Page({
  goMarket() {
    wx.navigateTo({ url: '/pages/confirm/confirm' })
  },
  goRecord() {
    wx.showToast({ title: '下一版接记录', icon: 'none' })
  },
  goMine() {
    wx.navigateTo({ url: '/pages/mine/mine' })
  }
})
