const RECOMMEND_KEY = 'cookthis_last_recommend'

const EMPTY_REASONS = {
  cannot_fill_combo: '当前食材凑不出完整搭配，可返回改场景或换食材',
  empty_recommend: '暂无可用方案，可返回改场景或换食材'
}

function emptyMessage(reason) {
  if (!reason) return '暂无推荐方案，可返回改场景或换食材'
  return EMPTY_REASONS[reason] || String(reason)
}

Page({
  data: {
    plans: [],
    empty: true,
    emptyText: '暂无推荐方案，可返回改场景或换食材'
  },

  onLoad(options) {
    // Slice 2: read storage snapshot (options.requestId reserved for later fetch).
    void options
    let snap = null
    try {
      snap = wx.getStorageSync(RECOMMEND_KEY) || null
    } catch (e) {
      snap = null
    }

    const plans = (snap && Array.isArray(snap.plans) ? snap.plans : []).slice(0, 3)
    const empty = plans.length === 0
    this.setData({
      plans,
      empty,
      emptyText: emptyMessage(snap && snap.emptyReason)
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
