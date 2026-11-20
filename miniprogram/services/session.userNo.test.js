'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

describe('session slim userNo cache', () => {
  const src = fs.readFileSync(path.join(__dirname, 'session.js'), 'utf8')
  const slim = src.slice(src.indexOf('const slim = {'), src.indexOf('if (preferLocalStance'))

  it('caches sanitized userNo and userNoRevealSeen from login', () => {
    assert.match(slim, /userNo:/)
    assert.match(slim, /userNoRevealSeen:/)
    assert.match(slim, /Number\.isInteger\(user\.userNo\) && user\.userNo >= 1 \? user\.userNo : null/)
    assert.match(slim, /userNoRevealSeen:\s*!!user\.userNoRevealSeen/)
  })

  it('soft-loads membership cache after login without blocking', () => {
    assert.match(src, /ensureMembershipStatus\(\)\.catch/)
    assert.match(src, /MEMBERSHIP_ENABLED/)
  })
})
