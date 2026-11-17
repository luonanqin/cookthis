'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'recommend.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'recommend.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'recommend.wxss'), 'utf8')

describe('recommend SWAP_CAP soft gate', () => {
  it('catches SWAP_CAP, tracks, and keeps plans', () => {
    const catchAt = js.indexOf(".catch((err) => {")
    assert.ok(catchAt >= 0)
    const rerunCatch = js.slice(js.indexOf('_rerun(action, extra)'), js.indexOf('onAccept(e)'))
    assert.match(rerunCatch, /err\.error === 'SWAP_CAP'/)
    assert.match(rerunCatch, /track\('swap_cap_show'/)
    assert.match(rerunCatch, /showSwapCap:\s*true/)
    assert.match(rerunCatch, /swapCapUsed:\s*err\.used/)
    assert.match(rerunCatch, /swapCapLimit:\s*err\.limit/)
    const capBranch = rerunCatch.slice(
      rerunCatch.indexOf("err.error === 'SWAP_CAP'"),
      rerunCatch.indexOf("wx.showToast")
    )
    assert.match(capBranch, /return/)
    assert.doesNotMatch(capBranch, /plans:\s*\[\]/)
    assert.doesNotMatch(capBranch, /applySnap/)
  })

  it('renders a soft sheet with shopping CTA and membership, no reward video', () => {
    assert.match(wxml, /wx:if="\{\{showSwapCap\}\}"/)
    assert.match(wxml, /class="swap-cap-mask"/)
    assert.match(wxml, /今日免费换菜已用完/)
    assert.match(wxml, /当前方案仍可去买菜/)
    assert.match(wxml, /bindtap="onSwapCapGoShopping"/)
    assert.match(wxml, /bindtap="onSwapCapGoMember"/)
    assert.match(wxml, /开通会员，换菜不限次/)
    assert.match(wxml, /bindtap="onSwapCapClose"/)
    assert.doesNotMatch(wxml, /swap_cap_reward|看视频|激励视频/)
    assert.match(wxss, /\.swap-cap-mask\s*\{/)
    assert.match(wxss, /\.swap-cap-sheet\s*\{/)
  })

  it('go shopping keeps plans; member path uses from=swap_cap', () => {
    assert.match(
      js,
      /onSwapCapGoShopping\(\)\s*\{[\s\S]*?track\('swap_cap_go_shopping'\)/
    )
    assert.match(
      js,
      /onSwapCapGoShopping\(\)\s*\{[\s\S]*?请先点方案去买菜/
    )
    assert.match(
      js,
      /onSwapCapGoShopping\(\)\s*\{[\s\S]*?pages\/shopping\/shopping/
    )
    assert.doesNotMatch(
      js.slice(js.indexOf('onSwapCapGoShopping()'), js.indexOf('onSwapCapGoMember()')),
      /plans:\s*\[\]/
    )
    assert.match(
      js,
      /onSwapCapGoMember\(\)\s*\{[\s\S]*?track\('swap_cap_go_member'\)[\s\S]*?pages\/membership\/index\?from=swap_cap/
    )
  })

  it('applies a 2.5s cooldown after a successful swap and ignores onRejectOpen', () => {
    const rerun = js.slice(js.indexOf('_rerun(action, extra)'), js.indexOf('onAccept(e)'))
    assert.match(rerun, /_swapCooldownUntil\s*=\s*Date\.now\(\)\s*\+\s*2500/)
    const cooldownLine = rerun.slice(
      rerun.indexOf('_swapCooldownUntil'),
      rerun.indexOf('_swapCooldownUntil') + 80
    )
    const emptyReturnAt = rerun.indexOf('if (result.noNewPlans')
    const cooldownAt = rerun.indexOf('_swapCooldownUntil')
    assert.ok(emptyReturnAt >= 0 && cooldownAt > emptyReturnAt)
    assert.match(
      js,
      /onRejectOpen\(\)\s*\{[\s\S]*?_swapCooldownUntil/
    )
  })
})
