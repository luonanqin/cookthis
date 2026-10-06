function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then(res => {
    const result = res.result
    if (result && result.ok === false) {
      return Promise.reject(result)
    }
    return result
  })
}

module.exports = { callCloud }
