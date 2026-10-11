'use strict'

const typeScale = require('../utils/typeScale.js')
const { tapFeedback } = require('../utils/haptic.js')

module.exports = Behavior({
  data: {
    typeScaleClass: '',
    largeText: false,
    typeScaleLabel: '大字版'
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
        typeScaleLabel: large ? '小字版' : '大字版'
      })
    },

    onToggleTypeScale() {
      tapFeedback('medium')
      typeScale.toggle()
      this.applyTypeScale()
    }
  }
})
