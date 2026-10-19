const LITE_AVOID_OPTIONS = [
  { id: 'pork', label: '猪肉类' },
  { id: 'seafood', label: '海鲜' },
  { id: 'coriander', label: '香菜' },
  { id: 'offal', label: '内脏' },
  { id: 'peanut', label: '花生' },
  { id: 'dairy', label: '乳制品' }
]

const LITE_LOVE_OPTIONS = [
  { id: 'hotpot', label: '火锅' },
  { id: 'noodle', label: '面食' }
]

Component({
  properties: {
    showNoneAvoids: {
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
      value: '补一句家庭忌口？'
    },
    hint: {
      type: String,
      value: '填了少推不能吃的；跳过不影响本次看方案'
    }
  },

  data: {
    liteAvoidOptions: LITE_AVOID_OPTIONS.slice(0, 4),
    liteAvoidMore: LITE_AVOID_OPTIONS.slice(4),
    liteAvoidExpanded: false,
    liteAvoidChecked: {},
    liteLoveOptions: LITE_LOVE_OPTIONS,
    liteLoveChecked: {}
  },

  methods: {
    onAvoidToggle(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      const liteAvoidChecked = Object.assign({}, this.data.liteAvoidChecked)
      liteAvoidChecked[id] = !liteAvoidChecked[id]
      this.setData({ liteAvoidChecked })
    },

    onLoveToggle(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      const liteLoveChecked = Object.assign({}, this.data.liteLoveChecked)
      liteLoveChecked[id] = !liteLoveChecked[id]
      this.setData({ liteLoveChecked })
    },

    onAvoidMore() {
      this.setData({ liteAvoidExpanded: !this.data.liteAvoidExpanded })
    },

    onSave() {
      const familyAvoids = Object.keys(this.data.liteAvoidChecked || {}).filter(
        (k) => this.data.liteAvoidChecked[k]
      )
      const checked = this.data.liteLoveChecked || {}
      this.triggerEvent('save', {
        familyAvoids,
        love: {
          hotpot: !!checked.hotpot,
          noodle: !!checked.noodle
        }
      })
    },

    onSkip() {
      this.triggerEvent('skip')
    },

    onNoneAvoids() {
      this.triggerEvent('noneavoids')
    }
  }
})
