'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'index.wxss'), 'utf8')
const onboardingWxml = fs.readFileSync(
  path.join(dir, '../onboarding/onboarding.wxml'),
  'utf8'
)
const onboardingJs = fs.readFileSync(
  path.join(dir, '../onboarding/onboarding.js'),
  'utf8'
)
const assetsDir = path.join(dir, '../../assets/images')

describe('home VIP entry', () => {
  it('places VIP to the left of type-scale in home-top-tools', () => {
    const toolsAt = wxml.indexOf('home-top-tools')
    const vipAt = wxml.indexOf('home-vip-entry')
    const scaleAt = wxml.indexOf('class="home-type-scale"')
    assert.ok(toolsAt >= 0 && vipAt > toolsAt && scaleAt > vipAt)
    assert.match(wxml, /bindtap="goMembership"/)
    assert.match(wxml, /aria-label="会员"/)
    assert.match(
      wxml,
      /src="\/assets\/images\/membership-vip-spark\.(webp|png)"/
    )
  })

  it('navigates with from=home_vip and keeps a ≥44px hot area', () => {
    assert.match(
      js,
      /goMembership\(\)\s*\{[\s\S]*?pages\/membership\/index\?from=home_vip/
    )
    assert.match(wxss, /\.home-top-tools\s*\{[^}]*display:\s*flex/)
    assert.match(wxss, /\.home-top-tools\s*\{[^}]*justify-content:\s*flex-end/)
    assert.match(
      wxss,
      /\.home-vip-entry\s*\{[^}]*(?:min-width|width):\s*88rpx/
    )
    assert.match(
      wxss,
      /\.home-vip-entry\s*\{[^}]*(?:min-height|height):\s*88rpx/
    )
  })

  it('ships a VIP spark asset and does not promo membership in onboarding', () => {
    const webp = path.join(assetsDir, 'membership-vip-spark.webp')
    const png = path.join(assetsDir, 'membership-vip-spark.png')
    assert.ok(fs.existsSync(webp) || fs.existsSync(png))
    assert.doesNotMatch(onboardingWxml, /pages\/membership/)
    assert.doesNotMatch(onboardingJs, /pages\/membership/)
    assert.doesNotMatch(onboardingJs, /goMembership/)
  })
})
