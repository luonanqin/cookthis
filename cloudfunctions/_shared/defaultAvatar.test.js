const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  pickDefaultAvatar,
  AVATAR_COUNT,
  AVATAR_PREFIX
} = require('./defaultAvatar.js')

describe('pickDefaultAvatar', () => {
  it('returns local asset path avatar-cook-01..10', () => {
    const p = pickDefaultAvatar('u_01JABC')
    assert.match(p, new RegExp(`^${AVATAR_PREFIX}\\d{2}\\.png$`))
    const n = Number(p.slice(AVATAR_PREFIX.length, AVATAR_PREFIX.length + 2))
    assert.ok(n >= 1 && n <= AVATAR_COUNT)
  })

  it('is stable for same uid', () => {
    assert.equal(pickDefaultAvatar('u_same'), pickDefaultAvatar('u_same'))
  })

  it('covers multiple slots across uids', () => {
    const set = new Set()
    for (let i = 0; i < 80; i++) {
      set.add(pickDefaultAvatar(`u_seed_${i}`))
    }
    assert.ok(set.size >= 5)
  })
})
