/**
 * WechatSI 同声传译封装。需在小程序后台添加插件，并在 app.json 声明。
 * 失败时 reject，调用方应保留手动输入入口。
 */

let manager = null

function getManager() {
  if (manager) return manager
  try {
    const plugin = requirePlugin('WechatSI')
    manager = plugin.getRecordRecognitionManager()
    return manager
  } catch (e) {
    return null
  }
}

/**
 * @returns {Promise<string>} transcript text
 */
function recognizeOnce(opts) {
  const duration = (opts && opts.duration) || 15000
  const m = getManager()
  if (!m) {
    return Promise.reject({ error: 'VOICE_PLUGIN_UNAVAILABLE' })
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, arg) => {
      if (settled) return
      settled = true
      fn(arg)
    }

    m.onStop = (res) => {
      const text = (res && res.result) || ''
      if (!text.trim()) {
        done(reject, { error: 'VOICE_EMPTY' })
        return
      }
      done(resolve, text.trim())
    }
    m.onError = (err) => {
      done(reject, { error: 'VOICE_ERROR', detail: err })
    }

    try {
      m.start({ duration, lang: 'zh_CN' })
      // Some plugin builds need an explicit stop near duration end
      setTimeout(() => {
        try {
          m.stop()
        } catch (e) {}
      }, Math.max(1000, duration - 300))
    } catch (e) {
      done(reject, { error: 'VOICE_START_FAILED', detail: e })
    }
  })
}

function stopRecognize() {
  const m = getManager()
  if (!m) return
  try {
    m.stop()
  } catch (e) {}
}

module.exports = { recognizeOnce, stopRecognize }
