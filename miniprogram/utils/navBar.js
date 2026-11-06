'use strict'

/**
 * Custom navigation metrics for navigationStyle: custom.
 * Safe to call synchronously after App launch.
 */
function getNavMetrics() {
  try {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = Number(sys.statusBarHeight) || 20
    const menuTop = Number(menu.top) || statusBarHeight
    const menuHeight = Number(menu.height) || 32
    const gap = Math.max(0, menuTop - statusBarHeight)
    const navBarHeight = gap * 2 + menuHeight
    return {
      statusBarHeight,
      navBarHeight,
      menuButton: menu,
      headerPadTop: statusBarHeight,
      totalNavHeight: statusBarHeight + navBarHeight
    }
  } catch (e) {
    return {
      statusBarHeight: 20,
      navBarHeight: 44,
      menuButton: null,
      headerPadTop: 20,
      totalNavHeight: 64
    }
  }
}

module.exports = {
  getNavMetrics
}
