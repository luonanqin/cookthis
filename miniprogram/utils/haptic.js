'use strict'

/**
 * 按钮点击触感：短震动（不支持则静默失败）。
 * type: light | medium | heavy —— 仅 iPhone 区分强度；安卓传 type 常 fail，回退无参短震。
 * 默认 medium；主操作可传 heavy。
 */
function tapFeedback(type) {
  try {
    if (!wx || typeof wx.vibrateShort !== 'function') return
    const intensity = type || 'medium'
    const fallback = function () {
      try {
        wx.vibrateShort({ fail() {} })
      } catch (e) {}
    }
    wx.vibrateShort({
      type: intensity,
      fail: fallback,
      complete() {}
    })
  } catch (e) {}
}

module.exports = { tapFeedback }
