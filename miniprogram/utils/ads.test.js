'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { ADS_ENABLED, canOfferDailyMealRewardAd } = require('./ads.js')

describe('ADS_ENABLED', () => {
  it('is true while ad联调; set false before ship if traffic-master not ready', () => {
    assert.equal(ADS_ENABLED, true)
  })

  it('canOfferDailyMealRewardAd follows ADS_ENABLED', () => {
    assert.equal(canOfferDailyMealRewardAd(), ADS_ENABLED)
  })
})
