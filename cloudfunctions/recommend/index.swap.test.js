'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const indexJs = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')

function handlerSource() {
  const start = indexJs.indexOf('async function handleSwapOrReject')
  const end = indexJs.indexOf('async function handleAccept')
  assert.ok(start >= 0 && end > start)
  return indexJs.slice(start, end)
}

describe('recommend handleSwapOrReject swap quota wiring', () => {
  it('vendors quota helpers and loads memberships by uid', () => {
    assert.match(indexJs, /require\('\.\/swapQuota\.js'\)/)
    assert.match(indexJs, /require\('\.\/membershipLogic\.js'\)/)
    assert.match(indexJs, /require\('\.\/swapGate\.js'\)/)
    assert.match(
      indexJs,
      /collection\('memberships'\)[\s\S]*?where\(\{\s*uid\s*\}\)/
    )
    for (const name of ['swapQuota.js', 'membershipLogic.js', 'membershipCatalog.js', 'swapGate.js']) {
      assert.ok(fs.existsSync(path.join(dir, name)), name)
    }
  })

  it('gates before rebuild and only consumes after new plans exist', () => {
    const src = handlerSource()
    const gateAt = src.indexOf('evaluateSwapAccess')
    const rebuildAt = src.indexOf('rebuildPlans')
    const emptyAt = src.indexOf('if (!plans.length)')
    const consumeAt = src.lastIndexOf('buildSwapQuotaUserPatch')
    assert.ok(gateAt >= 0 && rebuildAt > gateAt, 'gate must run before rebuild')
    assert.ok(emptyAt > rebuildAt, 'empty fail stays after rebuild')
    assert.ok(consumeAt > emptyAt, 'quota write must be after empty check')
    assert.match(src, /consume:\s*access\.consume/)
    assert.match(src, /consume:\s*false/)
    assert.match(src, /error:\s*'SWAP_CAP'|access\.ok/)
  })
})
