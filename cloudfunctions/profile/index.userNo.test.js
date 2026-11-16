'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

describe('profile.get and ackUserNoReveal wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const handleGet = src.slice(src.indexOf('async function handleGet'), src.indexOf('async function handleSetMarketScale'))
  const main = src.slice(src.indexOf('exports.main'))

  it('requires loginUserNoFields and spreads them onto profile.get', () => {
    assert.match(src, /loginUserNoFields/)
    assert.match(src, /require\('\.\/userNo\.js'\)/)
    assert.equal(handleGet.includes('...loginUserNoFields(user)'), true)
  })

  it('defines handleAckUserNoReveal and skips update when already seen', () => {
    assert.match(src, /async function handleAckUserNoReveal\(uid, user\)/)
    assert.match(src, /if \(user\.userNoRevealSeenAt\) return \{ ok: true, userNoRevealSeen: true \}/)
    assert.match(src, /userNoRevealSeenAt: db\.serverDate\(\)/)
  })

  it('routes action ackUserNoReveal to the handler', () => {
    assert.equal(main.includes("action === 'ackUserNoReveal'"), true)
    assert.match(main, /handleAckUserNoReveal\(uid, user\)/)
  })
})
