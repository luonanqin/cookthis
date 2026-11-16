'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'mine.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'mine.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'mine.wxss'), 'utf8')

describe('mine userNo subtitle only (no ceremony)', () => {
  it('wraps nickname plus optional userNoLabel under profile-text', () => {
    assert.match(wxml, /class="profile-text"/)
    assert.match(wxml, /class="nickname"/)
    assert.match(wxml, /<text wx:if="\{\{userNoLabel\}\}" class="user-no">\{\{userNoLabel\}\}<\/text>/)
  })

  it('does not render a userNo reveal mask on mine', () => {
    assert.doesNotMatch(wxml, /user-no-mask|showUserNoReveal|onUserNoRevealAck|revealDisplay/)
    assert.doesNotMatch(js, /_maybeStartUserNoReveal|showUserNoReveal|ackUserNoReveal/)
    assert.doesNotMatch(wxss, /\.user-no-mask|\.user-no-roll/)
  })

  it('still formats the subtitle from session userNo', () => {
    assert.match(js, /formatUserNoLabel/)
    assert.match(js, /userNoLabel:\s*formatUserNoLabel\(/)
  })
})
