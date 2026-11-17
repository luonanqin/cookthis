'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'mine.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'mine.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'mine.wxss'), 'utf8')

describe('mine membership status', () => {
  it('renders member-status near the profile userNo', () => {
    const profileAt = wxml.indexOf('class="profile-text"')
    const userNoAt = wxml.indexOf('class="user-no"')
    const statusAt = wxml.indexOf('class="member-status"')
    assert.ok(profileAt >= 0 && userNoAt > profileAt && statusAt > userNoAt)
    assert.match(wxml, /\{\{memberStatusLabel\}\}/)
    assert.match(wxss, /\.member-status\s*\{/)
  })

  it('loads getStatus onShow and labels from membership helpers', () => {
    const onShow = js.slice(js.indexOf('onShow()'), js.indexOf('refreshFromAuth()'))
    assert.match(onShow, /getStatus\s*\(/)
    assert.match(js, /memberStatusLabel/)
    assert.match(js, /getMembershipLite|setMembershipLite/)
    assert.match(js, /require\('\.\.\/\.\.\/services\/membership\.js'\)/)
  })

  it('opens membership from=mine without blocking on failure', () => {
    assert.match(
      js,
      /goMembership\(\)\s*\{[\s\S]*?pages\/membership\/index\?from=mine/
    )
    assert.match(wxml, /bindtap="goMembership"/)
    const load = js.includes('_loadMembershipStatus')
      ? js.slice(js.indexOf('_loadMembershipStatus'))
      : js.slice(js.indexOf('getStatus'))
    assert.match(load, /\.catch\(/)
    assert.doesNotMatch(load.slice(0, 800), /showToast|showModal/)
  })
})
