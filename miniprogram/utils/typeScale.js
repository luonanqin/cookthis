'use strict'

const STORAGE_KEY = 'cookthis_large_text'

function isLarge() {
  try {
    return !!wx.getStorageSync(STORAGE_KEY)
  } catch (e) {
    return false
  }
}

function setLarge(large) {
  const next = !!large
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (e) {}
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.largeText = next
  } catch (e) {}
  return next
}

function toggle() {
  return setLarge(!isLarge())
}

module.exports = { STORAGE_KEY, isLarge, setLarge, toggle }
