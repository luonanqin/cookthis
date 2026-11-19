function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then(res => {
    const result = res && res.result
    if (result == null) {
      return Promise.reject({
        ok: false,
        error: (res && res.errMsg) || '云函数无返回'
      })
    }
    if (result.ok === false) {
      return Promise.reject(result)
    }
    return result
  })
}

module.exports = { callCloud }
