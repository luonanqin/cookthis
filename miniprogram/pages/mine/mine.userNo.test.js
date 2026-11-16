'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'mine.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'mine.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'mine.wxss'), 'utf8')

describe('mine userNo subtitle and first-visit reveal', () => {
  it('wraps nickname plus optional userNoLabel under profile-text', () => {
    assert.match(wxml, /class="profile-text"/)
    assert.match(wxml, /<text class="nickname">\{\{nickname\}\}<\/text>/)
    assert.match(wxml, /<text wx:if="\{\{userNoLabel\}\}" class="user-no">\{\{userNoLabel\}\}<\/text>/)
  })

  it('renders the ceremony mask with welcome copy and ack control', () => {
    assert.match(wxml, /class="mask user-no-mask"/)
    assert.match(wxml, /catchtouchmove="true"/)
    assert.match(wxml, /class="user-no-card" catchtap="noop"/)
    assert.match(wxml, /欢迎加入/)
    assert.match(wxml, /\{\{revealDisplay\}\}/)
    assert.match(wxml, /wx:if="\{\{revealDone\}\}"/)
    assert.match(wxml, /bindtap="onUserNoRevealAck"/)
    assert.match(wxml, /知道了/)
    assert.match(wxml, /bindtap="onUserNoRevealAck"/)
  })

  it('lets a mask tap ack the same way as the button', () => {
    assert.match(
      wxml,
      /class="mask user-no-mask"[^>]*bindtap="onUserNoRevealAck"/
    )
  })

  it('styles the subtitle with secondary color and a smaller type token', () => {
    assert.match(wxss, /\.user-no\s*\{[^}]*--color-text-secondary/s)
    assert.match(wxss, /\.user-no\s*\{[^}]*--fs-/s)
  })

  it('starts the reveal from onShow and acks via storage, session, cloud, and track', () => {
    assert.match(js, /this\._maybeStartUserNoReveal\(\)/)
    assert.match(js, /if \(!isValidUserNo\(n\)\) return/)
    assert.match(js, /if \(u\.userNoRevealSeen\) return/)
    assert.match(js, /cookthis_user_no_reveal_seen/)
    assert.match(js, /shouldAnimateUserNoReveal\(\)/)
    assert.match(js, /formatUserNoLabel\(n\)/)
    assert.match(js, /revealStartValue\(n\)/)
    assert.match(js, /patchUser\(\{ userNoRevealSeen: true \}\)/)
    assert.match(js, /callCloud\('profile', \{ action: 'ackUserNoReveal' \}\)/)
    assert.match(js, /track\('user_no_reveal_show'/)
    assert.match(js, /track\('user_no_reveal_ack'/)
    assert.match(js, /userNoLabel:\s*formatUserNoLabel\(/)
  })
})
