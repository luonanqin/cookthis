'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'index.wxss'), 'utf8')
const json = fs.readFileSync(path.join(dir, 'index.json'), 'utf8')
const appJson = fs.readFileSync(path.join(dir, '../../app.json'), 'utf8')
const service = fs.readFileSync(
  path.join(dir, '../../services/membership.js'),
  'utf8'
)

describe('membership page wiring', () => {
  it('registers the page and uses page-header 会员', () => {
    assert.match(appJson, /pages\/membership\/index/)
    assert.match(wxml, /page-header/)
    assert.match(wxml, /title="会员"/)
    assert.match(json, /page-header/)
    assert.match(json, /busy-overlay/)
  })

  it('renders blocks in the brief order', () => {
    const statusAt = wxml.indexOf('status-text')
    const benefitsAt = wxml.indexOf('benefits')
    const usageAt = wxml.indexOf('usage')
    const offersAt = wxml.indexOf('offer-card')
    const ctaAt = wxml.indexOf('立即开通')
    const memberAt = wxml.indexOf('刷新会员状态')
    const noticeAt = wxml.indexOf('购买须知')
    assert.ok(statusAt >= 0 && benefitsAt > statusAt)
    assert.ok(usageAt > benefitsAt && offersAt > usageAt)
    assert.ok(ctaAt > offersAt && memberAt > offersAt)
    assert.ok(noticeAt > memberAt)
    assert.match(wxml, /换菜不限次/)
    assert.match(wxml, /日常菜数放宽/)
    assert.match(wxml, /免换菜激励预告/)
    assert.equal(wxml.includes('已免广告'), false)
    assert.equal(js.includes('已免广告'), false)
  })

  it('acks notice in storage and never grants membership on pay success', () => {
    assert.match(js, /cookthis_membership_notice_acked/)
    assert.match(js, /requestVirtualPayment/)
    assert.match(js, /_pollRefresh/)
    assert.match(js, /membership_pay_success/)
    assert.match(js, /membership_page_show/)
    assert.match(js, /membership_pay_click/)
    assert.match(js, /membership_sku_select/)
    assert.match(js, /membership_refresh_tap/)
    const successBlock = js.slice(
      js.indexOf('success:'),
      js.indexOf('fail:')
    )
    assert.match(successBlock, /_pollRefresh/)
    assert.doesNotMatch(successBlock, /isMember:\s*true/)
    assert.doesNotMatch(js, /devGrant/)
    assert.equal(wxss.includes('linear-gradient') && wxss.includes('purple'), false)
  })

  it('wraps membership cloud actions only', () => {
    assert.match(service, /callCloud\('membership', \{ action: 'getStatus' \}\)/)
    assert.match(service, /callCloud\('membership', \{ action: 'createOrder', sku \}\)/)
    assert.match(service, /callCloud\('membership', \{ action: 'refresh' \}\)/)
    assert.doesNotMatch(service, /devGrant/)
    assert.doesNotMatch(service, /isMember:\s*true/)
  })
})
