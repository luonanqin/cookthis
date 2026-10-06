const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildDefaultNickname } = require('./nickname.js')

describe('buildDefaultNickname', () => {
  it('starts with 大厨 and 4+ alnum uppercase', () => {
    const n = buildDefaultNickname('u_01JABC')
    assert.match(n, /^大厨[A-Z0-9]{4,}$/)
  })

  it('is stable for same uid', () => {
    assert.equal(
      buildDefaultNickname('u_same'),
      buildDefaultNickname('u_same')
    )
  })

  it('differs for different uids (usually)', () => {
    // 哈希碰撞极罕见；不同输入应得到不同短码
    assert.notEqual(
      buildDefaultNickname('u_a'),
      buildDefaultNickname('u_b')
    )
  })
})
