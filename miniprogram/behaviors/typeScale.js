'use strict'

const typeScale = require('../utils/typeScale.js')
const { tapFeedback } = require('../utils/haptic.js')

module.exports = Behavior({
  data: {
    typeScaleClass: '',
    largeText: false,
    // 圆钮上显示：未放大时「大」，已放大时「小」
    typeScaleLabel: '大'
  },

  lifetimes: {
    attached() {
      this.applyTypeScale()
    }
  },

  pageLifetimes: {
    show() {
      this.applyTypeScale()
    }
  },

  methods: {
    applyTypeScale() {
      const large = typeScale.isLarge()
      this.setData({
        largeText: large,
        typeScaleClass: large ? 'large-text' : '',
        typeScaleLabel: large ? '小' : '大'
      })
    },

    onToggleTypeScale() {
      tapFeedback('medium')
      typeScale.toggle()
      this.applyTypeScale()
    }
  }
})
