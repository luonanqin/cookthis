'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

describe('auth.login userNo wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const existing = src.slice(src.indexOf('if (idRes.data.length)'), src.indexOf('const uid ='))
  const created = src.slice(src.indexOf('const uid ='))

  it('does not allocate on existing-user login; returns loginUserNoFields instead', () => {
    assert.equal(existing.includes('allocateUserNo'), false)
    assert.equal(existing.includes('loginUserNoFields(user)'), true)
  })

  it('allocates once on signup and writes userNo + userNoRevealSeenAt:null', () => {
    assert.match(created, /const userNo = await allocateUserNo\(db\)/)
    assert.match(created, /userNoRevealSeenAt:\s*null/)
    assert.match(created, /loginUserNoFields\(\{\s*userNo,\s*userNoRevealSeenAt:\s*null\s*\}\)/)
    assert.equal(created.includes('buildDefaultNickname(uid)'), true)
  })
})
