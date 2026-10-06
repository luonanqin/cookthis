const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { suggestComboByPeople } = require('./suggestCombo.js')

describe('suggestComboByPeople', () => {
  it('maps table', () => {
    assert.deepEqual(suggestComboByPeople(1), { meat: 1, veg: 1, soup: 0 })
    assert.deepEqual(suggestComboByPeople(2), { meat: 1, veg: 1, soup: 1 })
    assert.deepEqual(suggestComboByPeople(3), { meat: 1, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(5), { meat: 2, veg: 2, soup: 1 })
    assert.deepEqual(suggestComboByPeople(8), { meat: 2, veg: 3, soup: 1 })
  })
  it('invalid n returns null', () => {
    assert.equal(suggestComboByPeople(0), null)
    assert.equal(suggestComboByPeople(-1), null)
  })
})
