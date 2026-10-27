const LITE_AVOID_OPTIONS = [
  { id: 'pork', label: '猪肉类' },
  { id: 'seafood', label: '海鲜' },
  { id: 'coriander', label: '香菜' },
  { id: 'offal', label: '内脏' },
  { id: 'peanut', label: '花生' },
  { id: 'dairy', label: '乳制品' }
]

Component({
  properties: {
    showNoneAvoids: {
      type: Boolean,
      value: false
    },
    showCity: {
      type: Boolean,
      value: false
    },
    primaryText: {
      type: String,
      value: '保存'
    },
    secondaryText: {
      type: String,
      value: '跳过'
    },
    title: {
      type: String,
      value: '有哪些家庭忌口？'
    }
  },

  data: {
    liteAvoidOptions: LITE_AVOID_OPTIONS,
    noneAvoidChecked: false,
    liteAvoidChecked: {},
    city: '',
    region: []
  },

  methods: {
    onRegionChange(e) {
      const region = (e.detail && e.detail.value) || []
      const city = region[1] || region[0] || ''
      this.setData({ region, city })
    },

    onAvoidToggle(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      if (id === 'none') {
        const on = !this.data.noneAvoidChecked
        this.setData({
          noneAvoidChecked: on,
          liteAvoidChecked: on ? {} : this.data.liteAvoidChecked
        })
        return
      }
      const liteAvoidChecked = Object.assign({}, this.data.liteAvoidChecked)
      liteAvoidChecked[id] = !liteAvoidChecked[id]
      this.setData({
        noneAvoidChecked: false,
        liteAvoidChecked
      })
    },

    _pickedCity() {
      return String(this.data.city || '').trim()
    },

    onSave() {
      const city = this._pickedCity()
      if (this.properties.showCity && !city) {
        wx.showToast({ title: '请先选择所在城市', icon: 'none' })
        return
      }
      if (this.data.noneAvoidChecked) {
        this.triggerEvent('noneavoids', { city })
        return
      }
      const familyAvoids = Object.keys(this.data.liteAvoidChecked || {}).filter(
        (k) => this.data.liteAvoidChecked[k]
      )
      this.triggerEvent('save', { familyAvoids, city })
    },

    onSkip() {
      this.triggerEvent('skip')
    }
  }
})
