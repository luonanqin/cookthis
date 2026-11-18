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

  it('folds member buy by default and passes buyExpanded like the page', () => {
    assert.match(js, /buyExpanded:\s*false/)
    assert.match(js, /applyStatus\(/)
    assert.match(js, /this\.data\.selectedSku/)
    assert.match(js, /this\.data\.buyExpanded/)
  })

  it('wires order list, replacePending, and expired toast', () => {
    assert.match(wxml, /wx:for="\{\{orders\}\}"/)
    assert.match(wxml, /onPayOrder/)
    assert.match(wxml, /onCancelOrder/)
    assert.match(wxml, /剩余/)
    assert.match(js, /PENDING_OTHER_SKU/)
    assert.match(js, /replacePending:\s*true/)
    assert.match(js, /payOrder/)
    assert.match(js, /cancelOrder/)
    assert.match(js, /ORDER_CANCELLED_TOAST|订单已取消，请重新下单/)
    assert.match(js, /tickOrderRemains/)
    assert.match(js, /_startCountdown/)
  })

  it('keeps busy through virtual pay and generation-guards onShow vs poll', () => {
    const launchStart = js.indexOf('_launchPayment(res, sku) {')
    const launch = js.slice(launchStart, js.indexOf('_handleOrderActionError(err) {'))
    const gateAt = launch.indexOf('if (!p')
    const payAt = launch.indexOf('requestVirtualPayment')
    assert.ok(gateAt > 0 && payAt > gateAt)
    assert.equal(launch.slice(0, gateAt).includes('busy: false'), false)
    assert.match(launch, /fail:\s*\([^)]*\)\s*=>\s*\{[\s\S]*busy:\s*false/)
    const successBlock = launch.slice(launch.indexOf('success:'), launch.indexOf('fail:'))
    assert.match(successBlock, /_pollRefresh/)
    assert.doesNotMatch(successBlock, /busy:\s*false/)
    const onShow = js.slice(js.indexOf('onShow()'), js.indexOf('onHide()'))
    assert.match(onShow, /if \(this\.data\.busy\) return/)
    const poll = js.slice(js.indexOf('_pollRefresh() {'))
    assert.match(poll, /this\._loadGen \+= 1/)
  })

  it('shows 刷新会员状态 for non-members and uses a noop catchtouchmove', () => {
    assert.ok((wxml.match(/刷新会员状态/g) || []).length >= 2)
    assert.match(wxml, /wx:else[\s\S]{0,220}刷新会员状态/)
    assert.match(wxml, /catchtouchmove="noop"/)
    assert.doesNotMatch(wxml, /catchtouchmove="true"/)
  })

  it('wraps membership cloud actions only', () => {
    assert.match(service, /callCloud\('membership', \{ action: 'getStatus' \}\)/)
    assert.match(service, /action: 'createOrder'/)
    assert.match(service, /replacePending/)
    assert.match(service, /action: 'payOrder'/)
    assert.match(service, /action: 'cancelOrder'/)
    assert.match(service, /callCloud\('membership', \{ action: 'refresh' \}\)/)
    assert.doesNotMatch(service, /devGrant/)
    assert.doesNotMatch(service, /isMember:\s*true/)
  })
})
